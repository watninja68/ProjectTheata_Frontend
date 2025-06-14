import React, { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  FaStroopwafel,
  FaCog,
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
} from "react-icons/fa";
import ChatList from "./components/ChatList";
import ChatView from "./components/ChatView";
import SettingsDialog from "./components/SettingsDialog";
import BackgroundTaskManager from "./components/BackgroundTaskManager";
import Collapsible from "./components/Collapsible";
import { useSettings } from "./hooks/useSettings";
import { useAuth } from "./hooks/useAuth";

function App() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    session,
    user,
    loading: authLoading,
    signInWithGoogle,
    signOut,
  } = useAuth();

  const {
    settings,
    isSettingsOpen,
    saveSettings,
    openSettings,
    closeSettings,
    getGeminiConfig,
    getWebsocketUrl,
    thresholds,
    theme,
    toggleTheme,
  } = useSettings();

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const profileIconRef = useRef(null);
  const [googleAuthMessage, setGoogleAuthMessage] = useState("");
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // --- Resizable Sidebar State ---
  const [rightSidebarWidth, setRightSidebarWidth] = useState(280);
  const [preCollapseWidth, setPreCollapseWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const mainContentRef = useRef(null);

  const showAuthSpinner = authLoading && !session;
  const profileImageUrl = user?.user_metadata?.avatar_url;

  // Effect to manage body scrolling for the App component
  useEffect(() => {
    document.body.classList.add("no-scroll");
    return () => {
      document.body.classList.remove("no-scroll");
    };
  }, []);

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get("google_auth_success") === "true") {
      setGoogleAuthMessage("Google account connected successfully!");
    } else if (queryParams.get("error")) {
      setGoogleAuthMessage(
        `Google connection failed: ${queryParams.get("error_description") || queryParams.get("error")}`,
      );
    }
    // Clean up URL after processing auth callback params
    if (queryParams.get("google_auth_success") || queryParams.get("error")) {
      setTimeout(() => setGoogleAuthMessage(""), 7000);
      // Use navigate from react-router-dom to clean URL state without reload
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, navigate]);

  const toggleProfileMenu = () => setIsProfileMenuOpen((prev) => !prev);
  const toggleLeftSidebar = () => setIsLeftSidebarCollapsed((prev) => !prev);

  // --- Right Sidebar Logic ---
  const toggleRightSidebar = () => {
    if (rightSidebarWidth > 0) {
      setPreCollapseWidth(rightSidebarWidth);
      setRightSidebarWidth(0);
    } else {
      setRightSidebarWidth(preCollapseWidth > 50 ? preCollapseWidth : 280);
    }
  };

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent) => {
      if (isResizing && mainContentRef.current) {
        const newWidth =
          mainContentRef.current.getBoundingClientRect().right -
          mouseMoveEvent.clientX;
        if (newWidth >= 220 && newWidth <= 600) {
          setRightSidebarWidth(newWidth);
        }
      }
    },
    [isResizing],
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isProfileMenuOpen &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target) &&
        profileIconRef.current &&
        !profileIconRef.current.contains(event.target)
      ) {
        setIsProfileMenuOpen(false);
      }
    };
    if (isProfileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProfileMenuOpen]);

  const renderStatus = useCallback(() => {
    if (!session && !authLoading) {
      return (
        <span
          className="status status-disconnected"
          title="Not logged into Supabase."
        >
          <FaTimesCircle /> Not Logged In
        </span>
      );
    }
    if (authLoading) {
      return (
        <span className="status status-initializing">
          <FaSpinner className="fa-spin" /> Auth...
        </span>
      );
    }
    if (isConnected) {
      return (
        <span className="status status-connected">
          <FaCheckCircle /> Connected
        </span>
      );
    }
    return (
      <span
        className="status status-disconnected"
        title="Agent is disconnected."
      >
        <FaTimesCircle /> Disconnected
      </span>
    );
  }, [session, authLoading, isConnected]);

  const getUserDisplayName = useCallback(() => {
    if (!user) return "Guest";
    return (
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "User"
    );
  }, [user]);

  const handleLogout = useCallback(() => {
    setIsProfileMenuOpen(false);
    signOut();
    navigate('/login'); // Redirect to login after sign out
  }, [signOut, navigate]);

  const handleConnectGoogleAccount = () => {
    if (user && user.id && settings.backendBaseUrl) {
      const googleLoginUrl = `${settings.backendBaseUrl}/api/auth/google/login?supabase_user_id=${user.id}`;
      window.location.href = googleLoginUrl;
    } else if (user && user.id && !settings.backendBaseUrl) {
      alert("Backend URL is not configured. Cannot connect Google Account.");
      console.error("Backend URL missing in settings for Google Auth.");
    } else {
      alert("Please log in to your main account first to connect Google.");
    }
  };

  const handleCreateChat = async () => {
    if (!user?.id) {
        alert("You must be logged in to create a chat.");
        return;
    }
    console.log("Creating new chat...");
    try {
      const res = await fetch(`${settings.backendBaseUrl}/api/chats/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New Chat",
          user_id: user.id,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create chat");
      }
      const data = await res.json();
      console.log("Create chat response", data);
      if (data.id) {
        navigate(`/app/chat/${data.id}`);
      }
    } catch (error) {
      console.error("Create chat error", error);
      alert(`Error creating chat: ${error.message}`);
    }
  };

  /**
   * FIX: This function handles chat selection from the ChatList component.
   * It receives a chat object and navigates to the correct URL.
   * @param {object | null} chat - The selected chat object or null.
   */
  const handleSelectChat = (chat) => {
    if (chat && chat.id) {
      navigate(`/app/chat/${chat.id}`);
    } else {
      // If chat is null (e.g., last chat deleted), navigate to base app page
      navigate('/app');
    }
  };

  return (
    <div className="app-container">
      <div className="app-header">
        <div className="header-left">
          <button
            onClick={toggleLeftSidebar}
            title={isLeftSidebarCollapsed ? "Show History" : "Hide History"}
            className="left-sidebar-toggle-btn"
          >
            {isLeftSidebarCollapsed ? <FaBars /> : <FaChevronLeft />}
          </button>
          <FaStroopwafel
            style={{
              fontSize: "1.8rem",
              color: "var(--accent-primary)",
              marginLeft: "0.5rem",
            }}
          />
           
          <h1>Project Theta</h1>
        </div>

        <div className="header-center">
          <div className="header-status">
            {renderStatus()}
            {googleAuthMessage && (
              <span
                className={`status ${
                  googleAuthMessage.includes("failed")
                    ? "status-error"
                    : "status-info"
                }`}
                style={{
                  maxWidth: "150px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={googleAuthMessage}
              >
                {googleAuthMessage.includes("failed") ? (
                  <FaExclamationTriangle />
                ) : (
                  <FaCheckCircle />
                )}{" "}
                {googleAuthMessage.length > 20
                  ? "G-Auth Note"
                  : googleAuthMessage}
              </span>
            )}
          </div>
        </div>

        <div className="header-right controls">
          {session && (
            <button
              onClick={toggleRightSidebar}
              title={
                rightSidebarWidth === 0 ? "Show Sidebar" : "Hide Sidebar"
              }
              className="sidebar-toggle-btn"
              style={{ marginRight: "0.5rem" }}
            >
              {rightSidebarWidth === 0 ? (
                <FaChevronLeft />
              ) : (
                <FaChevronRight />
              )}
            </button>
          )}

          {showAuthSpinner && (
            <FaSpinner
              className="fa-spin"
              title="Loading Authentication..."
              style={{ fontSize: "1.5rem" }}
            />
          )}

          {!session && !authLoading && (
            <button
              onClick={() => navigate('/login')}
              title="Login"
            >
              <FaGoogle /> <span className="button-text">Login</span>
            </button>
          )}

          <button
            onClick={toggleTheme}
            title="Toggle Theme"
            className="theme-toggle-btn"
          >
            {theme === "dark" ? <FaSun /> : <FaMoon />}
          </button>

          {session && (
            <div className="profile-container">
              <button
                ref={profileIconRef}
                onClick={toggleProfileMenu}
                className="profile-btn"
                title="User Profile"
                aria-haspopup="true"
                aria-expanded={isProfileMenuOpen}
              >
                {profileImageUrl ? (
                  <img
                    src={profileImageUrl}
                    alt="User profile"
                    className="profile-img"
                  />
                ) : (
                  <FaUserCircle />
                )}
              </button>
              {isProfileMenuOpen && (
                <div
                  ref={profileMenuRef}
                  className="profile-dropdown"
                  role="menu"
                >
                  <div className="profile-user-info" role="menuitem">
                    Signed in as:
                    <br /> <strong>{getUserDisplayName()}</strong>
                    {user.email && (
                      <div className="profile-user-email">({user.email})</div>
                    )}
                  </div>
                  <hr className="profile-divider" />
                  <button
                    onClick={handleConnectGoogleAccount}
                    className="profile-logout-btn"
                    style={{ color: "var(--info-color)" }}
                    role="menuitem"
                  >
                    <FaUserPlus style={{ color: "var(--info-color)" }} />{" "}
                    Connect Google
                  </button>
                  <hr className="profile-divider" />
                  <button
                    onClick={handleLogout}
                    className="profile-logout-btn"
                    role="menuitem"
                  >
                    <FaSignOutAlt /> Logout
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={openSettings}
            disabled={authLoading}
            title="Settings"
          >
            <FaCog />
          </button>
        </div>
      </div>

      <main
        className={`main-content ${isResizing ? "resizing" : ""}`}
        ref={mainContentRef}
      >
        <ChatList
          selectedChatId={chatId || null}
          onCreateChat={handleCreateChat}
          onChatSelect={handleSelectChat}
          isCollapsed={isLeftSidebarCollapsed}
        />
        
        <div className="center-and-right-content">
          {!session && !authLoading ? (
            <div className="chat-area">
              <div className="chat-history">
                <div className="chat-message system-message">
                  Please log in to start.
                </div>
              </div>
            </div>
          ) : authLoading && !session ? (
            <div className="chat-area">
              <div className="chat-history">
                <div className="chat-message system-message">
                  <FaSpinner className="fa-spin" /> Checking auth...
                </div>
              </div>
            </div>
          ) : chatId ? (
            <ChatView
              key={chatId} // Force re-mount on chatId change to reset state
              user={user}
              session={session}
              settings={settings}
              getGeminiConfig={getGeminiConfig}
              getWebsocketUrl={getWebsocketUrl}
              onConnectionChange={setIsConnected}
              chatId={chatId}
            />
          ) : (
            <div className="chat-area">
                <div className="chat-history">
                    <div className="connect-prompt-container" style={{ margin: 'auto' }}>
                        <h3>Welcome, {getUserDisplayName()}!</h3>
                        <p>Select a chat from the sidebar to continue, or create a new one to get started.</p>
                        <button
                            onClick={handleCreateChat}
                            className="connect-prompt-button"
                        >
                            <FaPlus style={{ marginRight: '8px' }} />
                            Create New Chat
                        </button>
                    </div>
                </div>
            </div>
          )}

          <div
            className="sidebar-resizer"
            onMouseDown={startResizing}
            title="Resize Sidebar"
          />

          <div
            className={`sidebar ${!isResizing ? "toggle-transition" : ""}`}
            style={{
              width: `${rightSidebarWidth}px`,
              padding: rightSidebarWidth > 10 ? "1rem" : "0",
              borderLeft:
                rightSidebarWidth > 10
                  ? "1px solid var(--border-color)"
                  : "none",
            }}
          >
            {rightSidebarWidth > 50 && (
              <div className="sidebar-content-wrapper">
                <Collapsible title="Media Previews" startOpen={true}>
                  <div id="cameraPreview" style={{ position: "relative" }} />
                  <div id="screenPreview" />
                </Collapsible>
                {session && (
                  <Collapsible title="Background Tasks" startOpen={true}>
                    <BackgroundTaskManager />
                  </Collapsible>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="app-footer" />

      {isSettingsOpen && (
        <SettingsDialog
          isOpen={isSettingsOpen}
          onClose={closeSettings}
          initialSettings={settings}
          onSave={(newSettings) => saveSettings(newSettings)}
          thresholds={thresholds}
        />
      )}
    </div>
  );
}

export default App;
