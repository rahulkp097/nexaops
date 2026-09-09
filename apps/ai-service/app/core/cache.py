import json
import logging
from typing import Any
from uuid import UUID

from app.core.redis import get_redis_client

logger = logging.getLogger(__name__)


def build_cache_key(organization_id: UUID, *parts: str) -> str:
    """spec §29's own example key shape (`org:{orgId}:analytics:revenue:{from}:{to}`).
    Every cache key in this app is built through this function, so "do not
    cache across organizations" holds by construction — there is no code
    path that can build a cache key without an organization id in it, even
    for data (like mock-business's) that happens to be identical across
    every organization today."""
    return ":".join(["org", str(organization_id), *parts])


async def get_cached(key: str) -> Any | None:
    """A cache is optional infrastructure, not a dependency it's safe to
    fail loudly on: any Redis error (or a value that somehow isn't valid
    JSON) is treated as a plain cache miss rather than raised, so a caching
    bug or a Redis outage never breaks the underlying operation — the same
    graceful-degradation posture as Phase 16's conversation-summary
    fallback."""
    try:
        raw = await get_redis_client().get(key)
    except Exception:
        logger.warning("Cache read failed for key=%s, treating as a miss", key, exc_info=True)
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        logger.warning("Cache value for key=%s was not valid JSON, treating as a miss", key)
        return None


async def set_cached(key: str, value: Any, ttl_seconds: int) -> None:
    try:
        await get_redis_client().set(key, json.dumps(value, default=str), ex=ttl_seconds)
    except Exception:
        logger.warning("Cache write failed for key=%s", key, exc_info=True)
