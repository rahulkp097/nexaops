from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ToolCallTrace:
    """One tool call made during an agent run — spec §17/§18 territory
    ("Persist ... tool execution metadata", "Tool names + duration") that a
    caller (eventually the gateway) can persist alongside the assistant
    message. Recorded whether the call succeeded or not."""

    name: str
    arguments: dict[str, Any]
    ok: bool
    result: dict[str, Any] | None
    error_code: str | None


@dataclass(frozen=True)
class AgentRunResult:
    answer: str
    tool_calls: list[ToolCallTrace] = field(default_factory=list)
    iterations: int = 0
    # "end_turn" (the model finished normally) or one of the bound names
    # below (spec §22: safe failure/partial-result handling) — never an
    # exception; a bound being hit is a normal, structured outcome.
    stopped_reason: str = "end_turn"
