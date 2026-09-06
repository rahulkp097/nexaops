export interface StorageService {
  save(key: string, buffer: Buffer): Promise<void>;
  delete(key: string): Promise<void>;
}

export const STORAGE_SERVICE = 'STORAGE_SERVICE';
