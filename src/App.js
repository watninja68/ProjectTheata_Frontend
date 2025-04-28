// src/App.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import './css/styles.css'; // Import global styles (Now contains the new theme)

// Import Icons from react-icons
import {
    FaLink, FaUnlink,FaStroopwafel, FaCog, FaPaperPlane, FaMicrophone, FaMicrophoneSlash,
    FaVideo, FaVideoSlash, FaDesktop, FaStopCircle, FaSyncAlt, FaExclamationTriangle,
    FaSpinner, FaCheckCircle, FaTimesCircle
} from 'react-icons/fa'; // Using Font Awesome icons

// Only import components that you have actually implemented
import AudioVisualizerComponent from './components/AudioVisualizerComponent';
import SettingsDialog from './components/SettingsDialog';

// Keep hook imports
import { useSettings } from './hooks/useSettings';
import { useGeminiAgent } from './hooks/useGeminiAgent';


function App() {
    // Settings hook logic remains the same
    const {
        settings,
        isSettingsOpen,
        saveSettings,
        openSettings,
        closeSettings,
        getGeminiConfig,
        getWebsocketUrl,
        thresholds
    } = useSettings();

    // Agent hook logic remains the same
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
        // Callback refs
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

    // State management for messages and transcripts remains
    const [messages, setMessages] = useState([]);
    const [currentTranscript, setCurrentTranscript] = useState('');
    const [lastUserMessageType, setLastUserMessageType] = useState(null);
    const streamingMessageRef = useRef(null);
    const chatHistoryRef = useRef(null);

    // State for camera/screen errors
    const [cameraError, setCameraError] = useState(null);
    const [screenError, setScreenError] = useState(null);
    const displayMicActive = isMicActive && !isMicSuspended;


    // --- Chat Management Logic (remains the same) ---
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
            if (lastMsg?.type === 'audio_input_placeholder') {
                return prev;
            }
            return [...prev, { id: 'placeholder-' + Date.now(), sender: 'user', text: 'Listening...', type: 'audio_input_placeholder', isStreaming: false }];
        });
       setLastUserMessageType('audio');
    }, []);

    const updateStreamingMessage = useCallback((transcriptChunk) => {
        const newFullTranscript = (currentTranscript + transcriptChunk).trimStart();
        setCurrentTranscript(newFullTranscript);
        setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageRef.current
                ? { ...msg, text: newFullTranscript, isStreaming: true }
                : msg
        ));
    }, [currentTranscript]);


    const finalizeStreamingMessage = useCallback(() => {
        setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageRef.current
                ? { ...msg, isStreaming: false }
                : msg
        ));
        streamingMessageRef.current = null;
        setCurrentTranscript('');
    }, []);

     // Auto-scroll chat history
     useEffect(() => {
        if (chatHistoryRef.current) {
             chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
     }, [messages]);


    // --- Agent Event Callbacks (Updated) ---
    useEffect(() => {
        // --- Transcription & Model Responses ---
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
            setLastUserMessageType(null);
        };

        // --- Media State Changes ---
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
         onCameraStartedRef.current = () => { console.log("App: Camera Started"); setCameraError(null); }; // Clear error on success
         onCameraStoppedRef.current = () => { console.log("App: Camera Stopped"); /* Error cleared manually or on start */ };
         onScreenShareStartedRef.current = () => { console.log("App: Screen Share Started"); setScreenError(null); }; // Clear error on success

         // Optional: Handle user transcription display
         onUserTranscriptionRef.current = (transcript) => {
             setMessages(prev => {
                 const lastMsg = prev[prev.length - 1];
                 if (lastMsg?.type === 'audio_input_placeholder') {
                     return prev.map(msg => msg.id === lastMsg.id ? { ...msg, text: ` ${transcript}` } : msg); // Just update text
                 } else if (lastMsg?.type === 'user_audio') {
                     // Append logic if needed
                 } else if (!prev.some(msg => msg.type === 'audio_input_placeholder') && displayMicActive) {
                    return [...prev, { id: 'placeholder-' + Date.now(), sender: 'user', text: ` ${transcript}`, type: 'audio_input_placeholder', isStreaming: false }];
                 }
                 return prev;
             });
         };

    }, [addMessage, updateStreamingMessage, finalizeStreamingMessage, addUserAudioPlaceholder, lastUserMessageType, displayMicActive]);


    // --- UI Event Handlers ---
    const handleConnect = () => {
        if (!isConnected && !isInitializing) {
            setCameraError(null);
            setScreenError(null);
            connectAgent().catch(err => { console.error("App: Connection failed", err); });
        }
    };
    const handleDisconnect = () => {
        if (isConnected) {
            disconnectAgent();
            setMessages([]);
            setCurrentTranscript('');
            setLastUserMessageType(null);
            streamingMessageRef.current = null;
        }
    };
    const handleSendMessage = (text) => {
        const trimmedText = text.trim();
        if (trimmedText && agent && isConnected) {
             finalizeStreamingMessage();
            sendText(trimmedText);
        }
    };
    const handleToggleMic = () => {
        if (agent && isConnected) {
            toggleMic().catch(err => {
                 console.error("App: Toggle mic error", err);
                 alert(`Mic error: ${err.message}`);
            });
        }
    };

    const handleToggleCamera = async () => {
        if (!agent || !isConnected) return;
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
            alert(`Camera error: ${error.message}. Please check permissions and ensure the camera is not in use.`);
            if (preview) preview.style.display = 'none';
        }
    };

    const handleToggleScreenShare = async () => {
         if (!agent || !isConnected) return;
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
             alert(`Screen share error: ${error.message}. Please grant permission.`);
              if (preview) preview.style.display = 'none';
         }
    };

    const handleSwitchCamera = useCallback(async () => {
        if (agent?.cameraManager && isCameraActive) {
             try {
                 setCameraError(null);
                 await agent.cameraManager.switchCamera();
                 console.log("App: Switched camera");
            }
             catch (e) {
                 console.error("App: Error switching camera:", e);
                 setCameraError(`Switch failed: ${e.message}`);
                 alert(`Failed to switch camera: ${e.message}`);
            }
        }
    }, [agent, isCameraActive]);

     const handleInputKeyPress = (e) => {
         if (e.key === 'Enter' && e.target.value.trim()) {
             handleSendMessage(e.target.value);
             e.target.value = '';
         }
     };

      const handleSendButtonClick = () => {
         const input = document.getElementById('messageInput');
         if (input && input.value.trim()) {
             handleSendMessage(input.value);
             input.value = '';
         }
     };


    // Function to render the current connection status with icons
    const renderStatus = () => {
        if (agentError) return <span className="status status-error" title={agentError}><FaTimesCircle /> Error</span>;
        if (isInitializing) return <span className="status status-initializing"><FaSpinner className="fa-spin" /> Connecting...</span>; // Use spinner icon
        if (isConnected) return <span className="status status-connected"><FaCheckCircle /> Connected</span>;
        return <span className="status status-disconnected"><FaTimesCircle /> Disconnected</span>; // Or FaUnlinkAlt
    };

    // --- JSX Return (Updated with Icons and Classes) ---
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
                          {cameraError && <span className="status status-warning" title={cameraError}><FaVideoSlash /> Cam Err</span>}
                          {screenError && <span className="status status-warning" title={screenError}><FaDesktop /> Screen Err</span>}
                     </div>
                </div>
                <div className="header-right controls">
                    {!isConnected && <button onClick={handleConnect} disabled={isInitializing} title="Connect">
                         <FaLink /> <span className="button-text">Connect</span>
                    </button>}
                    {isConnected && <button onClick={handleDisconnect} title="Disconnect">
                         <FaUnlink /> <span className="button-text">Disconnect</span>
                    </button>}
                    <button onClick={openSettings} disabled={isInitializing || isConnected} title="Settings">
                         <FaCog />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <main className="main-content">
                {/* Chat History Area */}
                <div className="chat-area">
                    <div id="chatHistory" ref={chatHistoryRef} className="chat-history">
                        {messages.map(msg => (
                            <div
                                key={msg.id}
                                className={`chat-message ${msg.sender === 'user' ? 'user-message' : 'model-message'} type-${msg.type || 'text'} ${msg.isStreaming ? 'streaming' : ''}`}
                            >
                                {msg.text}
                            </div>
                        ))}
                    </div>

                    {/* Audio Visualizer */}
                    {agent && agent.initialized && isConnected && <AudioVisualizerComponent agent={agent} />}
                </div>

                {/* Sidebar Area (For Previews) */}
                 <div className="sidebar">
                     <p>Media Previews</p>
                     <div id="cameraPreview"></div>
                     <div id="screenPreview"></div>

                     {isCameraActive && /Mobi|Android/i.test(navigator.userAgent) &&
                        <button onClick={handleSwitchCamera} className="switch-camera-btn" title="Switch Camera">
                            <FaSyncAlt />
                        </button>
                     }
                 </div>
            </main>

            {/* Footer with Input and Media Controls */}
            <footer className="app-footer">
                 <input
                     id="messageInput"
                     type="text"
                     placeholder={displayMicActive ? "Listening..." : "Type message or turn on mic..."}
                     disabled={!isConnected || displayMicActive}
                     onKeyPress={handleInputKeyPress}
                 />
                 <button onClick={handleSendButtonClick} disabled={!isConnected || displayMicActive} title="Send Message">
                     <FaPaperPlane /> <span className="button-text">Send</span>
                 </button>
                 <button
                    onClick={handleToggleMic}
                    className={`control-btn mic-btn ${displayMicActive ? 'active' : ''} ${isMicSuspended && isMicActive ? 'suspended' : ''}`}
                    disabled={!isConnected}
                    title={displayMicActive ? "Mute Mic (Listening)" : (isMicSuspended && isMicActive ? "Resume Mic (Suspended)" : "Unmute Mic")}
                 >
                    {displayMicActive ? <FaMicrophone /> : <FaMicrophoneSlash />}
                    <span className="button-text">
                         {isMicActive ? (isMicSuspended ? ' (Susp.)' : ' (On)') : ' (Off)'}
                    </span>
                 </button>
                 <button
                    onClick={handleToggleCamera}
                    className={`control-btn cam-btn ${isCameraActive ? 'active' : ''} ${cameraError ? 'error' : ''}`}
                    disabled={!isConnected}
                    title={cameraError ? `Camera Error: ${cameraError}` : (isCameraActive ? 'Stop Camera' : 'Start Camera')}
                 >
                    {isCameraActive ? <FaVideo /> : <FaVideoSlash />}
                     <span className="button-text">
                         {isCameraActive ? ' (On)' : ' (Off)'}
                     </span>
                 </button>
                  <button
                    onClick={handleToggleScreenShare}
                    className={`control-btn screen-btn ${isScreenShareActive ? 'active' : ''} ${screenError ? 'error' : ''}`}
                    disabled={!isConnected}
                    title={screenError ? `Screen Share Error: ${screenError}` : (isScreenShareActive ? 'Stop Screen Share' : 'Start Screen Share')}
                 >
                     {isScreenShareActive ? <FaDesktop /> : <FaStopCircle /> /* Placeholder icon */}
                     <span className="button-text">
                          {isScreenShareActive ? ' (On)' : ' (Off)'}
                     </span>
                 </button>
            </footer>

            {/* Settings Dialog */}
             {isSettingsOpen && (
                 <SettingsDialog
                     isOpen={isSettingsOpen}
                     onClose={closeSettings}
                     initialSettings={settings}
                     onSave={(newSettings) => {
                         saveSettings(newSettings);
                         closeSettings();
                     }}
                     thresholds={thresholds}
                 />
             )}
        </div>
    );
}

export default App;