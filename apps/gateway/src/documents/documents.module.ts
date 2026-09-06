import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AuditModule } from '../audit/audit.module';
import { documentsMulterOptions } from './documents-multer.config';
import { DocumentsController } from './documents.controller';
import { DocumentsRepository } from './documents.repository';
import { DocumentsService } from './documents.service';
import { IngestionPublisher } from './rabbitmq/ingestion-publisher.service';
import { storageServiceProvider } from './storage/storage.provider';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: documentsMulterOptions,
    }),
    AuditModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRepository, IngestionPublisher, storageServiceProvider],
})
export class DocumentsModule {}
