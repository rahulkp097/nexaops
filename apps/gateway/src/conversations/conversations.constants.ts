// How many prior messages (Phase 8's "retrieve relevant history") are sent
// to ai-service as multi-turn context. Summarizing longer history instead of
// just truncating it is Phase 16's job (Conversation Memory).
export const CONVERSATION_HISTORY_LIMIT = 10;

// Matches RagQueryRequest.question's max_length in
// apps/ai-service/app/rag/schemas.py — a longer message would always be
// rejected by ai-service once forwarded as the question, so reject it here
// with a clearer error instead.
export const MESSAGE_CONTENT_MAX_LENGTH = 2000;
