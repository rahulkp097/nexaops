from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.core.schemas import CamelModel
from app.evaluation.types import EvaluationCategory


class EvaluationCaseDto(CamelModel):
    """One case as the gateway reads it out of `evaluation_cases` and hands
    to the runner — see app.evaluation.types.EvaluationCase for what each
    field means to a specific category."""

    id: UUID
    category: EvaluationCategory
    question: str = Field(..., min_length=1, max_length=2000)
    expected_answer_contains: str | None = None
    expected_sources: list[str] = []
    expected_tool_names: list[str] = []
    metadata: dict[str, Any] = {}


class RunEvaluationRequest(CamelModel):
    organization_id: UUID
    # Identity the agent/tool categories execute under — an evaluation run
    # is always triggered by an authenticated admin (spec §11: "ADMIN:
    # ... evaluation administration"), so ADMIN's tool access covers every
    # registered tool.
    user_id: UUID
    role: Literal["ADMIN", "MANAGER", "EMPLOYEE"]
    cases: list[EvaluationCaseDto] = Field(..., min_length=1)


class EvaluationCaseResultDto(CamelModel):
    case_id: UUID
    category: EvaluationCategory
    question: str
    passed: bool
    latency_ms: int
    answer: str | None = None
    scores: dict[str, Any] = {}
    error: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0


class RunEvaluationResponse(CamelModel):
    results: list[EvaluationCaseResultDto]
    # Aggregate, run-level metrics (spec §26's named list, averaged/summed
    # across whichever cases each metric applies to) — see
    # app.evaluation.runner.aggregate_metrics.
    metrics: dict[str, Any]
    model: str
    provider: str
