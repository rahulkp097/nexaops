import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, pgPoolProvider } from './pg-pool.provider';

@Global()
@Module({
  providers: [pgPoolProvider],
  exports: [pgPoolProvider],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
