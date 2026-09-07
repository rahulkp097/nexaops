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
only. Phase 4 (`services/document-worker/src/rabbitmq/consumer.ts`) implements the actual
`channel.consume()` handler and the retry-count/DLQ routing logic described below.

## Retry-count tracking (Phase 4)

The consumer does **not** maintain a hand-rolled retry-count header. It reads RabbitMQ's
automatically-populated `x-death` message header, which accumulates one entry per distinct
`(queue, reason)` pair with an incrementing `count` — rather than appending a new entry per retry —
so `x-death` entries for `{queue: nexaops.ingestion.documents, reason: 'rejected'}` give a stable
"how many times has this exact message already failed" counter for free
(`src/ingestion/retry-policy.ts`).

Once that count would reach `INGESTION_MAX_ATTEMPTS` (default 5, ~2.5 minutes of retrying at the
fixed 30s retry TTL), the consumer stops nacking-to-retry and instead explicitly publishes the
message to the DLX/DLQ itself (a direct `channel.publish(DLX_EXCHANGE, DLQ_ROUTING_KEY, ...)`,
then acks the original) — this is the "message that should stop retrying" case referenced above.
Some errors (a tenant mismatch, an unsupported/corrupt file) skip the retry loop entirely and go
straight to the DLQ, since retrying them can never succeed.

## Idempotency

Every message published to the main exchange carries a `messageId` AMQP property (a fresh UUID
per publish — see `apps/gateway/src/documents/rabbitmq/ingestion-publisher.service.ts`). The
consumer does not maintain an explicit dedup store keyed on this id. Instead, processing a message
always deletes and re-inserts *all* of that document's chunks inside one transaction
(`services/document-worker/src/documents/repository.ts`'s `replaceDocumentChunks`) before marking
the document `READY` — so reprocessing (whether from broker redelivery, a crash before ack, or a
genuine `POST /documents/:id/reindex`) always converges to the same correct end state, regardless
of how many times it happens. `messageId` remains useful for tracing/logging a given publish
attempt, but correctness does not depend on deduplicating it.
