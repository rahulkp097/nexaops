import express from 'express';
import { checkDatabase } from './db';
import { getEmbeddingPipeline } from './model/embeddings';
import { getTokenizer } from './model/tokenizer';
import { checkRabbitmq, getConnection } from './rabbitmq/health';
import { startConsumer } from './rabbitmq/consumer';
import { setupTopology } from './rabbitmq/topology';

const app = express();

app.get('/health', async (_req, res) => {
  const [postgres, rabbitmq] = await Promise.allSettled([checkDatabase(), checkRabbitmq()]);

  const checks = {
    postgres: postgres.status === 'fulfilled' ? 'ok' : 'error',
    rabbitmq: rabbitmq.status === 'fulfilled' ? 'ok' : 'error',
  };
  const healthy = postgres.status === 'fulfilled' && rabbitmq.status === 'fulfilled';

  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks });
});

const port = process.env.PORT ?? 4100;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Document worker health server listening on port ${port}`);
});

async function startIngestion(): Promise<void> {
  const connection = await getConnection();
  // A confirm channel (not a plain one): startConsumer's DLQ publish needs
  // a broker-acknowledged confirm before it's safe to ack the original
  // message (Phase 19, spec §28's "Publisher confirms where appropriate").
  const channel = await connection.createConfirmChannel();
  await setupTopology(channel);

  // Warm up the model once at startup, not on whichever message happens
  // to arrive first — surfaces model-load/network failures in boot logs
  // and avoids a slow cold start mid-batch.
  await Promise.all([getTokenizer(), getEmbeddingPipeline()]);

  await startConsumer(channel);
  // eslint-disable-next-line no-console
  console.log('Document ingestion consumer started');
}

startIngestion().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start document ingestion consumer', error);
});
