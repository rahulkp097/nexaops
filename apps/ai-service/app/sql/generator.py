from app.core.config import get_settings
from app.rag.errors import LlmRequestError, LlmUnavailableError
from app.rag.llm_client import generate_answer
from app.sql.errors import SqlGenerationError
from app.sql.prompt import SYSTEM_PROMPT, build_user_content


async def generate_sql(question: str) -> str:
    """Calls the LLM to translate `question` into SQL text. Returns the raw
    text — validator.validate_and_rewrite() is what actually enforces
    safety; nothing here should be trusted on its own (spec §21)."""
    settings = get_settings()
    try:
        return await generate_answer(
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": build_user_content(question)}],
            max_tokens=settings.sql_generation_max_tokens,
        )
    except (LlmUnavailableError, LlmRequestError) as exc:
        raise SqlGenerationError(str(exc)) from exc
