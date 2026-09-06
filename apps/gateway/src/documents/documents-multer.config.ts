import { UnsupportedMediaTypeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModuleOptions } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ALLOWED_MIME_TYPES } from './documents.constants';

export function documentsMulterOptions(config: ConfigService): MulterModuleOptions {
  const maxSizeMb = Number(config.get<string>('MAX_DOCUMENT_SIZE_MB') ?? '25');

  return {
    storage: memoryStorage(),
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      if (!ALLOWED_MIME_TYPES[file.mimetype]) {
        callback(new UnsupportedMediaTypeException(`Unsupported file type: ${file.mimetype}`), false);
        return;
      }
      callback(null, true);
    },
  };
}
