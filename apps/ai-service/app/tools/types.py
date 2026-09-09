from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from pydantic import BaseModel


@dataclass(frozen=True)
class ToolContext:
    """Identity/tenant context a tool executes under. Always constructed by
    the server from an authenticated request (the gateway today; the agent
    loop in Phase 13) — a tool's input schema must never contain any of
    these fields, so the model has no way to supply or override them."""

    organization_id: UUID
    user_id: UUID
    role: str


@dataclass(frozen=True)
class ToolCallResult:
    """What registry.execute() always returns — success or failure alike —
    so a caller (the LLM, via the future agent loop) gets a structured
    result it can reason about instead of an exception tearing down the
    whole turn."""

    ok: bool
    data: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    # Written for the model: what this tool does *and* what it can't do —
    # spec §20 calls this out as its own required property, not just a
    # one-line label.
    description: str
    input_model: type[BaseModel]
    handler: Callable[[BaseModel, ToolContext], Awaitable[dict[str, Any]]]
    # None means "any authenticated role" — see users/user.types.ts's
    # Role union on the gateway side for the same ADMIN/MANAGER/EMPLOYEE set.
    allowed_roles: frozenset[str] | None
    timeout_seconds: float
    max_result_bytes: int
