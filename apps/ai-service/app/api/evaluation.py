from fastapi import APIRouter

from app.evaluation.runner import run_evaluation
from app.evaluation.schemas import RunEvaluationRequest, RunEvaluationResponse

# Internal-only endpoint, same trust model as /rag/query, /agent/run, and
# /tools/execute: no authentication of its own — the gateway resolves the
# triggering admin's organization/role before calling this. Unlike those
# endpoints, a single case failing (including the known AI-provider billing
# gap) is never surfaced as an HTTP error here — app.evaluation.runner
# always returns a 200 with that case's result marked failed, so one bad
# case can't take down an entire evaluation run.
router = APIRouter(prefix="/evaluation", tags=["evaluation"])


@router.post("/run", response_model=RunEvaluationResponse)
async def run(payload: RunEvaluationRequest) -> RunEvaluationResponse:
    return await run_evaluation(payload)
