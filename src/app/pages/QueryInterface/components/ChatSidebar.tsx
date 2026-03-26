// src/app/pages/QueryInterface/components/ChatSidebar.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquarePlus, MessageSquare, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { listChats, getMessages, ChatOut, MessageOut } from '../../../../lib/chatService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60_000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ChatSidebarProps {
  connectionId:    string;
  activeChatId:    string | null;
  executingChatId: string | null | undefined;
  refreshTrigger:  number;
  onNewChat:       () => void;
  onSelectChat:    (chatId: string, messages: MessageOut[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatSidebar({
  connectionId,
  activeChatId,
  executingChatId,
  refreshTrigger,
  onNewChat,
  onSelectChat,
}: ChatSidebarProps) {
  const [chats,     setChats]     = useState<ChatOut[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const fetchChats = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const res = await listChats(connectionId);
      setChats(res.chats);
    } catch {
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  // Reload when connection changes
  useEffect(() => { fetchChats(); }, [fetchChats]);

  // After a successful query: optimistic update for existing chats, refetch for new ones
  useEffect(() => {
    if (refreshTrigger === 0) return;
    const isExisting = activeChatId ? chats.some(c => c.chat_id === activeChatId) : false;
    if (isExisting && activeChatId) {
      setChats(prev =>
        prev
          .map(c => c.chat_id === activeChatId
            ? { ...c, updated_at: new Date().toISOString(), msg_count: c.msg_count + 2 }
            : c
          )
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      );
    } else {
      fetchChats();
    }
  }, [refreshTrigger]);

  const handleSelectChat = async (chat: ChatOut) => {
    if (loadingId) return;
    setLoadingId(chat.chat_id);
    try {
      const res = await getMessages(connectionId, chat.chat_id);
      onSelectChat(chat.chat_id, res.messages);
    } catch {
      // Silently fail — user can still start a new query
    } finally {
      setLoadingId(null);
    }
  };

  // ── Collapsed state (icon-only) ───────────────────────────────────────────

  if (collapsed) {
    return (
      <div className="hidden md:flex flex-col h-full w-10 border-r border-gray-100 bg-gray-50/60 items-center py-3 gap-3 shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400
                     hover:bg-gray-200 hover:text-gray-700 transition-colors"
          title="Expand chat history"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <div className="w-px flex-1 bg-gray-200 mx-auto" />
        {chats.slice(0, 8).map(c => (
          <button
            key={c.chat_id}
            onClick={() => { setCollapsed(false); handleSelectChat(c); }}
            title={c.title}
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0',
              activeChatId === c.chat_id
                ? 'bg-blue-100 text-blue-600'
                : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600',
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>
    );
  }

  // ── Expanded state ────────────────────────────────────────────────────────

  return (
    <div className="hidden md:flex flex-col h-full w-56 shrink-0 border-r border-gray-100 bg-gray-50/60">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Chats</span>
        <button
          onClick={() => setCollapsed(true)}
          className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400
                     hover:bg-gray-200 hover:text-gray-600 transition-colors"
          title="Collapse"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* New Chat button */}
      <div className="px-2.5 pt-2.5 pb-1">
        <button
          onClick={onNewChat}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all',
            'bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-95',
          )}
        >
          <MessageSquarePlus className="w-4 h-4 shrink-0" />
          New Chat
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">

        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        )}

        {!loading && chats.length === 0 && (
          <div className="text-center py-8 px-3">
            <MessageSquare className="w-7 h-7 text-gray-200 mx-auto mb-2" />
            <p className="text-xs font-medium text-gray-400">No conversations yet</p>
            <p className="text-[11px] text-gray-300 mt-1">Ask a question to start</p>
          </div>
        )}

        {!loading && chats.map(chat => {
          const isActive    = activeChatId  === chat.chat_id;
          const isLoading   = loadingId     === chat.chat_id;
          const isExecuting = executingChatId === chat.chat_id && !isActive;

          return (
            <button
              key={chat.chat_id}
              onClick={() => handleSelectChat(chat)}
              disabled={!!loadingId}
              className={cn(
                'w-full text-left px-2.5 py-2 rounded-lg transition-all group',
                isActive
                  ? 'bg-blue-50 border border-blue-200'
                  : 'hover:bg-white hover:shadow-sm border border-transparent',
                loadingId && !isLoading && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className="flex items-start gap-2 min-w-0">
                <div className={cn(
                  'mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0',
                  isActive ? 'bg-blue-100' : 'bg-gray-100 group-hover:bg-blue-50',
                )}>
                  {isLoading || isExecuting
                    ? <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-500" />
                    : <MessageSquare className={cn('w-2.5 h-2.5', isActive ? 'text-blue-600' : 'text-gray-400')} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-xs font-medium truncate leading-tight',
                    isActive ? 'text-blue-800' : 'text-gray-700',
                  )}>
                    {chat.title || 'Untitled'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-gray-400">{timeAgo(chat.updated_at)}</span>
                    <span className="text-gray-300 text-[10px]">·</span>
                    <span className="text-[10px] text-gray-400">{chat.msg_count} msg{chat.msg_count !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
