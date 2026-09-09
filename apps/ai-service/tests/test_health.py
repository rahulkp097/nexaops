from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

# `TestClient` as a context manager runs the real FastAPI lifespan, so the
# pool/client init+close in app.main must be patched too — otherwise these
# tests would require live Postgres/Redis just to start up the app.


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.health.check_db", new_callable=AsyncMock)
@patch("app.api.health.check_readonly_db", new_callable=AsyncMock)
@patch("app.api.health.check_redis", new_callable=AsyncMock)
def test_health_ok_when_dependencies_are_up(*_mocks):
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"postgres": "ok", "postgres_readonly": "ok", "redis": "ok"}}


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.health.check_db", new_callable=AsyncMock, side_effect=Exception("down"))
@patch("app.api.health.check_readonly_db", new_callable=AsyncMock)
@patch("app.api.health.check_redis", new_callable=AsyncMock)
def test_health_degraded_when_postgres_is_down(*_mocks):
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["postgres"] == "error"
    assert body["checks"]["postgres_readonly"] == "ok"
    assert body["checks"]["redis"] == "ok"


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.health.check_db", new_callable=AsyncMock)
@patch("app.api.health.check_readonly_db", new_callable=AsyncMock)
@patch("app.api.health.check_redis", new_callable=AsyncMock, side_effect=Exception("down"))
def test_health_degraded_when_redis_is_down(*_mocks):
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["postgres"] == "ok"
    assert body["checks"]["postgres_readonly"] == "ok"
    assert body["checks"]["redis"] == "error"


@patch("app.main.init_db_pool", new_callable=AsyncMock)
@patch("app.main.close_db_pool", new_callable=AsyncMock)
@patch("app.main.init_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.close_readonly_db_pool", new_callable=AsyncMock)
@patch("app.main.init_redis_client", new_callable=AsyncMock)
@patch("app.main.close_redis_client", new_callable=AsyncMock)
@patch("app.main.init_embedding_model", new_callable=AsyncMock)
@patch("app.api.health.check_db", new_callable=AsyncMock)
@patch("app.api.health.check_readonly_db", new_callable=AsyncMock, side_effect=Exception("down"))
@patch("app.api.health.check_redis", new_callable=AsyncMock)
def test_health_degraded_when_readonly_postgres_is_down(*_mocks):
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["checks"]["postgres"] == "ok"
    assert body["checks"]["postgres_readonly"] == "error"
    assert body["checks"]["redis"] == "ok"
