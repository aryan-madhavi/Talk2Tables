import React from 'react';
import { Send, Mic } from 'lucide-react';
import { cn } from '../../../../lib/utils';

interface ChatInputProps {
  input:        string;
  onChange:     (value: string) => void;
  onKeyDown:    (e: React.KeyboardEvent) => void;
  onSend:       () => void;
}

export function ChatInput({ input, onChange, onKeyDown, onSend }: ChatInputProps) {
  return (
    <div className="p-4 bg-white border-t border-gray-100">
      <div className="relative rounded-xl border border-gray-200 bg-white shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
        <textarea
          value={input}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything... e.g. Show all sensors due for calibration"
          className="w-full py-3 pl-4 pr-24 bg-transparent border-none focus:ring-0
                     resize-none min-h-[60px] max-h-[120px] text-sm outline-none"
          rows={2}
        />
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <button
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Voice Input"
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            onClick={onSend}
            disabled={!input.trim()}
            className={cn(
              'p-2 rounded-lg transition-colors',
              input.trim()
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2 text-center">
        Tip: Be specific for better results. AI can make mistakes.
      </p>
    </div>
  );
}