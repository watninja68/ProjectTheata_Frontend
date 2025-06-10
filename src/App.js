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
  const [message, setMessage] = useState("");
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(320);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // Gemini Agent
  const {
    isConnected,
    isConnecting,
    connectionError,
    isVoiceActive,
    isVideoActive,
    isScreenSharing,
    connect,
    disconnect,
    toggleVoice,
    toggleVideo,
    toggleScreenShare,
    sendMessage: sendGeminiMessage,
  } = useGeminiAgent();

  // Refs
  const messageInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const profileDropdownRef = useRef(null);
  const resizerRef = useRef(null);

  // ────────────────────────────────────────────────────────────────────────────
  // Effects
  // ────────────────────────────────────────────────────────────────────────────

  // Theme Effect
  useEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

  // Load chats on mount
  useEffect(() => {
    loadChats();
  }, [user]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Handle click outside profile dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target)
      ) {
        setShowProfileDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ────────────────────────────────────────────────────────────────────────────

  const loadChats = async () => {
    if (!user) return;

    setChatLoading(true);
    setChatError(null);

    try {
      const userChats = await ChatService.getUserChats(user.uid);
      setChats(userChats);

      if (userChats.length > 0 && !currentChatId) {
        setCurrentChatId(userChats[0].id);
      }
    } catch (error) {
      console.error("Error loading chats:", error);
      setChatError("Failed to load chats");
    } finally {
      setChatLoading(false);
    }
  };

  const handleCreateChat = async (chatData) => {
    if (!user) return;

    try {
      const newChat = await ChatService.createChat({
        ...chatData,
        userId: user.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      setChats((prev) => [newChat, ...prev]);
      setCurrentChatId(newChat.id);
      setShowCreateChatModal(false);
    } catch (error) {
      console.error("Error creating chat:", error);
      setChatError("Failed to create chat");
    }
  };

  const handleDeleteChat = async (chatId) => {
    try {
      await ChatService.deleteChat(chatId);
      setChats((prev) => prev.filter((chat) => chat.id !== chatId));

      if (currentChatId === chatId) {
        const remainingChats = chats.filter((chat) => chat.id !== chatId);
        setCurrentChatId(
          remainingChats.length > 0 ? remainingChats[0].id : null,
        );
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
      setChatError("Failed to delete chat");
    }
  };

  const handleSendMessage = useCallback(
    async (e) => {
      e?.preventDefault();

      if (!message.trim() || !currentChatId) return;

      const messageToSend = message.trim();
      setMessage("");

      // Add user message to chat
      const userMessage = {
        id: Date.now().toString(),
        role: "user",
        content: messageToSend,
        timestamp: new Date(),
      };

      addMessage(userMessage);

      try {
        // Send to Gemini if connected
        if (isConnected) {
          await sendGeminiMessage(messageToSend);
        }

        // Save to database
        await ChatService.addMessage(currentChatId, userMessage);
      } catch (error) {
        console.error("Error sending message:", error);
        // Add error message to chat
        const errorMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content:
            "Sorry, I encountered an error while processing your message.",
          timestamp: new Date(),
          isError: true,
        };
        addMessage(errorMessage);
      }

      // Focus back on input
      if (messageInputRef.current) {
        messageInputRef.current.focus();
      }
    },
    [message, currentChatId, isConnected, sendGeminiMessage, addMessage],
  );

  const handleThemeToggle = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    updateSettings({ theme: newTheme });
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleLeftSidebar = () => {
    setIsLeftSidebarOpen(!isLeftSidebarOpen);
  };

  const toggleRightSidebar = () => {
    setIsRightSidebarOpen(!isRightSidebarOpen);
  };

  // Sidebar resizing logic
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  const handleMouseMove = useCallback((e) => {
    const containerRect = document
      .querySelector(".app-container")
      .getBoundingClientRect();
    const newWidth = containerRect.right - e.clientX;
    setRightSidebarWidth(Math.max(200, Math.min(600, newWidth)));
  }, []);

  const handleMouseUp = useCallback(() => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  // ────────────────────────────────────────────────────────────────────────────
  // Render Helpers
  // ────────────────────────────────────────────────────────────────────────────

  const renderConnectionStatus = () => {
    if (isConnecting) {
      return (
        <div className="connection-status connecting">
          <FaSpinner className="spinning" />
          <span>Connecting...</span>
        </div>
      );
    }

    if (isConnected) {
      return (
        <div className="connection-status connected">
          <FaCheckCircle />
          <span>Connected</span>
        </div>
      );
    }

    if (connectionError) {
      return (
        <div className="connection-status error">
          <FaTimesCircle />
          <span>Connection Error</span>
        </div>
      );
    }

    return (
      <div className="connection-status disconnected">
        <FaTimesCircle />
        <span>Disconnected</span>
      </div>
    );
  };

  const renderMessage = (msg, index) => (
    <div
      key={msg.id || index}
      className={`message ${msg.role} ${msg.isError ? "error" : ""}`}
    >
      <div className="message-content">{msg.content}</div>
      <div className="message-timestamp">
        {new Date(msg.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );

  const renderProfileDropdown = () => (
    <div
      className={`profile-dropdown ${showProfileDropdown ? "visible" : ""}`}
      ref={profileDropdownRef}
    >
      <div className="profile-info">
        <img
          src={user?.photoURL || "/default-avatar.png"}
          alt="Profile"
          className="profile-avatar-small"
        />
        <div className="profile-text">
          <div className="profile-name">{user?.displayName}</div>
          <div className="profile-email">{user?.email}</div>
        </div>
      </div>
      <div className="profile-divider"></div>
      <button className="profile-action-btn logout-btn" onClick={signOut}>
        <FaSignOutAlt />
        Sign Out
      </button>
    </div>
  );

  const currentChat = chats.find((chat) => chat.id === currentChatId);

  // ────────────────────────────────────────────────────────────────────────────
  // Render Main Component
  // ────────────────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="loading-container">
        <FaSpinner className="spinning" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <button
            className="sidebar-toggle-btn"
            onClick={toggleLeftSidebar}
            title="Toggle Chat History"
          >
            <FaBars />
          </button>
          <h1>Project Theata</h1>
        </div>

        <div className="header-center">
          {currentChat && (
            <div className="current-chat-info">
              <span className="chat-title">{currentChat.title}</span>
              {renderConnectionStatus()}
            </div>
          )}
        </div>

        <div className="header-right">
          <div className="controls">
            {/* Connection Controls */}
            <button
              className={`control-btn ${isConnected ? "connected" : ""}`}
              onClick={isConnected ? disconnect : connect}
              title={isConnected ? "Disconnect" : "Connect to Gemini"}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <FaSpinner className="spinning" />
              ) : isConnected ? (
                <FaUnlink />
              ) : (
                <FaLink />
              )}
            </button>

            {/* Media Controls */}
            <button
              className={`control-btn ${isVoiceActive ? "active" : ""}`}
              onClick={toggleVoice}
              title="Toggle Voice"
              disabled={!isConnected}
            >
              {isVoiceActive ? <FaMicrophone /> : <FaMicrophoneSlash />}
            </button>

            <button
              className={`control-btn ${isVideoActive ? "active" : ""}`}
              onClick={toggleVideo}
              title="Toggle Video"
              disabled={!isConnected}
            >
              {isVideoActive ? <FaVideo /> : <FaVideoSlash />}
            </button>

            <button
              className={`control-btn ${isScreenSharing ? "active" : ""}`}
              onClick={toggleScreenShare}
              title="Toggle Screen Share"
              disabled={!isConnected}
            >
              {isScreenSharing ? <FaStopCircle /> : <FaDesktop />}
            </button>

            {/* Theme Toggle */}
            <button
              className="theme-toggle-btn"
              onClick={handleThemeToggle}
              title="Toggle Theme"
            >
              {theme === "light" ? <FaMoon /> : <FaSun />}
            </button>

            {/* Settings */}
            <button
              className="control-btn"
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <FaCog />
            </button>
          </div>

          {/* Profile Button */}
          <div className="profile-section">
            <button
              className="profile-btn"
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              title="Profile Menu"
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Profile"
                  className="profile-avatar"
                />
              ) : (
                <FaUserCircle />
              )}
            </button>
            {renderProfileDropdown()}
          </div>

          {/* Right Sidebar Toggle */}
          <button
            className="sidebar-toggle-btn"
            onClick={toggleRightSidebar}
            title="Toggle Right Sidebar"
          >
            {isRightSidebarOpen ? <FaChevronRight /> : <FaChevronLeft />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="app-main">
        {/* Left Sidebar - Chat History */}
        <aside
          className={`conversation-history-sidebar ${isLeftSidebarOpen ? "" : "collapsed"}`}
        >
          <div className="sidebar-header">
            <h3>Conversations</h3>
            <button
              className="create-chat-btn"
              onClick={() => setShowCreateChatModal(true)}
              title="Create New Chat"
            >
              <FaPlus />
            </button>
          </div>

          <div className="sidebar-content">
            {chatLoading ? (
              <div className="loading-state">
                <FaSpinner className="spinning" />
                <span>Loading chats...</span>
              </div>
            ) : chatError ? (
              <div className="error-state">
                <FaExclamationTriangle />
                <span>{chatError}</span>
                <button onClick={loadChats} className="retry-btn">
                  <FaSyncAlt /> Retry
                </button>
              </div>
            ) : (
              <ChatList
                chats={chats}
                currentChatId={currentChatId}
                onChatSelect={setCurrentChatId}
                onChatDelete={handleDeleteChat}
              />
            )}
          </div>
        </aside>

        {/* Center and Right Content */}
        <div className="center-and-right-content">
          {/* Chat Area */}
          <main className="chat-area">
            {currentChatId ? (
              <>
                {/* Messages */}
                <div className="messages-container">
                  {messages.length === 0 ? (
                    <div className="empty-chat">
                      <FaStroopwafel className="empty-icon" />
                      <h3>Start a conversation</h3>
                      <p>Send a message to begin chatting with Gemini</p>
                    </div>
                  ) : (
                    messages.map(renderMessage)
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Audio Visualizer */}
                {isVoiceActive && (
                  <div className="audio-visualizer-container">
                    <AudioVisualizerComponent />
                  </div>
                )}

                {/* Input Area */}
                <div className="input-container">
                  <form onSubmit={handleSendMessage} className="message-form">
                    <textarea
                      ref={messageInputRef}
                      id="messageInput"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Type your message..."
                      rows={1}
                      disabled={!currentChatId || messagesLoading}
                    />
                    <button
                      type="submit"
                      className="send-button"
                      disabled={!message.trim() || messagesLoading}
                    >
                      {messagesLoading ? (
                        <FaSpinner className="spinning" />
                      ) : (
                        <FaPaperPlane />
                      )}
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="no-chat-selected">
                <FaStroopwafel className="empty-icon" />
                <h3>No chat selected</h3>
                <p>Select a chat from the sidebar or create a new one</p>
                <button
                  className="create-chat-cta"
                  onClick={() => setShowCreateChatModal(true)}
                >
                  <FaPlus /> Create New Chat
                </button>
              </div>
            )}
          </main>

          {/* Right Sidebar */}
          <aside
            className={`sidebar ${isRightSidebarOpen ? "" : "collapsed"}`}
            style={{
              width: isRightSidebarOpen ? `${rightSidebarWidth}px` : "0px",
            }}
          >
            {/* Sidebar Resizer */}
            <div
              className="sidebar-resizer"
              ref={resizerRef}
              onMouseDown={handleMouseDown}
            />

            <div className="sidebar-content-wrapper">
              <div className="sidebar-content">
                {/* Background Tasks */}
                <Collapsible
                  title="Background Tasks"
                  isOpen={true}
                  icon={<FaSyncAlt />}
                >
                  <BackgroundTaskManager />
                </Collapsible>

                {/* Connection Info */}
                <Collapsible
                  title="Connection Status"
                  isOpen={false}
                  icon={<FaLink />}
                >
                  <div className="connection-details">
                    {renderConnectionStatus()}
                    {connectionError && (
                      <div className="error-details">
                        <p>{connectionError}</p>
                        <button
                          onClick={connect}
                          className="retry-connection-btn"
                        >
                          <FaSyncAlt /> Retry Connection
                        </button>
                      </div>
                    )}
                  </div>
                </Collapsible>

                {/* Chat Settings */}
                {currentChat && (
                  <Collapsible
                    title="Chat Settings"
                    isOpen={false}
                    icon={<FaCog />}
                  >
                    <div className="chat-settings">
                      <div className="setting-item">
                        <label>Chat Title:</label>
                        <input type="text" value={currentChat.title} readOnly />
                      </div>
                      <div className="setting-item">
                        <label>Created:</label>
                        <span>
                          {new Date(currentChat.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="setting-item">
                        <label>Messages:</label>
                        <span>{messages.length}</span>
                      </div>
                      <button
                        className="danger-btn"
                        onClick={() => handleDeleteChat(currentChat.id)}
                      >
                        <FaTrash /> Delete Chat
                      </button>
                    </div>
                  </Collapsible>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <span>Project Theata © 2024</span>
          <div className="footer-links">
            <button onClick={() => setShowSettings(true)}>Settings</button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      {showCreateChatModal && (
        <CreateChatModal
          onClose={() => setShowCreateChatModal(false)}
          onCreate={handleCreateChat}
        />
      )}

      {showSettings && (
        <SettingsDialog
          onClose={() => setShowSettings(false)}
          settings={settings}
          onSettingsUpdate={updateSettings}
        />
      )}
    </div>
  );
};

export default App;
