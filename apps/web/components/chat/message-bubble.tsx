import type { SourceResponseDto } from '@nexaops/shared-types';
import { useState } from 'react';
import { Badge } from '../ui';

export interface DisplayMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  sources: SourceResponseDto[];
  streaming?: boolean;
  error?: { message: string; retryable: boolean };
}

// Citations show as [1], [2]... inline-footnote style, expandable into the
// full source list below the message — spec §34's "citations ... source
// metadata" requirement for the chat UI.
export function MessageBubble({ message }: { message: DisplayMessage }) {
  const [showSources, setShowSources] = useState(false);
  const isUser = message.role === 'USER';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      data-message-role={message.role}
      data-message-streaming={message.streaming ? 'true' : 'false'}
    >
      <div className={`max-w-2xl rounded-lg px-4 py-2 ${isUser ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900'}`}>
        <p className="whitespace-pre-wrap text-sm">
          {message.content}
          {message.streaming && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-current align-middle" />}
        </p>

        {message.error && (
          <p className="mt-2 text-xs text-red-500">
            {message.error.message}
            {message.error.retryable ? ' — you can try sending again.' : ''}
          </p>
        )}

        {message.sources.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              className="text-xs underline opacity-70 hover:opacity-100"
              onClick={() => setShowSources((v) => !v)}
            >
              {showSources ? 'Hide' : 'Show'} {message.sources.length} source{message.sources.length === 1 ? '' : 's'}
            </button>
            {showSources && (
              <ul className="mt-1 space-y-1 border-t border-white/20 pt-1">
                {message.sources.map((source, index) => (
                  <li key={`${source.chunkId ?? source.documentId ?? index}`} className="text-xs opacity-80">
                    <Badge tone={isUser ? 'neutral' : 'amber'}>[{index + 1}]</Badge>{' '}
                    {source.filename}
                    {source.page !== null ? ` (p. ${source.page})` : ''} — score {source.score.toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
