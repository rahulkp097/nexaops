from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import UUID

# The 10 case categories spec §26 calls out. Mirrors the Postgres enum
# `evaluation_case_category` (infra/database/migrations/..._add-evaluation-tables.js).
EvaluationCategory = Literal[
    "DOCUMENT_QA",
    "NO_ANSWER",
    "EXACT_ID",
    "MULTI_HOP",
    "SQL",
    "BUSINESS_API",
    "COMBINED",
    "AGENT_MULTI_STEP",
    "PROMPT_INJECTION",
    "CROSS_TENANT",
]


@dataclass(frozen=True)
class EvaluationCase:
    """One row of the fixed evaluation dataset (gateway's `evaluation_cases`
    table) as the runner needs it. `metadata` carries whatever a category
    needs beyond the universal fields — see runner.py's per-category
    functions for exactly which keys each category reads."""

    id: UUID
    category: EvaluationCategory
    question: str
    expected_answer_contains: str | None
    expected_sources: list[str] = field(default_factory=list)
    expected_tool_names: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class EvaluationCaseResult:
    """Everything the gateway persists into `evaluation_case_results` for
    one case. `error` is set only when the underlying pipeline call raised
    (e.g. the Anthropic account's known zero-credit-balance gap) — a case
    erroring never raises out of run_evaluation, so one bad case can't
    abort an entire run (same "structured result, never an exception"
    convention as app.tools.registry.execute and app.agents.orchestrator)."""

    case_id: UUID
    category: EvaluationCategory
    question: str
    passed: bool
    latency_ms: int
    answer: str | None
    scores: dict[str, float | bool | int]
    error: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
