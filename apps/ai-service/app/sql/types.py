from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SqlQueryResult:
    sql: str
    rows: list[dict[str, Any]]
    row_count: int
