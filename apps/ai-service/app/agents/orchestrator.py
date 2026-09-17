import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Any

from app.agents.prompt import build_system_prompt
from app.agents.types import AgentRunResult, AgentStreamEvent, ToolCallTrace
from app.core.config import get_settings
from app.core.schemas import HistoryMessageDto
from app.rag.llm_client import create_message
from app.tools.registry import registry
from app.tools.types import ToolCallResult, ToolContext

logger = logging.getLogger(__name__)

_INCOMPLETE_ANSWER = "I wasn't able to fully answer within the allotted steps."


def _cache_key(name: str, arguments: dict[str, Any]) -> tuple[str, str]:
    return (name, json.dumps(arguments, sort_keys=True, default=str))


async def _run_agent_loop(
    question: str,
    context: ToolContext,
    history: list[HistoryMessageDto] | None,
    conversation_summary: str | None,
) -> AsyncIterator[tuple]:
    """spec §22: the bounded "LLM -> tool -> more steps? -> LLM" loop, as a
    stream of internal step events instead of one blocking result:
    ("tool_call_started", name, arguments), ("tool_call_finished", name,
    ok, payload), and a final ("done", AgentRunResult) that always ends
    the stream. run_agent() and run_agent_stream() below are this
    function's only two consumers — the former drains it and returns only
    the final result (preserving the exact contract every existing test
    and the blocking /agent/run endpoint already depend on), the latter
    reshapes every event into a wire-ready AgentStreamEvent for the
    streaming /agent/run/stream endpoint. Every bound the spec calls out
    is enforced here exactly as before this function existed — max tool
    calls, max iterations, a wall-clock timeout budget, a token budget,
    and an allowed-tool list scoped to the caller's role — a bound being
    hit is a normal, structured outcome (the final AgentRunResult's
    stopped_reason), never an exception. registry.execute() — the same
    server-side-authorized path every tool call already goes through
    outside the agent loop — is the *only* way a tool is ever invoked
    here; nothing in this loop calls a tool's handler directly, and no
    tool handler calls back into this loop (no recursive tool loops by
    construction, not by convention)."""
    settings = get_settings()
    deadline = time.monotonic() + settings.agent_timeout_seconds

    # Defense in depth beyond registry.execute()'s own per-call check: the
    # model is never even offered a tool name its role isn't allowed to
    # call — never let the LLM make an authorization decision, don't even
    # give it standing to try.
    tool_schemas = registry.to_anthropic_tools(role=context.role)
    system_prompt = build_system_prompt(conversation_summary)

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
            yield (
                "done",
                AgentRunResult(answer=last_text or _INCOMPLETE_ANSWER, tool_calls=trace, iterations=iteration - 1, stopped_reason="timeout"),
            )
            return

        # Once any budget is exhausted, or this is the last allowed
        # iteration, stop offering tools at all — Anthropic cannot request
        # a tool_use with no tools in the request, so this deterministically
        # forces a final text answer instead of an abrupt cutoff.
        budget_exhausted = tool_calls_executed >= settings.agent_max_tool_calls or total_tokens >= settings.agent_max_total_tokens
        offer_tools = tool_schemas if (not budget_exhausted and iteration < settings.agent_max_iterations) else None

        try:
            result = await asyncio.wait_for(
                create_message(
                    system=system_prompt,
                    messages=messages,
                    max_tokens=settings.agent_max_tokens_per_turn,
                    tools=offer_tools,
                ),
                timeout=remaining,
            )
        except asyncio.TimeoutError:
            yield (
                "done",
                AgentRunResult(answer=last_text or _INCOMPLETE_ANSWER, tool_calls=trace, iterations=iteration - 1, stopped_reason="timeout"),
            )
            return

        total_tokens += result.input_tokens + result.output_tokens
        if result.text:
            last_text = result.text

        if result.stop_reason != "tool_use":
            yield (
                "done",
                AgentRunResult(answer=result.text or _INCOMPLETE_ANSWER, tool_calls=trace, iterations=iteration, stopped_reason=result.stop_reason),
            )
            return

        messages.append({"role": "assistant", "content": result.raw_content})

        tool_result_blocks = []
        for tool_use in result.tool_uses:
            yield ("tool_call_started", tool_use.name, tool_use.input)

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
                yield ("tool_call_finished", tool_use.name, False, payload)
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
                yield ("tool_call_finished", tool_use.name, call_result.ok, payload)

            tool_result_blocks.append({"type": "tool_result", "tool_use_id": tool_use.id, "content": json.dumps(payload, default=str)})

        messages.append({"role": "user", "content": tool_result_blocks})

    yield (
        "done",
        AgentRunResult(answer=last_text or _INCOMPLETE_ANSWER, tool_calls=trace, iterations=settings.agent_max_iterations, stopped_reason="max_iterations"),
    )


async def run_agent(
    question: str,
    context: ToolContext,
    history: list[HistoryMessageDto] | None = None,
    conversation_summary: str | None = None,
) -> AgentRunResult:
    """Blocking contract, unchanged from before _run_agent_loop existed —
    drains the loop and returns only its final result. Used by the
    blocking POST /agent/run endpoint."""
    async for kind, *rest in _run_agent_loop(question, context, history, conversation_summary):
        if kind == "done":
            return rest[0]
    raise AssertionError("_run_agent_loop ended without a 'done' event")


async def run_agent_stream(
    question: str,
    context: ToolContext,
    history: list[HistoryMessageDto] | None = None,
    conversation_summary: str | None = None,
) -> AsyncIterator[AgentStreamEvent]:
    """Same bounded loop as run_agent, as a stream of wire-ready events
    instead of one blocking result — used by POST /agent/run/stream, the
    endpoint the gateway's real chat flow calls. `tool_call_started`/
    `tool_call_finished` surface as each tool call happens (spec §34:
    "make tool activity visible" in the chat UI); the final `done` event
    carries the same answer/tool-call trace run_agent returns, plus the
    model/provider that answered (echoed back the same way
    stream_rag_query's `done` event does, for the gateway to persist
    alongside the assistant message)."""
    settings = get_settings()
    async for kind, *rest in _run_agent_loop(question, context, history, conversation_summary):
        if kind == "tool_call_started":
            name, arguments = rest
            yield AgentStreamEvent(event="tool_call_started", data={"name": name, "arguments": arguments})
        elif kind == "tool_call_finished":
            name, ok, payload = rest
            yield AgentStreamEvent(
                event="tool_call_finished",
                data={
                    "name": name,
                    "ok": ok,
                    "result": payload if ok else None,
                    "errorCode": payload.get("error") if not ok else None,
                },
            )
        elif kind == "done":
            result: AgentRunResult = rest[0]
            yield AgentStreamEvent(
                event="done",
                data={
                    "answer": result.answer,
                    "stoppedReason": result.stopped_reason,
                    "iterations": result.iterations,
                    "toolCalls": [
                        {
                            "name": call.name,
                            "arguments": call.arguments,
                            "ok": call.ok,
                            "result": call.result,
                            "errorCode": call.error_code,
                        }
                        for call in result.tool_calls
                    ],
                    "model": settings.ai_model,
                    "provider": settings.ai_provider,
                },
            )
