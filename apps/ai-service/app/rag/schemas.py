from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base for RAG DTOs: camelCase over the wire, matching the gateway's
    existing wire convention and spec §15's example JSON (documentId,
    chunkId, ...), while Python code stays snake_case."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RagQueryRequest(CamelModel):
    question: str = Field(..., min_length=1, max_length=2000)
    organization_id: UUID
    # Generic tenant/business-scope filter (spec §16), applied as a JSONB
    # containment match against document_chunks.metadata. No concrete
    # business-metadata schema exists yet, so this stays a plain dict
    # rather than a speculative filter DSL.
    metadata_filter: dict[str, Any] | None = None


class SourceDto(CamelModel):
    document_id: UUID
    chunk_id: UUID
    filename: str
    page: int | None = None
    score: float


class RagQueryResponse(CamelModel):
    answer: str
    sources: list[SourceDto]
