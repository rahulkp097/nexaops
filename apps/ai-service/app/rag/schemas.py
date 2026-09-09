from typing import Any
from uuid import UUID

from pydantic import Field

from app.core.schemas import CamelModel, HistoryMessageDto


class RagQueryRequest(CamelModel):
    question: str = Field(..., min_length=1, max_length=2000)
    organization_id: UUID
    # Prior turns of the same conversation, oldest first, excluding
    # `question` itself. Empty for a conversation's first message.
    history: list[HistoryMessageDto] = []
    # Phase 16: a rolling summary of turns older than `history`'s window,
    # maintained by the gateway. None until a conversation is long enough
    # to have any summarized turns.
    conversation_summary: str | None = None
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
