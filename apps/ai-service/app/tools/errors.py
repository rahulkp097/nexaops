class ToolError(Exception):
    """Base for the tool layer's error contract (spec §20). Every subclass
    carries a stable, machine-readable `code` so a caller (the future agent
    loop) can react programmatically instead of pattern-matching messages."""

    code: str = "tool_error"


class ToolNotFoundError(ToolError):
    code = "tool_not_found"


class ToolValidationError(ToolError):
    """The LLM-supplied arguments failed the tool's input schema."""

    code = "invalid_arguments"


class ToolAuthorizationError(ToolError):
    """The caller's role isn't allowed to run this tool — decided entirely
    server-side (spec: "Never let the LLM make authorization decisions"),
    never inferred from anything the model said."""

    code = "unauthorized"


class ToolTimeoutError(ToolError):
    code = "timeout"


class ToolResultTooLargeError(ToolError):
    """Raised instead of silently truncating: a partial result presented as
    complete could mislead the model more than an outright failure would."""

    code = "result_too_large"


class ToolExecutionError(ToolError):
    """Catch-all for a tool's handler failing for reasons unrelated to
    input validation or authorization (e.g. a downstream service is
    unreachable). Never lets the underlying exception/traceback reach the
    caller — only this stable code and a safe message."""

    code = "execution_failed"
