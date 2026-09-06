import { randomUUID, createHash } from 'crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../auth/types/request-user.type';
import { isUniqueViolation } from '../database/pg-errors.util';
import { PG_POOL } from '../database/pg-pool.provider';
import { withTransaction } from '../database/transaction.util';
import { buildStorageKey } from './documents.constants';
import { DocumentRow } from './document.types';
import { DocumentsRepository } from './documents.repository';
import { DocumentResponseDto, toDocumentResponseDto } from './dto/document-response.dto';
import { IngestionPublisher } from './rabbitmq/ingestion-publisher.service';
import { STORAGE_SERVICE, StorageService } from './storage/storage.interface';

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly documentsRepository: DocumentsRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    private readonly ingestionPublisher: IngestionPublisher,
    private readonly auditService: AuditService,
  ) {}

  async upload(file: Express.Multer.File, user: RequestUser): Promise<DocumentResponseDto> {
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    const existing = await this.documentsRepository.findActiveByChecksum(user.organizationId, checksum);
    if (existing) {
      return toDocumentResponseDto(existing);
    }

    const documentId = randomUUID();
    const storageKey = buildStorageKey(user.organizationId, documentId, file.mimetype);
    await this.storageService.save(storageKey, file.buffer);

    let document: DocumentRow;
    try {
      document = await withTransaction(this.pool, async (client) => {
        const created = await this.documentsRepository.create(
          {
            id: documentId,
            organizationId: user.organizationId,
            filename: file.originalname,
            storageKey,
            mimeType: file.mimetype,
            size: file.size,
            checksum,
          },
          client,
        );
        await this.auditService.record(
          {
            organizationId: user.organizationId,
            userId: user.userId,
            action: 'document.uploaded',
            resource: 'document',
            metadata: { documentId: created.id, filename: created.filename, size: created.size },
          },
          client,
        );
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Lost the race to a concurrent upload of identical content:
        // clean up our orphaned file and return the winner instead.
        await this.storageService.delete(storageKey).catch(() => undefined);
        const winner = await this.documentsRepository.findActiveByChecksum(user.organizationId, checksum);
        if (winner) {
          return toDocumentResponseDto(winner);
        }
      }
      throw error;
    }

    await this.publishOrMarkFailed(document.id, user.organizationId);
    const latest = await this.documentsRepository.findByIdAndOrganization(document.id, user.organizationId);
    return toDocumentResponseDto(latest ?? document);
  }

  async list(organizationId: string): Promise<DocumentResponseDto[]> {
    const rows = await this.documentsRepository.listByOrganization(organizationId);
    return rows.map(toDocumentResponseDto);
  }

  async getOne(id: string, organizationId: string): Promise<DocumentResponseDto> {
    const row = await this.documentsRepository.findByIdAndOrganization(id, organizationId);
    if (!row) {
      throw new NotFoundException('Document not found');
    }
    return toDocumentResponseDto(row);
  }

  async remove(id: string, user: RequestUser): Promise<void> {
    const existing = await this.documentsRepository.findByIdAndOrganization(id, user.organizationId);
    if (!existing) {
      throw new NotFoundException('Document not found');
    }

    await withTransaction(this.pool, async (client) => {
      await this.documentsRepository.deleteByIdAndOrganization(id, user.organizationId, client);
      await this.auditService.record(
        {
          organizationId: user.organizationId,
          userId: user.userId,
          action: 'document.deleted',
          resource: 'document',
          metadata: { documentId: id, filename: existing.filename },
        },
        client,
      );
    });

    // Best-effort: a failed file delete only leaks disk space, it never
    // leaves a dangling DB row (which is already gone at this point).
    await this.storageService.delete(existing.storage_key).catch(() => undefined);
  }

  async reindex(id: string, user: RequestUser): Promise<DocumentResponseDto> {
    const existing = await this.documentsRepository.findByIdAndOrganization(id, user.organizationId);
    if (!existing) {
      throw new NotFoundException('Document not found');
    }
    if (existing.status === 'PROCESSING') {
      throw new ConflictException('Document is already being processed');
    }

    const updated = await withTransaction(this.pool, async (client) => {
      const row = await this.documentsRepository.incrementVersionAndReprocess(
        id,
        user.organizationId,
        client,
      );
      await this.auditService.record(
        {
          organizationId: user.organizationId,
          userId: user.userId,
          action: 'document.reindex_requested',
          resource: 'document',
          metadata: { documentId: id, version: row?.version },
        },
        client,
      );
      return row;
    });

    if (!updated) {
      throw new NotFoundException('Document not found');
    }

    await this.publishOrMarkFailed(updated.id, user.organizationId);
    const latest = await this.documentsRepository.findByIdAndOrganization(updated.id, user.organizationId);
    return toDocumentResponseDto(latest ?? updated);
  }

  // A publish failure marks the document FAILED rather than failing the
  // whole request or rolling back the row — FAILED is recoverable via
  // POST /documents/:id/reindex, matching the spec's own READY/FAILED model.
  private async publishOrMarkFailed(documentId: string, organizationId: string): Promise<void> {
    try {
      await this.ingestionPublisher.publishIngestionJob({ documentId, organizationId });
    } catch {
      await this.documentsRepository.markStatus(documentId, organizationId, 'FAILED').catch(() => undefined);
    }
  }
}
