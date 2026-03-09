import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getMyConnections } from '../../../lib/accessService';
import { listConnections } from '../../../lib/connectionService';
import { MessageOut } from '../../../lib/chatService';
import { useQueryExecution } from './hook/useQueryExecution';
import { ChatSidebar }  from './components/ChatSidebar';
import { ChatHeader }   from './components/ChatHeader';
import { ChatMessages } from './components/ChatMessages';
import { ChatInput }    from './components/ChatInput';
import { ResultPanel }  from './components/ResultPanel';

export interface ConnectionOption {
  connection_id: string;
  name:          string;
}

export default function QueryInterface() {
  const { isDbManager, isAdmin } = useAuth();
  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [selectedDb,  setSelectedDb]  = useState('');

  useEffect(() => {
    const load = isAdmin || isDbManager
      ? listConnections(true).then(res =>
          res.connections.map(c => ({ connection_id: c.connection_id, name: c.name }))
        )
      : getMyConnections().then(list =>
          list.map(c => ({ connection_id: c.connection_id, name: c.name }))
        );

    load.then(opts => {
      setConnections(opts);
      if (opts.length > 0) setSelectedDb(opts[0].connection_id);
    }).catch(console.error);
  }, [isAdmin, isDbManager]);

  const {
    messages, input, setInput, isTyping, currentResult,
    messagesEndRef, handleSend, handleKeyDown, handleMessageClick,
    chartType, setChartType, copyToClipboard, downloadCSV,
    chatId, loadChat, newChat, refreshTrigger,
  } = useQueryExecution(selectedDb);

  const handleSelectChat = (restoredChatId: string, history: MessageOut[]) => {
    loadChat(restoredChatId, history);
  };

  const handleSelectDb = (id: string) => {
    setSelectedDb(id);
  };

  return (
    <div className="h-[calc(100vh-6rem)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row">

      {/* ── Left: Chat History Sidebar ── */}
      <ChatSidebar
        connectionId={selectedDb}
        activeChatId={chatId}
        refreshTrigger={refreshTrigger}
        onNewChat={newChat}
        onSelectChat={handleSelectChat}
      />

      {/* ── Middle: Chat Panel ── */}
      <div className="flex flex-col h-full relative flex-1 min-w-0 border-r border-gray-200">
        <ChatHeader
          connections={connections}
          selectedDb={selectedDb}
          onSelectDb={handleSelectDb}
          currentResult={currentResult}
        />
        <ChatMessages
          messages={messages}
          isTyping={isTyping}
          messagesEndRef={messagesEndRef}
          onMessageClick={handleMessageClick}
        />
        <ChatInput
          input={input}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          onSend={handleSend}
        />
      </div>

      {/* ── Right: Result Panel ── */}
      <div className="hidden md:flex flex-col h-full w-[38%] shrink-0 bg-white border-l border-gray-100">
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
