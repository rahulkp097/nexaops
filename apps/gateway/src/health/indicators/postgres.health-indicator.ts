import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { Pool } from 'pg';

@Injectable()
export class PostgresHealthIndicator extends HealthIndicator implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    super();
    this.pool = new Pool({
      connectionString: this.config.get<string>('DATABASE_APP_URL'),
      connectionTimeoutMillis: 3000,
      statement_timeout: 3000,
      max: 2,
    });
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.pool.query('SELECT 1');
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Postgres check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
