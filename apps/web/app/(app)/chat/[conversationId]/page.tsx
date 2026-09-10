'use client';

import { use, useEffect } from 'react';
import { ChatPanel } from '../../../../components/chat/chat-panel';
import { useChat } from '../../../../lib/chat-context';

export default function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = use(params);
  const { setActiveConversation } = useChat();

  useEffect(() => {
    setActiveConversation(conversationId);
  }, [conversationId, setActiveConversation]);

  return <ChatPanel />;
}
