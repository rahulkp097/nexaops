from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.agents.types import AgentRunResult, ToolCallTrace
from app.main import app
from app.rag.errors import LlmRequestError, LlmUnavailableError

# Same lifespan-patching convention as tests/test_rag_api.py.


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.agent.run_agent", new_callable=AsyncMock)
def test_run_returns_the_answer_and_tool_call_trace(mock_run_agent, *_mocks):
    mock_run_agent.return_value = AgentRunResult(
        answer="Order 10291 was delayed due to a stock shortage.",
        tool_calls=[
            ToolCallTrace(
                name="get_order", arguments={"order_id": "10291"}, ok=True, result={"status": "DELAYED"}, error_code=None
            )
        ],
        iterations=2,
        stopped_reason="end_turn",
    )

    with TestClient(app) as client:
        response = client.post(
            "/agent/run",
            json={
                "question": "Why was order 10291 delayed?",
                "organizationId": str(uuid4()),
                "userId": str(uuid4()),
                "role": "MANAGER",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "Order 10291 was delayed due to a stock shortage."
    assert body["stoppedReason"] == "end_turn"
    assert body["iterations"] == 2
    assert body["toolCalls"] == [
        {
            "name": "get_order",
            "arguments": {"order_id": "10291"},
            "ok": True,
            "result": {"status": "DELAYED"},
            "errorCode": None,
        }
    ]


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.agent.run_agent", new_callable=AsyncMock)
def test_run_maps_llm_unavailable_to_503(mock_run_agent, *_mocks):
    mock_run_agent.side_effect = LlmUnavailableError("rate limited")

    with TestClient(app) as client:
        response = client.post(
            "/agent/run",
            json={"question": "question", "organizationId": str(uuid4()), "userId": str(uuid4()), "role": "ADMIN"},
        )

    assert response.status_code == 503


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.agent.run_agent", new_callable=AsyncMock)
def test_run_maps_llm_request_error_to_502(mock_run_agent, *_mocks):
    mock_run_agent.side_effect = LlmRequestError("bad key")

    with TestClient(app) as client:
        response = client.post(
            "/agent/run",
            json={"question": "question", "organizationId": str(uuid4()), "userId": str(uuid4()), "role": "ADMIN"},
        )

    assert response.status_code == 502


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
def test_run_rejects_a_malformed_role(*_mocks):
    with TestClient(app) as client:
        response = client.post(
            "/agent/run",
            json={
                "question": "question",
                "organizationId": str(uuid4()),
                "userId": str(uuid4()),
                "role": "SUPERUSER",
            },
        )

    assert response.status_code == 422


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.agent.run_agent", new_callable=AsyncMock)
def test_run_forwards_history_and_context_to_the_orchestrator(mock_run_agent, *_mocks):
    mock_run_agent.return_value = AgentRunResult(answer="ok", tool_calls=[], iterations=1, stopped_reason="end_turn")
    org_id = uuid4()

    with TestClient(app) as client:
        client.post(
            "/agent/run",
            json={
                "question": "Follow-up?",
                "organizationId": str(org_id),
                "userId": str(uuid4()),
                "role": "EMPLOYEE",
                "history": [{"role": "user", "content": "Hi"}],
            },
        )

    args = mock_run_agent.call_args.args
    assert args[0] == "Follow-up?"
    assert args[1].organization_id == org_id
    assert args[1].role == "EMPLOYEE"
    assert args[2][0].content == "Hi"


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.agent.run_agent", new_callable=AsyncMock)
def test_run_forwards_conversation_summary_to_the_orchestrator(mock_run_agent, *_mocks):
    mock_run_agent.return_value = AgentRunResult(answer="ok", tool_calls=[], iterations=1, stopped_reason="end_turn")

    with TestClient(app) as client:
        client.post(
            "/agent/run",
            json={
                "question": "Follow-up?",
                "organizationId": str(uuid4()),
                "userId": str(uuid4()),
                "role": "EMPLOYEE",
                "conversationSummary": "The user previously asked about order 10291.",
            },
        )

    args = mock_run_agent.call_args.args
    assert args[3] == "The user previously asked about order 10291."


def _parse_sse(body: str) -> list[tuple[str, dict]]:
    import json

    events = []
    for block in body.strip().split("\n\n"):
        lines = block.splitlines()
        event = next(line.removeprefix("event: ") for line in lines if line.startswith("event: "))
        data = next(line.removeprefix("data: ") for line in lines if line.startswith("data: "))
        events.append((event, json.loads(data)))
    return events


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.agent.run_agent_stream")
def test_run_stream_forwards_events_as_sse(mock_run_agent_stream, *_mocks):
    from app.agents.types import AgentStreamEvent

    async def fake_stream(*_args, **_kwargs):
        yield AgentStreamEvent(event="tool_call_started", data={"name": "get_order", "arguments": {"order_id": "10291"}})
        yield AgentStreamEvent(event="tool_call_finished", data={"name": "get_order", "ok": True, "result": {"status": "DELAYED"}, "errorCode": None})
        yield AgentStreamEvent(event="done", data={"answer": "Delayed.", "stoppedReason": "end_turn", "iterations": 2, "toolCalls": [], "model": "claude-sonnet-5", "provider": "anthropic"})

    mock_run_agent_stream.side_effect = fake_stream

    with TestClient(app) as client:
        response = client.post(
            "/agent/run/stream",
            json={"question": "Why was order 10291 delayed?", "organizationId": str(uuid4()), "userId": str(uuid4()), "role": "MANAGER"},
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = _parse_sse(response.text)
    assert events == [
        ("tool_call_started", {"name": "get_order", "arguments": {"order_id": "10291"}}),
        ("tool_call_finished", {"name": "get_order", "ok": True, "result": {"status": "DELAYED"}, "errorCode": None}),
        ("done", {"answer": "Delayed.", "stoppedReason": "end_turn", "iterations": 2, "toolCalls": [], "model": "claude-sonnet-5", "provider": "anthropic"}),
    ]


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.agent.run_agent_stream")
def test_run_stream_maps_llm_unavailable_to_an_error_event(mock_run_agent_stream, *_mocks):
    async def fake_stream(*_args, **_kwargs):
        raise LlmUnavailableError("rate limited")
        yield  # pragma: no cover - makes this an async generator function

    mock_run_agent_stream.side_effect = fake_stream

    with TestClient(app) as client:
        response = client.post(
            "/agent/run/stream",
            json={"question": "question", "organizationId": str(uuid4()), "userId": str(uuid4()), "role": "ADMIN"},
        )

    # The HTTP status is already 200 by the time the error occurs (streaming
    # has started) — the failure surfaces as an `error` SSE event instead.
    assert response.status_code == 200
    events = _parse_sse(response.text)
    assert events == [("error", {"message": "AI provider temporarily unavailable", "retryable": True})]
