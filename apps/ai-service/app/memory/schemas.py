from pydantic import Field

from app.core.schemas import CamelModel, HistoryMessageDto


class SummarizeConversationRequest(CamelModel):
    # None until a conversation's first summarization; then the summary
    # this call should extend, not replace.
    previous_summary: str | None = None
    # The slice of messages, oldest first, that has newly aged out of the
    # gateway's bounded recent-message window since the last summarization
    # — never the whole conversation.
    messages: list[HistoryMessageDto] = Field(..., min_length=1)


class SummarizeConversationResponse(CamelModel):
    summary: str
