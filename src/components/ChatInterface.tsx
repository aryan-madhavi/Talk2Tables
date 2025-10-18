import { useState, useEffect, useRef } from "react";
import {
  Send,
  Menu,
  Database,
  Plus,
  Hash,
  Users,
  Pin,
  MoreVertical,
  Star,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Separator } from "./ui/separator";
import type { Chat, Message, Connection } from "../App";

interface ChatInterfaceProps {
  chat: Chat;
  connectionString: string;
  connections: Connection[];
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  onConnectionChange: (value: string) => void;
  onUpdateMessages: (messages: Message[]) => void;
  onToggleStar: () => void;
}

export function ChatInterface({
  chat,
  connectionString,
  connections,
  onToggleSidebar,
  isSidebarOpen,
  onConnectionChange,
  onUpdateMessages,
  onToggleStar,
}: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const selectedConn = connections.find(
    (c) => c.id === connectionString,
  );

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat.messages]);

  const handleSend = () => {
    if (inputValue.trim()) {
      const newMessage: Message = {
        id: Date.now().toString(),
        content: inputValue,
        sender: "You",
        timestamp: new Date(),
        isOwn: true,
      };
      const updatedMessages = [...chat.messages, newMessage];
      onUpdateMessages(updatedMessages);
      setInputValue("");
      
      // Simulate AI response after a short delay
      setTimeout(() => {
        const aiResponse: Message = {
          id: (Date.now() + 1).toString(),
          content: "Thanks for your message! I'm processing your request.",
          sender: "AI Assistant",
          timestamp: new Date(),
          isOwn: false,
        };
        onUpdateMessages([...updatedMessages, aiResponse]);
      }, 1000);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleConnectionChange = (value: string) => {
    if (value === "add-new") {
      console.log("Add new connection clicked");
    } else {
      onConnectionChange(value);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0 h-full">
      {/* Enhanced Header */}
      <div className="bg-card border-b border-border/50 shadow-sm">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleSidebar}
                className="shrink-0"
              >
                <Menu className="h-5 w-5" />
              </Button>

              <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 flex-1 sm:flex-initial min-w-0">
                <Hash className="h-4 w-4 sm:h-5 sm:w-5 text-violet-600 dark:text-violet-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 className="leading-none truncate">
                    {chat.title}
                  </h2>
                  <p className="text-muted-foreground mt-0.5 sm:mt-1 hidden sm:block">
                    {chat.messages.length} message{chat.messages.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 sm:h-10 sm:w-10 ${chat.starred ? 'text-yellow-500 hover:text-yellow-600' : ''}`}
                onClick={onToggleStar}
              >
                <Star className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${chat.starred ? 'fill-current' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-10 sm:w-10"
              >
                <Pin className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-10 sm:w-10 hidden sm:flex"
              >
                <Users className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-10 sm:w-10"
              >
                <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* Date Divider */}
          <div className="flex items-center gap-4 mb-6">
            <Separator className="flex-1" />
            <span className="text-muted-foreground px-3 py-1 rounded-full bg-muted/50">
              October 13, 2025
            </span>
            <Separator className="flex-1" />
          </div>

          <div className="space-y-4">
            {chat.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Hash className="h-12 w-12 text-violet-500/20 mb-4" />
                <h3 className="text-muted-foreground mb-2">No messages yet</h3>
                <p className="text-muted-foreground/60">Start a conversation by typing a message below</p>
              </div>
            ) : (
              chat.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                />
              ))
            )}
            {/* Invisible div for auto-scroll target */}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </ScrollArea>

      {/* Enhanced Input Area */}
      <div className="border-t border-border/50 bg-card shadow-lg">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 pt-3 sm:pt-4 pb-6 sm:pb-4">
          {/* Connection Selector Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-3 p-2.5 sm:p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 w-full sm:flex-1 min-w-0">
              <Database className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
              <Select
                value={connectionString}
                onValueChange={handleConnectionChange}
              >
                <SelectTrigger className="w-full sm:w-[220px] h-9 border-0 bg-background shadow-sm text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id}>
                      <div className="flex items-center gap-2">
                        <Database className="h-3 w-3" />
                        <span>{conn.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                  <Separator className="my-1" />
                  <SelectItem value="add-new">
                    <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
                      <Plus className="h-3 w-3" />
                      <span>Add New Connection</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Separator
                orientation="vertical"
                className="h-5 hidden sm:block"
              />
              <div className="text-muted-foreground flex-1 sm:flex-initial truncate text-xs sm:text-sm">
                {selectedConn?.host}
              </div>
              <Badge
                variant="secondary"
                className="shrink-0 text-xs"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 mr-1.5"></div>
                Connected
              </Badge>
            </div>
          </div>

          {/* Message Input */}
          <div className="relative">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="pr-12 h-12 border-2 focus:border-violet-500 dark:focus:border-violet-400 rounded-xl shadow-sm"
            />
            <Button
              onClick={handleSend}
              size="icon"
              disabled={!inputValue.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* Extra safe area for mobile devices */}
        <div className="h-6 sm:hidden bg-card"></div>
      </div>
    </div>
  );
}