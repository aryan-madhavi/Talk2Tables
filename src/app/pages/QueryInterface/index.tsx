import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../../context/AuthContext';
import { getMyConnections } from '../../../lib/accessService';
import { listConnections } from '../../../lib/connectionService';
import { getMessages, favouriteMessage, unfavouriteMessage } from '../../../lib/chatService';
import { useQueryExecution } from './hook/useQueryExecution';
import { ChatSidebar }  from './components/ChatSidebar';
import { ChatHeader }   from './components/ChatHeader';
import { ChatMessages } from './components/ChatMessages';
import { ChatInput }    from './components/ChatInput';
import { ResultPanel }  from './components/ResultPanel';
import { MessageOut }   from '../../../lib/chatService';

export interface ConnectionOption {
  connection_id: string;
  name:          string;
}

export default function QueryInterface() {
  const { isDbManager, isAdmin } = useAuth();
  const location  = useLocation();
  const navigate  = useNavigate();

  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [selectedDb,  setSelectedDb]  = useState('');

  // Pending auto-run from History "Run Again" button
  const pendingRun = useRef<{ query: string; connectionId: string } | null>(
    (location.state as { query?: string; connectionId?: string } | null)?.query
      ? { query: (location.state as { query: string; connectionId: string }).query,
          connectionId: (location.state as { query: string; connectionId: string }).connectionId }
      : null
  );

  // Open existing chat from History / Recent Queries click
  const pendingChat = useRef<{ chatId: string; connectionId: string } | null>(
    (location.state as { chatId?: string; connectionId?: string } | null)?.chatId
      ? { chatId:       (location.state as { chatId: string; connectionId: string }).chatId,
          connectionId: (location.state as { chatId: string; connectionId: string }).connectionId }
      : null
  );

  // Pre-fill from Suggested Queries (no auto-run)
  const prefillText = (location.state as { prefill?: string } | null)?.prefill ?? null;

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
      if (pendingRun.current) {
        const connId = pendingRun.current.connectionId;
        const found  = opts.find(c => c.connection_id === connId);
        setSelectedDb(found ? connId : (opts[0]?.connection_id ?? ''));
      } else if (pendingChat.current) {
        const connId = pendingChat.current.connectionId;
        const found  = opts.find(c => c.connection_id === connId);
        setSelectedDb(found ? connId : (opts[0]?.connection_id ?? ''));
      } else if (opts.length > 0) {
        setSelectedDb(opts[0].connection_id);
      }
    }).catch(console.error);
  }, [isAdmin, isDbManager]);

  const {
    messages, input, setInput, isTyping, executingChatId, currentResult,
    messagesEndRef, handleSend, handleKeyDown, handleMessageClick,
    chartType, setChartType, copyToClipboard, downloadCSV,
    chatId, loadChat, newChat, refreshTrigger, sendQuery,
    updateCurrentResultInsights,
  } = useQueryExecution(selectedDb);

  // Pre-fill input from Suggested Queries click (fires once, no auto-run)
  const prefillFired = useRef(false);
  useEffect(() => {
    if (!prefillText || prefillFired.current) return;
    prefillFired.current = true;
    setInput(prefillText);
    navigate(location.pathname, { replace: true, state: null });
  }, [prefillText]);

  // Auto-run pending query once connection is ready
  const autoRunFired = useRef(false);
  useEffect(() => {
    if (!pendingRun.current || !selectedDb || autoRunFired.current) return;
    autoRunFired.current = true;
    const { query } = pendingRun.current;
    pendingRun.current = null;
    navigate(location.pathname, { replace: true, state: null });
    newChat();
    // small delay to let newChat() state settle
    setTimeout(() => sendQuery(query), 50);
  }, [selectedDb]);

  // Open existing chat once connection is selected
  const openChatFired = useRef(false);
  useEffect(() => {
    if (!pendingChat.current || !selectedDb || openChatFired.current) return;
    openChatFired.current = true;
    const { chatId } = pendingChat.current;
    pendingChat.current = null;
    navigate(location.pathname, { replace: true, state: null });
    getMessages(selectedDb, chatId)
      .then(res => loadChat(chatId, res.messages ?? []))
      .catch(console.error);
  }, [selectedDb]);

  // ── Favourite toggle ───────────────────────────────────────────────────────
  const [isFavourited,   setIsFavourited]   = useState(false);

  // Reset favourite state when result changes
  useEffect(() => { setIsFavourited(false); }, [currentResult?.id]);

  const handleSaveToggle = async () => {
    if (!currentResult || !chatId) return;

    let msgId = currentResult.msgId;
    if (!msgId) {
      // For fresh queries, fetch messages to find the msg_id
      const msgs = await getMessages(selectedDb, chatId);
      const last = [...msgs.messages]
        .reverse()
        .find(m => m.role === 'assistant' && m.sql_query === currentResult.sql);
      msgId = last?.msg_id;
      if (!msgId) return;
    }

    if (isFavourited) {
      await unfavouriteMessage(selectedDb, chatId, msgId);
    } else {
      await favouriteMessage(selectedDb, chatId, msgId);
    }
    setIsFavourited(f => !f);
  };

  return (
    <div className="h-[calc(100vh-6rem)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row">

      <ChatSidebar
        connectionId={selectedDb}
        activeChatId={chatId}
        executingChatId={executingChatId}
        refreshTrigger={refreshTrigger}
        onNewChat={newChat}
        onSelectChat={(id, msgs: MessageOut[]) => loadChat(id, msgs)}
      />

      <div className="flex flex-col h-full relative flex-1 min-w-0 border-r border-gray-200">
        <ChatHeader
          connections={connections}
          selectedDb={selectedDb}
          onSelectDb={setSelectedDb}
          currentResult={currentResult}
        />
        <ChatMessages
          messages={messages}
          isTyping={isTyping && executingChatId === chatId}
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

      <div className="hidden md:flex flex-col h-full w-[38%] shrink-0 bg-white border-l border-gray-100">
        <ResultPanel
          result={currentResult}
          chartType={chartType}
          setChartType={setChartType}
          onCopy={copyToClipboard}
          onDownload={downloadCSV}
          onSave={handleSaveToggle}
          isFavourited={isFavourited}
          onInsightsGenerated={updateCurrentResultInsights}
        />
      </div>

    </div>
  );
}
