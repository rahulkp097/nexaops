import { ConversationSidebar } from '../../../components/chat/conversation-sidebar';
import { ChatProvider } from '../../../lib/chat-context';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProvider>
      <div className="flex h-screen">
        <ConversationSidebar />
        <div className="flex-1">{children}</div>
      </div>
    </ChatProvider>
  );
}
