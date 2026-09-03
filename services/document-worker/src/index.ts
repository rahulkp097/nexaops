import express from 'express';

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.PORT ?? 4100;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Document worker health server listening on port ${port}`);
});

// Queue consumer wiring is added in Phase 4 (Document Ingestion Worker).
