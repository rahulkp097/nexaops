import express from 'express';
import { checkDatabase } from './db';
import { checkRabbitmq, getConnection } from './rabbitmq/health';
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

// Queue consumer wiring (channel.consume) is added in Phase 4. This only
// declares the topology so it exists ahead of time and is exercised by
// the health check.
getConnection()
  .then((connection) => connection.createChannel())
  .then((channel) => setupTopology(channel))
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to set up RabbitMQ topology', error);
  });
