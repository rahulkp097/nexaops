# RabbitMQ Topology — Document Ingestion

Declared and owned by `services/document-worker` (`src/rabbitmq/topology.ts`), idempotently on
every startup. Classic TTL+dead-letter-exchange retry pattern — no RabbitMQ plugins required.

| Purpose | Exchange | Queue | Routing key | Key args |
|---|---|---|---|---|
| Main ingestion | `nexaops.ingestion` (direct) | `nexaops.ingestion.documents` | `document.ingest` | `deadLetterExchange: nexaops.ingestion.retry`, `deadLetterRoutingKey: document.ingest.retry` |
| Retry (delay) | `nexaops.ingestion.retry` (direct) | `nexaops.ingestion.documents.retry` | `document.ingest.retry` | `messageTtl: 30000`, `deadLetterExchange: nexaops.ingestion`, `deadLetterRoutingKey: document.ingest` |
| Dead letter | `nexaops.ingestion.dlx` (direct) | `nexaops.ingestion.documents.dlq` | `document.ingest.dlq` | none — terminal |

Channel QoS: `prefetch(10)`, manual acknowledgement mode.

## Retry flow

1. A message on the main queue that's rejected (nack, no requeue) gets dead-lettered to the retry
   exchange.
2. The retry queue holds it for `messageTtl` (30s) with no consumer bound to it — messages just
   sit until they expire.
3. On TTL expiry, RabbitMQ dead-letters the message back to the main exchange, which redelivers
   it to the main queue.
4. A message that should stop retrying (retry-count threshold exceeded) is explicitly published to
   the DLX/DLQ instead, where it becomes terminal.

## What Phase 1 does vs. what Phase 4 does

Phase 1 (this doc) declares the topology and sets channel prefetch — connectivity and structure
only. It does **not** bind a `channel.consume()` handler and does **not** implement retry-count
tracking or DLQ routing logic; that's Phase 4 (Document Ingestion Worker).

## Idempotency-key convention (for Phase 4)

Every message published to the main exchange carries a `messageId` AMQP property (a stable
idempotency key — e.g. the document's ingestion job ID). Phase 4's consumer de-dupes on this
before processing, so a message redelivered after a retry or a crash-before-ack doesn't get
processed twice.
