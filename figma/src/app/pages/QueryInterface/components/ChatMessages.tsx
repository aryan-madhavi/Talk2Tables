import React from 'react';
import { cn } from '../../../../lib/utils';
import { Message } from '../types';
import { TypingIndicator } from './TypingIndicator';

interface ChatMessagesProps {
  messages:       Message[];
  isTyping:       boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatMessages({ messages, isTyping, messagesEndRef }: ChatMessagesProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/30">
      {messages.map(msg => (
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
            )}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
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
      ))}

      {isTyping && <TypingIndicator />}

      <div ref={messagesEndRef} />
    </div>
  );
}