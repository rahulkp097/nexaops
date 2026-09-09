from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base for any DTO crossing the wire to/from the gateway: camelCase
    JSON (documentId, chunkId, ...), matching the gateway's own convention,
    while Python code stays snake_case."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class HistoryMessageDto(CamelModel):
    """One prior conversation turn (Phase 8's "retrieve relevant history"),
    supplied by the gateway from its conversations/messages tables. Shared
    by app.rag and app.agents — both take the same conversation history
    shape. Kept to plain role+content — summarization of long history is
    Phase 16's job."""

    role: Literal["user", "assistant"]
    content: str
