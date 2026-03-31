import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { TableProperties, RotateCcw, Loader2 } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { Message } from '../types';
import { TypingIndicator } from './TypingIndicator';

interface ChatMessagesProps {
  messages:        Message[];
  isTyping:        boolean;
  progressMessage: string | null;
  messagesEndRef:  React.RefObject<HTMLDivElement | null>;
  onMessageClick:  (msg: Message) => void;
  onRetry?:        (input: string) => void;
  // ── Infinite scroll upward ───────────────────────────────────────────────
  hasMore?:        boolean;
  loadingEarlier?: boolean;
  onLoadEarlier?:  () => void;
}

export function ChatMessages({
  messages, isTyping, progressMessage, messagesEndRef,
  onMessageClick, onRetry,
  hasMore = false, loadingEarlier = false, onLoadEarlier,
}: ChatMessagesProps) {
  const scrollContainerRef  = useRef<HTMLDivElement>(null);
  const sentinelRef         = useRef<HTMLDivElement>(null);
  // Stores scrollHeight just before earlier messages are prepended
  const prevScrollHeightRef = useRef<number | null>(null);

  // ── Restore scroll position after prepend (runs before paint to avoid flicker) ──
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || prevScrollHeightRef.current === null) return;
    // Shift scrollTop by exactly how much taller the container got
    container.scrollTop += container.scrollHeight - prevScrollHeightRef.current;
    prevScrollHeightRef.current = null;
  }, [messages]);

  // ── IntersectionObserver: fire when sentinel scrolls into view ────────────
  useEffect(() => {
    const sentinel  = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container || !hasMore || loadingEarlier || !onLoadEarlier) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // Capture height before React re-renders with the prepended messages
          prevScrollHeightRef.current = container.scrollHeight;
          onLoadEarlier();
        }
      },
      {
        root:      container,   // observe within the scrollable div, not the viewport
        threshold: 0.1,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingEarlier, onLoadEarlier]);

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/30">

      {/*
        Sentinel div sits at the very top.
        IntersectionObserver fires when user scrolls here → triggers loadEarlierMessages().
      */}
      <div ref={sentinelRef} style={{ height: '1px' }} />

      {/* Loading spinner while fetching older messages */}
      {loadingEarlier && (
        <div className="flex justify-center py-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading earlier messages…
          </div>
        </div>
      )}

      {messages.map(msg => {
        const hasResult = msg.role === 'assistant' && !!msg.queryResult;

        return (
          <div
            key={msg.id}
            className={cn('flex w-full', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl p-4 shadow-sm',
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none',
                hasResult && 'cursor-pointer hover:border-blue-200 hover:shadow-md transition-all',
              )}
              onClick={() => hasResult && onMessageClick(msg)}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

              {hasResult && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-blue-500 font-medium">
                  <TableProperties className="w-3 h-3" />
                  <span>Click to view results</span>
                </div>
              )}

              {msg.isError && msg.retryInput && onRetry && (
                <button
                  onClick={e => { e.stopPropagation(); onRetry(msg.retryInput!); }}
                  className="mt-2 flex items-center gap-1.5 text-[11px] text-red-500 hover:text-red-700 font-medium transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}

              <div
                className={cn(
                  'text-[10px] mt-2 opacity-70',
                  msg.role === 'user' ? 'text-blue-100 text-right' : 'text-gray-400',
                )}
              >
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        );
      })}

      {isTyping && (
        progressMessage
          ? (
            <div className="flex justify-start w-full">
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-xs text-gray-500 ml-1">{progressMessage}</span>
              </div>
            </div>
          )
          : <TypingIndicator />
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
