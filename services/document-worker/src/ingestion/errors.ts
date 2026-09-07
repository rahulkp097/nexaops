// The document referenced by a job no longer exists (e.g. deleted via
// DELETE /documents/:id between publish and processing) — not an error,
// just nothing left to do.
export class DocumentNotFoundError extends Error {}

// The message's organizationId doesn't match the document's actual
// organization_id. Should never legitimately happen; never retried.
export class TenantMismatchError extends Error {}

// Content that will never succeed no matter how many times it's retried
// (corrupt/unsupported file, no extractable text).
export class UnrecoverableIngestionError extends Error {}
