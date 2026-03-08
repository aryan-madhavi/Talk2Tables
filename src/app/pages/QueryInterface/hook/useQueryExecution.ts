import { useState, useRef, useEffect } from 'react';
import { Message, QueryResult } from '../types';
import { executeQuery, isErrorPayload } from '../../../../lib/queryService';

export function useQueryExecution(selectedConnectionId: string) {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: 'Hello! I am connected. Ask me anything about your database.', timestamp: new Date() }
  ]);
  const [input,       setInput]       = useState('');
  const [isTyping,    setIsTyping]    = useState(false);
  const [currentResult, setCurrentResult] = useState<QueryResult | null>(null);
  const [chartType,   setChartType]   = useState<'bar' | 'pie'>('bar');
  const [chatId,      setChatId]      = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Reset conversation when the user switches database connections
  useEffect(() => {
    setChatId(null);
    setCurrentResult(null);
    setMessages([
      { id: '1', role: 'assistant', content: 'Hello! I am connected. Ask me anything about your database.', timestamp: new Date() }
    ]);
  }, [selectedConnectionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || !selectedConnectionId) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: new Date() };
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

      // Persist chat_id for conversation continuity
      setChatId(response.chat_id);

      const payload = response.data?.[0];

      if (!payload) throw new Error('Empty response from server.');

      if (isErrorPayload(payload)) {
        // Backend returned a structured error
        setMessages(prev => [...prev, {
          id:        (Date.now() + 1).toString(),
          role:      'assistant',
          content:   payload.error_message,
          timestamp: new Date(),
        }]);
        return;
      }

      // Success path
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
        id:             (Date.now() + 1).toString(),
        role:           'assistant',
        content:        payload.summary || 'Query executed.',
        timestamp:      new Date(),
        relatedQueryId: result.id,
      }]);
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

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

  return {
    messages, input, setInput, isTyping, currentResult,
    messagesEndRef, handleSend, handleKeyDown,
    chartType, setChartType, copyToClipboard, downloadCSV,
  };
}
