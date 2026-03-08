import React, { useState, useEffect } from 'react';
import { listConnections, ConnectionOut } from '../../../lib/connectionService';
import { useQueryExecution } from './hook/useQueryExecution';
import { ChatHeader }   from './components/ChatHeader';
import { ChatMessages } from './components/ChatMessages';
import { ChatInput }    from './components/ChatInput';
import { ResultPanel }  from './components/ResultPanel';

export default function QueryInterface() {
  const [connections, setConnections]     = useState<ConnectionOut[]>([]);
  const [selectedDb,  setSelectedDb]      = useState('');

  useEffect(() => {
    listConnections(true).then(res => {
      setConnections(res.connections);
      if (res.connections.length > 0) {
        setSelectedDb(res.connections[0].connection_id);
      }
    }).catch(console.error);
  }, []);

  const {
    messages, input, setInput, isTyping, currentResult,
    messagesEndRef, handleSend, handleKeyDown,
    chartType, setChartType, copyToClipboard, downloadCSV,
  } = useQueryExecution(selectedDb);

  return (
    <div className="h-[calc(100vh-6rem)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row">

      {/* ── Left: Chat Panel ── */}
      <div className="flex flex-col h-full relative w-full md:w-[60%] border-r border-gray-200">
        <ChatHeader
          connections={connections}
          selectedDb={selectedDb}
          onSelectDb={setSelectedDb}
          currentResult={currentResult}
        />
        <ChatMessages
          messages={messages}
          isTyping={isTyping}
          messagesEndRef={messagesEndRef}
        />
        <ChatInput
          input={input}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          onSend={handleSend}
        />
      </div>

      {/* ── Right: Result Panel ── */}
      <div className="flex flex-col h-full w-full md:w-[40%] bg-white border-l border-gray-100">
        <ResultPanel
          result={currentResult}
          chartType={chartType}
          setChartType={setChartType}
          onCopy={copyToClipboard}
          onDownload={downloadCSV}
        />
      </div>

    </div>
  );
}
