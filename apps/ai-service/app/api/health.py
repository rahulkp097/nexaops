from fastapi import APIRouter, Response

from app.core.db import check_db
from app.core.redis import check_redis

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health(response: Response) -> dict:
    checks: dict[str, str] = {}

    try:
        await check_db()
        checks["postgres"] = "ok"
    except Exception:
        checks["postgres"] = "error"

    try:
        await check_redis()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"

    healthy = all(status == "ok" for status in checks.values())
    response.status_code = 200 if healthy else 503

    return {"status": "ok" if healthy else "degraded", "checks": checks}
