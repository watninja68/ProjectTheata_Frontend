// src/App.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import './css/styles.css'; // Import global styles (Now contains the new theme)

// Only import components that you have actually implemented
import AudioVisualizerComponent from './components/AudioVisualizerComponent';
import SettingsDialog from './components/SettingsDialog';
// Preview component might be useful if its logic becomes complex
// import Preview from './components/Preview';

// Keep hook imports
import { useSettings } from './hooks/useSettings';
import { useGeminiAgent } from './hooks/useGeminiAgent';

// Removed imports for integrated components

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
    const chatHistoryRef = useRef(null); // Ref for scrolling chat history

    // Add new state for camera/screen errors and specific mic state
    const [cameraError, setCameraError] = useState(null);
    const [screenError, setScreenError] = useState(null);
    // Use derived state from hook for mic status display
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
            return [...prev, { id: 'placeholder-' + Date.now(), sender: 'user', text: '🎤 Listening...', type: 'audio_input_placeholder', isStreaming: false }];
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
             // Hide preview manually if ScreenManager's cleanup didn't
             const preview = document.getElementById('screenPreview');
             if (preview) preview.style.display = 'none';
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
         onCameraStartedRef.current = () => {
            console.log("App: Camera Started");
            const preview = document.getElementById('cameraPreview');
            if(preview) preview.style.display = 'block';
         };
         onCameraStoppedRef.current = () => {
            console.log("App: Camera Stopped");
            const preview = document.getElementById('cameraPreview');
            if(preview) preview.style.display = 'none';
            setCameraError(null); // Clear errors when stopped
         };
         onScreenShareStartedRef.current = () => {
            console.log("App: Screen Share Started");
            const preview = document.getElementById('screenPreview');
            if(preview) preview.style.display = 'block';
         };

         // Optional: Handle user transcription display
         onUserTranscriptionRef.current = (transcript) => {
             setMessages(prev => {
                 const lastMsg = prev[prev.length - 1];
                 if (lastMsg?.type === 'audio_input_placeholder') {
                     return prev.map(msg => msg.id === lastMsg.id ? { ...msg, text: `🎤 ${transcript}` } : msg);
                 } else if (displayMicActive && !prev.some(msg => msg.type === 'audio_input_placeholder')) {
                     return [...prev, { id: 'placeholder-' + Date.now(), sender: 'user', text: `🎤 ${transcript}`, type: 'audio_input_placeholder', isStreaming: false }];
                 }
                 return prev;
             });
         };


    }, [addMessage, updateStreamingMessage, finalizeStreamingMessage, addUserAudioPlaceholder, lastUserMessageType, displayMicActive]); // Add displayMicActive dependency


    // --- UI Event Handlers (Updated for Errors) ---
    const handleConnect = () => {
        if (!isConnected && !isInitializing) {
            setCameraError(null);
            setScreenError(null);
            connectAgent().catch(err => {
                console.error("App: Connection failed", err);
                // Error state is set within the hook, displayed via agentError in status bar
            });
        }
    };
    const handleDisconnect = () => {
        if (isConnected) {
            disconnectAgent();
            setMessages([]);
            setCurrentTranscript('');
            setLastUserMessageType(null);
            streamingMessageRef.current = null;
            // Ensure previews are hidden on disconnect
             const camPreview = document.getElementById('cameraPreview');
             const screenPreview = document.getElementById('screenPreview');
             if (camPreview) camPreview.style.display = 'none';
             if (screenPreview) screenPreview.style.display = 'none';
        }
    };
    const handleSendMessage = (text) => {
        if (text.trim() && agent && isConnected) {
             finalizeStreamingMessage();
             sendText(text.trim());
             // User message added via onTextSentRef callback
             // Clear input after sending
             const input = document.getElementById('messageInput');
             if (input) input.value = '';
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
        // Previews are managed by CameraManager's initialize/dispose and show/hide methods now
        try {
            if (isCameraActive) {
                await stopCamera();
            } else {
                await startCamera();
            }
        } catch (error) {
            console.error("App: Camera toggle error:", error);
            setCameraError(error.message);
            alert(`Camera error: ${error.message}. Please check permissions and ensure the camera is not in use by another application.`);
            // Ensure preview is hidden on error
            const preview = document.getElementById('cameraPreview');
            if (preview) preview.style.display = 'none';
        }
    };

    const handleToggleScreenShare = async () => {
         if (!agent || !isConnected) return;
         setScreenError(null);
         // Previews are managed by ScreenManager's initialize/dispose and show/hide methods now
         try {
            if (isScreenShareActive) {
                await stopScreenShare();
            } else {
                await startScreenShare();
            }
         } catch (error) {
             console.error("App: Screen share toggle error:", error);
             setScreenError(error.message);
             alert(`Screen share error: ${error.message}. Please ensure you grant permission when prompted.`);
             // Ensure preview is hidden on error
            const preview = document.getElementById('screenPreview');
            if (preview) preview.style.display = 'none';
         }
    };

    // Switch Camera
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

     // Ensure Preview Containers Exist (Optional Check - CSS handles display)
     useEffect(() => {
         if (!document.getElementById('cameraPreview')) {
             const div = document.createElement('div');
             div.id = 'cameraPreview';
             // Find sidebar to append to, or body as fallback
             const sidebar = document.querySelector('.sidebar');
             if (sidebar) sidebar.appendChild(div);
             else document.body.appendChild(div); // Fallback, might not be styled ideally
         }
          if (!document.getElementById('screenPreview')) {
             const div = document.createElement('div');
             div.id = 'screenPreview';
             const sidebar = document.querySelector('.sidebar');
             if (sidebar) sidebar.appendChild(div);
             else document.body.appendChild(div);
         }
     }, []);


    // --- JSX Return (Updated with New Structure and Classes) ---
    return (
        <div className="app-container">
            {/* Header */}
            <header className="app-header">
                <h1>Project Theata</h1>
                <div className="controls">
                    {!isConnected && <button onClick={handleConnect} disabled={isInitializing}>🔗 Connect</button>}
                    {isConnected && <button onClick={handleDisconnect}>🔌 Disconnect</button>}
                    <button onClick={openSettings} disabled={isInitializing || isConnected} title="Settings">⚙️</button>
                </div>
            </header>

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

                    {/* Audio Visualizer (only if agent is initialized and connected) */}
                    {agent && agent.initialized && isConnected && agent.audioStreamer && <AudioVisualizerComponent agent={agent} />}
                </div>

                {/* Sidebar Area (For Previews) */}
                 <aside className="sidebar">
                     <p>Media Previews</p>
                     {/* Preview divs are positioned by CSS now, Camera/Screen managers add video element */}
                     <div id="cameraPreview" className="preview">
                         {/* Video element added by CameraManager */}
                         {/* Switch button added by CameraManager or here */}
                         {isCameraActive && /Mobi|Android/i.test(navigator.userAgent) && (
                             <button onClick={handleSwitchCamera} className="camera-switch-btn" title="Switch Camera">⟲</button>
                         )}
                     </div>
                     <div id="screenPreview" className="preview">
                         {/* Video element added by ScreenManager */}
                     </div>
                 </aside>
            </main>

            {/* Footer with Input and Media Controls */}
            <footer className="app-footer">
                 <input
                     id="messageInput"
                     type="text"
                     placeholder={displayMicActive ? "🎤 Listening... Type to interrupt." : "Type your message here..."}
                     disabled={!isConnected} // Allow typing even when mic is active to interrupt
                     onKeyPress={(e) => { if (e.key === 'Enter') handleSendMessage(e.target.value); }}
                     // Consider adding onChange handler if you need live input value
                 />
                 <button onClick={() => handleSendMessage(document.getElementById('messageInput').value)} disabled={!isConnected} title="Send Message">
                    <span>Send</span> <span role="img" aria-label="send icon">➤</span>
                 </button>
                 {/* Media Controls */}
                 <button
                    onClick={handleToggleMic}
                    className={`control-btn mic-btn ${displayMicActive ? 'active' : ''} ${isMicSuspended && isMicActive ? 'suspended' : ''}`}
                    disabled={!isConnected}
                    title={displayMicActive ? "Mute Mic (Listening)" : (isMicSuspended && isMicActive ? "Resume Mic (Suspended)" : "Unmute Mic")}
                 >
                    <span role="img" aria-label="microphone icon">🎤</span>
                    {/* Text hidden on mobile via CSS */}
                    <span>{isMicActive ? (isMicSuspended ? 'Suspended' : 'On') : 'Off'}</span>
                 </button>
                 <button
                    onClick={handleToggleCamera}
                    className={`control-btn cam-btn ${isCameraActive ? 'active' : ''} ${cameraError ? 'error' : ''}`}
                    disabled={!isConnected}
                    title={cameraError ? `Camera Error: ${cameraError}` : (isCameraActive ? 'Stop Camera' : 'Start Camera')}
                 >
                    <span role="img" aria-label="camera icon">📷</span>
                    <span>{isCameraActive ? 'On' : 'Off'}</span>
                 </button>
                  <button
                    onClick={handleToggleScreenShare}
                    className={`control-btn screen-btn ${isScreenShareActive ? 'active' : ''} ${screenError ? 'error' : ''}`}
                    disabled={!isConnected}
                    title={screenError ? `Screen Share Error: ${screenError}` : (isScreenShareActive ? 'Stop Screen Share' : 'Start Screen Share')}
                 >
                     <span role="img" aria-label="screen share icon">🖥️</span>
                     <span>{isScreenShareActive ? 'On' : 'Off'}</span>
                 </button>
            </footer>

            {/* Status/Error Indicators */}
            <div className="status-bar">
                {isInitializing && <span className="status status-initializing">Connecting...</span>}
                {agentError && <span className="status status-error">⚠️ Agent Error: {agentError}</span>}
                {cameraError && <span className="status status-warning">📷 Camera Error</span>} {/* Keep brief */}
                {screenError && <span className="status status-warning">🖥️ Screen Error</span>} {/* Keep brief */}
                 {!isInitializing && !agentError && isConnected && <span className="status status-connected">🟢 Connected</span>}
                 {!isInitializing && !isConnected && !agentError && <span className="status status-disconnected">⚪ Disconnected</span>}
            </div>


            {/* Settings Dialog */}
             {isSettingsOpen && (
                 <SettingsDialog
                     isOpen={isSettingsOpen}
                     onClose={closeSettings}
                     initialSettings={settings}
                     onSave={(newSettings) => {
                         saveSettings(newSettings);
                         // Reload is handled by useSettings hook
                     }}
                     thresholds={thresholds}
                 />
             )}
        </div>
    );
}

export default App;