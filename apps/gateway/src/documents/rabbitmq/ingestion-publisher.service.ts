import { randomUUID } from 'crypto';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type Channel, type ChannelModel } from 'amqplib';

// Exchange/routing-key literals duplicated here rather than imported: this
// gateway and services/document-worker are separate npm workspaces and no
// shared package is wired into either Docker build (see
// packages/shared-types, which nothing actually imports for that reason).
// Must stay in sync with services/document-worker/src/rabbitmq/topology.ts
// and docs/architecture/rabbitmq-topology.md.
export const INGESTION_EXCHANGE = 'nexaops.ingestion';
export const INGESTION_ROUTING_KEY = 'document.ingest';

export interface IngestionJobPayload {
  documentId: string;
  organizationId: string;
  jobId: string;
}

@Injectable()
export class IngestionPublisher implements OnModuleDestroy {
  private connectionPromise: Promise<ChannelModel> | null = null;
  private channelPromise: Promise<Channel> | null = null;

  constructor(private readonly config: ConfigService) {}

  async publishIngestionJob(input: { documentId: string; organizationId: string }): Promise<void> {
    const jobId = randomUUID();
    const payload: IngestionJobPayload = { ...input, jobId };
    const channel = await this.getChannel();
    channel.publish(INGESTION_EXCHANGE, INGESTION_ROUTING_KEY, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json',
      messageId: jobId,
    });
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

  private async getChannel(): Promise<Channel> {
    if (!this.channelPromise) {
      this.channelPromise = this.createChannel().catch((error) => {
        this.channelPromise = null;
        throw error;
      });
    }
    return this.channelPromise;
  }

  private async createChannel(): Promise<Channel> {
    const connection = await this.getConnection();
    const channel = await connection.createChannel();
    // Producer-side responsibility (standard AMQP practice): assert the
    // exchange defensively so a publish doesn't race the worker's own
    // setupTopology() on startup — docker-compose.yml has no depends_on
    // between gateway and document-worker. Does not bind/declare the
    // queue; that stays the worker's job per the topology doc.
    await channel.assertExchange(INGESTION_EXCHANGE, 'direct', { durable: true });
    channel.once('close', () => {
      this.channelPromise = null;
    });
    channel.once('error', () => {
      this.channelPromise = null;
    });
    return channel;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connectionPromise) {
      const connection = await this.connectionPromise.catch(() => null);
      await connection?.close();
    }
  }
}
