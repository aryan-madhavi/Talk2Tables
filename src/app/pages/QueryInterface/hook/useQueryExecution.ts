import { useState, useRef, useEffect, useCallback } from 'react';
import { Message, QueryResult } from '../types';
import { executeQuery, isErrorPayload } from '../../../../lib/queryService';
import { MessageOut } from '../../../../lib/chatService';

const INITIAL_MESSAGE: Message = {
  id:        'welcome',
  role:      'assistant',
  content:   'Hello! I am connected. Ask me anything about your database.',
  timestamp: new Date(),
};

function buildResultFromMessage(m: MessageOut): QueryResult | null {
  if (!m.data || m.data.length === 0) return null;
  return {
    id:            m.msg_id,
    sql:           m.sql_query   || '',
    data:          m.data,
    columns:       Object.keys(m.data[0] ?? {}),
    executionTime: 0,
    rowCount:      m.total_records ?? m.data.length,
    chartData:     m.data.slice(0, 10).map(item => {
      const keys = Object.keys(item);
      return { name: String(item[keys[0]]), value: Number(item[keys[1]]) || 0 };
    }),
  };
}

export function useQueryExecution(selectedConnectionId: string) {
  const [messages,       setMessages]       = useState<Message[]>([INITIAL_MESSAGE]);
  const [input,          setInput]          = useState('');
  const [isTyping,       setIsTyping]       = useState(false);
  const [currentResult,  setCurrentResult]  = useState<QueryResult | null>(null);
  const [chartType,      setChartType]      = useState<'bar' | 'pie'>('bar');
  const [chatId,         setChatId]         = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Reset when switching connections
  useEffect(() => {
    setChatId(null);
    setCurrentResult(null);
    setMessages([INITIAL_MESSAGE]);
    setRefreshTrigger(0);
  }, [selectedConnectionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ── Load a past chat from history ──────────────────────────────────────────

  const loadChat = useCallback((restoredChatId: string, history: MessageOut[]) => {
    setChatId(restoredChatId);

    if (history.length === 0) {
      setMessages([INITIAL_MESSAGE]);
      setCurrentResult(null);
      return;
    }

    setMessages(history.map(m => ({
      id:          m.msg_id,
      role:        m.role,
      content:     m.content,
      timestamp:   new Date(m.created_at),
      queryResult: buildResultFromMessage(m) ?? undefined,
    })));

    // Restore the last result from the last assistant message with data
    const lastWithData = [...history]
      .reverse()
      .find(m => m.role === 'assistant' && m.data && m.data.length > 0);

    setCurrentResult(lastWithData ? buildResultFromMessage(lastWithData) : null);
  }, []);

  // ── Start a new chat ───────────────────────────────────────────────────────

  const newChat = useCallback(() => {
    setChatId(null);
    setCurrentResult(null);
    setMessages([INITIAL_MESSAGE]);
  }, []);

  // ── Send a message ─────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!input.trim() || !selectedConnectionId) return;

    const userMsg: Message = {
      id:        Date.now().toString(),
      role:      'user',
      content:   input,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const startTime = Date.now();
      const response = await executeQuery({
        connection_id: selectedConnectionId,
        chat_input:    input,
        chat_id:       chatId,
      });
      const executionTime = Date.now() - startTime;

      setChatId(response.chat_id);

      const payload = response.data?.[0];
      if (!payload) throw new Error('Empty response from server.');

      if (isErrorPayload(payload)) {
        setMessages(prev => [...prev, {
          id:        (Date.now() + 1).toString(),
          role:      'assistant',
          content:   payload.error_message,
          timestamp: new Date(),
        }]);
        return;
      }

      const result: QueryResult = {
        id:            Date.now().toString(),
        sql:           payload.sql_query   || '-- No SQL generated',
        data:          payload.data        || [],
        columns:       payload.data?.length > 0 ? Object.keys(payload.data[0]) : [],
        executionTime,
        rowCount:      payload.total_records ?? payload.data?.length ?? 0,
        chartData:     (payload.data || []).slice(0, 10).map(item => {
          const keys = Object.keys(item);
          return { name: String(item[keys[0]]), value: Number(item[keys[1]]) || 0 };
        }),
      };

      setCurrentResult(result);
      setMessages(prev => [...prev, {
        id:          (Date.now() + 1).toString(),
        role:        'assistant',
        content:     payload.summary || 'Query executed.',
        timestamp:   new Date(),
        queryResult: result,
      }]);

      // Signal sidebar to refresh (new chat title / message count)
      setRefreshTrigger(n => n + 1);

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Query failed. Please try again.';
      setMessages(prev => [...prev, {
        id:        (Date.now() + 1).toString(),
        role:      'assistant',
        content:   `Error: ${msg}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  const downloadCSV = () => {
    if (!currentResult?.data || currentResult.data.length === 0) return;
    const headers = Object.keys(currentResult.data[0]).join(',');
    const rows    = currentResult.data.map(row => Object.values(row).join(',')).join('\n');
    const blob    = new Blob([[headers, rows].join('\n')], { type: 'text/csv' });
    const url     = window.URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `data_export_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleMessageClick = (msg: Message) => {
    if (msg.queryResult) setCurrentResult(msg.queryResult);
  };

  return {
    messages, input, setInput, isTyping, currentResult,
    messagesEndRef, handleSend, handleKeyDown, handleMessageClick,
    chartType, setChartType, copyToClipboard, downloadCSV,
    chatId, loadChat, newChat, refreshTrigger,
  };
}
