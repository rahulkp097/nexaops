import json
import logging
import time
from dataclasses import asdict
from typing import Any
from uuid import UUID

from app.core.config import get_settings
from app.evaluation import scoring
from app.evaluation.schemas import EvaluationCaseResultDto, RunEvaluationRequest, RunEvaluationResponse
from app.evaluation.types import EvaluationCase, EvaluationCaseResult
from app.agents.orchestrator import run_agent
from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.rag.llm_client import generate_answer
from app.rag.prompt import build_messages, build_system_prompt
from app.rag.service import _retrieve_context
from app.sql.errors import SqlExecutionError, SqlValidationError
from app.sql.executor import execute_readonly_query
from app.sql.validator import validate_and_rewrite
from app.tools.registry import registry
from app.tools.types import ToolContext

logger = logging.getLogger(__name__)

_RAG_CATEGORIES = frozenset({"DOCUMENT_QA", "MULTI_HOP", "EXACT_ID", "NO_ANSWER", "PROMPT_INJECTION"})
_AGENT_CATEGORIES = frozenset({"COMBINED", "AGENT_MULTI_STEP"})


def _elapsed_ms(start: float) -> int:
    return round((time.monotonic() - start) * 1000)


async def run_evaluation(request: RunEvaluationRequest) -> RunEvaluationResponse:
    """Executes every case in `request.cases` against the matching pipeline
    (RAG, agent, tool registry, or the SQL validator directly), scoring
    each with app.evaluation.scoring's structural, LLM-independent checks.
    A single case raising never aborts the run — spec §22/§20's "never a
    raw exception" convention applied to evaluation itself, since a broken
    fixture case shouldn't hide every other case's result."""
    settings = get_settings()
    context = ToolContext(organization_id=request.organization_id, user_id=request.user_id, role=request.role)
    run_start = time.monotonic()

    results: list[EvaluationCaseResult] = []
    for dto in request.cases:
        case = EvaluationCase(
            id=dto.id,
            category=dto.category,
            question=dto.question,
            expected_answer_contains=dto.expected_answer_contains,
            expected_sources=dto.expected_sources,
            expected_tool_names=dto.expected_tool_names,
            metadata=dto.metadata,
        )
        try:
            result = await _run_case(case, request.organization_id, context)
        except Exception as exc:  # noqa: BLE001 - see docstring: one case must never abort the run
            logger.exception("Evaluation case %s (%s) failed unexpectedly", case.id, case.category)
            result = EvaluationCaseResult(
                case_id=case.id,
                category=case.category,
                question=case.question,
                passed=False,
                latency_ms=0,
                answer=None,
                scores={},
                error=f"Unexpected error: {exc}",
            )
        results.append(result)

    metrics = aggregate_metrics(results)
    duration_ms = round((time.monotonic() - run_start) * 1000, 1)
    # spec §27: "Evaluation result." — one summary line per run, not one
    # per case (each case's own pipeline call already logs itself).
    logger.info(
        "Evaluation run completed: organization_id=%s total_cases=%s passed=%s pass_rate=%.2f duration_ms=%s",
        request.organization_id,
        metrics["totalCases"],
        metrics["passedCases"],
        metrics["passRate"],
        duration_ms,
    )

    return RunEvaluationResponse(
        results=[EvaluationCaseResultDto(**asdict(r)) for r in results],
        metrics=metrics,
        model=settings.ai_model,
        provider=settings.ai_provider,
    )


async def _run_case(case: EvaluationCase, organization_id: UUID, context: ToolContext) -> EvaluationCaseResult:
    if case.category in _RAG_CATEGORIES:
        return await _run_rag_case(case, organization_id)
    if case.category == "CROSS_TENANT":
        return await _run_cross_tenant_case(case, organization_id)
    if case.category == "SQL":
        return await _run_sql_case(case)
    if case.category == "BUSINESS_API":
        return await _run_business_api_case(case, context)
    if case.category in _AGENT_CATEGORIES:
        return await _run_agent_case(case, context)
    raise ValueError(f"Unknown evaluation category: {case.category}")


async def _run_rag_case(case: EvaluationCase, organization_id: UUID) -> EvaluationCaseResult:
    """Retrieval and generation are scored separately (unlike a plain
    run_rag_query call) so that recallAtK/citationAccuracy — properties of
    retrieval alone — still get a real score even when the generation step
    fails, e.g. the account's known zero-credit-balance gap. Without this
    split, every RAG-based case would show zero signal whenever the LLM
    call fails, hiding a retrieval regression behind a billing error."""
    start = time.monotonic()
    chunks, sources = await _retrieve_context(case.question, organization_id, None)

    filenames = [source.filename for source in sources]
    recall, citation = scoring.score_sources(case.expected_sources, filenames)
    scores: dict[str, Any] = {"recallAtK": recall, "citationAccuracy": citation}
    evidence_found = recall >= 1.0 if case.expected_sources else True

    settings = get_settings()
    try:
        answer = await generate_answer(
            system=build_system_prompt(),
            messages=build_messages([], case.question, chunks),
            max_tokens=settings.rag_max_answer_tokens,
        )
    except (LlmRequestError, LlmUnavailableError) as exc:
        return EvaluationCaseResult(
            case_id=case.id,
            category=case.category,
            question=case.question,
            passed=False,
            latency_ms=_elapsed_ms(start),
            answer=None,
            scores=scores,
            error=str(exc),
        )
    latency_ms = _elapsed_ms(start)
    scores["faithfulness"] = scoring.score_faithfulness(answer, len(sources))

    if case.category == "NO_ANSWER":
        admitted = scoring.admits_insufficient_evidence(answer)
        scores["insufficientEvidenceAdmitted"] = admitted
        passed = admitted
    elif case.category == "PROMPT_INJECTION":
        resisted = not scoring.contains(answer, case.metadata.get("forbiddenContains"))
        scores["injectionResisted"] = resisted
        passed = resisted and evidence_found
    else:  # DOCUMENT_QA, MULTI_HOP, EXACT_ID
        answer_ok = scoring.contains(answer, case.expected_answer_contains)
        scores["answerCorrectness"] = answer_ok
        passed = answer_ok and evidence_found

    return EvaluationCaseResult(
        case_id=case.id,
        category=case.category,
        question=case.question,
        passed=passed,
        latency_ms=latency_ms,
        answer=answer,
        scores=scores,
    )


async def _run_cross_tenant_case(case: EvaluationCase, organization_id: UUID) -> EvaluationCaseResult:
    """Retrieval only, deliberately bypassing the LLM call — tenant
    isolation is a property of the SQL WHERE clause in
    app.rag.retrieval.search_by_vector/search_by_keyword, not of anything
    the model does, so this can (and should) be verified without paying
    for a Claude call at all."""
    start = time.monotonic()
    _chunks, sources = await _retrieve_context(case.question, organization_id, None)
    latency_ms = _elapsed_ms(start)

    canary_filename = case.metadata.get("canaryFilename")
    filenames = [source.filename for source in sources]
    isolated = canary_filename not in filenames if canary_filename else True

    return EvaluationCaseResult(
        case_id=case.id,
        category=case.category,
        question=case.question,
        passed=isolated,
        latency_ms=latency_ms,
        answer=None,
        scores={"crossTenantIsolated": isolated, "retrievedCount": len(sources)},
    )


async def _run_sql_case(case: EvaluationCase) -> EvaluationCaseResult:
    """Feeds hand-authored SQL straight to the Phase 12 validator, bypassing
    NL generation — "SQL rejection/safety rate" is a property of the
    validator/allowlist, not of the LLM's phrasing, so this is fully
    testable (and testable today) without an LLM call in the loop."""
    start = time.monotonic()
    sql_text = str(case.metadata.get("sql", ""))
    expect_rejection = bool(case.metadata.get("expectRejection", False))

    try:
        safe_sql = validate_and_rewrite(sql_text)
    except SqlValidationError as exc:
        return EvaluationCaseResult(
            case_id=case.id,
            category=case.category,
            question=case.question,
            passed=expect_rejection,
            latency_ms=_elapsed_ms(start),
            answer=None,
            scores={"sqlSafetyCorrect": expect_rejection},
            error=None if expect_rejection else f"Expected acceptance, but validation rejected it: {exc}",
        )

    if expect_rejection:
        return EvaluationCaseResult(
            case_id=case.id,
            category=case.category,
            question=case.question,
            passed=False,
            latency_ms=_elapsed_ms(start),
            answer=safe_sql,
            scores={"sqlSafetyCorrect": False},
            error="Expected this SQL to be rejected, but the validator accepted it",
        )

    try:
        rows = await execute_readonly_query(safe_sql)
    except SqlExecutionError as exc:
        return EvaluationCaseResult(
            case_id=case.id,
            category=case.category,
            question=case.question,
            passed=False,
            latency_ms=_elapsed_ms(start),
            answer=safe_sql,
            scores={"sqlSafetyCorrect": True},
            error=str(exc),
        )

    latency_ms = _elapsed_ms(start)
    answer = json.dumps(rows, default=str)
    answer_ok = scoring.contains(answer, case.expected_answer_contains)
    return EvaluationCaseResult(
        case_id=case.id,
        category=case.category,
        question=case.question,
        passed=answer_ok,
        latency_ms=latency_ms,
        answer=answer,
        scores={"sqlSafetyCorrect": True, "answerCorrectness": answer_ok, "rowCount": len(rows)},
    )


async def _run_business_api_case(case: EvaluationCase, context: ToolContext) -> EvaluationCaseResult:
    """Calls registry.execute() directly with hand-authored arguments,
    bypassing the LLM's tool-selection step — this evaluates whether the
    tool itself (and the mock-business data behind it) behaves as
    expected, independent of whether a model would have chosen to call it,
    so it's fully testable today with no LLM in the loop."""
    start = time.monotonic()
    tool_name = str(case.metadata.get("toolName", ""))
    arguments = case.metadata.get("arguments", {})

    result = await registry.execute(tool_name, arguments, context)
    latency_ms = _elapsed_ms(start)

    payload = result.data if result.ok else {"error": result.error_code, "message": result.error_message}
    answer = json.dumps(payload, default=str)
    answer_ok = scoring.contains(answer, case.expected_answer_contains)
    passed = result.ok and answer_ok

    return EvaluationCaseResult(
        case_id=case.id,
        category=case.category,
        question=case.question,
        passed=passed,
        latency_ms=latency_ms,
        answer=answer,
        scores={"toolSuccessRate": 1.0 if result.ok else 0.0, "answerCorrectness": answer_ok},
        error=None if result.ok else result.error_message,
    )


async def _run_agent_case(case: EvaluationCase, context: ToolContext) -> EvaluationCaseResult:
    start = time.monotonic()
    try:
        result = await run_agent(case.question, context)
    except (LlmRequestError, LlmUnavailableError) as exc:
        return EvaluationCaseResult(
            case_id=case.id,
            category=case.category,
            question=case.question,
            passed=False,
            latency_ms=_elapsed_ms(start),
            answer=None,
            scores={},
            error=str(exc),
        )
    latency_ms = _elapsed_ms(start)

    called_tool_names = {call.name for call in result.tool_calls if call.ok}
    tools_matched = (
        all(name in called_tool_names for name in case.expected_tool_names) if case.expected_tool_names else True
    )
    tool_success_rate = (
        sum(1 for call in result.tool_calls if call.ok) / len(result.tool_calls) if result.tool_calls else 1.0
    )
    answer_ok = scoring.contains(result.answer, case.expected_answer_contains)
    passed = tools_matched and answer_ok

    return EvaluationCaseResult(
        case_id=case.id,
        category=case.category,
        question=case.question,
        passed=passed,
        latency_ms=latency_ms,
        answer=result.answer,
        scores={
            "toolCallsMatchExpected": tools_matched,
            "toolSuccessRate": tool_success_rate,
            "answerCorrectness": answer_ok,
        },
    )


def aggregate_metrics(results: list[EvaluationCaseResult]) -> dict[str, Any]:
    total = len(results)
    passed = sum(1 for r in results if r.passed)

    by_category: dict[str, dict[str, Any]] = {}
    for result in results:
        bucket = by_category.setdefault(result.category, {"total": 0, "passed": 0})
        bucket["total"] += 1
        bucket["passed"] += 1 if result.passed else 0
    for bucket in by_category.values():
        bucket["passRate"] = bucket["passed"] / bucket["total"]

    def avg_score(key: str) -> float | None:
        values = [float(r.scores[key]) for r in results if isinstance(r.scores.get(key), (int, float, bool))]
        return sum(values) / len(values) if values else None

    latencies = [r.latency_ms for r in results]

    return {
        "totalCases": total,
        "passedCases": passed,
        "passRate": passed / total if total else 0.0,
        "byCategory": by_category,
        "recallAtK": avg_score("recallAtK"),
        "citationAccuracy": avg_score("citationAccuracy"),
        "answerCorrectness": avg_score("answerCorrectness"),
        "faithfulness": avg_score("faithfulness"),
        "toolSuccessRate": avg_score("toolSuccessRate"),
        "sqlSafetyRate": avg_score("sqlSafetyCorrect"),
        "avgLatencyMs": round(sum(latencies) / len(latencies)) if latencies else 0,
        "errorCount": sum(1 for r in results if r.error),
        # Neither run_rag_query nor run_agent currently surface token counts
        # on a successful call (RagQueryResponse/AgentRunResult don't carry
        # them) — always 0/unavailable today regardless of billing status,
        # not something this phase's zero-credit-balance gap is hiding.
        "totalInputTokens": 0,
        "totalOutputTokens": 0,
        "tokenUsageAvailable": False,
    }
