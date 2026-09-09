import asyncio
import json
import logging
import time
from typing import Any

from app.agents.prompt import SYSTEM_PROMPT
from app.agents.types import AgentRunResult, ToolCallTrace
from app.core.config import get_settings
from app.core.schemas import HistoryMessageDto
from app.rag.llm_client import create_message
from app.tools.registry import registry
from app.tools.types import ToolCallResult, ToolContext

logger = logging.getLogger(__name__)

_INCOMPLETE_ANSWER = "I wasn't able to fully answer within the allotted steps."


def _cache_key(name: str, arguments: dict[str, Any]) -> tuple[str, str]:
    return (name, json.dumps(arguments, sort_keys=True, default=str))


async def run_agent(
    question: str,
    context: ToolContext,
    history: list[HistoryMessageDto] | None = None,
) -> AgentRunResult:
    """spec §22: the bounded "LLM -> tool -> more steps? -> LLM" loop.
    Every bound the spec calls out is enforced here — max tool calls, max
    iterations, a wall-clock timeout budget, a token budget, and an
    allowed-tool list scoped to the caller's role. A bound being hit is a
    normal, structured outcome (AgentRunResult.stopped_reason), never an
    exception. registry.execute() — the same server-side-authorized path
    every tool call already goes through outside the agent loop — is the
    *only* way a tool is ever invoked here; nothing in this loop calls a
    tool's handler directly, and no tool handler calls back into this
    loop (no recursive tool loops by construction, not by convention)."""
    settings = get_settings()
    deadline = time.monotonic() + settings.agent_timeout_seconds

    # Defense in depth beyond registry.execute()'s own per-call check: the
    # model is never even offered a tool name its role isn't allowed to
    # call — never let the LLM make an authorization decision, don't even
    # give it standing to try.
    tool_schemas = registry.to_anthropic_tools(role=context.role)

    messages: list[dict[str, Any]] = [{"role": turn.role, "content": turn.content} for turn in (history or [])]
    messages.append({"role": "user", "content": question})

    trace: list[ToolCallTrace] = []
    result_cache: dict[tuple[str, str], ToolCallResult] = {}
    tool_calls_executed = 0
    total_tokens = 0
    last_text = ""

    for iteration in range(1, settings.agent_max_iterations + 1):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return AgentRunResult(answer=last_text or _INCOMPLETE_ANSWER, tool_calls=trace, iterations=iteration - 1, stopped_reason="timeout")

        # Once any budget is exhausted, or this is the last allowed
        # iteration, stop offering tools at all — Anthropic cannot request
        # a tool_use with no tools in the request, so this deterministically
        # forces a final text answer instead of an abrupt cutoff.
        budget_exhausted = tool_calls_executed >= settings.agent_max_tool_calls or total_tokens >= settings.agent_max_total_tokens
        offer_tools = tool_schemas if (not budget_exhausted and iteration < settings.agent_max_iterations) else None

        try:
            result = await asyncio.wait_for(
                create_message(
                    system=SYSTEM_PROMPT,
                    messages=messages,
                    max_tokens=settings.agent_max_tokens_per_turn,
                    tools=offer_tools,
                ),
                timeout=remaining,
            )
        except asyncio.TimeoutError:
            return AgentRunResult(answer=last_text or _INCOMPLETE_ANSWER, tool_calls=trace, iterations=iteration - 1, stopped_reason="timeout")

        total_tokens += result.input_tokens + result.output_tokens
        if result.text:
            last_text = result.text

        if result.stop_reason != "tool_use":
            return AgentRunResult(answer=result.text or _INCOMPLETE_ANSWER, tool_calls=trace, iterations=iteration, stopped_reason=result.stop_reason)

        messages.append({"role": "assistant", "content": result.raw_content})

        tool_result_blocks = []
        for tool_use in result.tool_uses:
            key = _cache_key(tool_use.name, tool_use.input)
            call_result: ToolCallResult | None

            if key in result_cache:
                call_result = result_cache[key]
            elif tool_calls_executed >= settings.agent_max_tool_calls:
                call_result = None  # signals "budget exceeded" below, not executed at all
            else:
                call_result = await registry.execute(tool_use.name, tool_use.input, context)
                result_cache[key] = call_result
                tool_calls_executed += 1

            if call_result is None:
                trace.append(
                    ToolCallTrace(
                        name=tool_use.name, arguments=tool_use.input, ok=False, result=None, error_code="tool_call_budget_exceeded"
                    )
                )
                payload: dict[str, Any] = {"error": "tool_call_budget_exceeded", "message": "Maximum tool calls for this request has been reached"}
            else:
                trace.append(
                    ToolCallTrace(
                        name=tool_use.name,
                        arguments=tool_use.input,
                        ok=call_result.ok,
                        result=call_result.data,
                        error_code=call_result.error_code,
                    )
                )
                payload = call_result.data if call_result.ok else {"error": call_result.error_code, "message": call_result.error_message}

            tool_result_blocks.append({"type": "tool_result", "tool_use_id": tool_use.id, "content": json.dumps(payload, default=str)})

        messages.append({"role": "user", "content": tool_result_blocks})

    return AgentRunResult(answer=last_text or _INCOMPLETE_ANSWER, tool_calls=trace, iterations=settings.agent_max_iterations, stopped_reason="max_iterations")
