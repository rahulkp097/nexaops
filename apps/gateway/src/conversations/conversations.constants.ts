// How many prior messages (Phase 8's "retrieve relevant history") are sent
// to ai-service verbatim as multi-turn context. Anything older than this
// window is folded into conversations.summary instead of being dropped
// (Phase 16, ConversationsService.maybeUpdateSummary).
export const CONVERSATION_HISTORY_LIMIT = 10;

// Matches RagQueryRequest.question's max_length in
// apps/ai-service/app/rag/schemas.py — a longer message would always be
// rejected by ai-service once forwarded as the question, so reject it here
// with a clearer error instead.
export const MESSAGE_CONTENT_MAX_LENGTH = 2000;
