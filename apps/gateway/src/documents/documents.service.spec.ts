import { ConflictException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { DocumentsService } from './documents.service';
import { DocumentsRepository } from './documents.repository';
import { StorageService } from './storage/storage.interface';
import { IngestionPublisher } from './rabbitmq/ingestion-publisher.service';
import { AuditService } from '../audit/audit.service';

function makePool() {
  const clientQuery = jest.fn().mockResolvedValue(undefined);
  const release = jest.fn();
  const client = { query: clientQuery, release };
  const connect = jest.fn().mockResolvedValue(client);
  return { pool: { connect } as unknown as Pool, client };
}

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'report.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 5,
    buffer: Buffer.from('hello'),
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
    ...overrides,
  } as Express.Multer.File;
}

describe('DocumentsService', () => {
  const user = { userId: 'user-1', organizationId: 'org-1', role: 'ADMIN' as const };

  const readyDocument = {
    id: 'doc-1',
    organization_id: 'org-1',
    filename: 'report.pdf',
    storage_key: 'org-1/doc-1.pdf',
    mime_type: 'application/pdf',
    size: 5,
    version: 1,
    status: 'READY' as const,
    checksum: 'checksum-value',
    created_at: new Date(),
    updated_at: new Date(),
  };

  let documentsRepository: jest.Mocked<
    Pick<
      DocumentsRepository,
      | 'create'
      | 'findActiveByChecksum'
      | 'findByIdAndOrganization'
      | 'listByOrganization'
      | 'markStatus'
      | 'incrementVersionAndReprocess'
      | 'deleteByIdAndOrganization'
    >
  >;
  let storageService: jest.Mocked<StorageService>;
  let ingestionPublisher: jest.Mocked<Pick<IngestionPublisher, 'publishIngestionJob'>>;
  let auditService: jest.Mocked<Pick<AuditService, 'record'>>;
  let pool: ReturnType<typeof makePool>;
  let service: DocumentsService;

  beforeEach(() => {
    documentsRepository = {
      create: jest.fn(),
      findActiveByChecksum: jest.fn(),
      findByIdAndOrganization: jest.fn(),
      listByOrganization: jest.fn(),
      markStatus: jest.fn(),
      incrementVersionAndReprocess: jest.fn(),
      deleteByIdAndOrganization: jest.fn(),
    };
    storageService = { save: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) };
    ingestionPublisher = { publishIngestionJob: jest.fn().mockResolvedValue(undefined) };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    pool = makePool();

    service = new DocumentsService(
      pool.pool,
      documentsRepository as unknown as DocumentsRepository,
      storageService,
      ingestionPublisher as unknown as IngestionPublisher,
      auditService as unknown as AuditService,
    );
  });

  describe('upload', () => {
    it('stores the file, inserts the row, records an audit event, and publishes an ingestion job', async () => {
      documentsRepository.findActiveByChecksum.mockResolvedValue(null);
      documentsRepository.create.mockResolvedValue({ ...readyDocument, status: 'PROCESSING' });
      documentsRepository.findByIdAndOrganization.mockResolvedValue({ ...readyDocument, status: 'PROCESSING' });

      const result = await service.upload(makeFile(), user);

      expect(storageService.save).toHaveBeenCalledWith(
        expect.stringMatching(/^org-1\/[0-9a-f-]+\.pdf$/),
        expect.any(Buffer),
      );
      expect(documentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', filename: 'report.pdf', mimeType: 'application/pdf' }),
        pool.client,
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'document.uploaded', organizationId: 'org-1', userId: 'user-1' }),
        pool.client,
      );
      expect(ingestionPublisher.publishIngestionJob).toHaveBeenCalledWith({
        documentId: expect.any(String),
        organizationId: 'org-1',
      });
      expect(result.status).toBe('PROCESSING');
    });

    it('is idempotent by checksum: returns the existing document without storing/inserting/publishing again', async () => {
      documentsRepository.findActiveByChecksum.mockResolvedValue(readyDocument);

      const result = await service.upload(makeFile(), user);

      expect(storageService.save).not.toHaveBeenCalled();
      expect(documentsRepository.create).not.toHaveBeenCalled();
      expect(ingestionPublisher.publishIngestionJob).not.toHaveBeenCalled();
      expect(result.id).toBe('doc-1');
    });

    it('on a checksum race (23505), deletes the orphaned file and returns the winning row', async () => {
      documentsRepository.findActiveByChecksum
        .mockResolvedValueOnce(null) // pre-check
        .mockResolvedValueOnce(readyDocument); // post-race lookup
      documentsRepository.create.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

      const result = await service.upload(makeFile(), user);

      expect(storageService.delete).toHaveBeenCalled();
      expect(result.id).toBe('doc-1');
    });

    it('marks the document FAILED (but still resolves) if the ingestion publish fails', async () => {
      documentsRepository.findActiveByChecksum.mockResolvedValue(null);
      documentsRepository.create.mockResolvedValue({ ...readyDocument, status: 'PROCESSING' });
      documentsRepository.findByIdAndOrganization.mockResolvedValue({ ...readyDocument, status: 'FAILED' });
      documentsRepository.markStatus.mockResolvedValue({ ...readyDocument, status: 'FAILED' });
      ingestionPublisher.publishIngestionJob.mockRejectedValue(new Error('broker down'));

      const resolved = await service.upload(makeFile(), user);

      expect(documentsRepository.markStatus).toHaveBeenCalledWith(
        expect.any(String),
        'org-1',
        'FAILED',
      );
      expect(resolved.status).toBe('FAILED');
    });
  });

  describe('cross-tenant access', () => {
    it('getOne throws NotFoundException for a document belonging to a different org', async () => {
      documentsRepository.findByIdAndOrganization.mockResolvedValue(null);

      await expect(service.getOne('doc-1', 'org-B')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('remove throws NotFoundException and performs no side effects for a wrong org', async () => {
      documentsRepository.findByIdAndOrganization.mockResolvedValue(null);

      await expect(service.remove('doc-1', { ...user, organizationId: 'org-B' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storageService.delete).not.toHaveBeenCalled();
      expect(documentsRepository.deleteByIdAndOrganization).not.toHaveBeenCalled();
    });

    it('reindex throws NotFoundException and performs no side effects for a wrong org', async () => {
      documentsRepository.findByIdAndOrganization.mockResolvedValue(null);

      await expect(service.reindex('doc-1', { ...user, organizationId: 'org-B' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(ingestionPublisher.publishIngestionJob).not.toHaveBeenCalled();
      expect(documentsRepository.incrementVersionAndReprocess).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the DB row and audit record in one transaction, then best-effort deletes the file', async () => {
      documentsRepository.findByIdAndOrganization.mockResolvedValue(readyDocument);

      await service.remove('doc-1', user);

      expect(documentsRepository.deleteByIdAndOrganization).toHaveBeenCalledWith('doc-1', 'org-1', pool.client);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'document.deleted' }),
        pool.client,
      );
      expect(storageService.delete).toHaveBeenCalledWith('org-1/doc-1.pdf');
    });

    it('does not reject when the storage delete fails', async () => {
      documentsRepository.findByIdAndOrganization.mockResolvedValue(readyDocument);
      storageService.delete.mockRejectedValue(new Error('disk error'));

      await expect(service.remove('doc-1', user)).resolves.toBeUndefined();
    });
  });

  describe('reindex', () => {
    it('rejects with ConflictException when the document is already PROCESSING', async () => {
      documentsRepository.findByIdAndOrganization.mockResolvedValue({ ...readyDocument, status: 'PROCESSING' });

      await expect(service.reindex('doc-1', user)).rejects.toBeInstanceOf(ConflictException);
      expect(documentsRepository.incrementVersionAndReprocess).not.toHaveBeenCalled();
    });

    it('increments version, republishes, and records an audit event on a READY/FAILED document', async () => {
      documentsRepository.findByIdAndOrganization
        .mockResolvedValueOnce(readyDocument) // pre-check
        .mockResolvedValueOnce({ ...readyDocument, version: 2, status: 'PROCESSING' }); // post-transaction refetch
      documentsRepository.incrementVersionAndReprocess.mockResolvedValue({
        ...readyDocument,
        version: 2,
        status: 'PROCESSING',
      });

      const result = await service.reindex('doc-1', user);

      expect(documentsRepository.incrementVersionAndReprocess).toHaveBeenCalledWith('doc-1', 'org-1', pool.client);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'document.reindex_requested' }),
        pool.client,
      );
      expect(ingestionPublisher.publishIngestionJob).toHaveBeenCalledWith({
        documentId: 'doc-1',
        organizationId: 'org-1',
      });
      expect(result.version).toBe(2);
    });
  });
});
