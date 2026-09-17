// Shared by every apps/ai-service client that forwards multi-turn history
// (the agent client, the memory-summarization client) — one shape, not
// redeclared per client.
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}
