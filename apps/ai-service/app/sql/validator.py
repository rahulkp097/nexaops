import sqlglot
from sqlglot import exp

from app.core.config import get_settings
from app.sql.errors import SqlValidationError
from app.sql.schema import ALLOWED_COLUMNS, ALLOWED_TABLE

_DIALECT = "postgres"

# Every function class sqlglot may recognize that this validator considers
# safe over the sales_orders table. Deliberately an allowlist, not a
# blocklist — spec §21 treats generated SQL as untrusted code, so a
# function must be provably safe to be permitted at all, rather than
# merely "not one we thought to ban" (e.g. pg_sleep, version() — both
# parse cleanly and are rejected here for exactly that reason). A bare or
# qualified `*` (not inside COUNT(...)) is handled separately in
# _check_star_usage, since sqlglot represents it as its own node type
# rather than a function.
#
# exp.And/exp.Or are here because sqlglot models basic logical connectives
# as Func subclasses in this version (verified directly — most operators
# like comparisons, BETWEEN, arithmetic are NOT: they're distinct AST node
# types this scan never even sees) — without them, any WHERE clause with
# more than one condition would be wrongly rejected.
_ALLOWED_FUNCTION_TYPES = frozenset(
    {
        exp.Count,
        exp.Sum,
        exp.Avg,
        exp.Min,
        exp.Max,
        exp.Cast,
        exp.TimestampTrunc,
        exp.Extract,
        exp.Round,
        exp.Coalesce,
        exp.And,
        exp.Or,
    }
)


def _strip_wrapping(sql_text: str) -> str:
    text = sql_text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        first_line, _, rest = text.partition("\n")
        if first_line.strip().lower() in ("sql", ""):
            text = rest
    return text.strip().rstrip(";").strip()


def validate_and_rewrite(sql_text: str) -> str:
    """Parses, validates, and re-serializes a model-generated SQL string.
    Raises SqlValidationError for anything that fails any check.

    The caller must execute ONLY the returned string, never the original —
    this also forcibly injects the row limit regardless of what (if
    anything) the model wrote, and re-serializing from the validated AST
    (rather than trusting the original text) means what gets executed is
    exactly what was validated, not something a parser/re-parser
    discrepancy could smuggle a difference into.
    """
    cleaned = _strip_wrapping(sql_text)
    if not cleaned:
        raise SqlValidationError("The model returned no SQL")

    try:
        statements = [s for s in sqlglot.parse(cleaned, dialect=_DIALECT) if s is not None]
    except Exception as exc:  # sqlglot's own ParseError and friends
        raise SqlValidationError("Generated SQL did not parse") from exc

    if len(statements) != 1:
        raise SqlValidationError(f"Expected exactly one SQL statement, got {len(statements)}")

    statement = statements[0]
    if not isinstance(statement, exp.Select):
        raise SqlValidationError(f"Only SELECT statements are allowed, got {type(statement).__name__}")

    _check_tables(statement)
    _check_star_usage(statement)
    _check_columns(statement)
    _check_functions(statement)
    _apply_row_limit(statement)

    return statement.sql(dialect=_DIALECT)


def _check_tables(statement: exp.Select) -> None:
    # Deliberately no CTE (WITH-clause) support: a CTE's own alias shows up
    # here as if it were a table, which this single-table allowlist has no
    # way to distinguish from a real disallowed table — so any CTE is
    # rejected outright rather than validated incorrectly. The analytics
    # use case (aggregates over one table) never needs one.
    for table in statement.find_all(exp.Table):
        if table.name.lower() != ALLOWED_TABLE:
            raise SqlValidationError(f"Table not allowed: {table.name}")


def _check_columns(statement: exp.Select) -> None:
    # A query's own SELECT-list aliases are legitimate to reference in
    # GROUP BY/ORDER BY (e.g. "...AS revenue ... ORDER BY revenue") even
    # though "revenue" isn't a real column — allowed only because it was
    # itself derived from an already-validated expression in this same
    # statement, not because it grants access to anything new. Only an
    # *explicit* `AS alias` counts: statement.named_selects would also
    # include a bare, unaliased column's own name (e.g. "password_hash" in
    # `SELECT password_hash FROM ...`), which must NOT bypass this check.
    aliases = {p.alias.lower() for p in statement.expressions if isinstance(p, exp.Alias) and p.alias}
    allowed = set(ALLOWED_COLUMNS) | aliases
    for column in statement.find_all(exp.Column):
        if isinstance(column.this, exp.Star):
            continue  # a qualified star (table.*) — _check_star_usage already rejects this
        if column.name.lower() not in allowed:
            raise SqlValidationError(f"Column not allowed: {column.name}")


def _check_functions(statement: exp.Select) -> None:
    for func in statement.find_all(exp.Func):
        if type(func) not in _ALLOWED_FUNCTION_TYPES:
            raise SqlValidationError(f"Function not allowed: {func.sql_name()}")


def _check_star_usage(statement: exp.Select) -> None:
    # Only COUNT(*) is permitted — a bare `SELECT *`, a qualified
    # `sales_orders.*`, or `SELECT DISTINCT *` are all rejected, matching
    # the "never SELECT *" instruction in the prompt with an actual
    # enforced rule rather than trusting the model to follow it.
    for star in statement.find_all(exp.Star):
        if type(star.parent) not in _ALLOWED_FUNCTION_TYPES:
            raise SqlValidationError("SELECT * is not allowed — list explicit columns (COUNT(*) is the only exception)")


def _apply_row_limit(statement: exp.Select) -> None:
    limit = get_settings().sql_row_limit
    statement.set("limit", exp.Limit(expression=exp.Literal.number(limit)))
