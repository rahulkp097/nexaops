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
      // Phase 19 (spec §28: "Timeouts on external/model calls"): a hung
      // connection attempt or a runaway query fails loudly instead of
      // holding a pool client (and the request awaiting it) open
      // indefinitely — mirroring the explicit timeout/command_timeout
      // apps/ai-service's own asyncpg pools already set.
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
      query_timeout: 10_000,
    }),
};
