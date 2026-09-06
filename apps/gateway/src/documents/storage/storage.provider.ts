import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service';
import { STORAGE_SERVICE } from './storage.interface';

export const storageServiceProvider: Provider = {
  provide: STORAGE_SERVICE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const provider = config.get<string>('STORAGE_PROVIDER') ?? 'local';
    if (provider !== 'local') {
      throw new Error(`Unsupported STORAGE_PROVIDER: ${provider} (only 'local' is implemented)`);
    }
    return new LocalStorageService(config);
  },
};
