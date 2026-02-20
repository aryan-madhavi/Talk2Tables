import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Mic, Database, Table, Code, BarChart2, Download, 
  Save, RefreshCw, Copy, AlertTriangle, Check, ChevronDown, Trash2 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { databases, tableSchemas } from '../data/mockData';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  relatedQueryId?: string;
}

interface QueryResult {
  id: string;
  sql: string;
  data: any[];
  columns: string[];
  executionTime: number;
  rowCount: number;
  chartData?: any[];
}

export default function QueryInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I can help you query the database. Try asking "Show me all active sensors".',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [selectedDb, setSelectedDb] = useState(databases[0].id);
  const [isTyping, setIsTyping] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState<'table' | 'sql' | 'chart'>('table');
  const [currentResult, setCurrentResult] = useState<QueryResult | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Mock AI response
    setTimeout(() => {
      setIsTyping(false);
      
      const mockData = [
        { id: 101, name: 'Sensor A', location: 'Zone 1', status: 'active', reading: 45.2 },
        { id: 102, name: 'Sensor B', location: 'Zone 2', status: 'maintenance', reading: 12.8 },
        { id: 103, name: 'Sensor C', location: 'Zone 1', status: 'active', reading: 88.5 },
        { id: 104, name: 'Sensor D', location: 'Zone 3', status: 'active', reading: 67.1 },
        { id: 105, name: 'Sensor E', location: 'Zone 2', status: 'calibration', reading: 23.4 },
      ];

      const result: QueryResult = {
        id: Date.now().toString(),
        sql: "SELECT * FROM sensors WHERE status != 'retired' LIMIT 5;",
        data: mockData,
        columns: ['id', 'name', 'location', 'status', 'reading'],
        executionTime: 145,
        rowCount: 5,
        chartData: mockData.map(d => ({ name: d.name, value: d.reading }))
      };

      setCurrentResult(result);
      
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I found ${result.rowCount} sensors matching your criteria.`,
        timestamp: new Date(),
        relatedQueryId: result.id
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

  return (
    <div className="h-[calc(100vh-6rem)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row">
       <div className="flex flex-col h-full relative w-full md:w-[60%] border-r border-gray-200">
            {/* Chat Header / DB Selector */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-gray-500" />
                <select 
                  value={selectedDb}
                  onChange={(e) => setSelectedDb(e.target.value)}
                  className="bg-transparent font-medium text-gray-700 text-sm border-none focus:ring-0 cursor-pointer hover:text-blue-700"
                >
                  {databases.map(db => (
                    <option key={db.id} value={db.id}>{db.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-gray-400 pointer-events-none -ml-1" />
              </div>
              <div className="text-xs text-gray-400">
                {currentResult && `Last run: ${currentResult.executionTime}ms`}
              </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/30">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={cn(
                    "flex w-full",
                    msg.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  <div 
                    className={cn(
                      "max-w-[85%] rounded-2xl p-4 shadow-sm",
                      msg.role === 'user' 
                        ? "bg-blue-600 text-white rounded-br-none" 
                        : "bg-white border border-gray-100 text-gray-800 rounded-bl-none"
                    )}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    <div 
                      className={cn(
                        "text-[10px] mt-2 opacity-70",
                        msg.role === 'user' ? "text-blue-100 text-right" : "text-gray-400"
                      )}
                    >
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="flex justify-start w-full">
                  <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none p-4 shadow-sm flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-gray-100">
              <div className="relative rounded-xl border border-gray-200 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all bg-white">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything... e.g. Show all sensors due for calibration"
                  className="relative rounded-xl w-full py-3 pl-4 pr-24 bg-transparent border-none focus:ring-0 resize-none min-h-[60px] max-h-[120px] text-sm"
                  rows={2}
                />
                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                  <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Voice Input">
                    <Mic className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      input.trim() 
                        ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md" 
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
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
         </div>

         <div className="flex flex-col h-full w-full md:w-[40%] bg-white border-l border-gray-100">
           {currentResult ? (
             <>
               {/* Result Tabs */}
               <div className="flex items-center border-b border-gray-100 bg-gray-50/50 px-2">
                 <button 
                   onClick={() => setActiveResultTab('table')}
                   className={cn(
                     "px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors",
                     activeResultTab === 'table' 
                       ? "border-blue-600 text-blue-700 bg-white" 
                       : "border-transparent text-gray-500 hover:text-gray-700"
                   )}
                 >
                   <Table className="w-4 h-4" /> Results
                 </button>
                 <button 
                   onClick={() => setActiveResultTab('sql')}
                   className={cn(
                     "px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors",
                     activeResultTab === 'sql' 
                       ? "border-blue-600 text-blue-700 bg-white" 
                       : "border-transparent text-gray-500 hover:text-gray-700"
                   )}
                 >
                   <Code className="w-4 h-4" /> SQL
                 </button>
                 <button 
                   onClick={() => setActiveResultTab('chart')}
                   className={cn(
                     "px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors",
                     activeResultTab === 'chart' 
                       ? "border-blue-600 text-blue-700 bg-white" 
                       : "border-transparent text-gray-500 hover:text-gray-700"
                   )}
                 >
                   <BarChart2 className="w-4 h-4" /> Chart
                 </button>
               </div>

               {/* Result Content */}
               <div className="flex-1 overflow-auto p-4 bg-white relative">
                 {activeResultTab === 'table' && (
                   <div className="animate-in fade-in duration-300">
                     <div className="overflow-x-auto border border-gray-200 rounded-lg">
                       <table className="w-full text-sm text-left text-gray-500">
                         <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                           <tr>
                             {currentResult.columns.map(col => (
                               <th key={col} className="px-6 py-3 font-medium whitespace-nowrap">{col}</th>
                             ))}
                           </tr>
                         </thead>
                         <tbody>
                           {currentResult.data.map((row, i) => (
                             <tr key={i} className="bg-white border-b hover:bg-gray-50">
                               {currentResult.columns.map(col => (
                                 <td key={`${i}-${col}`} className="px-6 py-4 whitespace-nowrap text-gray-900">
                                   {row[col]}
                                 </td>
                               ))}
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                     <div className="mt-4 text-xs text-gray-500 text-right">
                       Showing 1–{currentResult.rowCount} of {currentResult.rowCount} results
                     </div>
                   </div>
                 )}

                 {activeResultTab === 'sql' && (
                   <div className="animate-in fade-in duration-300 h-full flex flex-col">
                     <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 overflow-auto flex-1 relative group">
                       <pre>{currentResult.sql}</pre>
                       <button 
                        className="absolute top-2 right-2 p-2 bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-gray-700"
                        title="Copy SQL"
                       >
                         <Copy className="w-4 h-4" />
                       </button>
                     </div>
                     <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-200">
                       <AlertTriangle className="w-4 h-4" />
                       Generated SQL may need review before production use.
                     </div>
                   </div>
                 )}

                 {activeResultTab === 'chart' && (
                   <div className="animate-in fade-in duration-300 h-full w-full">
                     {currentResult.chartData && currentResult.chartData.length > 0 ? (
                          <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={currentResult.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="value" fill="#0D47A1" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                     ) : (
                       <div className="h-full flex flex-col items-center justify-center text-gray-400">
                         <BarChart2 className="w-12 h-12 mb-2 opacity-20" />
                         <p>No numeric data to visualize</p>
                       </div>
                     )}
                   </div>
                 )}
               </div>

               {/* Action Bar */}
               <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                 <div className="flex gap-2">
                   <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 transition-colors">
                     <Download className="w-3.5 h-3.5" /> CSV
                   </button>
                   <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-blue-600 transition-colors">
                     <Save className="w-3.5 h-3.5" /> Save
                   </button>
                 </div>
                 <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors">
                   <RefreshCw className="w-3.5 h-3.5" /> Refine
                 </button>
               </div>
             </>
           ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
               <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                 <Table className="w-8 h-8 opacity-40" />
               </div>
               <h3 className="text-lg font-medium text-gray-900 mb-1">No results yet</h3>
               <p className="text-sm max-w-xs">Run a query in the chat panel to see data, SQL, and visualizations here.</p>
             </div>
           )}
         </div>

    </div>
  );
}
