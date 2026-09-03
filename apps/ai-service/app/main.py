from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.health import router as health_router
from app.core.db import close_db_pool, init_db_pool
from app.core.redis import close_redis_client, init_redis_client


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db_pool()
    await init_redis_client()
    try:
        yield
    finally:
        await close_redis_client()
        await close_db_pool()


app = FastAPI(title="NexaOps AI Service", lifespan=lifespan)

app.include_router(health_router)
