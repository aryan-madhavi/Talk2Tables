import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatInterface } from './components/ChatInterface';
import { SettingsDialog } from './components/SettingsDialog';

export interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
  isOwn: boolean;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  starred: boolean;
  timestamp: Date;
}

export interface Connection {
  id: string;
  name: string;
  host: string;
  port?: string;
  database?: string;
  username?: string;
  active: boolean;
}

const initialChat: Chat = {
  id: '1',
  title: 'New Chat',
  messages: [
    {
      id: "1",
      content: "Hey! How are you doing?",
      sender: "John Doe",
      timestamp: new Date(2025, 9, 13, 10, 30),
      isOwn: false,
    },
    {
      id: "2",
      content: "I'm doing great! Just working on some new features.",
      sender: "You",
      timestamp: new Date(2025, 9, 13, 10, 32),
      isOwn: true,
    },
    {
      id: "3",
      content: "That sounds exciting! What are you building?",
      sender: "John Doe",
      timestamp: new Date(2025, 9, 13, 10, 33),
      isOwn: false,
    },
    {
      id: "4",
      content: "A chat interface with an admin panel. It has connection string management and a lot of cool features.",
      sender: "You",
      timestamp: new Date(2025, 9, 13, 10, 35),
      isOwn: true,
    },
  ],
  starred: false,
  timestamp: new Date(2025, 9, 13, 10, 30),
};

export default function App() {
  const [connections, setConnections] = useState<Connection[]>([
    { id: 'main-db', name: 'Main Database', host: 'main.db.example.com', port: '5432', database: 'main_db', username: 'admin', active: true },
    { id: 'dev-db', name: 'Development DB', host: 'dev.db.example.com', port: '5432', database: 'dev_db', username: 'dev_user', active: false },
    { id: 'staging-db', name: 'Staging DB', host: 'staging.db.example.com', port: '5432', database: 'staging_db', username: 'staging_user', active: false },
    { id: 'prod-db', name: 'Production DB', host: 'prod.db.example.com', port: '5432', database: 'prod_db', username: 'prod_user', active: false },
  ]);
  const [selectedConnection, setSelectedConnection] = useState('main-db');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([initialChat]);
  const [activeChatId, setActiveChatId] = useState('1');

  const activeChat = chats.find(chat => chat.id === activeChatId) || chats[0];

  const handleNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      starred: false,
      timestamp: new Date(),
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setIsSidebarOpen(false);
  };

  const handleSwitchChat = (chatId: string) => {
    setActiveChatId(chatId);
    setIsSidebarOpen(false);
  };

  const handleToggleStar = (chatId: string) => {
    setChats(prev => prev.map(chat => 
      chat.id === chatId ? { ...chat, starred: !chat.starred } : chat
    ));
  };

  const handleUpdateMessages = (messages: Message[]) => {
    setChats(prev => prev.map(chat => 
      chat.id === activeChatId 
        ? { 
            ...chat, 
            messages,
            title: messages.length > 0 && chat.title === 'New Chat' 
              ? messages[0].content.slice(0, 30) + (messages[0].content.length > 30 ? '...' : '')
              : chat.title,
            timestamp: new Date()
          } 
        : chat
    ));
  };

  const handleConnectionChange = (connectionId: string) => {
    setSelectedConnection(connectionId);
    // Create a new chat when switching database
    handleNewChat();
  };

  const handleUpdateConnections = (updatedConnections: Connection[]) => {
    setConnections(updatedConnections);
    // If the selected connection was deleted, switch to the first available one
    const connectionExists = updatedConnections.find(conn => conn.id === selectedConnection);
    if (!connectionExists && updatedConnections.length > 0) {
      setSelectedConnection(updatedConnections[0].id);
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden touch-none">
      <Sidebar 
        onOpenSettings={() => setIsSettingsOpen(true)}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onNewChat={handleNewChat}
        chats={chats}
        activeChatId={activeChatId}
        onSwitchChat={handleSwitchChat}
        onToggleStar={handleToggleStar}
      />
      <ChatInterface 
        chat={activeChat}
        connectionString={selectedConnection}
        connections={connections}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
        onConnectionChange={handleConnectionChange}
        onUpdateMessages={handleUpdateMessages}
        onToggleStar={() => handleToggleStar(activeChatId)}
      />
      <SettingsDialog 
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        connections={connections}
        onUpdateConnections={handleUpdateConnections}
      />
    </div>
  );
}
