export type DocumentStatus = 'PROCESSING' | 'READY' | 'FAILED';

export interface DocumentResponseDto {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  version: number;
  status: DocumentStatus;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
}
