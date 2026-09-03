import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { connect, type ChannelModel } from 'amqplib';

@Injectable()
export class RabbitmqHealthIndicator extends HealthIndicator implements OnModuleDestroy {
  private connectionPromise: Promise<ChannelModel> | null = null;

  constructor(private readonly config: ConfigService) {
    super();
  }

  private async getConnection(): Promise<ChannelModel> {
    if (!this.connectionPromise) {
      this.connectionPromise = connect(this.config.get<string>('RABBITMQ_URL') as string).catch(
        (error) => {
          this.connectionPromise = null;
          throw error;
        },
      );
    }
    return this.connectionPromise;
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const connection = await this.getConnection();
      const channel = await connection.createChannel();
      await channel.close();
      return this.getStatus(key, true);
    } catch (error) {
      this.connectionPromise = null;
      throw new HealthCheckError(
        'RabbitMQ check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connectionPromise) {
      const connection = await this.connectionPromise.catch(() => null);
      await connection?.close();
    }
  }
}
