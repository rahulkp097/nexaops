import asyncio
from uuid import uuid4

import pytest
from pydantic import BaseModel

from app.tools.registry import ToolRegistry
from app.tools.types import ToolContext, ToolDefinition


class EchoInput(BaseModel):
    value: str


async def _echo_handler(input_model: EchoInput, _context: ToolContext) -> dict:
    return {"echoed": input_model.value}


def _context(role: str = "ADMIN") -> ToolContext:
    return ToolContext(organization_id=uuid4(), user_id=uuid4(), role=role)


def _register_echo(registry: ToolRegistry, **overrides) -> None:
    defaults = dict(
        name="echo",
        description="Echoes its input back.",
        input_model=EchoInput,
        handler=_echo_handler,
        allowed_roles=None,
        timeout_seconds=1.0,
        max_result_bytes=1_000,
    )
    defaults.update(overrides)
    registry.register(ToolDefinition(**defaults))


async def test_execute_returns_ok_with_data_on_success():
    registry = ToolRegistry()
    _register_echo(registry)

    result = await registry.execute("echo", {"value": "hi"}, _context())

    assert result.ok is True
    assert result.data == {"echoed": "hi"}
    assert result.error_code is None


async def test_execute_unknown_tool_returns_tool_not_found():
    registry = ToolRegistry()

    result = await registry.execute("does_not_exist", {}, _context())

    assert result.ok is False
    assert result.error_code == "tool_not_found"


async def test_execute_invalid_arguments_returns_invalid_arguments():
    registry = ToolRegistry()
    _register_echo(registry)

    result = await registry.execute("echo", {}, _context())  # missing required "value"

    assert result.ok is False
    assert result.error_code == "invalid_arguments"


async def test_execute_rejects_a_role_outside_allowed_roles():
    registry = ToolRegistry()
    _register_echo(registry, allowed_roles=frozenset({"ADMIN"}))

    result = await registry.execute("echo", {"value": "hi"}, _context(role="EMPLOYEE"))

    assert result.ok is False
    assert result.error_code == "unauthorized"


async def test_execute_allows_a_role_within_allowed_roles():
    registry = ToolRegistry()
    _register_echo(registry, allowed_roles=frozenset({"ADMIN", "MANAGER"}))

    result = await registry.execute("echo", {"value": "hi"}, _context(role="MANAGER"))

    assert result.ok is True


async def test_execute_none_allowed_roles_means_any_role():
    registry = ToolRegistry()
    _register_echo(registry, allowed_roles=None)

    result = await registry.execute("echo", {"value": "hi"}, _context(role="EMPLOYEE"))

    assert result.ok is True


async def test_execute_times_out_a_slow_handler():
    async def _slow_handler(_input_model: EchoInput, _context: ToolContext) -> dict:
        await asyncio.sleep(10)
        return {}

    registry = ToolRegistry()
    _register_echo(registry, handler=_slow_handler, timeout_seconds=0.01)

    result = await registry.execute("echo", {"value": "hi"}, _context())

    assert result.ok is False
    assert result.error_code == "timeout"


async def test_execute_rejects_an_oversized_result():
    async def _big_handler(_input_model: EchoInput, _context: ToolContext) -> dict:
        return {"data": "x" * 10_000}

    registry = ToolRegistry()
    _register_echo(registry, handler=_big_handler, max_result_bytes=100)

    result = await registry.execute("echo", {"value": "hi"}, _context())

    assert result.ok is False
    assert result.error_code == "result_too_large"


async def test_execute_wraps_an_unexpected_exception_without_leaking_details():
    async def _broken_handler(_input_model: EchoInput, _context: ToolContext) -> dict:
        raise RuntimeError("some internal secret detail")

    registry = ToolRegistry()
    _register_echo(registry, handler=_broken_handler)

    result = await registry.execute("echo", {"value": "hi"}, _context())

    assert result.ok is False
    assert result.error_code == "execution_failed"
    assert "some internal secret detail" not in (result.error_message or "")


def test_register_rejects_a_duplicate_tool_name():
    registry = ToolRegistry()
    _register_echo(registry)

    with pytest.raises(ValueError, match="already registered"):
        _register_echo(registry)


def test_clear_allows_re_registering_the_same_name():
    registry = ToolRegistry()
    _register_echo(registry)
    registry.clear()

    _register_echo(registry)  # should not raise

    assert registry.get("echo") is not None


def test_to_anthropic_tools_has_the_expected_shape():
    registry = ToolRegistry()
    _register_echo(registry)

    tools = registry.to_anthropic_tools()

    assert len(tools) == 1
    assert tools[0]["name"] == "echo"
    assert tools[0]["description"] == "Echoes its input back."
    assert "title" not in tools[0]["input_schema"]
    assert tools[0]["input_schema"]["properties"]["value"]["type"] == "string"
