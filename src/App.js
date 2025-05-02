// src/App.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import './css/styles.css'; // Import global styles

// Import Icons from react-icons
import {
    FaLink, FaUnlink, FaStroopwafel, FaCog, FaPaperPlane, FaMicrophone, FaMicrophoneSlash,
    FaVideo, FaVideoSlash, FaDesktop, FaStopCircle, FaSyncAlt, FaExclamationTriangle,
    FaSpinner, FaCheckCircle, FaTimesCircle, FaSun, FaMoon, FaGoogle, FaSignOutAlt,
    FaUserCircle // Keep FaUserCircle as a fallback
} from 'react-icons/fa';

// Import custom components and hooks
import AudioVisualizerComponent from './components/AudioVisualizerComponent';
import SettingsDialog from './components/SettingsDialog';
import { useSettings } from './hooks/useSettings';
import { useGeminiAgent } from './hooks/useGeminiAgent';
import { useAuth } from './hooks/useAuth';


function App() {
    // --- Hooks ---
    const { session, user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
    const {
        settings, isSettingsOpen, saveSettings, openSettings, closeSettings,
        getGeminiConfig, getWebsocketUrl, thresholds, theme, toggleTheme
    } = useSettings(); // Needs user context, so declared after useAuth
    const {
        agent, isConnected, isInitializing, isMicActive, isMicSuspended,
        isCameraActive, isScreenShareActive, error: agentError, connectAgent,
        disconnectAgent, sendText, toggleMic, startCamera, stopCamera,
        startScreenShare, stopScreenShare,
        // Callback Refs from useGeminiAgent
        onTranscriptionRef,
        onTextSentRef,
        onInterruptedRef,
        onTurnCompleteRef,
        onScreenShareStoppedRef,
        onUserTranscriptionRef,
        onTranscriptForBackendRef, // <<< NEW: Get the ref for backend
        onMicStateChangedRef,
        onCameraStartedRef,
        onCameraStoppedRef,
        onScreenShareStartedRef,
    } = useGeminiAgent(settings, getGeminiConfig, getWebsocketUrl); // Depends on settings and config functions

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
    const profileImageUrl = user?.user_metadata?.avatar_url; // Get profile image URL

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

    // --- Chat Management Callbacks (Restored full definitions) ---
    const addMessage = useCallback((sender, text, isStreaming = false, type = 'text') => {
        setMessages(prev => {
            const newMessage = { id: Date.now() + Math.random(), sender, text, isStreaming, type };
            if (sender === 'model' && isStreaming) {
                streamingMessageRef.current = newMessage.id; // Track the streaming message ID
            }
            // Remove audio placeholder if model starts responding
            const filteredPrev = prev.filter(msg => !(msg.type === 'audio_input_placeholder' && sender === 'model'));
            return [...filteredPrev, newMessage];
        });
        // Initialize the transcript state if this is the start of a streaming message
        if (sender === 'model' && isStreaming) {
            setCurrentTranscript(text);
        }
        // Track the type of the last message sent by the user
        setLastUserMessageType(sender === 'user' ? type : null);
    }, []); // No dependencies needed as it only uses setters

    const addUserAudioPlaceholder = useCallback(() => {
        setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            // Avoid adding duplicate placeholders
            if (lastMsg?.type === 'audio_input_placeholder') { return prev; }
            // Add the placeholder
            return [...prev, { id: 'placeholder-' + Date.now(), sender: 'user', text: 'Listening...', type: 'audio_input_placeholder', isStreaming: false }];
        });
       setLastUserMessageType('audio'); // Mark last user input type as audio
    }, []); // No dependencies needed

    const updateStreamingMessage = useCallback((transcriptChunk) => {
        // Use functional update for transcript state
        setCurrentTranscript(prevTranscript => {
             const newFullTranscript = (prevTranscript + transcriptChunk).trimStart();
             // Update the corresponding message in the messages array
             setMessages(prevMessages => prevMessages.map(msg =>
                 msg.id === streamingMessageRef.current
                      ? { ...msg, text: newFullTranscript, isStreaming: true } // Update text and keep streaming flag
                      : msg
             ));
             return newFullTranscript; // Return new state for setCurrentTranscript
        });
    }, []); // streamingMessageRef is stable

    const finalizeStreamingMessage = useCallback(() => {
        // Mark the streaming message as no longer streaming
        setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageRef.current
                 ? { ...msg, isStreaming: false }
                 : msg
        ));
        streamingMessageRef.current = null; // Clear the ref
        setCurrentTranscript(''); // Clear the transcript state
    }, []); // streamingMessageRef is stable

    // --- Auto-scroll Chat History ---
    useEffect(() => {
        if (chatHistoryRef.current) {
             chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
    }, [messages]); // Run whenever messages array changes

    // <<< --- NEW: Backend Sending Function --- >>>
    const sendTranscriptToBackend = useCallback(async (speaker, transcript) => {
        // speaker will be 'user' or 'agent'
        // transcript is the text string
        if (!transcript || transcript.trim() === '') {
            // console.debug("Skipping empty transcript for backend send.");
            return;
        }

        // Replace with your actual backend endpoint URL
        const backendUrl = 'http://localhost:8080/text'; // Example endpoint

        console.log(`Sending to backend: Speaker=${speaker}, Text=${transcript.substring(0, 50)}...`);

        try {
            const payload = {
                speaker: speaker,
                text: transcript,
                timestamp: new Date().toISOString(),
                // Optionally include session/user info if needed by backend
                // userId: user?.id, // Example if using Supabase user ID
            };

            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Add Authorization header if your backend requires it
                    // 'Authorization': `Bearer ${session?.access_token}` // Example using Supabase session
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                // Handle non-2xx responses (e.g., 4xx, 5xx)
                const errorData = await response.text(); // Read error text or JSON
                console.error(`Backend Error (${response.status}): Failed to send transcript for ${speaker}. Response: ${errorData}`);
                // Optionally: Show an error message to the user?
            } else {
                console.debug(`Successfully sent transcript for ${speaker} to backend.`);
                // Optionally: Handle successful response data if backend returns any
                // const responseData = await response.json();
            }
        } catch (error) {
            // Handle network errors (fetch failed)
            console.error(`Network Error: Failed to send transcript for ${speaker} to backend:`, error);
            // Optionally: Show an error message or implement retry logic
        }
        // Add 'session' and 'user' as dependencies if you uncomment the Authorization/userId lines above
    }, []); // Add dependencies like 'session', 'user' if used inside

    // --- Agent Event Callbacks Setup ---
    useEffect(() => {
        // Assign functions to the refs passed to useGeminiAgent

        // --- UI Callbacks ---
        onTranscriptionRef.current = (transcript) => { // Model's speech for UI
             if (!streamingMessageRef.current) { addMessage('model', transcript, true); } // Start new streaming message
             else { updateStreamingMessage(' ' + transcript); } // Append to existing
        };
        onUserTranscriptionRef.current = (transcript) => { // User's speech for UI
             // Update the user's listening placeholder with their speech in real-time
             setMessages(prev => {
                 const lastMsg = prev[prev.length - 1];
                 if (lastMsg?.type === 'audio_input_placeholder') {
                      return prev.map(msg => msg.id === lastMsg.id ? { ...msg, text: ` ${transcript}` } : msg);
                 }
                 // If no placeholder but mic is active, create one
                 else if (!prev.some(msg => msg.type === 'audio_input_placeholder') && displayMicActive) {
                    return [...prev, { id: 'placeholder-' + Date.now(), sender: 'user', text: ` ${transcript}`, type: 'audio_input_placeholder', isStreaming: false }];
                 }
                 return prev;
             });
        };

        // <<< NEW: Assign Backend Sending Callback >>>
        onTranscriptForBackendRef.current = sendTranscriptToBackend;

        // --- Other Callbacks ---
        onTextSentRef.current = (text) => {
            finalizeStreamingMessage(); // Finalize any previous model streaming
            addMessage('user', text, false, 'text'); // Add user text message
        };
        onInterruptedRef.current = () => {
            finalizeStreamingMessage(); // Stop model streaming
            // If mic is active, show listening placeholder again
            if (displayMicActive) { addUserAudioPlaceholder(); }
        };
        onTurnCompleteRef.current = () => {
            finalizeStreamingMessage(); // Mark model message as complete
            setLastUserMessageType(null); // Reset last user input type
        };
         onScreenShareStoppedRef.current = () => {
             console.log("Screen share stopped (event received in App)");
             setScreenError(null); // Clear screen error state
         };
         onMicStateChangedRef.current = (state) => {
              if (state.active && !state.suspended) { // If mic becomes truly active
                  setMessages(prev => {
                      const lastMsg = prev[prev.length - 1];
                      // Add placeholder only if appropriate
                      if (lastMsg?.sender !== 'user' || lastMsg?.type === 'text') {
                          addUserAudioPlaceholder();
                      }
                      return prev;
                   });
              } else { // Mic is off or suspended
                  // Remove any existing placeholder
                  setMessages(prev => prev.filter(msg => msg.type !== 'audio_input_placeholder'));
              }
         };
         onCameraStartedRef.current = () => { console.log("App: Camera Started"); setCameraError(null); };
         onCameraStoppedRef.current = () => { console.log("App: Camera Stopped"); /* Don't clear error here, might be intentional stop */ };
         onScreenShareStartedRef.current = () => { console.log("App: Screen Share Started"); setScreenError(null); };

        // Dependencies include the new backend sending function and any UI callbacks useGeminiAgent depends on
    }, [
        addMessage, updateStreamingMessage, finalizeStreamingMessage, addUserAudioPlaceholder, displayMicActive,
        sendTranscriptToBackend // <<< NEW dependency
    ]);

    // --- UI Event Handlers (Restored full definitions) ---
    const handleConnect = useCallback(() => {
        // Must be logged in
        if (!session) { alert("Please log in first to connect."); return; }
        // Prevent multiple connections
        if (!isConnected && !isInitializing) {
            setCameraError(null); // Reset errors on connect attempt
            setScreenError(null);
            connectAgent().catch(err => { console.error("App: Connection failed", err); /* Agent hook handles error state */ });
        }
    }, [session, isConnected, isInitializing, connectAgent]); // Dependencies for connect logic

    const handleDisconnect = useCallback(() => {
        if (isConnected) {
            disconnectAgent(); // Agent hook handles state reset
            // Clear UI state related to the session
            setMessages([]);
            setCurrentTranscript('');
            setLastUserMessageType(null);
            streamingMessageRef.current = null;
            setCameraError(null); // Clear errors on disconnect
            setScreenError(null);
        }
    }, [isConnected, disconnectAgent]); // Dependency on connection state and disconnect function

    const handleSendMessage = useCallback((text) => {
        const trimmedText = text.trim();
        // Requires text, agent, connection, and session
        if (trimmedText && agent && isConnected && session) {
            finalizeStreamingMessage(); // Finalize any model speech first
            sendText(trimmedText); // Agent hook sends the text
        }
    }, [agent, isConnected, session, finalizeStreamingMessage, sendText]); // Dependencies

    const handleToggleMic = useCallback(() => {
        // Requires agent, connection, and session
        if (agent && isConnected && session) {
            toggleMic().catch(err => {
                 console.error("App: Toggle mic error", err);
                 alert(`Mic error: ${err.message}`); // Show error to user
            });
        } else if (!session) { alert("Please log in to use the microphone."); }
         else if (!isConnected) { alert("Please connect the agent first."); }
    }, [agent, isConnected, session, toggleMic]); // Dependencies

    const handleToggleCamera = useCallback(async () => {
        // Requires agent, connection, and session
        if (!agent || !isConnected || !session) {
            if (!session) alert("Please log in to use the camera.");
            else if (!isConnected) alert("Please connect the agent first.");
            return;
        }
        setCameraError(null); // Clear previous camera errors
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
            setCameraError(error.message); // Set error state
            alert(`Camera error: ${error.message}. Check permissions/availability.`);
            if (preview) preview.style.display = 'none'; // Hide preview on error
        }
    }, [agent, isConnected, session, isCameraActive, startCamera, stopCamera]); // Dependencies

    const handleToggleScreenShare = useCallback(async () => {
         // Requires agent, connection, and session
         if (!agent || !isConnected || !session) {
              if (!session) alert("Please log in to use screen sharing.");
               else if (!isConnected) alert("Please connect the agent first.");
              return;
         }
         setScreenError(null); // Clear previous screen errors
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
              setScreenError(error.message); // Set error state
              alert(`Screen share error: ${error.message}. Check permissions.`);
              if (preview) preview.style.display = 'none'; // Hide preview on error
         }
    }, [agent, isConnected, session, isScreenShareActive, startScreenShare, stopScreenShare]); // Dependencies

    const handleSwitchCamera = useCallback(async () => {
        // Requires specific conditions
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
    }, [agent, isCameraActive, session]); // Dependencies

    const handleInputKeyPress = useCallback((e) => {
        // Check if Enter key is pressed and input is not empty
        if (e.key === 'Enter' && e.target.value.trim()) {
            handleSendMessage(e.target.value); // Send message
            e.target.value = ''; // Clear input field
        }
    }, [handleSendMessage]); // Depends on handleSendMessage

     const handleSendButtonClick = useCallback(() => {
        const input = document.getElementById('messageInput');
        if (input && input.value.trim()) {
            handleSendMessage(input.value); // Send message
            input.value = ''; // Clear input field
        }
    }, [handleSendMessage]); // Depends on handleSendMessage

    // --- Logout Handler ---
    const handleLogout = useCallback(() => {
        setIsProfileMenuOpen(false); // Close profile menu
        signOut(); // Sign out using auth hook
    }, [signOut]); // Depends on signOut from useAuth

    // --- Render Status Logic ---
    const renderStatus = useCallback(() => {
        // Order matters: Auth loading -> Not logged in -> Agent Error -> Initializing -> Connected -> Disconnected
        if (!session && !authLoading) return <span className="status status-disconnected"><FaTimesCircle /> Not Logged In</span>;
        if (authLoading) return <span className="status status-initializing"><FaSpinner className="fa-spin" /> Auth Loading...</span>;
        // If logged in, show agent status
        if (agentError) return <span className="status status-error" title={agentError}><FaTimesCircle /> Agent Error</span>;
        if (isInitializing) return <span className="status status-initializing"><FaSpinner className="fa-spin" /> Connecting...</span>;
        if (isConnected) return <span className="status status-connected"><FaCheckCircle /> Connected</span>;
        return <span className="status status-disconnected"><FaTimesCircle /> Disconnected</span>; // Default state after login but before connecting
    }, [session, authLoading, agentError, isInitializing, isConnected]); // Dependencies

    // --- Get User Display Name ---
    const getUserDisplayName = useCallback(() => {
        if (!user) return "Guest";
        return user.user_metadata?.full_name || user.user_metadata?.name || user.email || "User";
    }, [user]); // Depends on user object

    // --- JSX Structure ---
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
                           {/* Show media errors only if interaction is possible and error exists */}
                           {canInteract && cameraError && <span className="status status-warning" title={cameraError}><FaVideoSlash /> Cam Err</span>}
                           {canInteract && screenError && <span className="status status-warning" title={screenError}><FaDesktop /> Screen Err</span>}
                     </div>
                </div>
                <div className="header-right controls">
                     {/* Auth Controls */}
                     {showAuthSpinner && <FaSpinner className="fa-spin" title="Loading..." />}
                     {!session && !authLoading && (
                          <button onClick={signInWithGoogle} title="Login with Google"> <FaGoogle /> <span className="button-text">Login</span> </button>
                     )}
                     {/* Disconnect Button */}
                     {isConnected && session && ( <button onClick={handleDisconnect} title="Disconnect Agent"> <FaUnlink /> <span className="button-text">Disconnect</span> </button> )}
                     {/* Theme Toggle */}
                     <button onClick={toggleTheme} title="Toggle Theme"> {theme === 'dark' ? <FaSun /> : <FaMoon />} </button>
                     {/* Profile Menu */}
                     {session && (
                         <div className="profile-container">
                            {/* **MODIFIED:** Conditionally render image or icon */}
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
                    {/* Settings Button */}
                    <button onClick={openSettings} disabled={isInitializing || isConnected || authLoading} title="Settings"> <FaCog /> </button>
                </div>
            </div>

            {/* Main Content */}
            <main className="main-content">
                <div className="chat-area">
                    <div id="chatHistory" ref={chatHistoryRef} className="chat-history">
                         {/* Initial State Messages / Connect Prompt */}
                         {!session && !authLoading && ( <div className="chat-message system-message">Please log in to start.</div> )}
                         {authLoading && ( <div className="chat-message system-message"><FaSpinner className="fa-spin"/> Checking auth...</div> )}
                         {showConnectPrompt && (
                              <div className="connect-prompt-container">
                                   <p>Welcome, {getUserDisplayName()}!</p>
                                   <p>Connect to the agent to start the session.</p>
                                   <button onClick={handleConnect} className="connect-prompt-button"> <FaLink /> Connect Agent </button>
                              </div>
                         )}
                          {showConnectError && (
                               <div className="chat-message system-message error-message">
                                    <FaExclamationTriangle /> Connection failed: {agentError}. <br/> Please check settings or try again.
                                     <button onClick={handleConnect} className="connect-prompt-button retry-button"> <FaSyncAlt /> Retry Connect </button>
                               </div>
                          )}
                         {/* Chat Messages (only if connected) */}
                         {isConnected && messages.map(msg => (
                              <div key={msg.id} className={`chat-message ${msg.sender === 'user' ? 'user-message' : 'model-message'} type-${msg.type || 'text'} ${msg.isStreaming ? 'streaming' : ''}`} > {msg.text} </div>
                         ))}
                    </div>
                    {/* Visualizer */}
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
                  {/* Media Controls */}
                  <button onClick={handleToggleMic} className={`control-btn mic-btn ${displayMicActive ? 'active' : ''} ${isMicSuspended && isMicActive ? 'suspended' : ''}`} disabled={!canInteract || authLoading} title={!session ? "Login Required" : (!isConnected? "Connect First" : (displayMicActive?"Mute":"Unmute") + (isMicSuspended?" (Suspended)":""))} >
                     {displayMicActive ? <FaMicrophone /> : <FaMicrophoneSlash />} <span className="button-text">{isMicActive ? (isMicSuspended ? ' (Susp.)' : ' (On)') : ' (Off)'}</span> </button>
                  <button onClick={handleToggleCamera} className={`control-btn cam-btn ${isCameraActive ? 'active' : ''} ${cameraError ? 'error' : ''}`} disabled={!canInteract || authLoading} title={!session ? "Login Required" : (!isConnected? "Connect First" : (cameraError ? `Cam Err: ${cameraError}` : (isCameraActive ? 'Stop Cam' : 'Start Cam')))} >
                     {isCameraActive ? <FaVideo /> : <FaVideoSlash />} <span className="button-text">{isCameraActive ? ' (On)' : ' (Off)'}</span> </button>
                  <button onClick={handleToggleScreenShare} className={`control-btn screen-btn ${isScreenShareActive ? 'active' : ''} ${screenError ? 'error' : ''}`} disabled={!canInteract || authLoading} title={!session ? "Login Required" : (!isConnected? "Connect First" : (screenError ? `Screen Err: ${screenError}` : (isScreenShareActive ? 'Stop Screen' : 'Start Screen')))} >
                       {isScreenShareActive ? <FaDesktop /> : <FaStopCircle />} <span className="button-text">{isScreenShareActive ? ' (On)' : ' (Off)'}</span> </button>
            </footer>

            {/* Settings Dialog */}
             {isSettingsOpen && ( <SettingsDialog isOpen={isSettingsOpen} onClose={closeSettings} initialSettings={settings} onSave={(newSettings) => { saveSettings(newSettings); }} thresholds={thresholds} /> )}
        </div>
    );
}

export default App;
