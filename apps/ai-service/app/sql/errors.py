class SqlToolError(Exception):
    """Base for Phase 12's controlled error contract (spec §21: "Return
    controlled errors"). Callers should show `str(exc)` to a user/model —
    it never contains raw SQL, table/column names outside the allowlist,
    or a database driver's own error text."""


class SqlGenerationError(SqlToolError):
    """The LLM call to generate SQL failed (provider unavailable/rejected)."""


class SqlValidationError(SqlToolError):
    """The generated SQL failed the parser/allowlist — spec §21: "NL-to-SQL
    is a core feature but must be treated as an untrusted code-generation
    problem." This is the actual security boundary; nothing downstream of
    this trusts the model's output."""


class SqlExecutionError(SqlToolError):
    """Validated SQL still failed to execute (timeout, unexpected DB
    error). Never surfaces the underlying driver exception/message."""
