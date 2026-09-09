from app.core.config import get_settings
from app.core.schemas import HistoryMessageDto
from app.rag.llm_client import generate_answer

# Spec §25 (Phase 16): "Summarize older context when conversations become
# long." This is a plain summarization task, not evidence grounding — the
# input is the same authenticated user's own conversation turns Phase 8
# already forwards to the LLM verbatim as real messages, so it doesn't need
# the <retrieved_evidence>-style untrusted-content framing app.rag/app.agents
# use for documents and tool output.
SUMMARY_SYSTEM_PROMPT = """You maintain a running summary of an ongoing conversation between a user and \
an assistant, so older turns can be dropped from the context window without losing information a later \
turn might depend on.

Write a concise summary (a few sentences, or short bullet points for several distinct topics) that \
preserves: facts and figures mentioned, decisions made, questions asked and whether they were answered, \
and any named entities (order numbers, document names, dates) likely to be referenced again. Omit \
pleasantries and filler. Write only the summary itself — no preamble like "Here is a summary"."""


def _format_turn(turn: HistoryMessageDto) -> str:
    speaker = "User" if turn.role == "user" else "Assistant"
    return f"{speaker}: {turn.content}"


def build_summary_prompt(previous_summary: str | None, messages: list[HistoryMessageDto]) -> str:
    transcript = "\n".join(_format_turn(turn) for turn in messages)
    if previous_summary:
        return (
            f"Existing summary of earlier turns:\n{previous_summary}\n\n"
            f"New turns to fold into that summary:\n{transcript}\n\n"
            "Write one updated summary that covers both the existing summary and the new turns."
        )
    return f"Conversation turns to summarize:\n{transcript}"


async def summarize_conversation(previous_summary: str | None, messages: list[HistoryMessageDto]) -> str:
    settings = get_settings()
    prompt = build_summary_prompt(previous_summary, messages)
    return await generate_answer(
        system=SUMMARY_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=settings.memory_summary_max_tokens,
    )
