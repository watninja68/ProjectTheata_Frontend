import React, { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import ChatList from "./components/ChatList";
import CreateChatModal from "./components/CreateChatModal";
import useChatHistory from "./hooks/useChatHistory";
import {
  FaLink,
  FaUnlink,
  FaStroopwafel,
  FaCog,
  FaPaperPlane,
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaDesktop,
  FaStopCircle,
  FaSyncAlt,
  FaExclamationTriangle,
  FaSpinner,
  FaCheckCircle,
  FaTimesCircle,
  FaSun,
  FaMoon,
  FaGoogle,
  FaSignOutAlt,
  FaUserCircle,
  FaUserPlus,
  FaChevronLeft,
  FaChevronRight,
  FaBars,
  FaPlus,
  FaTrash,
} from "react-icons/fa";

import AudioVisualizerComponent from "./components/AudioVisualizerComponent";
import SettingsDialog from "./components/SettingsDialog";
import BackgroundTaskManager from "./components/BackgroundTaskManager";
import Collapsible from "./components/Collapsible";
import { useSettings } from "./hooks/useSettings";
import { useGeminiAgent } from "./hooks/useGeminiAgent";
import { useAuth } from "./hooks/useAuth";
import ChatService from "./services/chatService";

const App = () => {
  // ────────────────────────────────────────────────────────────────────────────
  // State Management
  // ────────────────────────────────────────────────────────────────────────────

  // Auth & User
  const { user, signInWithGoogle, signOut, loading: authLoading } = useAuth();

  // Settings & Theme
  const { settings, updateSettings } = useSettings();
  const [theme, setTheme] = useState(settings?.theme || "light");
  const [showSettings, setShowSettings] = useState(false);

  // Chat Management
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [showCreateChatModal, setShowCreateChatModal] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);

  // Chat History Hook
  const {
    messages,
    addMessage,
    clearMessages,
    isLoading: messagesLoading,
    error: messagesError,
  } = useChatHistory(currentChatId);

  // UI State
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  // Audio/Video State
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Input State
  const [inputValue, setInputValue] = useState("");
  const messageInputRef = useRef(null);

  // Refs for resizer
  const resizerRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(300);

  // ────────────────────────────────────────────────────────────────────────────
  // Gemini Agent Integration
  // ────────────────────────────────────────────────────────────────────────────

  const {
    agent,
    isConnected,
    isInitializing,
    isMicActive,
    isMicSuspended,
    isCameraActive,
    isScreenShareActive,
    error: agentError,
    connectAgent,
    disconnectAgent,
    sendMessage: sendAgentMessage,
    toggleMicrophone,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
  } = useGeminiAgent({
    settings,
    onTranscription: (text) => {
      if (currentChatId && text.trim()) {
        addMessage({
          type: "assistant",
          content: text,
          timestamp: new Date().toISOString(),
          chatId: currentChatId,
        });
      }
    },
    onUserTranscription: (text) => {
      if (currentChatId && text.trim()) {
        addMessage({
          type: "user",
          content: text,
          timestamp: new Date().toISOString(),
          chatId: currentChatId,
          source: "voice",
        });
      }
    },
    onTextSent: (text) => {
      if (currentChatId && text.trim()) {
        addMessage({
          type: "user",
          content: text,
          timestamp: new Date().toISOString(),
          chatId: currentChatId,
          source: "text",
        });
      }
    },
    onError: (error) => {
      console.error("Gemini Agent Error:", error);
    },
    onMicStateChanged: (state) => {
      console.log("Mic state changed:", state);
    },
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Theme Management
  // ────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    updateSettings({ theme: newTheme });
  }, [theme, updateSettings]);

  // ────────────────────────────────────────────────────────────────────────────
  // Chat Management Functions
  // ────────────────────────────────────────────────────────────────────────────

  // Load user's chats
  const loadChats = useCallback(async () => {
    if (!user) return;

    setChatLoading(true);
    setChatError(null);

    try {
      const userChats = await ChatService.getUserChats(user.id);
      setChats(userChats || []);

      // If no current chat selected and we have chats, select the first one
      if (!currentChatId && userChats?.length > 0) {
        setCurrentChatId(userChats[0].id);
      }
    } catch (error) {
      console.error("Failed to load chats:", error);
      setChatError("Failed to load chats");
    } finally {
      setChatLoading(false);
    }
  }, [user, currentChatId]);

  // Load chats when user changes
  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Create new chat
  const handleCreateChat = useCallback(
    async (chatData) => {
      try {
        const newChat = await ChatService.createChat({
          ...chatData,
          user_id: user.id,
        });

        setChats((prevChats) => [newChat, ...prevChats]);
        setCurrentChatId(newChat.id);
        setShowCreateChatModal(false);

        // If there's an initial message, send it
        if (chatData.initial_message?.trim()) {
          setTimeout(() => {
            handleSendMessage(chatData.initial_message.trim());
          }, 100);
        }
      } catch (error) {
        console.error("Failed to create chat:", error);
        setChatError("Failed to create chat");
      }
    },
    [user],
  );

  // Select chat
  const handleChatSelect = useCallback(
    (chatId) => {
      if (chatId !== currentChatId) {
        setCurrentChatId(chatId);
        clearMessages(); // Clear current messages before loading new chat
      }
    },
    [currentChatId, clearMessages],
  );

  // Delete chat
  const handleDeleteChat = useCallback(
    async (chatId) => {
      if (!window.confirm("Are you sure you want to delete this chat?")) {
        return;
      }

      try {
        await ChatService.deleteChat(chatId);
        setChats((prevChats) => prevChats.filter((chat) => chat.id !== chatId));

        // If we deleted the current chat, select another one or clear
        if (chatId === currentChatId) {
          const remainingChats = chats.filter((chat) => chat.id !== chatId);
          if (remainingChats.length > 0) {
            setCurrentChatId(remainingChats[0].id);
          } else {
            setCurrentChatId(null);
            clearMessages();
          }
        }
      } catch (error) {
        console.error("Failed to delete chat:", error);
        setChatError("Failed to delete chat");
      }
    },
    [currentChatId, chats, clearMessages],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Message Handling
  // ────────────────────────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(
    async (messageText = null) => {
      const text = messageText || inputValue.trim();
      if (!text || !currentChatId) return;

      // Clear input if using input value
      if (!messageText) {
        setInputValue("");
      }

      // Add user message to chat history
      const userMessage = {
        type: "user",
        content: text,
        timestamp: new Date().toISOString(),
        chatId: currentChatId,
        source: "text",
      };

      addMessage(userMessage);

      // Send to Gemini agent if connected
      if (isConnected && agent) {
        try {
          await sendAgentMessage(text);
        } catch (error) {
          console.error("Failed to send message to agent:", error);
          // Add error message to chat
          addMessage({
            type: "system",
            content:
              "Failed to send message to AI agent. Please check your connection.",
            timestamp: new Date().toISOString(),
            chatId: currentChatId,
          });
        }
      } else {
        // If agent not connected, add a system message
        addMessage({
          type: "system",
          content:
            "AI agent is not connected. Please connect the agent to get responses.",
          timestamp: new Date().toISOString(),
          chatId: currentChatId,
        });
      }
    },
    [
      inputValue,
      currentChatId,
      isConnected,
      agent,
      sendAgentMessage,
      addMessage,
    ],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Input Handlers
  // ────────────────────────────────────────────────────────────────────────────

  const handleInputKeyPress = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  const handleSendButtonClick = useCallback(
    (e) => {
      e.preventDefault();
      handleSendMessage();
    },
    [handleSendMessage],
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Sidebar Resizing
  // ────────────────────────────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e) => {
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = sidebarWidth;

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      e.preventDefault();
    },
    [sidebarWidth],
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!isResizing) return;

      const deltaX = startXRef.current - e.clientX;
      const newWidth = Math.min(
        Math.max(startWidthRef.current + deltaX, 250),
        600,
      );
      setSidebarWidth(newWidth);
    },
    [isResizing],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  // ────────────────────────────────────────────────────────────────────────────
  // Permission Handlers
  // ────────────────────────────────────────────────────────────────────────────

  const requestMicrophonePermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionGranted(true);
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.error("Microphone permission denied:", error);
      setMicPermissionGranted(false);
    }
  }, []);

  const requestCameraPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraPermissionGranted(true);
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      console.error("Camera permission denied:", error);
      setCameraPermissionGranted(false);
    }
  }, []);

  // ────────────────────────────────────────────────────────────────────────────
  // Computed Values
  // ────────────────────────────────────────────────────────────────────────────

  const currentChat = chats.find((chat) => chat.id === currentChatId);
  const canInteract = user && !authLoading;
  const displayMicActive = isMicActive && !isMicSuspended;
  const hasError = agentError || chatError || messagesError;

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="app loading">
        <div className="loading-spinner">
          <FaSpinner className="fa-spin" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <button
            className="left-sidebar-toggle-btn"
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            title="Toggle Chat List"
          >
            <FaBars />
          </button>

          {user && (
            <button
              className="control-btn"
              onClick={() => setShowCreateChatModal(true)}
              title="New Chat"
              disabled={!canInteract}
            >
              <FaPlus />
            </button>
          )}
        </div>

        <div className="header-center">
          <h1>
            <FaStroopwafel className="app-icon" />
            Gemini Live Agent
          </h1>
          {currentChat && (
            <div className="current-chat-title">{currentChat.title}</div>
          )}
        </div>

        <div className="header-right">
          <div className="controls">
            {/* Agent Connection */}
            <button
              className={`control-btn ${isConnected ? "connected" : ""}`}
              onClick={isConnected ? disconnectAgent : connectAgent}
              disabled={isInitializing || !canInteract}
              title={isConnected ? "Disconnect Agent" : "Connect Agent"}
            >
              {isInitializing ? (
                <FaSpinner className="fa-spin" />
              ) : isConnected ? (
                <FaUnlink />
              ) : (
                <FaLink />
              )}
            </button>

            {/* Microphone */}
            <button
              className={`control-btn ${displayMicActive ? "active" : ""}`}
              onClick={toggleMicrophone}
              disabled={!isConnected || !canInteract}
              title={
                displayMicActive ? "Turn off microphone" : "Turn on microphone"
              }
            >
              {displayMicActive ? <FaMicrophone /> : <FaMicrophoneSlash />}
            </button>

            {/* Camera */}
            <button
              className={`control-btn ${isCameraActive ? "active" : ""}`}
              onClick={toggleCamera}
              disabled={!isConnected || !canInteract}
              title={isCameraActive ? "Turn off camera" : "Turn on camera"}
            >
              {isCameraActive ? <FaVideo /> : <FaVideoSlash />}
            </button>

            {/* Screen Share */}
            <button
              className={`control-btn ${isScreenShareActive ? "active" : ""}`}
              onClick={isScreenShareActive ? stopScreenShare : startScreenShare}
              disabled={!isConnected || !canInteract}
              title={
                isScreenShareActive ? "Stop sharing screen" : "Share screen"
              }
            >
              {isScreenShareActive ? <FaStopCircle /> : <FaDesktop />}
            </button>

            {/* Settings */}
            <button
              className="control-btn"
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <FaCog />
            </button>

            {/* Theme Toggle */}
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            >
              {theme === "light" ? <FaMoon /> : <FaSun />}
            </button>

            {/* Auth */}
            {user ? (
              <div className="user-profile">
                <button className="profile-btn" title={user.email}>
                  {user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt="Profile"
                      className="profile-image"
                    />
                  ) : (
                    <FaUserCircle />
                  )}
                </button>
                <button
                  className="control-btn"
                  onClick={signOut}
                  title="Sign Out"
                >
                  <FaSignOutAlt />
                </button>
              </div>
            ) : (
              <button
                className="control-btn auth-btn"
                onClick={signInWithGoogle}
                disabled={authLoading}
                title="Sign in with Google"
              >
                {authLoading ? <FaSpinner className="fa-spin" /> : <FaGoogle />}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {/* Left Sidebar - Chat List */}
        {user && (
          <div
            className={`conversation-history-sidebar ${leftSidebarCollapsed ? "collapsed" : ""}`}
          >
            <div className="sidebar-header">
              <h3>Conversations</h3>
              <button
                className="control-btn"
                onClick={() => setShowCreateChatModal(true)}
                title="New Chat"
                disabled={!canInteract}
              >
                <FaPlus />
              </button>
            </div>

            <div className="chat-list-container">
              {chatLoading ? (
                <div className="loading-state">
                  <FaSpinner className="fa-spin" />
                  <span>Loading chats...</span>
                </div>
              ) : chatError ? (
                <div className="error-state">
                  <FaExclamationTriangle />
                  <span>{chatError}</span>
                  <button onClick={loadChats} className="retry-btn">
                    <FaSyncAlt />
                  </button>
                </div>
              ) : (
                <ChatList
                  chats={chats}
                  currentChatId={currentChatId}
                  onChatSelect={handleChatSelect}
                  onChatDelete={handleDeleteChat}
                />
              )}
            </div>
          </div>
        )}

        {/* Center and Right Content */}
        <div className="center-and-right-content">
          {/* Chat Area */}
          <div className="chat-container">
            {!user ? (
              <div className="welcome-screen">
                <div className="welcome-content">
                  <FaStroopwafel className="welcome-icon" />
                  <h2>Welcome to Gemini Live Agent</h2>
                  <p>Sign in with Google to start chatting with AI</p>
                  <button
                    className="auth-btn primary"
                    onClick={signInWithGoogle}
                    disabled={authLoading}
                  >
                    {authLoading ? (
                      <FaSpinner className="fa-spin" />
                    ) : (
                      <FaGoogle />
                    )}
                    Sign in with Google
                  </button>
                </div>
              </div>
            ) : !currentChatId ? (
              <div className="no-chat-screen">
                <div className="no-chat-content">
                  <FaStroopwafel className="welcome-icon" />
                  <h2>No Chat Selected</h2>
                  <p>
                    Create a new chat or select an existing one to get started
                  </p>
                  <button
                    className="control-btn primary"
                    onClick={() => setShowCreateChatModal(true)}
                  >
                    <FaPlus />
                    Create New Chat
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Messages Area */}
                <div className="messages-container">
                  {messagesLoading ? (
                    <div className="loading-state">
                      <FaSpinner className="fa-spin" />
                      <span>Loading messages...</span>
                    </div>
                  ) : messagesError ? (
                    <div className="error-state">
                      <FaExclamationTriangle />
                      <span>Failed to load messages</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="empty-chat">
                      <p>Start a conversation...</p>
                    </div>
                  ) : (
                    <div className="messages-list">
                      {messages.map((message, index) => (
                        <div
                          key={`${message.id || index}-${message.timestamp}`}
                          className={`message ${message.type}`}
                        >
                          <div className="message-content">
                            {message.content}
                          </div>
                          <div className="message-meta">
                            {message.source && (
                              <span className="message-source">
                                {message.source}
                              </span>
                            )}
                            <span className="message-time">
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Input Area */}
                <div className="input-container">
                  {hasError && (
                    <div className="error-banner">
                      <FaExclamationTriangle />
                      <span>{agentError || chatError || messagesError}</span>
                    </div>
                  )}

                  <div className="input-row">
                    <input
                      ref={messageInputRef}
                      type="text"
                      id="messageInput"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={
                        !user
                          ? "Please log in first"
                          : !isConnected
                            ? "Connect agent to chat"
                            : displayMicActive
                              ? "Listening..."
                              : "Type message or turn on mic..."
                      }
                      disabled={!canInteract || displayMicActive || authLoading}
                      onKeyPress={handleInputKeyPress}
                    />
                    <button
                      onClick={handleSendButtonClick}
                      className="send-icon-button"
                      disabled={
                        !canInteract ||
                        displayMicActive ||
                        authLoading ||
                        !inputValue.trim()
                      }
                      title="Send Message"
                    >
                      <FaPaperPlane />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Sidebar */}
          <div
            className={`sidebar ${rightSidebarCollapsed ? "collapsed" : ""}`}
            style={{
              width: rightSidebarCollapsed ? "0px" : `${sidebarWidth}px`,
            }}
          >
            <div className="sidebar-content-wrapper">
              <div className="sidebar-header">
                <h3>Tools & Status</h3>
                <button
                  className="sidebar-toggle-btn"
                  onClick={() =>
                    setRightSidebarCollapsed(!rightSidebarCollapsed)
                  }
                  title="Toggle Sidebar"
                >
                  {rightSidebarCollapsed ? (
                    <FaChevronLeft />
                  ) : (
                    <FaChevronRight />
                  )}
                </button>
              </div>

              <div className="sidebar-content">
                {/* Connection Status */}
                <Collapsible title="Connection Status" defaultOpen={true}>
                  <div className="status-section">
                    <div
                      className={`status-item ${isConnected ? "connected" : "disconnected"}`}
                    >
                      <span className="status-label">Agent:</span>
                      <span className="status-value">
                        {isInitializing
                          ? "Connecting..."
                          : isConnected
                            ? "Connected"
                            : "Disconnected"}
                      </span>
                      {isConnected ? <FaCheckCircle /> : <FaTimesCircle />}
                    </div>

                    <div
                      className={`status-item ${displayMicActive ? "active" : "inactive"}`}
                    >
                      <span className="status-label">Microphone:</span>
                      <span className="status-value">
                        {displayMicActive ? "Active" : "Inactive"}
                      </span>
                      {displayMicActive ? (
                        <FaMicrophone />
                      ) : (
                        <FaMicrophoneSlash />
                      )}
                    </div>

                    <div
                      className={`status-item ${isCameraActive ? "active" : "inactive"}`}
                    >
                      <span className="status-label">Camera:</span>
                      <span className="status-value">
                        {isCameraActive ? "Active" : "Inactive"}
                      </span>
                      {isCameraActive ? <FaVideo /> : <FaVideoSlash />}
                    </div>

                    {isScreenShareActive && (
                      <div className="status-item active">
                        <span className="status-label">Screen Share:</span>
                        <span className="status-value">Active</span>
                        <FaDesktop />
                      </div>
                    )}
                  </div>
                </Collapsible>

                {/* Audio Visualizer */}
                {displayMicActive && (
                  <Collapsible title="Audio Level" defaultOpen={true}>
                    <AudioVisualizerComponent
                      audioLevel={audioLevel}
                      isActive={displayMicActive}
                    />
                  </Collapsible>
                )}

                {/* Background Tasks */}
                <Collapsible title="Background Tasks" defaultOpen={false}>
                  <BackgroundTaskManager />
                </Collapsible>

                {/* Chat Info */}
                {currentChat && (
                  <Collapsible title="Chat Information" defaultOpen={false}>
                    <div className="chat-info">
                      <div className="info-item">
                        <span className="info-label">Title:</span>
                        <span className="info-value">{currentChat.title}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Created:</span>
                        <span className="info-value">
                          {new Date(
                            currentChat.created_at,
                          ).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Messages:</span>
                        <span className="info-value">{messages.length}</span>
                      </div>
                    </div>
                  </Collapsible>
                )}
              </div>
            </div>

            {/* Sidebar Resizer */}
            {!rightSidebarCollapsed && (
              <div
                ref={resizerRef}
                className="sidebar-resizer"
                onMouseDown={handleMouseDown}
              />
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <span>Gemini Live Agent</span>
          {isConnected && (
            <span className="connection-indicator">
              <FaCheckCircle />
              Connected
            </span>
          )}
        </div>
      </footer>

      {/* Modals */}
      <CreateChatModal
        isOpen={showCreateChatModal}
        onClose={() => setShowCreateChatModal(false)}
        onChatCreated={handleCreateChat}
      />

      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSettingsUpdate={updateSettings}
      />
    </div>
  );
};

export default App;
