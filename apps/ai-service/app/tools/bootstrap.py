from app.tools import business_tools, search_tool
from app.tools.registry import registry


def register_default_tools() -> None:
    """Called from app.main's lifespan on every app startup. Idempotent by
    design (clears first) — the same fixed default set every time, so
    re-entering the lifespan (every TestClient(app) use in tests) is safe.
    Kept separate from import time so tests can build a fresh ToolRegistry()
    and register only what a given test needs instead."""
    registry.clear()
    business_tools.register_all(registry)
    search_tool.register_all(registry)
