'use client';

import { useEffect } from 'react';
import { ChatPanel } from '../../../components/chat/chat-panel';
import { useChat } from '../../../lib/chat-context';

export default function NewChatPage() {
  const { setActiveConversation } = useChat();

  useEffect(() => {
    setActiveConversation(null);
    // Only on mount — setActiveConversation itself is stable enough for
    // this route's purpose (it always means "start fresh").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ChatPanel />;
}
