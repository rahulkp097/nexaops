import { ConfigService } from '@nestjs/config';
import { Provider } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

export const pgPoolProvider: Provider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Pool({
      connectionString: config.get<string>('DATABASE_APP_URL'),
    }),
};
