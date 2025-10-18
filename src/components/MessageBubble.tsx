import { Avatar, AvatarFallback } from './ui/avatar';
import { MoreHorizontal, Reply, Smile } from 'lucide-react';
import { Button } from './ui/button';

interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
  isOwn: boolean;
}

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // User messages - Right aligned
  if (message.isOwn) {
    return (
      <div className="flex justify-end">
        <div className="flex gap-3 group max-w-[85%] sm:max-w-[70%]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 justify-end">
              <span className="text-muted-foreground">{formatTime(message.timestamp)}</span>
              <span className="font-medium">You</span>
            </div>
            <div className="relative">
              <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl rounded-tr-sm px-4 py-3 shadow-md">
                <p className="break-words leading-relaxed text-white">{message.content}</p>
              </div>
              {/* Hover Actions */}
              <div className="absolute -top-3 left-4 hidden group-hover:flex items-center gap-1 bg-card border border-border rounded-lg shadow-lg p-1">
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Reply className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Smile className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <Avatar className="shrink-0 h-10 w-10 mt-1 ring-2 ring-violet-500/30">
            <AvatarFallback className="bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500 text-white">
              {getInitials(message.sender)}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    );
  }

  // AI/Other messages - Left aligned
  return (
    <div className="flex gap-3 group max-w-[85%] sm:max-w-[70%]">
      <Avatar className="shrink-0 h-10 w-10 mt-1 ring-2 ring-emerald-500/30">
        <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
          {getInitials(message.sender)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium">{message.sender}</span>
          <span className="text-muted-foreground">{formatTime(message.timestamp)}</span>
        </div>
        <div className="relative">
          <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
            <p className="break-words leading-relaxed">{message.content}</p>
          </div>
          {/* Hover Actions */}
          <div className="absolute -top-3 right-4 hidden group-hover:flex items-center gap-1 bg-card border border-border rounded-lg shadow-lg p-1">
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Smile className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Reply className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
