import { Settings, Plus, MessageSquare, X, Clock, Star } from 'lucide-react';
import { Button } from './ui/button';
import { ThemeSwitcher } from './ThemeSwitcher';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import type { Chat } from '../App';

interface SidebarProps {
  onOpenSettings: () => void;
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  chats: Chat[];
  activeChatId: string;
  onSwitchChat: (chatId: string) => void;
  onToggleStar: (chatId: string) => void;
}

// Helper function to format relative time
const getRelativeTime = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

export function Sidebar({ 
  onOpenSettings, 
  isOpen, 
  onClose, 
  onNewChat, 
  chats, 
  activeChatId, 
  onSwitchChat, 
  onToggleStar 
}: SidebarProps) {
  // Separate starred and regular chats
  const starredChats = chats.filter(chat => chat.starred);
  const regularChats = chats.filter(chat => !chat.starred);
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 backdrop-blur-md z-40"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50
        w-[280px] bg-gradient-to-b from-card to-card/95 border-r border-border/50 
        flex flex-col shadow-2xl
        transform transition-all duration-300 ease-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Header with gradient */}
        <div className="p-4 bg-gradient-to-r from-violet-600 to-indigo-600">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-white">Chat Hub</h1>
                <p className="text-white/70">Database Console</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20 shrink-0"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* New Chat Button */}
          <Button
            variant="secondary"
            className="w-full justify-start gap-2 bg-white/10 hover:bg-white/20 text-white border-white/20"
            onClick={() => {
              onNewChat?.();
              onClose();
            }}
          >
            <Plus className="h-4 w-4" />
            <span>New Chat</span>
          </Button>
        </div>

        {/* Recent Conversations */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-muted-foreground uppercase tracking-wider">Recent</span>
            <Badge variant="secondary" className="text-xs">
              {chats.length}
            </Badge>
          </div>
          
          {/* Starred Chats */}
          {starredChats.length > 0 && (
            <div className="mb-4">
              <div className="px-1 mb-2 flex items-center gap-2">
                <Star className="h-3 w-3 text-yellow-500 fill-current" />
                <span className="text-muted-foreground uppercase tracking-wider">Starred</span>
              </div>
              <div className="space-y-1">
                {starredChats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => onSwitchChat(chat.id)}
                    className={`group flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-accent transition-all duration-200 cursor-pointer relative ${
                      activeChatId === chat.id ? 'bg-accent/70' : ''
                    }`}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="truncate flex-1">{chat.title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{getRelativeTime(chat.timestamp)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar(chat.id);
                      }}
                      className="shrink-0 mt-0.5 opacity-100 hover:scale-110 transition-transform"
                    >
                      <Star className="h-4 w-4 text-yellow-500 fill-current" />
                    </button>
                  </div>
                ))}
              </div>
              <Separator className="opacity-50 my-3" />
            </div>
          )}
          
          {/* Regular Chats */}
          <div className="space-y-1">
            {regularChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => onSwitchChat(chat.id)}
                className={`group flex items-start gap-3 px-3 py-3 rounded-lg hover:bg-accent transition-all duration-200 cursor-pointer relative ${
                  activeChatId === chat.id ? 'bg-accent/70' : ''
                }`}
              >
                <MessageSquare className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="truncate flex-1">{chat.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{getRelativeTime(chat.timestamp)}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(chat.id);
                  }}
                  className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 hover:scale-110 transition-all"
                >
                  <Star className="h-4 w-4 text-muted-foreground hover:text-yellow-500" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Footer */}
        <div className="p-4 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                <span className="text-white">AD</span>
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-card rounded-full"></div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate">Admin User</div>
              <div className="text-muted-foreground">Online</div>
            </div>
            <div className="flex items-center gap-1">
              <ThemeSwitcher />
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenSettings}
                className="shrink-0"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
