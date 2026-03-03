import { useState, useRef, useEffect } from 'react';
import { Message, QueryResult } from '../types';

// ─── Mock response data ───────────────────────────────────────────────────────

const MOCK_DATA = [
  { id: 101, name: 'Sensor A', location: 'Zone 1', status: 'active',      reading: 45.2 },
  { id: 102, name: 'Sensor B', location: 'Zone 2', status: 'maintenance', reading: 12.8 },
  { id: 103, name: 'Sensor C', location: 'Zone 1', status: 'active',      reading: 88.5 },
  { id: 104, name: 'Sensor D', location: 'Zone 3', status: 'active',      reading: 67.1 },
  { id: 105, name: 'Sensor E', location: 'Zone 2', status: 'calibration', reading: 23.4 },
];

const INITIAL_MESSAGE: Message = {
  id:        '1',
  role:      'assistant',
  content:   'Hello! I can help you query the database. Try asking "Show me all active sensors".',
  timestamp: new Date(),
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useQueryExecution() {
  const [messages, setMessages]         = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput]               = useState('');
  const [isTyping, setIsTyping]         = useState(false);
  const [currentResult, setCurrentResult] = useState<QueryResult | null>(null);
  const messagesEndRef                  = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id:        Date.now().toString(),
      role:      'user',
      content:   input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // TODO: replace with real API call
    setTimeout(() => {
      setIsTyping(false);

      const result: QueryResult = {
        id:            Date.now().toString(),
        sql:           "SELECT * FROM sensors WHERE status != 'retired' LIMIT 5;",
        data:          MOCK_DATA,
        columns:       ['id', 'name', 'location', 'status', 'reading'],
        executionTime: 145,
        rowCount:      5,
        chartData:     MOCK_DATA.map(d => ({ name: d.name, value: d.reading })),
      };

      setCurrentResult(result);

      const aiMsg: Message = {
        id:             (Date.now() + 1).toString(),
        role:           'assistant',
        content:        `I found ${result.rowCount} sensors matching your criteria.`,
        timestamp:      new Date(),
        relatedQueryId: result.id,
      };

      setMessages(prev => [...prev, aiMsg]);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return {
    messages,
    input,
    setInput,
    isTyping,
    currentResult,
    messagesEndRef,
    handleSend,
    handleKeyDown,
  };
}