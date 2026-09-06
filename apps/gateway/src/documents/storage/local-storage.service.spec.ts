import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service';

const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();
const mockRm = jest.fn();

jest.mock('fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}));

describe('LocalStorageService', () => {
  const rootPath = '/data/storage';
  let service: LocalStorageService;

  beforeEach(() => {
    mockMkdir.mockReset().mockResolvedValue(undefined);
    mockWriteFile.mockReset().mockResolvedValue(undefined);
    mockRm.mockReset().mockResolvedValue(undefined);

    const config = {
      get: jest.fn((key: string) => (key === 'STORAGE_PATH' ? rootPath : undefined)),
    } as unknown as ConfigService;
    service = new LocalStorageService(config);
  });

  it('writes the buffer to the resolved path, creating parent dirs', async () => {
    const buffer = Buffer.from('hello');
    await service.save('org-1/doc-1.txt', buffer);

    const expectedPath = path.join(rootPath, 'org-1/doc-1.txt');
    expect(mockMkdir).toHaveBeenCalledWith(path.dirname(expectedPath), { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(expectedPath, buffer);
  });

  it('deletes the file at the resolved path', async () => {
    await service.delete('org-1/doc-1.txt');

    expect(mockRm).toHaveBeenCalledWith(path.join(rootPath, 'org-1/doc-1.txt'), { force: true });
  });

  it('throws instead of writing outside the storage root for a traversal key', async () => {
    await expect(service.save('../../etc/passwd', Buffer.from('x'))).rejects.toThrow(
      /resolves outside the storage root/,
    );
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('throws instead of deleting outside the storage root for a traversal key', async () => {
    await expect(service.delete('../../etc/passwd')).rejects.toThrow(
      /resolves outside the storage root/,
    );
    expect(mockRm).not.toHaveBeenCalled();
  });
});
