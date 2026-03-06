import { useState, useRef, useEffect } from 'react';
import { Message, QueryResult } from '../types';

export function useQueryExecution(selectedDbId: string) {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: 'Hello! I am connected. Ask me anything about your database.', timestamp: new Date() }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentResult, setCurrentResult] = useState<QueryResult | null>(null);
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar'); // New: Chart filter state
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const startTime = Date.now();
      const response = await fetch('https://fomoha8938hutudns.app.n8n.cloud/webhook/f999a27b-b48b-44bf-bd72-1e9694872d07', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatInput: input,
          DatabaseType: "mysql", 
          sessionId: "session_001",
          hostname: "sql12.freesqldatabase.com",
          dbName: "sql12818282",
          dbUser: "sql12818282",
          pass: "7k9R8qUwFv",
          port: "3306"
        }),
      });

      const resultData = await response.json();
      const executionTime = Date.now() - startTime;

      const result: QueryResult = {
        id: Date.now().toString(),
        sql: resultData.sql_query || '-- No SQL generated',
        data: resultData.data || [],
        columns: (resultData.data && resultData.data.length > 0) ? Object.keys(resultData.data[0]) : [],
        executionTime: executionTime,
        rowCount: resultData.total_records || (resultData.data ? resultData.data.length : 0),
        chartData: (resultData.data || []).slice(0, 10).map((item: any) => {
           const keys = Object.keys(item);
           return { name: String(item[keys[0]]), value: Number(item[keys[1]]) || 0 };
        })
      };

      setCurrentResult(result);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: resultData.summary || 'Query executed.',
        timestamp: new Date(),
        relatedQueryId: result.id,
      }]);
    } catch (error) {
      console.error("Workflow Error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  // Utility: Copy to Clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  // Utility: Download CSV
  const downloadCSV = () => {
    if (!currentResult?.data || currentResult.data.length === 0) return;
    const headers = Object.keys(currentResult.data[0]).join(",");
    const rows = currentResult.data.map(row => Object.values(row).join(",")).join("\n");
    const blob = new Blob([[headers, rows].join("\n")], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data_export_${Date.now()}.csv`;
    a.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return { 
    messages, input, setInput, isTyping, currentResult, 
    messagesEndRef, handleSend, handleKeyDown,
    chartType, setChartType, copyToClipboard, downloadCSV // Exporting new tools
  };
}