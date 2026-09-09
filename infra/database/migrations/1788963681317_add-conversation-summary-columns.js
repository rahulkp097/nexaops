/**
 * Phase 16 (spec §25, Conversation Memory): "Summarize older context when
 * conversations become long." `summarized_message_count` marks how many of
 * a conversation's oldest messages are already folded into `summary` — the
 * gateway only asks the AI service to (re)summarize the slice of messages
 * that has newly aged out of the bounded recent-message window
 * (CONVERSATION_HISTORY_LIMIT) since the last summarization, not the whole
 * history each time.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.addColumns('conversations', {
    summary: { type: 'text' },
    summarized_message_count: { type: 'integer', notNull: true, default: 0 },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumns('conversations', ['summary', 'summarized_message_count']);
};
