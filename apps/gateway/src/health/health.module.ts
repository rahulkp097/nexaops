import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PostgresHealthIndicator } from './indicators/postgres.health-indicator';
import { RabbitmqHealthIndicator } from './indicators/rabbitmq.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PostgresHealthIndicator, RedisHealthIndicator, RabbitmqHealthIndicator],
})
export class HealthModule {}
