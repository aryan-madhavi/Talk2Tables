import { useState, useRef, useEffect, useCallback } from 'react';
import { Message, QueryResult } from '../types';
import { executeQueryStream, isErrorPayload } from '../../../../lib/queryService';
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
    msgId:         m.msg_id,
    chartData:     m.data.slice(0, 10).map(item => {
      const keys = Object.keys(item);
      return { name: String(item[keys[0]]), value: Number(item[keys[1]]) || 0 };
    }),
  };
}

export function useQueryExecution(selectedConnectionId: string) {
  const [messages,        setMessages]        = useState<Message[]>([INITIAL_MESSAGE]);
  const [input,           setInput]           = useState('');
  const [isTyping,        setIsTyping]        = useState(false);
  const [executingChatId, setExecutingChatId] = useState<string | null | undefined>(undefined);
  const [currentResult,   setCurrentResult]   = useState<QueryResult | null>(null);
  const [chartType,       setChartType]       = useState<'bar' | 'pie'>('bar');
  const [chatId,           setChatId]           = useState<string | null>(null);
  const [refreshTrigger,   setRefreshTrigger]   = useState(0);
  const [progressMessage,  setProgressMessage]  = useState<string | null>(null);
  const messagesEndRef  = useRef<HTMLDivElement | null>(null);
  // Increments each time the connection changes; used to discard stale responses
  const generationRef   = useRef(0);

  // Reset when switching connections
  useEffect(() => {
    generationRef.current += 1;
    setChatId(null);
    setCurrentResult(null);
    setMessages([INITIAL_MESSAGE]);
    setIsTyping(false);
    setExecutingChatId(undefined);
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

  const sendQuery = useCallback(async (queryText: string) => {
    if (!queryText.trim() || !selectedConnectionId) return;

    const generation = generationRef.current;

    const userMsg: Message = {
      id:        Date.now().toString(),
      role:      'user',
      content:   queryText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    setExecutingChatId(chatId);   // capture which chat is running (null = new chat)

    try {
      const startTime = Date.now();
      let executionTime = 0;

      await executeQueryStream(
        {
          connection_id: selectedConnectionId,
          chat_input:    queryText,
          chat_id:       chatId,
        },
        {
          onProgress: ({ message }) => {
            if (generationRef.current === generation) {
              setProgressMessage(message);
            }
          },
          onResult: (response) => {
            executionTime = Date.now() - startTime;
            if (generationRef.current !== generation) return;

            setChatId(response.chat_id);

            const payload = response.data?.[0];
            if (!payload) {
              setMessages(prev => [...prev, {
                id:         (Date.now() + 1).toString(),
                role:       'assistant',
                content:    'Empty response from server.',
                timestamp:  new Date(),
                isError:    true,
                retryInput: queryText,
              }]);
              return;
            }

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
              question:          queryText,
              summary:           payload.summary,
              insights:          (payload as any).numerical_insights  ?? undefined,
              narrativeInsights: (payload as any).narrative_insights  ?? undefined,
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

            setRefreshTrigger(n => n + 1);
          },
          onError: (msg) => {
            if (generationRef.current !== generation) return;
            setMessages(prev => [...prev, {
              id:         (Date.now() + 1).toString(),
              role:       'assistant',
              content:    `Error: ${msg}`,
              timestamp:  new Date(),
              isError:    true,
              retryInput: queryText,
            }]);
          },
        },
      );
    } catch (error) {
      if (generationRef.current !== generation) return;
      const msg = error instanceof Error ? error.message : 'Query failed. Please try again.';
      setMessages(prev => [...prev, {
        id:         (Date.now() + 1).toString(),
        role:       'assistant',
        content:    `Error: ${msg}`,
        timestamp:  new Date(),
        isError:    true,
        retryInput: queryText,
      }]);
    } finally {
      if (generationRef.current === generation) {
        setProgressMessage(null);
        setIsTyping(false);
        setExecutingChatId(undefined);
      }
    }
  }, [selectedConnectionId, chatId]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput('');
    await sendQuery(text);
  };

  const copyToClipboard = useCallback((text: string) => navigator.clipboard.writeText(text), []);

  const downloadCSV = useCallback(() => {
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
  }, [currentResult]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleMessageClick = (msg: Message) => {
    if (msg.queryResult) setCurrentResult(msg.queryResult);
  };

  const updateCurrentResultInsights = (
    insights:         QueryResult['insights'],
    narrativeInsights: QueryResult['narrativeInsights'],
  ) => {
    setCurrentResult(prev => prev ? { ...prev, insights, narrativeInsights } : prev);
  };

  return {
    messages, input, setInput, isTyping, executingChatId, currentResult,
    messagesEndRef, handleSend, handleKeyDown, handleMessageClick,
    chartType, setChartType, copyToClipboard, downloadCSV,
    chatId, loadChat, newChat, refreshTrigger, sendQuery,
    updateCurrentResultInsights, progressMessage,
  };
}
