from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.rag import router as rag_router
from app.api.tools import router as tools_router
from app.core.db import close_db_pool, init_db_pool
from app.core.redis import close_redis_client, init_redis_client
from app.rag.embeddings import init_embedding_model
from app.tools.bootstrap import register_default_tools


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db_pool()
    await init_redis_client()
    await init_embedding_model()
    register_default_tools()
    try:
        yield
    finally:
        await close_redis_client()
        await close_db_pool()


app = FastAPI(title="NexaOps AI Service", lifespan=lifespan)

app.include_router(health_router)
app.include_router(rag_router)
app.include_router(tools_router)
