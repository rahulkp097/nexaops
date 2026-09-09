from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.core.schemas import CamelModel


class ToolExecuteRequest(CamelModel):
    tool: str = Field(..., min_length=1, max_length=100)
    arguments: dict[str, Any] = Field(default_factory=dict)
    # Supplied by the caller (the gateway, eventually the Phase 13 agent
    # loop) from its own authenticated request context — never accepted as
    # part of `arguments`, and never trusted from the model itself.
    organization_id: UUID
    user_id: UUID
    role: Literal["ADMIN", "MANAGER", "EMPLOYEE"]


class ToolExecuteResponse(CamelModel):
    ok: bool
    data: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None
