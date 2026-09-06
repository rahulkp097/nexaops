import * as path from 'path';
import * as fs from 'fs/promises';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.interface';

export class LocalStorageService implements StorageService {
  private readonly rootPath: string;

  constructor(config: ConfigService) {
    this.rootPath = path.resolve(process.cwd(), config.get<string>('STORAGE_PATH') ?? './storage');
  }

  async save(key: string, buffer: Buffer): Promise<void> {
    const fullPath = this.resolveWithinRoot(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolveWithinRoot(key);
    await fs.rm(fullPath, { force: true });
  }

  // Defense in depth: buildStorageKey() already guarantees a safe key, but
  // this stops any future caller from ever writing/deleting outside the
  // storage root, even if a key gets constructed incorrectly upstream.
  private resolveWithinRoot(key: string): string {
    const fullPath = path.resolve(this.rootPath, key);
    const rootWithSep = this.rootPath.endsWith(path.sep) ? this.rootPath : this.rootPath + path.sep;
    if (fullPath !== this.rootPath && !fullPath.startsWith(rootWithSep)) {
      throw new Error(`Storage key resolves outside the storage root: ${key}`);
    }
    return fullPath;
  }
}
