import express from 'express';

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.PORT ?? 4200;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Mock business service listening on port ${port}`);
});

// Customer/order/inventory/revenue endpoints are added in Phase 10 (Mock Business Platform).
