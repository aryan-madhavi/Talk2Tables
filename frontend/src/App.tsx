import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatInterface } from './components/ChatInterface';
import { SettingsDialog } from './components/SettingsDialog';
import { AuthPage } from './components/AuthPage';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner@2.0.3';
import { db, auth } from './components/firebase/FirebaseApp';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';


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
  typeo?: string;
  id: string;
  name: string;
  host: string;
  port?: string;
  database?: string;
  username?: string;
  password?: string;
  active: boolean;
  addedby?: string;     
  createdAt?: any;  
}

export interface UserData {
  uid: string;
  username: string;
  email: string;
  allowedDatabases: string[]; // IDs of databases this user can access
}

const LOGOUT_URL = import.meta.env.VITE_API_LOGOUT_URL;
const SESSION_URL = import.meta.env.VITE_API_SESSION_URL;


const initialChat: Chat = {
  id: crypto.randomUUID(),
  title: 'New Chat',
  messages: [],
  starred: false,
  timestamp: new Date(),
};

// All available database connections
const allConnections: Connection[] = [];




// Mock user database - In production, this would come from a backend
const mockUserDatabase: Record<string, UserData> = {
  'admin': {
    uid: 'admin-uid',
    username: 'admin',
    email: 'admin@example.com',
    allowedDatabases: ['main-db', 'dev-db', 'staging-db', 'prod-db', 'analytics-db', 'backup-db'], // Admin has access to all
  },
  'developer': {
    uid: 'developer-uid',
    username: 'developer',
    email: 'developer@example.com',
    allowedDatabases: ['dev-db', 'staging-db'], // Developer has limited access
  },
  'analyst': {
    uid: 'analyst-uid',
    username: 'analyst',
    email: 'analyst@example.com',
    allowedDatabases: ['analytics-db', 'main-db'], // Analyst has specific access
  },
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<string>('general');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([initialChat]);
  const [activeChatId, setActiveChatId] = useState('1');
  const [checkingSession, setCheckingSession] = useState(true);

  const activeChat = chats.find(chat => chat.id === activeChatId) || chats[0];

  // All available database connections
    useEffect(() => {
      if (!isAuthenticated || !currentUser) return;

      // console.log("Setting up Firestore listener for user connections:", currentUser.uid);

      const q = query(
        collection(db, "connections"),
        where("addedby", "==", currentUser.uid),
        orderBy("createdAt", "desc")
      );

      // Real-time updates using onSnapshot
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const userConnections = snapshot.docs.map((doc) => {
        const data = doc.data() as Omit<Connection, "id">;
        return { id: doc.id, ...data };
      });

        setConnections(userConnections);

        // Auto-select the first connection if none selected
        if (!selectedConnection && userConnections.length > 0) {
          setSelectedConnection(userConnections[0].id);
        }
      });

      return () => unsubscribe(); // cleanup listener when unmounts
    }, [isAuthenticated, currentUser]);


  const handleNewChat = () => {
    const newChat: Chat = {
      id: crypto.randomUUID(),
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

  const handleRenameChat = (chatId: string, newTitle: string) => {
    setChats(prev => prev.map(chat => 
      chat.id === chatId ? { ...chat, title: newTitle } : chat
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
    
    if (currentUser) {
      const updatedUser = {
        ...currentUser,
        allowedDatabases: updatedConnections.map(conn => conn.id)
      };
      setCurrentUser(updatedUser);
    }
    
    // If the selected connection was deleted, switch to the first available one
    const connectionExists = updatedConnections.find(conn => conn.id === selectedConnection);
    if (!connectionExists && updatedConnections.length > 0) {
      setSelectedConnection(updatedConnections[0].id);
    } else if (updatedConnections.length === 0) {
      setSelectedConnection('');
    }
  };

  const handleAuthenticated = (username: string, email: string) => {
    const user = auth.currentUser;
    if (!user) {
      console.error("No authenticated user found in Firebase Auth");
      return;
    }
    // Get user data from mock database
    const userData = mockUserDatabase[username.toLowerCase()] || {
      uid: user.uid,
      username: username,
      email: email,
      allowedDatabases: ['main-db', 'dev-db'], // Default access for new users
    };
    
    setCurrentUser(userData);
    setIsAuthenticated(true);
    
    // Load user's allowed connections
    const userConnections = allConnections.filter(conn => 
      userData.allowedDatabases.includes(conn.id)
    );
    setConnections(userConnections);
    
    // Set first connection as selected
    if (userConnections.length > 0) {
      setSelectedConnection(userConnections[0].id);
    }
    
    // Show welcome notification
    setTimeout(() => {
      toast.success(`Welcome back, ${username}!`, {
        description: `You have access to ${userConnections.length} database${userConnections.length !== 1 ? 's' : ''}`,
        duration: 3000,
      });
    }, 500);
  };

  const handleLogout = async () => {

    try{
        await fetch(LOGOUT_URL, {
        method: "POST",
        credentials: "include", // 👈 include cookies
      });
    } catch(err){
        console.error("Logout failed:", err);
    }


    setIsAuthenticated(false);
    setCurrentUser(null);
    setConnections([]);
    setSelectedConnection('');
    // Reset to initial state
    setChats([initialChat]);
    setActiveChatId('1');
    setIsSidebarOpen(false);
    setIsSettingsOpen(false);
  };

  const handleOpenSettingsWithTab = (tab: string) => {
    setSettingsDefaultTab(tab);
    setIsSettingsOpen(true);
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch(SESSION_URL, {
          method: "GET",
          credentials: "include", // 👈 sends the HTTP-only cookie
        });

        if (!res.ok) {
          console.log("No active session found");
          return;
        }

        const data = await res.json();
        console.log("Session user:", data.user);

        // Reuse your existing logic
        handleAuthenticated(data.user.name ?? data.user.email, data.user.email);
      } catch (err) {
        console.error("Session check failed:", err);
      } finally{
        setCheckingSession(false);
      }
    };

    checkSession();
  }, []); // Run once on mount

  if (checkingSession) {
    return <div className="flex items-center justify-center h-screen text-lg">Checking session...</div>;
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

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
        onRenameChat={handleRenameChat}
        onLogout={handleLogout}
        currentUser={currentUser?.username || ''}
        databaseCount={connections.length}
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
        onOpenSettingsWithTab={handleOpenSettingsWithTab}
      />
      <SettingsDialog 
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        connections={connections}
        onUpdateConnections={handleUpdateConnections}
        defaultTab={settingsDefaultTab}
        onDefaultTabChange={setSettingsDefaultTab}
      />
      <Toaster />
    </div>
  );
}