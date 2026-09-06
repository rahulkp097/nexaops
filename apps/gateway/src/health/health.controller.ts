import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { PostgresHealthIndicator } from './indicators/postgres.health-indicator';
import { RabbitmqHealthIndicator } from './indicators/rabbitmq.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly rabbitmq: RabbitmqHealthIndicator,
  ) {}

  // Infra health probes must stay unauthenticated (load balancers/orchestrators
  // hit this with no credentials) — this predates JwtAuthGuard being global.
  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.postgres.isHealthy('postgres'),
      () => this.redis.isHealthy('redis'),
      () => this.rabbitmq.isHealthy('rabbitmq'),
    ]);
  }
}
