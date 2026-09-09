"""spec §23 (Phase 14 — Combined RAG + Tools), "the flagship workflow":

    Question: "Why was order #10291 delayed and what does the operations
    SOP recommend?"
    Step 1: get_order(10291)
    Step 2: inspect delay reason
    Step 3: search_documents("delay procedure ...")
    Step 4: combine structured order data + SOP evidence
    Step 5: produce explanation
    Step 6: cite SOP source

Phases 11-13 already built a *generic* tool-calling loop — this test's job
is to prove that generic mechanism actually produces this exact combined
flow correctly, exercising the real get_order/search_documents handlers
(business_client + RAG retrieval), not a mocked registry.execute() like
the more unit-focused tests in test_agent_orchestrator.py. Only the
outermost boundaries are mocked: the LLM itself, the mock-business HTTP
call, and the RAG retrieval call — proving "the model does not directly
access the database or documents [...] it requests approved operations
through controlled interfaces" (spec §23) end to end.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

from app.agents.orchestrator import run_agent
from app.rag.llm_client import MessageResult, ToolUseRequest
from app.rag.types import RetrievedChunk
from app.tools.bootstrap import register_default_tools
from app.tools.business_client import MockBusinessNotFoundError
from app.tools.types import ToolContext


def _text_only(text: str) -> MessageResult:
    return MessageResult(
        stop_reason="end_turn", text=text, tool_uses=[], raw_content=[{"type": "text", "text": text}], input_tokens=50, output_tokens=30
    )


def _tool_use(tool_use_id: str, name: str, tool_input: dict) -> MessageResult:
    return MessageResult(
        stop_reason="tool_use",
        text="",
        tool_uses=[ToolUseRequest(id=tool_use_id, name=name, input=tool_input)],
        raw_content=[{"type": "tool_use", "id": tool_use_id, "name": name, "input": tool_input}],
        input_tokens=80,
        output_tokens=25,
    )


async def test_flagship_scenario_combines_get_order_and_search_documents():
    register_default_tools()  # real tool definitions, real handlers — not mocked away

    order_10291 = {
        "id": "10291",
        "customerId": "CUST-1005",
        "status": "DELAYED",
        "items": [{"sku": "SKU-2040", "productName": "Precision Servo Motor", "quantity": 3}],
        "total": 267,
        "placedAt": "2026-07-14",
        "expectedDeliveryAt": "2026-07-21",
        "deliveredAt": None,
        "delayReason": "Inventory shortage: SKU-2040 (Precision Servo Motor) went out of stock "
        "before this order could be fulfilled; restock expected 2026-07-25.",
    }
    sop_chunk = RetrievedChunk(
        chunk_id=uuid4(),
        document_id=uuid4(),
        filename="operations-sop.txt",
        content=(
            "Order Delay Procedure: When an order is delayed due to an inventory shortage, "
            "notify the affected customer within 24 hours and offer either a full refund or "
            "the option to wait for restock."
        ),
        page_number=None,
        score=0.87,
    )

    final_answer = (
        "Order 10291 was delayed because SKU-2040 (Precision Servo Motor) went out of stock. "
        "Per the operations SOP (operations-sop.txt), the customer should be notified within 24 "
        "hours and offered a refund or the option to wait for restock."
    )

    with patch("app.agents.orchestrator.create_message", new_callable=AsyncMock) as mock_create, patch(
        "app.tools.business_tools.business_client.get_order", new_callable=AsyncMock
    ) as mock_get_order, patch("app.tools.search_tool.embed_query", new_callable=AsyncMock) as mock_embed, patch(
        "app.tools.search_tool.retrieve_top_chunks", new_callable=AsyncMock
    ) as mock_retrieve:
        mock_get_order.return_value = order_10291
        mock_embed.return_value = [0.1] * 8
        mock_retrieve.return_value = [sop_chunk]

        mock_create.side_effect = [
            _tool_use("toolu_1", "get_order", {"order_id": "10291"}),
            _tool_use("toolu_2", "search_documents", {"query": "delay procedure for inventory shortage"}),
            _text_only(final_answer),
        ]

        context = ToolContext(organization_id=uuid4(), user_id=uuid4(), role="MANAGER")
        result = await run_agent(
            "Why was order #10291 delayed and what does the operations SOP recommend?", context
        )

    # Step 1/2: get_order was actually called (real handler, real
    # business_client boundary) and its delay reason is in the trace.
    assert result.tool_calls[0].name == "get_order"
    assert result.tool_calls[0].ok is True
    assert result.tool_calls[0].result["delayReason"].startswith("Inventory shortage: SKU-2040")

    # Step 3: search_documents was actually called (real handler, real RAG
    # retrieval boundary), scoped to this org (never accepted from the model).
    assert result.tool_calls[1].name == "search_documents"
    assert result.tool_calls[1].ok is True
    assert result.tool_calls[1].result["results"][0]["filename"] == "operations-sop.txt"
    mock_retrieve.assert_awaited_once()
    assert mock_retrieve.await_args.args[0] == context.organization_id

    # Step 4-6: the final answer combines both, and the loop reports a
    # clean completion, not a bound cutoff.
    assert result.answer == final_answer
    assert result.stopped_reason == "end_turn"
    assert result.iterations == 3


async def test_flagship_scenario_still_answers_gracefully_when_the_order_is_unknown():
    register_default_tools()

    with patch("app.agents.orchestrator.create_message", new_callable=AsyncMock) as mock_create, patch(
        "app.tools.business_tools.business_client.get_order", new_callable=AsyncMock
    ) as mock_get_order:
        mock_get_order.side_effect = MockBusinessNotFoundError("404")
        mock_create.side_effect = [
            _tool_use("toolu_1", "get_order", {"order_id": "99999"}),
            _text_only("I couldn't find an order with that id."),
        ]

        context = ToolContext(organization_id=uuid4(), user_id=uuid4(), role="MANAGER")
        result = await run_agent("Why was order #99999 delayed?", context)

    assert result.tool_calls[0].result == {"found": False, "orderId": "99999"}
    assert result.answer == "I couldn't find an order with that id."
