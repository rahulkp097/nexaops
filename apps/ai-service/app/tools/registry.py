import asyncio
import json
import logging
import time
from typing import Any

from pydantic import ValidationError

from app.tools.errors import (
    ToolAuthorizationError,
    ToolNotFoundError,
    ToolResultTooLargeError,
    ToolTimeoutError,
    ToolValidationError,
)
from app.tools.types import ToolCallResult, ToolContext, ToolDefinition

logger = logging.getLogger(__name__)


class ToolRegistry:
    """spec §20: "Create an explicit tool registry. The model may select
    only registered tools." This is the sole authority on: what tools
    exist, what arguments they accept, who's allowed to call them, and how
    long/how much output they're allowed. Nothing calls a tool by any path
    other than `execute()` below."""

    def __init__(self) -> None:
        self._definitions: dict[str, ToolDefinition] = {}

    def register(self, definition: ToolDefinition) -> None:
        if definition.name in self._definitions:
            raise ValueError(f"Tool already registered: {definition.name}")
        self._definitions[definition.name] = definition

    def clear(self) -> None:
        self._definitions.clear()

    def get(self, name: str) -> ToolDefinition | None:
        return self._definitions.get(name)

    def list_definitions(self) -> list[ToolDefinition]:
        return list(self._definitions.values())

    def to_anthropic_tools(self) -> list[dict[str, Any]]:
        """The `tools` parameter shape Anthropic's Messages API expects —
        what the (Phase 13) agent loop hands the model so it can select a
        tool by name. Unregistered tool names are therefore never even
        visible to the model, let alone callable."""
        tools = []
        for definition in self._definitions.values():
            schema = definition.input_model.model_json_schema()
            schema.pop("title", None)
            tools.append(
                {
                    "name": definition.name,
                    "description": definition.description,
                    "input_schema": schema,
                }
            )
        return tools

    async def execute(self, name: str, raw_arguments: dict[str, Any], context: ToolContext) -> ToolCallResult:
        start = time.monotonic()
        try:
            result = await self._execute_unsafe(name, raw_arguments, context)
            duration_ms = round((time.monotonic() - start) * 1000, 1)
            logger.info(
                "Tool call succeeded: tool=%s organization_id=%s user_id=%s duration_ms=%s",
                name,
                context.organization_id,
                context.user_id,
                duration_ms,
            )
            return ToolCallResult(ok=True, data=result)
        except (
            ToolNotFoundError,
            ToolValidationError,
            ToolAuthorizationError,
            ToolTimeoutError,
            ToolResultTooLargeError,
        ) as exc:
            duration_ms = round((time.monotonic() - start) * 1000, 1)
            logger.warning(
                "Tool call rejected: tool=%s organization_id=%s user_id=%s duration_ms=%s code=%s: %s",
                name,
                context.organization_id,
                context.user_id,
                duration_ms,
                exc.code,
                exc,
            )
            return ToolCallResult(ok=False, error_code=exc.code, error_message=str(exc))
        except Exception:
            duration_ms = round((time.monotonic() - start) * 1000, 1)
            # Never let an unexpected exception (traceback, internal detail)
            # reach the caller/model — log it fully here, return only a
            # generic, stable error contract.
            logger.exception(
                "Tool call failed unexpectedly: tool=%s organization_id=%s user_id=%s duration_ms=%s",
                name,
                context.organization_id,
                context.user_id,
                duration_ms,
            )
            return ToolCallResult(ok=False, error_code="execution_failed", error_message="Tool execution failed")

    async def _execute_unsafe(self, name: str, raw_arguments: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        definition = self.get(name)
        if definition is None:
            raise ToolNotFoundError(f"No such tool: {name}")

        if definition.allowed_roles is not None and context.role not in definition.allowed_roles:
            raise ToolAuthorizationError(f"Role {context.role!r} is not allowed to call tool {name!r}")

        try:
            validated_input = definition.input_model.model_validate(raw_arguments)
        except ValidationError as exc:
            raise ToolValidationError(f"Invalid arguments for tool {name!r}: {exc}") from exc

        try:
            result = await asyncio.wait_for(
                definition.handler(validated_input, context), timeout=definition.timeout_seconds
            )
        except asyncio.TimeoutError as exc:
            raise ToolTimeoutError(f"Tool {name!r} timed out after {definition.timeout_seconds}s") from exc

        encoded_size = len(json.dumps(result, default=str).encode("utf-8"))
        if encoded_size > definition.max_result_bytes:
            raise ToolResultTooLargeError(
                f"Tool {name!r} result was {encoded_size} bytes, exceeding the {definition.max_result_bytes} limit"
            )

        return result


registry = ToolRegistry()
