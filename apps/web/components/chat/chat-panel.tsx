'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '../../lib/chat-context';
import { Button, ErrorBanner, Spinner } from '../ui';
import { MessageBubble } from './message-bubble';

export function ChatPanel() {
  const { conversationTitle, messages, loadingHistory, sending, notFound, topLevelError, sendMessage } = useChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setInput('');
    await sendMessage(content);
  }

  if (notFound) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <ErrorBanner message="This conversation doesn't exist, or belongs to someone else." />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-neutral-200 px-6 py-3">
        <h1 className="truncate text-sm font-medium text-neutral-700">{conversationTitle ?? 'New conversation'}</h1>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {loadingHistory && (
          <div className="flex justify-center">
            <Spinner />
          </div>
        )}
        {!loadingHistory && messages.length === 0 && (
          <p className="text-center text-sm text-neutral-400">
            Ask about documents, orders, inventory, or sales — NexaOps will cite what it used to answer.
          </p>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {topLevelError && <ErrorBanner message={topLevelError} />}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-neutral-200 p-4">
        <input
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Ask a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <Button type="submit" disabled={sending || !input.trim()}>
          {sending ? <Spinner className="border-white/40 border-t-white" /> : 'Send'}
        </Button>
      </form>
    </div>
  );
}
