// src/App.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import './css/styles.css'; // Import global styles

// Import Icons from react-icons
import {
    FaLink, FaUnlink, FaStroopwafel, FaCog, FaPaperPlane, FaMicrophone, FaMicrophoneSlash,
    FaVideo, FaVideoSlash, FaDesktop, FaStopCircle, FaSyncAlt, FaExclamationTriangle,
    FaSpinner, FaCheckCircle, FaTimesCircle, FaSun, FaMoon, FaGoogle, FaSignOutAlt,
    FaUserCircle // <-- Import user icon
} from 'react-icons/fa';

// Import custom components and hooks
import AudioVisualizerComponent from './components/AudioVisualizerComponent';
import SettingsDialog from './components/SettingsDialog';
import { useSettings } from './hooks/useSettings';
import { useGeminiAgent } from './hooks/useGeminiAgent';
import { useAuth } from './hooks/useAuth'; // Import the useAuth hook


function App() {
    // --- Auth Hook ---
    const { session, user, loading: authLoading, signInWithGoogle, signOut } = useAuth();

    // --- Settings Hook --- (Uses useAuth internally for user info)
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
        toggleTheme
    } = useSettings();

    // --- Agent Hook ---
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
        sendText,
        toggleMic,
        startCamera,
        stopCamera,
        startScreenShare,
        stopScreenShare,
        onTranscriptionRef,
        onTextSentRef,
        onInterruptedRef,
        onTurnCompleteRef,
        onScreenShareStoppedRef,
        onUserTranscriptionRef,
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
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false); // State for profile menu
    const profileMenuRef = useRef(null); // Ref for the dropdown menu
    const profileIconRef = useRef(null); // Ref for the icon button

    // --- Derived State ---
    const displayMicActive = isMicActive && !isMicSuspended;
    const canInteract = session && isConnected && !isInitializing; // Core interaction requires login & connection
    const showAuthSpinner = authLoading && !session; // Show spinner only during initial load/login

    // --- Toggle Profile Menu ---
    const toggleProfileMenu = () => {
        setIsProfileMenuOpen(prev => !prev);
    };

    // --- Click Outside Listener to Close Profile Menu ---
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Close if clicked outside the menu AND outside the icon
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
        // Add listener if menu is open
        if (isProfileMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        // Cleanup
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isProfileMenuOpen]); // Re-run effect when menu open state changes

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
            setCurrentTranscript(text); // Initialize streaming transcript state
        }
        setLastUserMessageType(sender === 'user' ? type : null);
    }, []); // Should be stable unless dependencies change

    const addUserAudioPlaceholder = useCallback(() => {
        setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.type === 'audio_input_placeholder') {
                return prev; // Avoid duplicate placeholders
            }
            return [...prev, { id: 'placeholder-' + Date.now(), sender: 'user', text: 'Listening...', type: 'audio_input_placeholder', isStreaming: false }];
        });
       setLastUserMessageType('audio');
    }, []);

    const updateStreamingMessage = useCallback((transcriptChunk) => {
        // Use functional update form for setCurrentTranscript to ensure latest state
        setCurrentTranscript(prevTranscript => {
             const newFullTranscript = (prevTranscript + transcriptChunk).trimStart();
             setMessages(prev => prev.map(msg =>
                 msg.id === streamingMessageRef.current
                     ? { ...msg, text: newFullTranscript, isStreaming: true }
                     : msg
             ));
             return newFullTranscript; // Return the new state for setCurrentTranscript
        });
    }, []); // streamingMessageRef is stable

    const finalizeStreamingMessage = useCallback(() => {
        setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageRef.current
                ? { ...msg, isStreaming: false }
                : msg
        ));
        streamingMessageRef.current = null;
        setCurrentTranscript(''); // Reset transcript state
    }, []); // streamingMessageRef is stable

     // --- Auto-scroll Chat History ---
     useEffect(() => {
        if (chatHistoryRef.current) {
             chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
     }, [messages]); // Run whenever messages change

    // --- Agent Event Callbacks Setup ---
    useEffect(() => {
        onTranscriptionRef.current = (transcript) => {
            if (!streamingMessageRef.current) {
                 addMessage('model', transcript, true);
            } else {
                 updateStreamingMessage(' ' + transcript);
            }
        };
        onTextSentRef.current = (text) => {
            finalizeStreamingMessage();
            addMessage('user', text, false, 'text');
        };
        onInterruptedRef.current = () => {
            finalizeStreamingMessage();
             if (displayMicActive) {
                addUserAudioPlaceholder();
             }
        };
        onTurnCompleteRef.current = () => {
            finalizeStreamingMessage();
            setLastUserMessageType(null); // Reset last message type after turn
        };
         onScreenShareStoppedRef.current = () => {
             console.log("Screen share stopped (event received in App)");
             setScreenError(null);
         };
         onMicStateChangedRef.current = (state) => {
             if (state.active && !state.suspended) { // If mic becomes truly active
                 setMessages(prev => {
                     const lastMsg = prev[prev.length - 1];
                     // Add placeholder only if last message wasn't already a placeholder or user audio
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
         onCameraStoppedRef.current = () => { console.log("App: Camera Stopped"); /* Error cleared manually or on start */ };
         onScreenShareStartedRef.current = () => { console.log("App: Screen Share Started"); setScreenError(null); };
         onUserTranscriptionRef.current = (transcript) => {
             setMessages(prev => {
                 const lastMsg = prev[prev.length - 1];
                 // Update placeholder text if it exists
                 if (lastMsg?.type === 'audio_input_placeholder') {
                     return prev.map(msg => msg.id === lastMsg.id ? { ...msg, text: ` ${transcript}` } : msg);
                 }
                 // If no placeholder but mic is active, create one with the transcript
                 else if (!prev.some(msg => msg.type === 'audio_input_placeholder') && displayMicActive) {
                    return [...prev, { id: 'placeholder-' + Date.now(), sender: 'user', text: ` ${transcript}`, type: 'audio_input_placeholder', isStreaming: false }];
                 }
                 // Otherwise, don't modify messages (avoids duplicates if events overlap)
                 return prev;
             });
         };
    // Ensure callbacks have stable references or include necessary dependencies
    }, [addMessage, updateStreamingMessage, finalizeStreamingMessage, addUserAudioPlaceholder, displayMicActive]);


    // --- UI Event Handlers ---
    const handleConnect = () => {
        if (!session) { alert("Please log in first to connect."); return; }
        if (!isConnected && !isInitializing) {
            setCameraError(null);
            setScreenError(null);
            connectAgent().catch(err => { console.error("App: Connection failed", err); });
        }
    };
    const handleDisconnect = () => {
        if (isConnected) {
            disconnectAgent(); // Agent disconnect handles state reset internally now
            setMessages([]); // Clear messages on UI side
            setCurrentTranscript('');
            setLastUserMessageType(null);
            streamingMessageRef.current = null;
        }
    };
    const handleSendMessage = (text) => {
        const trimmedText = text.trim();
        if (trimmedText && agent && isConnected && session) {
             finalizeStreamingMessage(); // Ensure any streaming model response is finalized
            sendText(trimmedText);
        }
    };
    const handleToggleMic = () => {
        if (agent && isConnected && session) {
            toggleMic().catch(err => {
                 console.error("App: Toggle mic error", err);
                 alert(`Mic error: ${err.message}`);
            });
        } else if (!session) { alert("Please log in to use the microphone."); }
    };
    const handleToggleCamera = async () => {
        if (!agent || !isConnected || !session) { if (!session) alert("Please log in to use the camera."); return; }
        setCameraError(null);
        const preview = document.getElementById('cameraPreview');
        try {
            if (isCameraActive) { await stopCamera(); if (preview) preview.style.display = 'none'; }
            else { await startCamera(); if (preview) preview.style.display = 'block'; }
        } catch (error) {
            console.error("App: Camera toggle error:", error); setCameraError(error.message);
            alert(`Camera error: ${error.message}. Check permissions/availability.`);
            if (preview) preview.style.display = 'none';
        }
    };
    const handleToggleScreenShare = async () => {
         if (!agent || !isConnected || !session) { if (!session) alert("Please log in to use screen sharing."); return; }
         setScreenError(null);
         const preview = document.getElementById('screenPreview');
         try {
            if (isScreenShareActive) { await stopScreenShare(); if (preview) preview.style.display = 'none'; }
            else { await startScreenShare(); if (preview) preview.style.display = 'block'; }
         } catch (error) {
             console.error("App: Screen share toggle error:", error); setScreenError(error.message);
             alert(`Screen share error: ${error.message}. Check permissions.`);
              if (preview) preview.style.display = 'none';
         }
    };
    const handleSwitchCamera = useCallback(async () => {
        if (agent?.cameraManager && isCameraActive && session) {
             try {
                 setCameraError(null); await agent.cameraManager.switchCamera(); console.log("App: Switched camera");
            } catch (e) {
                 console.error("App: Error switching camera:", e); setCameraError(`Switch failed: ${e.message}`);
                 alert(`Failed to switch camera: ${e.message}`);
            }
        }
    }, [agent, isCameraActive, session]);
     const handleInputKeyPress = (e) => {
         if (e.key === 'Enter' && e.target.value.trim()) { handleSendMessage(e.target.value); e.target.value = ''; }
     };
      const handleSendButtonClick = () => {
         const input = document.getElementById('messageInput');
         if (input && input.value.trim()) { handleSendMessage(input.value); input.value = ''; }
     };
    // --- Logout Handler (closes menu) ---
    const handleLogout = () => {
        setIsProfileMenuOpen(false); // Close menu first
        signOut();
    };

    // --- Render Status Logic ---
    const renderStatus = () => {
        if (!session && !authLoading) return <span className="status status-disconnected"><FaTimesCircle /> Not Logged In</span>;
        if (authLoading) return <span className="status status-initializing"><FaSpinner className="fa-spin" /> Auth Loading...</span>;
        if (agentError) return <span className="status status-error" title={agentError}><FaTimesCircle /> Agent Error</span>;
        if (isInitializing) return <span className="status status-initializing"><FaSpinner className="fa-spin" /> Connecting...</span>;
        if (isConnected) return <span className="status status-connected"><FaCheckCircle /> Connected</span>;
        return <span className="status status-disconnected"><FaTimesCircle /> Disconnected</span>;
    };
    // --- Get User Display Name ---
    const getUserDisplayName = () => {
        if (!user) return "Guest";
        // Prioritize full name, then name, then email
        return user.user_metadata?.full_name || user.user_metadata?.name || user.email || "User";
    };

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
                          {/* Show media errors only if logged in and connected */}
                          {canInteract && cameraError && <span className="status status-warning" title={cameraError}><FaVideoSlash /> Cam Err</span>}
                          {canInteract && screenError && <span className="status status-warning" title={screenError}><FaDesktop /> Screen Err</span>}
                     </div>
                </div>
                {/* --- MODIFIED ORDER --- */}
                <div className="header-right controls">
                     {/* 1. Auth Buttons (Login/Spinner) */}
                     {showAuthSpinner && <FaSpinner className="fa-spin" title="Loading..." />}
                     {!session && !authLoading && (
                         <button onClick={signInWithGoogle} title="Login with Google">
                             <FaGoogle /> <span className="button-text">Login</span>
                         </button>
                     )}

                    {/* 2. Agent Connect/Disconnect (Only if logged in) */}
                    {!isConnected && session && <button onClick={handleConnect} disabled={isInitializing || authLoading} title="Connect Agent">
                         <FaLink /> <span className="button-text">Connect</span>
                    </button>}
                    {isConnected && session && <button onClick={handleDisconnect} title="Disconnect Agent">
                         <FaUnlink /> <span className="button-text">Disconnect</span>
                    </button>}

                    {/* 3. Theme Toggle */}
                     <button onClick={toggleTheme} title="Toggle Theme">
                         {theme === 'dark' ? <FaSun /> : <FaMoon />}
                     </button>

                     {/* 4. Profile Icon and Dropdown (Only if logged in) */}
                     {session && (
                         <div className="profile-container"> {/* Container for positioning */}
                             <button
                                 ref={profileIconRef} // Add ref to the button
                                 onClick={toggleProfileMenu}
                                 className="profile-btn"
                                 title="User Profile"
                                 aria-haspopup="true"
                                 aria-expanded={isProfileMenuOpen}
                             >
                                 <FaUserCircle />
                             </button>
                             {isProfileMenuOpen && (
                                 <div ref={profileMenuRef} className="profile-dropdown" role="menu">
                                     <div className="profile-user-info" role="menuitem">
                                         Signed in as:<br/>
                                         <strong>{getUserDisplayName()}</strong>
                                         {user.email && <div className="profile-user-email">({user.email})</div>}
                                     </div>
                                     <hr className="profile-divider" />
                                     <button onClick={handleLogout} className="profile-logout-btn" role="menuitem">
                                         <FaSignOutAlt /> Logout
                                     </button>
                                     {/* Add more profile options here if needed */}
                                 </div>
                             )}
                         </div>
                     )}

                    {/* 5. Settings Button */}
                    <button onClick={openSettings} disabled={isInitializing || isConnected || authLoading} title="Settings">
                         <FaCog />
                    </button>
                </div>
                 {/* --- END MODIFIED ORDER --- */}
            </div>

            {/* Main Content */}
            <main className="main-content">
                <div className="chat-area">
                    <div id="chatHistory" ref={chatHistoryRef} className="chat-history">
                        {/* Initial messages based on auth state */}
                        {!session && !authLoading && ( <div className="chat-message system-message">Please log in to start.</div> )}
                        {authLoading && ( <div className="chat-message system-message"><FaSpinner className="fa-spin"/> Checking auth...</div> )}
                        {/* Render actual chat messages */}
                        {messages.map(msg => (
                            <div key={msg.id}
                                className={`chat-message ${msg.sender === 'user' ? 'user-message' : 'model-message'} type-${msg.type || 'text'} ${msg.isStreaming ? 'streaming' : ''}`} >
                                {msg.text}
                            </div>
                        ))}
                    </div>
                    {/* Visualizer shown only when fully ready */}
                    {agent && agent.initialized && isConnected && session && <AudioVisualizerComponent agent={agent} />}
                </div>
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
                     placeholder={!session ? "Please log in first" : (displayMicActive ? "Listening..." : "Type message or turn on mic...")}
                     disabled={!canInteract || displayMicActive || authLoading}
                     onKeyPress={handleInputKeyPress} />
                 <button onClick={handleSendButtonClick} disabled={!canInteract || displayMicActive || authLoading} title="Send Message">
                     <FaPaperPlane /> <span className="button-text">Send</span>
                 </button>
                 <button onClick={handleToggleMic}
                    className={`control-btn mic-btn ${displayMicActive ? 'active' : ''} ${isMicSuspended && isMicActive ? 'suspended' : ''}`}
                    disabled={!canInteract || authLoading}
                    title={!session ? "Login Required" : (displayMicActive?"Mute":"Unmute") + (isMicSuspended?" (Suspended)":"")} >
                    {displayMicActive ? <FaMicrophone /> : <FaMicrophoneSlash />}
                    <span className="button-text">{isMicActive ? (isMicSuspended ? ' (Susp.)' : ' (On)') : ' (Off)'}</span>
                 </button>
                 <button onClick={handleToggleCamera}
                    className={`control-btn cam-btn ${isCameraActive ? 'active' : ''} ${cameraError ? 'error' : ''}`}
                    disabled={!canInteract || authLoading}
                    title={!session ? "Login Required" : (cameraError ? `Cam Err: ${cameraError}` : (isCameraActive ? 'Stop Cam' : 'Start Cam'))} >
                    {isCameraActive ? <FaVideo /> : <FaVideoSlash />}
                     <span className="button-text">{isCameraActive ? ' (On)' : ' (Off)'}</span>
                 </button>
                  <button onClick={handleToggleScreenShare}
                    className={`control-btn screen-btn ${isScreenShareActive ? 'active' : ''} ${screenError ? 'error' : ''}`}
                    disabled={!canInteract || authLoading}
                    title={!session ? "Login Required" : (screenError ? `Screen Err: ${screenError}` : (isScreenShareActive ? 'Stop Screen' : 'Start Screen'))} >
                     {isScreenShareActive ? <FaDesktop /> : <FaStopCircle />}
                     <span className="button-text">{isScreenShareActive ? ' (On)' : ' (Off)'}</span>
                 </button>
            </footer>

            {/* Settings Dialog */}
             {isSettingsOpen && (
                 <SettingsDialog
                     isOpen={isSettingsOpen} onClose={closeSettings} initialSettings={settings}
                     onSave={(newSettings) => { saveSettings(newSettings); /* closeSettings called internally if needed */ }}
                     thresholds={thresholds} />
             )}
        </div>
    );
}

export default App;