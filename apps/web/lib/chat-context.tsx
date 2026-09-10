'use client';

import type { MessageResponseDto } from '@nexaops/shared-types';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createConversation, getConversation, listMessages, postMessage, streamConversation } from './api/conversations';
import { ApiError } from './api-client';
import type { DisplayMessage } from '../components/chat/message-bubble';

interface ChatContextValue {
  activeConversationId: string | null;
  conversationTitle: string | null;
  messages: DisplayMessage[];
  loadingHistory: boolean;
  sending: boolean;
  notFound: boolean;
  topLevelError: string | null;
  // Called by each route (chat/page.tsx with null, chat/[id]/page.tsx with
  // its id) on mount/when the param changes. No-ops when it's already the
  // active conversation — critically, that includes the router.replace
  // sendMessage does right after creating a conversation, so an in-flight
  // stream isn't reset by the resulting navigation.
  setActiveConversation: (id: string | null) => void;
  sendMessage: (content: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function toDisplayMessage(message: MessageResponseDto): DisplayMessage {
  return { id: message.id, role: message.role, content: message.content, sources: message.sources };
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  // Guards against a slow in-flight history fetch for conversation A
  // clobbering state after the user has already switched to conversation B.
  const loadToken = useRef(0);

  const setActiveConversation = useCallback(
    (id: string | null) => {
      if (id === activeConversationId) {
        return;
      }
      const token = ++loadToken.current;
      setActiveConversationId(id);
      setConversationTitle(null);
      setMessages([]);
      setSending(false);
      setNotFound(false);
      setTopLevelError(null);

      if (!id) {
        return;
      }
      setLoadingHistory(true);
      Promise.all([getConversation(id), listMessages(id)])
        .then(([conversation, history]) => {
          if (loadToken.current !== token) return;
          setConversationTitle(conversation.title);
          setMessages(history.map(toDisplayMessage));
        })
        .catch((err) => {
          if (loadToken.current !== token) return;
          if (err instanceof ApiError && err.status === 404) {
            setNotFound(true);
          } else {
            setTopLevelError(err instanceof ApiError ? err.message : 'Failed to load conversation');
          }
        })
        .finally(() => {
          if (loadToken.current === token) setLoadingHistory(false);
        });
    },
    [activeConversationId],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      setSending(true);
      setTopLevelError(null);
      try {
        let id = activeConversationId;
        if (!id) {
          const conversation = await createConversation();
          id = conversation.id;
          loadToken.current += 1; // this id's history is already what we're about to build locally
          setActiveConversationId(id);
          setConversationTitle(conversation.title);
          router.replace(`/chat/${id}`);
        }

        const userMessage = await postMessage(id, content);
        setMessages((prev) => [...prev, toDisplayMessage(userMessage)]);

        let sawAnyEvent = false;
        for await (const event of streamConversation(id)) {
          sawAnyEvent = true;
          if (event.event === 'message_start') {
            setMessages((prev) => [
              ...prev,
              { id: event.data.messageId, role: 'ASSISTANT', content: '', sources: [], streaming: true },
            ]);
          } else if (event.event === 'source') {
            const { documentId, chunkId, filename, page, score } = event.data;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (!last) return prev;
              next[next.length - 1] = { ...last, sources: [...last.sources, { documentId, chunkId, filename, page, score }] };
              return next;
            });
          } else if (event.event === 'token') {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (!last) return prev;
              next[next.length - 1] = { ...last, content: last.content + event.data.text };
              return next;
            });
          } else if (event.event === 'message_complete') {
            const complete = event.data;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = toDisplayMessage(complete);
              return next;
            });
          } else if (event.event === 'error') {
            const { message, retryable } = event.data;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (!last) return prev;
              next[next.length - 1] = { ...last, streaming: false, error: { message, retryable } };
              return next;
            });
          }
        }

        if (!sawAnyEvent) {
          // Generation had already finished and its replay window was
          // evicted before we opened the stream (Phase 8's documented rough
          // edge) — reload from the messages table to pick up what's real.
          const fresh = await listMessages(id);
          setMessages(fresh.map(toDisplayMessage));
        }
      } catch (err) {
        setTopLevelError(err instanceof ApiError ? err.message : 'Failed to send message');
      } finally {
        setSending(false);
      }
    },
    [activeConversationId, router],
  );

  return (
    <ChatContext.Provider
      value={{
        activeConversationId,
        conversationTitle,
        messages,
        loadingHistory,
        sending,
        notFound,
        topLevelError,
        setActiveConversation,
        sendMessage,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return ctx;
}
