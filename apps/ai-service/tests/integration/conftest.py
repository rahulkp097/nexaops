from uuid import UUID, uuid4

import pytest_asyncio
from pgvector import Vector

from app.core.db import close_db_pool, get_pool, init_db_pool
from app.core.readonly_db import close_readonly_db_pool, init_readonly_db_pool
from app.core.redis import close_redis_client, init_redis_client
from app.rag.embeddings import embed_query, init_embedding_model
from app.tools.bootstrap import register_default_tools

# Every test in this directory needs the pools below to outlive a single
# test function, which in turn means they all need to share one event
# loop (an asyncpg pool's connections are bound to whichever loop created
# them) — loop_scope="session" here, matched by the same marker on every
# integration test module, opts this directory into that without changing
# the rest of the suite's default per-function loop scope.
@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _real_infra():
    """Every test under tests/integration/ is marked `integration` (spec
    §30) and talks to the real local stack instead of mocks — this brings
    up the same pools/clients app.main's lifespan would, once per test
    session. Requires `docker compose up -d`; Settings' own defaults
    already point at its exposed host ports, so no extra .env is needed
    to run these from the host."""
    await init_db_pool()
    await init_readonly_db_pool()
    await init_redis_client()
    await init_embedding_model()
    register_default_tools()
    yield
    await close_redis_client()
    await close_readonly_db_pool()
    await close_db_pool()


@pytest_asyncio.fixture(loop_scope="session")
async def db_connection():
    pool = get_pool()
    async with pool.acquire() as connection:
        yield connection


@pytest_asyncio.fixture(loop_scope="session")
async def org_factory(db_connection):
    """Creates a real organizations row and tears it down afterward —
    every fixture document/chunk below references organization_id, and
    ON DELETE CASCADE means deleting the org cleans all of it up in one
    statement, so individual tests never need their own teardown."""
    created_ids: list[UUID] = []

    async def _create(name: str = "Integration Test Org") -> UUID:
        org_id = uuid4()
        await db_connection.execute("INSERT INTO organizations (id, name) VALUES ($1, $2)", org_id, name)
        created_ids.append(org_id)
        return org_id

    yield _create

    for org_id in created_ids:
        await db_connection.execute("DELETE FROM organizations WHERE id = $1", org_id)


@pytest_asyncio.fixture(loop_scope="session")
async def document_factory(db_connection):
    async def _create(organization_id: UUID, filename: str = "fixture.txt") -> UUID:
        document_id = uuid4()
        await db_connection.execute(
            """INSERT INTO documents (id, organization_id, filename, storage_key, mime_type, size, checksum, status)
               VALUES ($1, $2, $3, $4, 'text/plain', 1, 'fixture-checksum', 'READY')""",
            document_id,
            organization_id,
            filename,
            f"fixtures/{document_id}.txt",
        )
        return document_id

    return _create


@pytest_asyncio.fixture(loop_scope="session")
async def chunk_factory(db_connection):
    """Computes a real embedding via the production embed_query() path —
    the whole point of these tests is exercising real pgvector similarity
    search, which a fake/random vector couldn't meaningfully do."""

    async def _create(document_id: UUID, organization_id: UUID, content: str, chunk_index: int = 0) -> UUID:
        chunk_id = uuid4()
        embedding = await embed_query(content)
        await db_connection.execute(
            """INSERT INTO document_chunks (id, document_id, organization_id, chunk_index, content, embedding)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            chunk_id,
            document_id,
            organization_id,
            chunk_index,
            content,
            Vector(embedding),
        )
        return chunk_id

    return _create
