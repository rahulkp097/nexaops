from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.core.schemas import CamelModel, HistoryMessageDto


class AgentRunRequest(CamelModel):
    question: str = Field(..., min_length=1, max_length=2000)
    organization_id: UUID
    user_id: UUID
    role: Literal["ADMIN", "MANAGER", "EMPLOYEE"]
    history: list[HistoryMessageDto] = []
    # Phase 16: a rolling summary of turns older than `history`'s window,
    # maintained by the gateway. None until a conversation is long enough
    # to have any summarized turns.
    conversation_summary: str | None = None


class ToolCallTraceDto(CamelModel):
    name: str
    arguments: dict[str, Any]
    ok: bool
    result: dict[str, Any] | None = None
    error_code: str | None = None


class AgentRunResponse(CamelModel):
    answer: str
    stopped_reason: str
    iterations: int
    tool_calls: list[ToolCallTraceDto]
