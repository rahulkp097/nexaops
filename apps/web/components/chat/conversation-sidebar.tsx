'use client';

import type { ConversationResponseDto } from '@nexaops/shared-types';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { listConversations } from '../../lib/api/conversations';

function formatTitle(conversation: ConversationResponseDto): string {
  if (conversation.title) return conversation.title;
  return `Conversation ${conversation.id.slice(0, 8)}`;
}

export function ConversationSidebar() {
  const pathname = usePathname();
  const [conversations, setConversations] = useState<ConversationResponseDto[] | null>(null);

  // Re-fetches whenever the route changes — including right after ChatView
  // navigates to a freshly created conversation's URL, which is how a new
  // conversation shows up here without any cross-component wiring.
  useEffect(() => {
    let cancelled = false;
    listConversations()
      .then((result) => {
        if (!cancelled) setConversations(result);
      })
      .catch(() => {
        if (!cancelled) setConversations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-200">
      <div className="p-3">
        <Link
          href="/chat"
          className="block w-full rounded-md border border-neutral-300 px-3 py-1.5 text-center text-sm hover:bg-neutral-100"
        >
          + New chat
        </Link>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {conversations === null && <p className="px-2 py-1 text-xs text-neutral-400">Loading…</p>}
        {conversations?.length === 0 && <p className="px-2 py-1 text-xs text-neutral-400">No conversations yet</p>}
        {conversations?.map((conversation) => {
          const active = pathname === `/chat/${conversation.id}`;
          return (
            <Link
              key={conversation.id}
              href={`/chat/${conversation.id}`}
              className={`block truncate rounded-md px-2 py-1.5 text-sm ${
                active ? 'bg-neutral-200 font-medium' : 'text-neutral-700 hover:bg-neutral-100'
              }`}
              title={formatTitle(conversation)}
            >
              {formatTitle(conversation)}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
