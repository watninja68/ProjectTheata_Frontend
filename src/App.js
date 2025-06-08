// src/App.js
import React, { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import {
  FaLink, FaUnlink, FaStroopwafel, FaCog, FaPaperPlane, FaMicrophone,
  FaMicrophoneSlash, FaVideo, FaVideoSlash, FaDesktop, FaStopCircle,
  FaSyncAlt, FaExclamationTriangle, FaSpinner, FaCheckCircle,
  FaTimesCircle, FaSun, FaMoon, FaGoogle, FaSignOutAlt, FaUserCircle,
  FaUserPlus, 
  FaChevronLeft, FaChevronRight, FaBars,
} from "react-icons/fa";

import AudioVisualizerComponent from "./components/AudioVisualizerComponent";
import SettingsDialog from "./components/SettingsDialog";
import BackgroundTaskManager from "./components/BackgroundTaskManager";
import Collapsible from "./components/Collapsible"; 
import { useSettings } from "./hooks/useSettings";
import { useGeminiAgent } from "./hooks/useGeminiAgent";
import { useAuth } from "./hooks/useAuth";

function App() {
  const { session, user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const {
    settings, isSettingsOpen, saveSettings, openSettings, closeSettings,
    getGeminiConfig, getWebsocketUrl, thresholds, theme, toggleTheme,
  } = useSettings();
  const {
    agent, isConnected, isInitializing, isMicActive, isMicSuspended,
    isCameraActive, isScreenShareActive, error: agentError, connectAgent,
    disconnectAgent, sendText, toggleMic, startCamera, stopCamera,
    startScreenShare, stopScreenShare, onTranscriptionRef, onTextSentRef,
    onInterruptedRef, onTurnCompleteRef, onScreenShareStoppedRef,
    onUserTranscriptionRef, onTranscriptForBackendRef, onMicStateChangedRef,
    onCameraStartedRef, onCameraStoppedRef, onScreenShareStartedRef,
  } = useGeminiAgent(settings, getGeminiConfig, getWebsocketUrl);

  const [messages, setMessages] = useState([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const streamingMessageRef = useRef(null);
  const chatHistoryRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);
  const [screenError, setScreenError] = useState(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);
  const profileIconRef = useRef(null);
  const [googleAuthMessage, setGoogleAuthMessage] = useState("");

  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);

  // --- Resizable Sidebar State ---
  const [rightSidebarWidth, setRightSidebarWidth] = useState(280);
  const [preCollapseWidth, setPreCollapseWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const mainContentRef = useRef(null);

  const displayMicActive = isMicActive && !isMicSuspended;
  const canInteract = session && isConnected && !isInitializing;
  const showAuthSpinner = authLoading && !session;
  const showConnectPrompt = session && !isConnected && !isInitializing && !authLoading && !agentError;
  const showConnectError = session && agentError && !isConnected && !isInitializing && !authLoading;
  const profileImageUrl = user?.user_metadata?.avatar_url;

  // Effect to manage body scrolling for the App component
  useEffect(() => {
    // When App component mounts, disable body scrolling
    document.body.classList.add('no-scroll');

    // When App component unmounts, re-enable body scrolling
    return () => {
      document.body.classList.remove('no-scroll');
    };
  }, []); // Empty dependency array ensures this runs only on mount and unmount

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    if (queryParams.get("google_auth_success") === "true") {
      setGoogleAuthMessage("Google account connected successfully!");
    } else if (queryParams.get("error")) {
      setGoogleAuthMessage(`Google connection failed: ${queryParams.get("error_description") || queryParams.get("error")}`);
    }
    if (queryParams.get("google_auth_success") || queryParams.get("error")) {
        setTimeout(() => setGoogleAuthMessage(""), 7000);
        // Clean URL without reloading the page
        const newUrl = window.location.pathname; // Just the path, remove all query params
        window.history.replaceState({}, document.title, newUrl);
    }
  }, []);

  const toggleProfileMenu = () => setIsProfileMenuOpen((prev) => !prev);
  const toggleLeftSidebar = () => setIsLeftSidebarCollapsed((prev) => !prev); 

  // --- Right Sidebar Logic ---
  const toggleRightSidebar = () => {
    if (rightSidebarWidth > 0) {
      setPreCollapseWidth(rightSidebarWidth); // Save current width
      setRightSidebarWidth(0); // Collapse
    } else {
      setRightSidebarWidth(preCollapseWidth > 50 ? preCollapseWidth : 280); // Restore
    }
  };
  
  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((mouseMoveEvent) => {
    if (isResizing && mainContentRef.current) {
        const newWidth = mainContentRef.current.getBoundingClientRect().right - mouseMoveEvent.clientX;
        // Clamp width between min and max
        if (newWidth >= 220 && newWidth <= 600) {
            setRightSidebarWidth(newWidth);
        }
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);
  // --- End Right Sidebar Logic ---


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isProfileMenuOpen &&
        profileMenuRef.current && !profileMenuRef.current.contains(event.target) &&
        profileIconRef.current && !profileIconRef.current.contains(event.target)
      ) {
        setIsProfileMenuOpen(false);
      }
    };
    if (isProfileMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProfileMenuOpen]);

  const addMessage = useCallback((sender, text, isStreaming = false, type = "text") => {
    setMessages((prev) => {
      const newMessage = { id: Date.now() + Math.random(), sender, text, isStreaming, type };
      if (sender === "model" && isStreaming) streamingMessageRef.current = newMessage.id;
      const filteredPrev = prev.filter((msg) => !(msg.type === "audio_input_placeholder" && sender === "model"));
      return [...filteredPrev, newMessage];
    });
    if (sender === "model" && isStreaming) setCurrentTranscript(text);
  }, []);

  const addUserAudioPlaceholder = useCallback(() => {
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.type === "audio_input_placeholder") return prev;
      return [...prev, { id: "placeholder-" + Date.now(), sender: "user", text: "Listening...", type: "audio_input_placeholder", isStreaming: false }];
    });
  }, []);

  const updateStreamingMessage = useCallback((transcriptChunk) => {
    setCurrentTranscript((prevTranscript) => {
      const newFullTranscript = (prevTranscript + transcriptChunk).trimStart();
      setMessages((prevMessages) =>
        prevMessages.map((msg) => msg.id === streamingMessageRef.current ? { ...msg, text: newFullTranscript, isStreaming: true } : msg)
      );
      return newFullTranscript;
    });
  }, []);

  const finalizeStreamingMessage = useCallback(() => {
    setMessages((prev) => prev.map((msg) => msg.id === streamingMessageRef.current ? { ...msg, isStreaming: false } : msg));
    streamingMessageRef.current = null;
    setCurrentTranscript("");
  }, []);

  useEffect(() => {
    if (chatHistoryRef.current) chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
  }, [messages]);

  const sendTranscriptToBackend = useCallback(async (speaker, transcript) => {
    if (!transcript || transcript.trim() === "") return;
    const backendUrl = `${settings.backendBaseUrl || "http://localhost:8080"}/api/text`;
    log.Printf(`Sending to Go backend (for main agent log): Speaker=${speaker}, Text=${transcript.substring(0, 50)}... via ${backendUrl}`);
    try {
      const payload = { speaker, text: transcript, timestamp: new Date().toISOString(), session_id: "main_gemini_session" };
      const response = await fetch(backendUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const errorData = await response.text();
        console.error(`Go Backend Logging Error (${response.status}): ${errorData}`);
      }
    } catch (error) {
      console.error(`Network Error logging transcript for ${speaker}:`, error);
    }
  }, [settings.backendBaseUrl]);

  useEffect(() => {
    onTranscriptionRef.current = (transcript) => {
      if (!streamingMessageRef.current) addMessage("model", transcript, true);
      else updateStreamingMessage(" " + transcript);
    };
    onUserTranscriptionRef.current = (transcript) => {
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.type === "audio_input_placeholder") {
          return prev.map((msg) => msg.id === lastMsg.id ? { ...msg, text: ` ${transcript}` } : msg);
        } else if (!prev.some((msg) => msg.type === "audio_input_placeholder") && displayMicActive) {
          return [...prev, { id: "placeholder-" + Date.now(), sender: "user", text: ` ${transcript}`, type: "audio_input_placeholder", isStreaming: false }];
        }
        return prev;
      });
    };
    onTranscriptForBackendRef.current = sendTranscriptToBackend;
    onTextSentRef.current = (text) => {
      finalizeStreamingMessage();
      addMessage("user", text, false, "text");
    };
    onInterruptedRef.current = () => {
      finalizeStreamingMessage();
      if (displayMicActive) addUserAudioPlaceholder();
    };
    onTurnCompleteRef.current = finalizeStreamingMessage;
    onScreenShareStoppedRef.current = () => {
      log.Printf("Screen share stopped (event received in App)");
      setScreenError(null);
    };
    onMicStateChangedRef.current = (state) => {
      if (state.active && !state.suspended) addUserAudioPlaceholder();
      else setMessages((prev) => prev.filter((msg) => msg.type !== "audio_input_placeholder"));
    };
    onCameraStartedRef.current = () => { log.Printf("App: Camera Started"); setCameraError(null); };
    onCameraStoppedRef.current = () => { log.Printf("App: Camera Stopped"); };
    onScreenShareStartedRef.current = () => { log.Printf("App: Screen Share Started"); setScreenError(null); };
  }, [addMessage, updateStreamingMessage, finalizeStreamingMessage, addUserAudioPlaceholder, displayMicActive, sendTranscriptToBackend]);

  const handleConnect = useCallback(() => {
    if (!session) { alert("Please log in first to connect."); return; }
    if (!isConnected && !isInitializing) {
      setCameraError(null); setScreenError(null); setMessages([]);
      connectAgent().catch((err) => console.error("App: Connection failed", err));
    }
  }, [session, isConnected, isInitializing, connectAgent]);

  const handleDisconnect = useCallback(() => {
    if (isConnected) {
      disconnectAgent(); setMessages([]); setCurrentTranscript("");
      streamingMessageRef.current = null; setCameraError(null); setScreenError(null);
    }
  }, [isConnected, disconnectAgent]);

  const handleSendMessage = useCallback((text) => {
    const trimmedText = text.trim();
    if (trimmedText && agent && isConnected && session) {
      finalizeStreamingMessage();
      setMessages(prev => prev.filter(msg => msg.type !== 'audio_input_placeholder'));
      sendText(trimmedText);
    }
  }, [agent, isConnected, session, finalizeStreamingMessage, sendText]);

  const handleToggleMic = useCallback(() => {
    if (agent && isConnected && session) {
      toggleMic().catch(err => { console.error("App: Toggle mic error", err); alert(`Mic error: ${err.message}`); });
    } else if (!session) alert("Please log in to use the microphone.");
    else if (!isConnected) alert("Please connect the agent first.");
  }, [agent, isConnected, session, toggleMic]);

  const handleToggleCamera = useCallback(async () => {
    if (!agent || !isConnected || !session) {
      if (!session) alert("Please log in to use the camera.");
      else if (!isConnected) alert("Please connect the agent first.");
      return;
    }
    setCameraError(null);
    const preview = document.getElementById("cameraPreview");
    try {
      if (isCameraActive) { await stopCamera(); if (preview) preview.style.display = "none"; }
      else { await startCamera(); if (preview) preview.style.display = "block"; }
    } catch (error) {
      console.error("App: Camera toggle error:", error); setCameraError(error.message);
      if (preview) preview.style.display = "none";
    }
  }, [agent, isConnected, session, isCameraActive, startCamera, stopCamera]);

  const handleToggleScreenShare = useCallback(async () => {
    if (!agent || !isConnected || !session) {
      if (!session) alert("Please log in to use screen sharing.");
      else if (!isConnected) alert("Please connect the agent first.");
      return;
    }
    setScreenError(null);
    const preview = document.getElementById("screenPreview");
    try {
      if (isScreenShareActive) { await stopScreenShare(); if (preview) preview.style.display = "none"; }
      else { await startScreenShare(); if (preview) preview.style.display = "block"; }
    } catch (error) {
      console.error("App: Screen share toggle error:", error); setScreenError(error.message);
      if (preview) preview.style.display = "none";
    }
  }, [agent, isConnected, session, isScreenShareActive, startScreenShare, stopScreenShare]);

  const handleSwitchCamera = useCallback(async () => {
    if (agent?.cameraManager && isCameraActive && session && /Mobi|Android/i.test(navigator.userAgent)) {
      try {
        setCameraError(null); await agent.cameraManager.switchCamera(); log.Printf("App: Switched camera");
      } catch (e) {
        console.error("App: Error switching camera:", e); setCameraError(`Switch failed: ${e.message}`);
      }
    }
  }, [agent, isCameraActive, session]);

  const handleInputKeyPress = useCallback((e) => {
    if (e.key === "Enter" && e.target.value.trim()) { handleSendMessage(e.target.value); e.target.value = ""; }
  }, [handleSendMessage]);

  const handleSendButtonClick = useCallback(() => {
    const input = document.getElementById("messageInput");
    if (input && input.value.trim()) { handleSendMessage(input.value); input.value = ""; }
  }, [handleSendMessage]);

  const handleLogout = useCallback(() => {
    setIsProfileMenuOpen(false); signOut();
    if (isConnected) handleDisconnect();
  }, [signOut, isConnected, handleDisconnect]);

  const handleConnectGoogleAccount = () => { 
    if (user && user.id && settings.backendBaseUrl) {
      const googleLoginUrl = `${settings.backendBaseUrl}/api/auth/google/login?supabase_user_id=${user.id}`;
      window.location.href = googleLoginUrl;
    } else if (user && user.id && !settings.backendBaseUrl) {
        alert("Backend URL is not configured. Cannot connect Google Account.");
        console.error("Backend URL missing in settings for Google Auth.");
    } else {
      alert("Please log in to your Supabase account first to connect Google.");
    }
  };

  const renderStatus = useCallback(() => {
    if (!session && !authLoading) return <span className="status status-disconnected" title="Not logged into Supabase."><FaTimesCircle /> Not Logged In</span>;
    if (authLoading) return <span className="status status-initializing"><FaSpinner className="fa-spin" /> Auth...</span>;
    if (agentError && !isConnected) return <span className="status status-error" title={agentError}><FaTimesCircle /> Agent Err</span>;
    if (isInitializing) return <span className="status status-initializing"><FaSpinner className="fa-spin" /> Connecting...</span>;
    if (isConnected) return <span className="status status-connected"><FaCheckCircle /> Connected</span>;
    return <span className="status status-disconnected" title="Agent is disconnected."><FaTimesCircle /> Disconnected</span>;
  }, [session, authLoading, agentError, isInitializing, isConnected]);

  const getUserDisplayName = useCallback(() => {
    if (!user) return "Guest";
    return user.user_metadata?.full_name || user.user_metadata?.name || user.email || "User";
  }, [user]);

  const conversationHistoryItems = [
    { id: 1, title: "CI/CD in Containers vs VMs" },
    { id: 2, title: "DigitalOcean Event Feedback" },
    { id: 3, title: "WooCommerce KNET Integrat..." },
    { id: 4, title: "Negotiation Training Game" },
    { id: 5, title: "Unsloth LLaMA Fine-Tuning" },
    { id: 6, title: "Chennai Restaurant Recomme..." },
    { id: 7, title: "Chennai Restaurant Recomme..." },
    { id: 8, title: "Fixing List Index Error" },
    { id: 9, title: "JSON Question Generation" },
  ];


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
          <FaStroopwafel style={{fontSize: "1.8rem", color: "var(--accent-primary)", marginLeft: "0.5rem"}}/>
          &nbsp;
          <h1>Project Theta</h1>
        </div>
        <div className="header-center">
          <div className="header-status">
            {renderStatus()}
            {canInteract && cameraError && <span className="status status-warning" title={`Camera Error: ${cameraError}`}><FaVideoSlash /> Cam Err</span>}
            {canInteract && screenError && <span className="status status-warning" title={`Screen Share Error: ${screenError}`}><FaDesktop /> Screen Err</span>}
            {googleAuthMessage && (
                <span className={`status ${googleAuthMessage.includes("failed") ? "status-error" : "status-info"}`} style={{maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}} title={googleAuthMessage}>
                    {googleAuthMessage.includes("failed") ? <FaExclamationTriangle /> : <FaCheckCircle /> } {googleAuthMessage.length > 20 ? "G-Auth Note" : googleAuthMessage }
                </span>
            )}
          </div>
        </div>
        <div className="header-right controls">
          {session && (
            <button 
              onClick={toggleRightSidebar} 
              title={rightSidebarWidth === 0 ? "Show Sidebar" : "Hide Sidebar"} 
              className="sidebar-toggle-btn"
              style={{marginRight: '0.5rem'}} 
            >
              {rightSidebarWidth === 0 ? <FaChevronLeft /> : <FaChevronRight />}
            </button>
          )}

          {showAuthSpinner && <FaSpinner className="fa-spin" title="Loading Authentication..." style={{fontSize: '1.5rem'}}/>}
          {!session && !authLoading && <button onClick={signInWithGoogle} title="Login with Google (Supabase)"><FaGoogle /> <span className="button-text">Login</span></button>}
          {session && !isConnected && !isInitializing && agentError && <button onClick={handleConnect} title="Retry Connection" className="control-btn error"><FaSyncAlt/> <span className="button-text">Retry</span></button>}
          {isConnected && session && <button onClick={handleDisconnect} title="Disconnect Agent"><FaUnlink /> <span className="button-text">Disconnect</span></button>}
          
          <button onClick={toggleTheme} title="Toggle Theme" className="theme-toggle-btn">{theme === "dark" ? <FaSun /> : <FaMoon />}</button>
          
          {session && (
            <div className="profile-container">
              <button ref={profileIconRef} onClick={toggleProfileMenu} className="profile-btn" title="User Profile" aria-haspopup="true" aria-expanded={isProfileMenuOpen}>
                {profileImageUrl ? <img src={profileImageUrl} alt="User profile" className="profile-img"/> : <FaUserCircle />}
              </button>
              {isProfileMenuOpen && (
                <div ref={profileMenuRef} className="profile-dropdown" role="menu">
                  <div className="profile-user-info" role="menuitem">
                    Signed in as:<br /> <strong>{getUserDisplayName()}</strong>
                    {user.email && <div className="profile-user-email">({user.email})</div>}
                  </div>
                  <hr className="profile-divider" />
                  <button onClick={handleConnectGoogleAccount} className="profile-logout-btn" style={{color: "var(--info-color)"}} role="menuitem">
                     <FaUserPlus style={{color: "var(--info-color)"}}/> Connect Google
                  </button>
                  <hr className="profile-divider" />
                  <button onClick={handleLogout} className="profile-logout-btn" role="menuitem"><FaSignOutAlt /> Logout</button>
                </div>
              )}
            </div>
          )}

          <button onClick={openSettings} disabled={isInitializing || isConnected || authLoading} title="Settings"><FaCog /></button>
        </div>
      </div>

      <main className={`main-content ${isResizing ? 'resizing' : ''}`} ref={mainContentRef}>
        <div className={`conversation-history-sidebar ${isLeftSidebarCollapsed ? "collapsed" : ""}`}>
            <div className="conv-history-header">
            </div>
            <div className="conv-history-list">
                <p className="conv-history-group-title">Previous 7 Days</p>
                {conversationHistoryItems.slice(0, 5).map(item => (
                    <div key={item.id} className="conv-history-item" title={item.title}>
                        {item.title}
                    </div>
                ))}
                <p className="conv-history-group-title">Previous 30 Days</p>
                 {conversationHistoryItems.slice(5, 9).map(item => (
                    <div key={item.id} className="conv-history-item" title={item.title}>
                        {item.title}
                    </div>
                ))}
            </div>
            <div className="conv-history-footer">
                <div className="upgrade-plan-item">
                    <FaUserCircle style={{marginRight: "8px"}}/>
                    <div>
                        <strong>{getUserDisplayName()}</strong>
                    </div>
                </div>
            </div>
        </div>

        <div className="center-and-right-content">
            <div className="chat-area">
              <div id="chatHistory" ref={chatHistoryRef} className="chat-history">
                  {!session && !authLoading && <div className="chat-message system-message">Please log in to start.</div>}
                  {authLoading && !session && <div className="chat-message system-message"><FaSpinner className="fa-spin" /> Checking auth...</div>}
                  {showConnectPrompt && (
                  <div className="connect-prompt-container">
                      <p>Welcome, {getUserDisplayName()}!</p>
                      <p>Connect to the main agent to start the session.</p>
                      <button onClick={handleConnect} className="connect-prompt-button" disabled={isInitializing}>
                      {isInitializing ? <FaSpinner className="fa-spin" /> : <FaLink />}
                      {isInitializing ? " Connecting..." : " Connect Main Agent"}
                      </button>
                  </div>
                  )}
                  {showConnectError && (
                  <div className="chat-message system-message error-message">
                      <FaExclamationTriangle /> Connection failed: {agentError}<br /> Please check settings or try again.
                      <button onClick={handleConnect} className="connect-prompt-button retry-button" disabled={isInitializing}>
                      {isInitializing ? <FaSpinner className="fa-spin" /> : <FaSyncAlt />}
                      {isInitializing ? " Retrying..." : " Retry Connect"}
                      </button>
                  </div>
                  )}
                  {isConnected && messages.length === 0 && <div className="chat-message system-message">Agent connected. Say hello or use the mic!</div>}
                  {isConnected && messages.map((msg) => (
                      <div key={msg.id} className={`chat-message ${msg.sender === "user" ? "user-message" : "model-message"} type-${msg.type || "text"} ${msg.isStreaming ? "streaming" : ""}`}>
                      {msg.text}
                      </div>
                  ))}
              </div>
              {canInteract && agent?.initialized && <AudioVisualizerComponent agent={agent} />}
              {session && (
                  <div className="footer-controls-stacked">
                      <div className="floating-media-controls">
                          <button onClick={handleToggleMic} className={`control-btn mic-btn ${displayMicActive ? "active" : ""} ${isMicSuspended && isMicActive ? "suspended" : ""}`}
                              disabled={!canInteract || authLoading}
                              title={!session ? "Login Required" : !isConnected ? "Connect First" : (displayMicActive ? "Mute Microphone" : "Unmute Microphone") + (isMicSuspended && isMicActive ? " (Suspended - Click to Unmute)" : "")}>
                              <FaMicrophoneSlash />
                              <span className="button-text">Mic</span>
                          </button>
                          <button onClick={handleToggleCamera} className={`control-btn cam-btn ${isCameraActive ? "active" : ""} ${cameraError ? "error" : ""}`}
                              disabled={!canInteract || authLoading}
                              title={!session ? "Login Required" : !isConnected ? "Connect First" : cameraError ? `Camera Error: ${cameraError}` : isCameraActive ? "Stop Camera" : "Start Camera"}>
                              <FaVideoSlash />
                              <span className="button-text">Cam</span>
                          </button>
                          <button onClick={handleToggleScreenShare} className={`control-btn screen-btn ${isScreenShareActive ? "active" : ""} ${screenError ? "error" : ""}`}
                              disabled={!canInteract || authLoading}
                              title={!session ? "Login Required" : !isConnected ? "Connect First" : screenError ? `Screen Share Error: ${screenError}` : isScreenShareActive ? "Stop Screen Sharing" : "Start Screen Sharing"}>
                              <FaDesktop /> 
                              <span className="button-text">Screen</span>
                          </button>
                      </div>
                      <div className="text-input-container">
                      <input id="messageInput" type="text"
                          placeholder={!session ? "Please log in first" : !isConnected ? "Connect agent to chat" : displayMicActive ? "Listening..." : "Type message or turn on mic..."}
                          disabled={!canInteract || displayMicActive || authLoading}
                          onKeyPress={handleInputKeyPress} />
                      <button 
                          onClick={handleSendButtonClick} 
                          className="send-icon-button"
                          disabled={!canInteract || displayMicActive || authLoading || (typeof document !== 'undefined' && (!document.getElementById('messageInput') || document.getElementById('messageInput').value.trim() === ''))} 
                          title="Send Message"
                      >
                          <FaPaperPlane />
                      </button>
                      </div>
                  </div>
              )}
            </div>
            
            <div
                className="sidebar-resizer"
                onMouseDown={startResizing}
                title="Resize Sidebar"
            />
            <div 
                className={`sidebar ${!isResizing ? 'toggle-transition' : ''}`}
                style={{
                    width: `${rightSidebarWidth}px`,
                    padding: rightSidebarWidth > 10 ? '1rem' : '0',
                    borderLeft: rightSidebarWidth > 10 ? '1px solid var(--border-color)' : 'none',
                }}
            >
              {rightSidebarWidth > 50 && (
                <div className="sidebar-content-wrapper">
                    <Collapsible title="Media Previews" startOpen={true}>
                        <div id="cameraPreview" style={{ position: "relative" }}>
                        {isCameraActive && /Mobi|Android/i.test(navigator.userAgent) && session && agent?.cameraManager?.stream && (
                            <button onClick={handleSwitchCamera} className="switch-camera-btn" title="Switch Camera"><FaSyncAlt /></button>
                        )}
                        </div>
                        <div id="screenPreview"></div>
                    </Collapsible>
                    {session && 
                        <Collapsible title="Background Tasks" startOpen={true}>
                        <BackgroundTaskManager />
                        </Collapsible>
                    }
                </div>
              )}
            </div>
        </div>
      </main>

      <footer className="app-footer">
      </footer>

      {isSettingsOpen && (
        <SettingsDialog isOpen={isSettingsOpen} onClose={closeSettings} initialSettings={settings}
          onSave={(newSettings) => saveSettings(newSettings)} thresholds={thresholds} />
      )}
    </div>
  );
}

const log = {
    Printf: (message, ...args) => console.log(message, ...args),
};

export default App;