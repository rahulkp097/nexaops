import express from 'express';
import { errorHandler, router } from './routes';

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(router);
// Registered last: Express only routes synchronous throws from the
// handlers above into this once every route has had a chance to match.
app.use(errorHandler);

const port = process.env.PORT ?? 4200;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Mock business service listening on port ${port}`);
});
