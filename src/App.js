// src/App.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import "./App.css"
//import './css/styles.css'; // This was empty and is removed

// Import Icons from react-icons
import {
    FaLink, FaUnlink, FaStroopwafel, FaCog, FaPaperPlane, FaMicrophone, FaMicrophoneSlash,
    FaVideo, FaVideoSlash, FaDesktop, FaStopCircle, FaSyncAlt, FaExclamationTriangle,
    FaSpinner, FaCheckCircle, FaTimesCircle, FaSun, FaMoon, FaGoogle, FaSignOutAlt,
    FaUserCircle 
} from 'react-icons/fa';

// Import custom components and hooks
import AudioVisualizerComponent from './components/AudioVisualizerComponent';
import SettingsDialog from './components/SettingsDialog';
import BackgroundTaskManager from './components/BackgroundTaskManager'; // <<< NEW IMPORT
import { useSettings } from './hooks/useSettings';
import { useGeminiAgent } from './hooks/useGeminiAgent';
import { useAuth } from './hooks/useAuth';


function App() {
    // --- Hooks ---
    const { session, user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
    const {
        settings, isSettingsOpen, saveSettings, openSettings, closeSettings,
        getGeminiConfig, getWebsocketUrl, thresholds, theme, toggleTheme
    } = useSettings(); 
    const {
        agent, isConnected, isInitializing, isMicActive, isMicSuspended,
        isCameraActive, isScreenShareActive, error: agentError, connectAgent,
        disconnectAgent, sendText, toggleMic, startCamera, stopCamera,
        startScreenShare, stopScreenShare,
        onTranscriptionRef,
        onTextSentRef,
        onInterruptedRef,
        onTurnCompleteRef,
        onScreenShareStoppedRef,
        onUserTranscriptionRef,
        onTranscriptForBackendRef, 
        onMicStateChangedRef,
        onCameraStartedRef,
        onCameraStoppedRef,
        onScreenShareStartedRef,
    } = useGeminiAgent(settings, getGeminiConfig, getWebsocketUrl); 

    // --- State Management ---
    const [messages, setMessages] = useState([]);
    const [currentTranscript, setCurrentTranscript] = useState('');
    const [lastUserMessageType, setLastUserMessageType] = useState(null);
    const streamingMessageRef = useRef(null);
    const chatHistoryRef = useRef(null);
    const [cameraError, setCameraError] = useState(null);
    const [screenError, setScreenError] = useState(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef(null);
    const profileIconRef = useRef(null);

    // --- Derived State ---
    const displayMicActive = isMicActive && !isMicSuspended;
    const canInteract = session && isConnected && !isInitializing;
    const showAuthSpinner = authLoading && !session;
    const showConnectPrompt = session && !isConnected && !isInitializing && !authLoading && !agentError;
    const showConnectError = session && agentError && !isConnected && !isInitializing && !authLoading;
    const profileImageUrl = user?.user_metadata?.avatar_url; 

    // --- Toggle Profile Menu ---
    const toggleProfileMenu = () => setIsProfileMenuOpen(prev => !prev);

    // --- Click Outside Listener for Profile Menu ---
    useEffect(() => {
        const handleClickOutside = (event) => {
            if ( isProfileMenuOpen &&
                 profileMenuRef.current && !profileMenuRef.current.contains(event.target) &&
                 profileIconRef.current && !profileIconRef.current.contains(event.target) ) {
                setIsProfileMenuOpen(false);
            }
        };
        if (isProfileMenuOpen) { document.addEventListener('mousedown', handleClickOutside); }
        return () => { document.removeEventListener('mousedown', handleClickOutside); };
    }, [isProfileMenuOpen]);

    // --- Chat Management Callbacks ---
    const addMessage = useCallback((sender, text, isStreaming = false, type = 'text') => {
        setMessages(prev => {
            const newMessage = { id: Date.now() + Math.random(), sender, text, isStreaming, type };
            if (sender === 'model' && isStreaming) {
                streamingMessageRef.current = newMessage.id; 
            }
            const filteredPrev = prev.filter(msg => !(msg.type === 'audio_input_placeholder' && sender === 'model'));
            return [...filteredPrev, newMessage];
        });
        if (sender === 'model' && isStreaming) {
            setCurrentTranscript(text);
        }
        setLastUserMessageType(sender === 'user' ? type : null);
    }, []); 

    const addUserAudioPlaceholder = useCallback(() => {
        setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.type === 'audio_input_placeholder') { return prev; }
            return [...prev, { id: 'placeholder-' + Date.now(), sender: 'user', text: 'Listening...', type: 'audio_input_placeholder', isStreaming: false }];
        });
       setLastUserMessageType('audio'); 
    }, []); 

    const updateStreamingMessage = useCallback((transcriptChunk) => {
        setCurrentTranscript(prevTranscript => {
             const newFullTranscript = (prevTranscript + transcriptChunk).trimStart();
             setMessages(prevMessages => prevMessages.map(msg =>
                 msg.id === streamingMessageRef.current
                      ? { ...msg, text: newFullTranscript, isStreaming: true } 
                      : msg
             ));
             return newFullTranscript; 
        });
    }, []); 

    const finalizeStreamingMessage = useCallback(() => {
        setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageRef.current
                 ? { ...msg, isStreaming: false }
                 : msg
        ));
        streamingMessageRef.current = null; 
        setCurrentTranscript(''); 
    }, []); 

    // --- Auto-scroll Chat History ---
    useEffect(() => {
        if (chatHistoryRef.current) {
             chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
    }, [messages]); 

    // --- Backend Sending Function (for main agent transcripts) ---
    const sendTranscriptToBackend = useCallback(async (speaker, transcript) => {
        if (!transcript || transcript.trim() === '') {
            return;
        }
        // This is the URL for the primary agent's transcript backend (Python ADK's /text or Go's equivalent if Go proxies it)
        // If `useGeminiAgent`'s SSE connects to Go's `/api/agent/events`, then this function might not be directly needed by `onTranscriptForBackendRef`.
        // However, it's still a valid function for sending arbitrary text to *a* backend.
        // For the new background tasks, communication is direct HTTP to /api/tasks/execute.

        // Assuming settings.backendBaseUrl is the Go backend (http://localhost:8080)
        // and the primary agent's text logs go to a specific endpoint there.
        // If useGeminiAgent's SSE is handled by Go backend for main agent, this might be redundant for that specific path.
        const backendUrl = `${settings.backendBaseUrl || 'http://localhost:8080'}/api/agent/log_transcript`; // Example endpoint on Go backend

        console.log(`Sending to Go backend (for main agent log): Speaker=${speaker}, Text=${transcript.substring(0, 50)}... via ${backendUrl}`);

        try {
            const payload = {
                speaker: speaker,
                text: transcript,
                timestamp: new Date().toISOString(),
                session_id: "main_gemini_session", // Or get current session ID if available
            };
            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorData = await response.text();
                console.error(`Go Backend Logging Error (${response.status}): ${errorData}`);
            } else {
                console.debug(`Successfully sent transcript log for ${speaker} to Go backend.`);
            }
        } catch (error) {
            console.error(`Network Error logging transcript to Go backend for ${speaker}:`, error);
        }
    }, [settings.backendBaseUrl]); // Dependency on backendBaseUrl

    // --- Agent Event Callbacks Setup ---
    useEffect(() => {
        onTranscriptionRef.current = (transcript) => { 
             if (!streamingMessageRef.current) { addMessage('model', transcript, true); } 
             else { updateStreamingMessage(' ' + transcript); } 
        };
        onUserTranscriptionRef.current = (transcript) => { 
             setMessages(prev => {
                 const lastMsg = prev[prev.length - 1];
                 if (lastMsg?.type === 'audio_input_placeholder') {
                      return prev.map(msg => msg.id === lastMsg.id ? { ...msg, text: ` ${transcript}` } : msg);
                 }
                 else if (!prev.some(msg => msg.type === 'audio_input_placeholder') && displayMicActive) {
                    return [...prev, { id: 'placeholder-' + Date.now(), sender: 'user', text: ` ${transcript}`, type: 'audio_input_placeholder', isStreaming: false }];
                 }
                 return prev;
             });
        };

        // onTranscriptForBackendRef is for the Gemini agent's own transcriptions (user/model)
        // If settings.backendBaseUrl is the Go backend, and useGeminiAgent's SSE connects to it,
        // the Go backend would be responsible for logging to the ADK agent.
        // This ref can be used if frontend needs to *also* send it somewhere else or handle it differently.
        onTranscriptForBackendRef.current = (speaker, transcript) => {
            // This could call sendTranscriptToBackend, or if useGeminiAgent's SSE goes to Go,
            // Go backend handles forwarding/logging to ADK.
            // For now, let's assume it's for direct logging or if Go backend needs explicit pushes.
            sendTranscriptToBackend(speaker, transcript);

            // If useGeminiAgent's SSE (`${settings.backendBaseUrl}/sse` or `/api/agent/events`)
            // is how the main agent's text is displayed, then the Go backend's SSE handler
            // needs to emit events that `useGeminiAgent` can understand (e.g., type 'chat_message').
        };

        onTextSentRef.current = (text) => {
            finalizeStreamingMessage(); 
            addMessage('user', text, false, 'text'); 
        };
        onInterruptedRef.current = () => {
            finalizeStreamingMessage(); 
            if (displayMicActive) { addUserAudioPlaceholder(); }
        };
        onTurnCompleteRef.current = () => {
            finalizeStreamingMessage(); 
            setLastUserMessageType(null); 
        };
         onScreenShareStoppedRef.current = () => {
             console.log("Screen share stopped (event received in App)");
             setScreenError(null); 
         };
         onMicStateChangedRef.current = (state) => {
              if (state.active && !state.suspended) { 
                  setMessages(prev => {
                      const lastMsg = prev[prev.length - 1];
                      if (lastMsg?.sender !== 'user' || lastMsg?.type === 'text') {
                          addUserAudioPlaceholder();
                      }
                      return prev;
                   });
              } else { 
                  setMessages(prev => prev.filter(msg => msg.type !== 'audio_input_placeholder'));
              }
         };
         onCameraStartedRef.current = () => { console.log("App: Camera Started"); setCameraError(null); };
         onCameraStoppedRef.current = () => { console.log("App: Camera Stopped");  };
         onScreenShareStartedRef.current = () => { console.log("App: Screen Share Started"); setScreenError(null); };
    }, [
        addMessage, updateStreamingMessage, finalizeStreamingMessage, addUserAudioPlaceholder, displayMicActive,
        sendTranscriptToBackend 
    ]);

    // --- UI Event Handlers ---
    const handleConnect = useCallback(() => {
        if (!session) { alert("Please log in first to connect."); return; }
        if (!isConnected && !isInitializing) {
            setCameraError(null); 
            setScreenError(null);
            connectAgent().catch(err => { console.error("App: Connection failed", err); });
        }
    }, [session, isConnected, isInitializing, connectAgent]); 

    const handleDisconnect = useCallback(() => {
        if (isConnected) {
            disconnectAgent(); 
            setMessages([]);
            setCurrentTranscript('');
            setLastUserMessageType(null);
            streamingMessageRef.current = null;
            setCameraError(null); 
            setScreenError(null);
        }
    }, [isConnected, disconnectAgent]); 

    const handleSendMessage = useCallback((text) => {
        const trimmedText = text.trim();
        if (trimmedText && agent && isConnected && session) {
            finalizeStreamingMessage(); 
            sendText(trimmedText); 
        }
    }, [agent, isConnected, session, finalizeStreamingMessage, sendText]); 

    const handleToggleMic = useCallback(() => {
        if (agent && isConnected && session) {
            toggleMic().catch(err => {
                 console.error("App: Toggle mic error", err);
                 alert(`Mic error: ${err.message}`); 
            });
        } else if (!session) { alert("Please log in to use the microphone."); }
         else if (!isConnected) { alert("Please connect the agent first."); }
    }, [agent, isConnected, session, toggleMic]); 

    const handleToggleCamera = useCallback(async () => {
        if (!agent || !isConnected || !session) {
            if (!session) alert("Please log in to use the camera.");
            else if (!isConnected) alert("Please connect the agent first.");
            return;
        }
        setCameraError(null); 
        const preview = document.getElementById('cameraPreview');
        try {
            if (isCameraActive) {
                await stopCamera();
                if (preview) preview.style.display = 'none';
            } else {
                await startCamera();
                if (preview) preview.style.display = 'block';
            }
        } catch (error) {
            console.error("App: Camera toggle error:", error);
            setCameraError(error.message); 
            alert(`Camera error: ${error.message}. Check permissions/availability.`);
            if (preview) preview.style.display = 'none'; 
        }
    }, [agent, isConnected, session, isCameraActive, startCamera, stopCamera]); 

    const handleToggleScreenShare = useCallback(async () => {
         if (!agent || !isConnected || !session) {
              if (!session) alert("Please log in to use screen sharing.");
               else if (!isConnected) alert("Please connect the agent first.");
              return;
         }
         setScreenError(null); 
         const preview = document.getElementById('screenPreview');
         try {
            if (isScreenShareActive) {
                await stopScreenShare();
                if (preview) preview.style.display = 'none';
            } else {
                await startScreenShare();
                if (preview) preview.style.display = 'block';
            }
         } catch (error) {
              console.error("App: Screen share toggle error:", error);
              setScreenError(error.message); 
              alert(`Screen share error: ${error.message}. Check permissions.`);
              if (preview) preview.style.display = 'none'; 
         }
    }, [agent, isConnected, session, isScreenShareActive, startScreenShare, stopScreenShare]); 

    const handleSwitchCamera = useCallback(async () => {
        if (agent?.cameraManager && isCameraActive && session && /Mobi|Android/i.test(navigator.userAgent)) {
             try {
                 setCameraError(null);
                 await agent.cameraManager.switchCamera();
                 console.log("App: Switched camera");
             } catch (e) {
                 console.error("App: Error switching camera:", e);
                 setCameraError(`Switch failed: ${e.message}`);
                 alert(`Failed to switch camera: ${e.message}`);
             }
        }
    }, [agent, isCameraActive, session]); 

    const handleInputKeyPress = useCallback((e) => {
        if (e.key === 'Enter' && e.target.value.trim()) {
            handleSendMessage(e.target.value); 
            e.target.value = ''; 
        }
    }, [handleSendMessage]); 

     const handleSendButtonClick = useCallback(() => {
        const input = document.getElementById('messageInput');
        if (input && input.value.trim()) {
            handleSendMessage(input.value); 
            input.value = ''; 
        }
    }, [handleSendMessage]); 

    const handleLogout = useCallback(() => {
        setIsProfileMenuOpen(false); 
        signOut(); 
    }, [signOut]); 

    const renderStatus = useCallback(() => {
        if (!session && !authLoading) return <span className="status status-disconnected"><FaTimesCircle /> Not Logged In</span>;
        if (authLoading) return <span className="status status-initializing"><FaSpinner className="fa-spin" /> Auth Loading...</span>;
        if (agentError) return <span className="status status-error" title={agentError}><FaTimesCircle /> Agent Error</span>;
        if (isInitializing) return <span className="status status-initializing"><FaSpinner className="fa-spin" /> Connecting...</span>;
        if (isConnected) return <span className="status status-connected"><FaCheckCircle /> Connected</span>;
        return <span className="status status-disconnected"><FaTimesCircle /> Disconnected</span>; 
    }, [session, authLoading, agentError, isInitializing, isConnected]); 

    const getUserDisplayName = useCallback(() => {
        if (!user) return "Guest";
        return user.user_metadata?.full_name || user.user_metadata?.name || user.email || "User";
    }, [user]); 

    return (
        <div className="app-container">
            {/* Header */}
            <div className="app-header">
                <div className="header-left">
                    <FaStroopwafel/>
                    <h1>Project Theta</h1>
                </div>
                <div className="header-center">
                     <div className="header-status">
                          {renderStatus()}
                           {canInteract && cameraError && <span className="status status-warning" title={cameraError}><FaVideoSlash /> Cam Err</span>}
                           {canInteract && screenError && <span className="status status-warning" title={screenError}><FaDesktop /> Screen Err</span>}
                     </div>
                </div>
                <div className="header-right controls">
                     {showAuthSpinner && <FaSpinner className="fa-spin" title="Loading..." />}
                     {!session && !authLoading && (
                          <button onClick={signInWithGoogle} title="Login with Google"> <FaGoogle /> <span className="button-text">Login</span> </button>
                     )}
                     {isConnected && session && ( <button onClick={handleDisconnect} title="Disconnect Agent"> <FaUnlink /> <span className="button-text">Disconnect</span> </button> )}
                     <button onClick={toggleTheme} title="Toggle Theme"> {theme === 'dark' ? <FaSun /> : <FaMoon />} </button>
                     {session && (
                         <div className="profile-container">
                             <button ref={profileIconRef} onClick={toggleProfileMenu} className="profile-btn" title="User Profile" aria-haspopup="true" aria-expanded={isProfileMenuOpen} >
                                {profileImageUrl ? (
                                    <img src={profileImageUrl} alt="User profile" className="profile-img" />
                                ) : (
                                    <FaUserCircle />
                                )}
                             </button>
                             {isProfileMenuOpen && (
                                 <div ref={profileMenuRef} className="profile-dropdown" role="menu">
                                     <div className="profile-user-info" role="menuitem"> Signed in as:<br/> <strong>{getUserDisplayName()}</strong> {user.email && <div className="profile-user-email">({user.email})</div>} </div>
                                     <hr className="profile-divider" />
                                     <button onClick={handleLogout} className="profile-logout-btn" role="menuitem"> <FaSignOutAlt /> Logout </button>
                                 </div>
                             )}
                         </div>
                     )}
                    <button onClick={openSettings} disabled={isInitializing || isConnected || authLoading} title="Settings"> <FaCog /> </button>
                </div>
            </div>

            {/* Main Content */}
            <main className="main-content">
                <div className="chat-area">
                    <div id="chatHistory" ref={chatHistoryRef} className="chat-history">
                         {!session && !authLoading && ( <div className="chat-message system-message">Please log in to start.</div> )}
                         {authLoading && ( <div className="chat-message system-message"><FaSpinner className="fa-spin"/> Checking auth...</div> )}
                         {showConnectPrompt && (
                              <div className="connect-prompt-container">
                                   <p>Welcome, {getUserDisplayName()}!</p>
                                   <p>Connect to the main agent to start the session.</p>
                                   <button onClick={handleConnect} className="connect-prompt-button"> <FaLink /> Connect Main Agent </button>
                              </div>
                         )}
                          {showConnectError && (
                               <div className="chat-message system-message error-message">
                                    <FaExclamationTriangle /> Connection failed: {agentError}. <br/> Please check settings or try again.
                                     <button onClick={handleConnect} className="connect-prompt-button retry-button"> <FaSyncAlt /> Retry Connect </button>
                               </div>
                          )}
                         {isConnected && messages.map(msg => (
                              <div key={msg.id} className={`chat-message ${msg.sender === 'user' ? 'user-message' : 'model-message'} type-${msg.type || 'text'} ${msg.isStreaming ? 'streaming' : ''}`} > {msg.text} </div>
                         ))}
                    </div>
                    {canInteract && agent?.initialized && <AudioVisualizerComponent agent={agent} />}
                </div>
                {/* Sidebar */}
                <div className="sidebar">
                      <p>Media Previews</p>
                      <div id="cameraPreview"></div>
                      <div id="screenPreview"></div>
                      {isCameraActive && /Mobi|Android/i.test(navigator.userAgent) && session &&
                           <button onClick={handleSwitchCamera} className="switch-camera-btn" title="Switch Camera"> <FaSyncAlt /> </button>
                      }
                      {/* --- NEW: Background Task Manager --- */}
                      {session && <BackgroundTaskManager />} 
                 </div>
            </main>

            {/* Footer */}
            <footer className="app-footer">
                  <input id="messageInput" type="text"
                       placeholder={!session ? "Please log in first" : (!isConnected ? "Connect agent to chat" : (displayMicActive ? "Listening..." : "Type message or turn on mic..."))}
                       disabled={!canInteract || displayMicActive || authLoading}
                       onKeyPress={handleInputKeyPress} />
                  <button onClick={handleSendButtonClick} disabled={!canInteract || displayMicActive || authLoading} title="Send Message">
                       <FaPaperPlane /> <span className="button-text">Send</span>
                  </button>
                  <button onClick={handleToggleMic} className={`control-btn mic-btn ${displayMicActive ? 'active' : ''} ${isMicSuspended && isMicActive ? 'suspended' : ''}`} disabled={!canInteract || authLoading} title={!session ? "Login Required" : (!isConnected? "Connect First" : (displayMicActive?"Mute":"Unmute") + (isMicSuspended?" (Suspended)":""))} >
                     {displayMicActive ? <FaMicrophone /> : <FaMicrophoneSlash />} <span className="button-text">{isMicActive ? (isMicSuspended ? ' (Susp.)' : ' (On)') : ' (Off)'}</span> </button>
                  <button onClick={handleToggleCamera} className={`control-btn cam-btn ${isCameraActive ? 'active' : ''} ${cameraError ? 'error' : ''}`} disabled={!canInteract || authLoading} title={!session ? "Login Required" : (!isConnected? "Connect First" : (cameraError ? `Cam Err: ${cameraError}` : (isCameraActive ? 'Stop Cam' : 'Start Cam')))} >
                     {isCameraActive ? <FaVideo /> : <FaVideoSlash />} <span className="button-text">{isCameraActive ? ' (On)' : ' (Off)'}</span> </button>
                  <button onClick={handleToggleScreenShare} className={`control-btn screen-btn ${isScreenShareActive ? 'active' : ''} ${screenError ? 'error' : ''}`} disabled={!canInteract || authLoading} title={!session ? "Login Required" : (!isConnected? "Connect First" : (screenError ? `Screen Err: ${screenError}` : (isScreenShareActive ? 'Stop Screen' : 'Start Screen')))} >
                       {isScreenShareActive ? <FaDesktop /> : <FaStopCircle />} <span className="button-text">{isScreenShareActive ? ' (On)' : ' (Off)'}</span> </button>
            </footer>

             {isSettingsOpen && ( <SettingsDialog isOpen={isSettingsOpen} onClose={closeSettings} initialSettings={settings} onSave={(newSettings) => { saveSettings(newSettings); }} thresholds={thresholds} /> )}
        </div>
    );
}

export default App;