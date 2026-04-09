import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../../context/AuthContext';
import { getMyConnectionsOnly } from '../../../lib/accessService';
import { listConnections } from '../../../lib/connectionService';
import { getMessages, favouriteMessage, unfavouriteMessage } from '../../../lib/chatService';
import { useQueryExecution } from './hook/useQueryExecution';
import { ChatSidebar }  from './components/ChatSidebar';
import { ChatHeader }   from './components/ChatHeader';
import { ChatMessages } from './components/ChatMessages';
import { ChatInput }    from './components/ChatInput';
import { ResultPanel }  from './components/ResultPanel';
import { MessageOut }   from '../../../lib/chatService';
import { Sheet, SheetContent } from '../../components/ui/sheet';

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
    const connectionsP = isAdmin || isDbManager
      ? listConnections(true).then(res =>
          res.connections.map(c => ({ connection_id: c.connection_id, name: c.name }))
        )
      : getMyConnectionsOnly().then(list =>
          list.map(c => ({ connection_id: c.connection_id, name: c.name }))
        );

    // Fetch pending chat messages in parallel with connections if we already know the IDs
    const messagesP = pendingChat.current
      ? getMessages(pendingChat.current.connectionId, pendingChat.current.chatId).catch(() => null)
      : Promise.resolve(null);

    Promise.all([connectionsP, messagesP]).then(([opts, msgs]) => {
      setConnections(opts);
      if (pendingRun.current) {
        const connId = pendingRun.current.connectionId;
        const found  = opts.find(c => c.connection_id === connId);
        setSelectedDb(found ? connId : (opts[0]?.connection_id ?? ''));
      } else if (pendingChat.current) {
        const { chatId: pendingChatId, connectionId } = pendingChat.current;
        const found = opts.find(c => c.connection_id === connectionId);
        setSelectedDb(found ? connectionId : (opts[0]?.connection_id ?? ''));
        if (msgs) {
          openChatFired.current = true;
          pendingChat.current = null;
          navigate(location.pathname, { replace: true, state: null });
          setTimeout(() => {
            loadChat(pendingChatId, msgs.messages ?? [], {
              has_more:        msgs.has_more,
              next_before_seq: msgs.next_before_seq,
            });
          }, 50);
        }
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
    updateCurrentResultInsights, progressMessage,
    hasMoreMessages, loadingEarlier, loadEarlierMessages,
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
      .then(res => loadChat(chatId, res.messages ?? [], {
        has_more:        res.has_more,
        next_before_seq: res.next_before_seq,
      }))
      .catch(console.error);
  }, [selectedDb]);

  // ── Favourite toggle ───────────────────────────────────────────────────────
  const [isFavourited,   setIsFavourited]   = useState(false);

  // Reset favourite state when result changes
  useEffect(() => { setIsFavourited(false); }, [currentResult?.id]);

  const handleSaveToggle = useCallback(async () => {
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
  }, [currentResult, chatId, selectedDb, isFavourited]);

  // ── Mobile Drawer States ───────────────────────────────────────────────────
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileResultsOpen, setMobileResultsOpen] = useState(false);

  // Close sidebars on navigation actions automatically
  useEffect(() => { setMobileSidebarOpen(false); }, [selectedDb, chatId]);
  // Open mobile results automatically when a new result finishes running (only on mobile)
  useEffect(() => { 
    if (currentResult && window.innerWidth < 768) {
      setMobileResultsOpen(true); 
    }
  }, [currentResult]);

  return (
    <div className="h-[calc(100vh-6rem)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row relative">

      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full">
        <ChatSidebar
          connectionId={selectedDb}
          activeChatId={chatId}
          executingChatId={executingChatId}
          refreshTrigger={refreshTrigger}
          onNewChat={newChat}
          onSelectChat={(id, msgs, meta) => loadChat(id, msgs, meta)}
        />
      </div>

      {/* Mobile Sidebar (Sheet) */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="p-0 w-64 border-r-0">
          <ChatSidebar
            connectionId={selectedDb}
            activeChatId={chatId}
            executingChatId={executingChatId}
            refreshTrigger={refreshTrigger}
            onNewChat={newChat}
            onSelectChat={(id, msgs, meta) => loadChat(id, msgs, meta)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex flex-col h-full relative flex-1 min-w-0 md:border-r border-gray-200">
        <div className="relative">
          <ChatHeader
            connections={connections}
            selectedDb={selectedDb}
            onSelectDb={setSelectedDb}
            currentResult={currentResult}
            onMobileMenuClick={() => setMobileSidebarOpen(true)}
          />
          {currentResult && (
            <button
              onClick={() => setMobileResultsOpen(true)}
              className="md:hidden absolute right-4 top-1/2 -translate-y-1/2 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg border border-blue-200 shadow-sm"
            >
              View Results
            </button>
          )}
        </div>
        
        <ChatMessages
          messages={messages}
          isTyping={isTyping && executingChatId === chatId}
          progressMessage={progressMessage}
          messagesEndRef={messagesEndRef}
          onMessageClick={handleMessageClick}
          onRetry={sendQuery}
          hasMore={hasMoreMessages}
          loadingEarlier={loadingEarlier}
          onLoadEarlier={loadEarlierMessages}
        />
        <ChatInput
          input={input}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          onSend={handleSend}
          isLoading={isTyping && executingChatId === chatId}
        />
      </div>

      {/* Desktop Result Panel */}
      <div className="hidden md:flex flex-col h-full w-[38%] shrink-0 bg-white border-l border-gray-100 relative">
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
      
      {/* Mobile Result Overlay (Sheet) */}
      <Sheet open={mobileResultsOpen} onOpenChange={setMobileResultsOpen}>
        <SheetContent side="bottom" className="p-0 h-[85vh] rounded-t-xl sm:hidden flex flex-col">
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
        </SheetContent>
      </Sheet>

    </div>
  );
}
