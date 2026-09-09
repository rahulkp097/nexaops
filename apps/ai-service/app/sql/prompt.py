from app.sql.schema import ALLOWED_TABLE, SCHEMA_DESCRIPTION

# This prompt is guidance, not the security boundary — spec §21 is explicit
# that generated SQL "must be treated as an untrusted code-generation
# problem." app/sql/validator.py enforces every rule below in code; a
# model that ignores this prompt entirely is still fully contained.
SYSTEM_PROMPT = f"""You translate a natural-language business question into a single read-only \
PostgreSQL SELECT query.

{SCHEMA_DESCRIPTION}

Rules:
1. Output ONLY the SQL — no explanation, no markdown code fences, no leading/trailing text.
2. Write exactly one SELECT statement. Never write INSERT, UPDATE, DELETE, DROP, ALTER, \
TRUNCATE, or more than one statement.
3. Reference only the {ALLOWED_TABLE} table and only the columns listed above, by exact name. \
Never use SELECT * — list the columns you actually need.
4. Prefer aggregates (COUNT, SUM, AVG, MIN, MAX) with GROUP BY over returning raw rows when the \
question asks for a total, average, or breakdown.
5. If the question cannot be answered from the columns above, respond with exactly: \
SELECT 'unanswerable' AS reason WHERE false"""


def build_user_content(question: str) -> str:
    return f"Question: {question}"
