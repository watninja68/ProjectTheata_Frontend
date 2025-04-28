import React, { useState, useEffect, useCallback, useRef } from 'react';
import './css/styles.css'; // Import global styles

// Only import components that you have actually implemented (assuming AudioVisualizerComponent exists)
import AudioVisualizerComponent from './components/AudioVisualizerComponent';
// Import SettingsDialog and Collapsible helper
import SettingsDialog from './components/SettingsDialog';
import Collapsible from './components/Collapsible'; // Assuming Collapsible is inside SettingsDialog.js or separate

// Keep hook imports
import { useSettings } from './hooks/useSettings';
import { useGeminiAgent } from './hooks/useGeminiAgent';

// Removed imports for: Header, Footer, ChatHistory, Sidebar, MediaControls, Preview (handled differently now)

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
        isMicActive, // Reflects agent.audioRecorder.isRecording
        isMicSuspended, // Reflects agent.audioRecorder.isSuspended
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
        onUserTranscriptionRef, // Add if using user transcription display
        onMicStateChangedRef,    // Add ref for mic state changes
        onCameraStartedRef,    // Add ref for camera start
        onCameraStoppedRef,    // Add ref for camera stop
        onScreenShareStartedRef, // Add ref for screen share start
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
        // type can be 'text', 'audio_input', 'image_input' etc. for different styling
        setMessages(prev => {
            const newMessage = { id: Date.now() + Math.random(), sender, text, isStreaming, type };
            if (sender === 'model' && isStreaming) {
                streamingMessageRef.current = newMessage.id;
            }
            // Filter out placeholder messages before adding new
             const filteredPrev = prev.filter(msg => !(msg.type === 'audio_input_placeholder' && sender === 'model'));
            return [...filteredPrev, newMessage];
        });
        if (sender === 'model' && isStreaming) {
            setCurrentTranscript(text);
        }
        setLastUserMessageType(sender === 'user' ? type : null); // Store type if user message
    }, []);

    const addUserAudioPlaceholder = useCallback(() => {
         // Check if the last message is already the placeholder
        setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.type === 'audio_input_placeholder') {
                return prev; // Don't add duplicates
            }
            return [...prev, { id: 'audio_placeholder_' + Date.now(), sender: 'user', text: '🎤...', type: 'audio_input_placeholder', isStreaming: false }];
        });
       setLastUserMessageType('audio');
    }, []);

    const updateStreamingMessage = useCallback((transcriptChunk) => {
        const newFullTranscript = (currentTranscript + transcriptChunk).trim(); // Trim leading/trailing spaces
        setCurrentTranscript(newFullTranscript); // Update state for next chunk
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
        setCurrentTranscript(''); // Reset transcript state
        setLastUserMessageType(null); // Reset last message type
    }, []);

     // Auto-scroll chat history
     useEffect(() => {
        if (chatHistoryRef.current) {
            chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
     }, [messages]); // Scroll whenever messages update


    // --- Agent Event Callbacks (Updated) ---
    useEffect(() => {
        // --- Transcription & Model Responses ---
        onTranscriptionRef.current = (transcript) => {
            // console.debug("App: onTranscription", transcript)
            if (!streamingMessageRef.current) {
                // If mic is active, assume this is response to user speech
                // Add placeholder only if model starts speaking *without* prior user text/audio indication
                 if (!lastUserMessageType && displayMicActive) {
                    // Replace placeholder with actual message
                    addMessage('model', transcript, true);
                 } else if (!lastUserMessageType && !displayMicActive) {
                     // Model started speaking without obvious user input (e.g., initial prompt)
                     addMessage('model', transcript, true);
                 } else {
                      // Model continues after user text/audio
                      addMessage('model', transcript, true);
                 }

            } else {
                updateStreamingMessage(' ' + transcript);
            }
        };
        onTextSentRef.current = (text) => {
            // console.debug("App: onTextSent", text)
            finalizeStreamingMessage(); // Finalize any previous model streaming
            addMessage('user', text, false, 'text'); // Add user text message
        };
        onInterruptedRef.current = () => {
            // console.debug("App: onInterrupted")
            finalizeStreamingMessage();
             // User interrupted, maybe show placeholder?
             if (displayMicActive) { // Only show if mic is actually on
                addUserAudioPlaceholder();
             }
        };
        onTurnCompleteRef.current = () => {
             // console.debug("App: onTurnComplete")
            finalizeStreamingMessage();
        };

        // --- Media State Changes ---
         onScreenShareStoppedRef.current = () => {
             console.log("Screen share stopped (event received in App)");
             // UI state is handled by the hook, maybe clear errors?
             setScreenError(null);
         };
         onMicStateChangedRef.current = (state) => {
             // console.debug("App: Mic state changed", state);
             // UI state is handled by the hook (isMicActive, isMicSuspended)
             // Show placeholder only when mic becomes active and un-suspended
             if (state.active && !state.suspended) {
                 // Check if the last message was from the user already
                 setMessages(prev => {
                     const lastMsg = prev[prev.length - 1];
                     if (lastMsg?.sender !== 'user') {
                         addUserAudioPlaceholder();
                     }
                     return prev;
                 });
             } else {
                 // Mic suspended or stopped, remove placeholder if present
                 setMessages(prev => prev.filter(msg => msg.type !== 'audio_input_placeholder'));
             }
         };
         // Add handlers for camera/screen start/stop if needed for UI feedback
         onCameraStartedRef.current = () => console.log("App: Camera Started");
         onCameraStoppedRef.current = () => console.log("App: Camera Stopped");
         onScreenShareStartedRef.current = () => console.log("App: Screen Share Started");

         // Optional: Handle user transcription display
         onUserTranscriptionRef.current = (transcript) => {
             console.log("User transcript:", transcript);
             // Example: Update a specific "user speaking" message or display elsewhere
             setMessages(prev => {
                 const lastMsg = prev[prev.length - 1];
                 if (lastMsg?.type === 'audio_input_placeholder') {
                     // Update the placeholder text
                     return prev.map(msg => msg.id === lastMsg.id ? { ...msg, text: `🎤... ${transcript}` } : msg);
                 } else if (lastMsg?.type === 'user_audio') {
                     // Append to existing audio message (if you create one)
                 }
                 // Or just log it for now
                 return prev;
             });
         };


    }, [addMessage, updateStreamingMessage, finalizeStreamingMessage, addUserAudioPlaceholder, lastUserMessageType, displayMicActive]); // Add displayMicActive dependency


    // --- UI Event Handlers (Updated for Errors) ---
    const handleConnect = () => {
        if (!isConnected && !isInitializing) { // Prevent multiple clicks
            // Clear previous errors on connect attempt
            setCameraError(null);
            setScreenError(null);
            connectAgent().catch(err => {
                // Catch connection errors shown to user
                console.error("App: Connection failed", err);
                // Error state is set within the hook, display agentError
            });
        }
    };
    const handleDisconnect = () => {
        if (isConnected) {
            disconnectAgent();
            setMessages([]); // Clear messages on disconnect
            setCurrentTranscript('');
            setLastUserMessageType(null);
            streamingMessageRef.current = null;
        }
    };
    const handleSendMessage = (text) => {
        if (text.trim() && agent && isConnected) {
             finalizeStreamingMessage(); // Finalize any model speech first
            sendText(text.trim());
            // User message added via onTextSentRef callback
        }
    };
    const handleToggleMic = () => {
        if (agent && isConnected) {
            toggleMic().catch(err => {
                 console.error("App: Toggle mic error", err);
                 alert(`Mic error: ${err.message}`);
            });
            // State change (placeholder etc.) handled by onMicStateChangedRef callback
        }
    };

    const handleToggleCamera = async () => {
        if (!agent || !isConnected) return;
        setCameraError(null); // Clear previous camera errors
        try {
            if (isCameraActive) {
                await stopCamera();
                 // Hide preview container manually if needed, CameraManager might do it
                 const preview = document.getElementById('cameraPreview');
                 if (preview) preview.style.display = 'none';
            } else {
                await startCamera();
                // Show preview container, CameraManager might do it
                 const preview = document.getElementById('cameraPreview');
                 if (preview) preview.style.display = 'block';
            }
        } catch (error) {
            console.error("App: Camera toggle error:", error);
            setCameraError(error.message);
            alert(`Camera error: ${error.message}. Please check permissions and ensure the camera is not in use by another application.`);
            // Ensure UI state reflects error (hook should set isCameraActive to false)
             const preview = document.getElementById('cameraPreview');
             if (preview) preview.style.display = 'none';
        }
    };

    const handleToggleScreenShare = async () => {
         if (!agent || !isConnected) return;
         setScreenError(null); // Clear previous screen errors
         try {
            if (isScreenShareActive) {
                await stopScreenShare();
                 // Hide preview container manually if needed, ScreenManager might do it
                 const preview = document.getElementById('screenPreview');
                 if (preview) preview.style.display = 'none';
            } else {
                await startScreenShare();
                 // Show preview container, ScreenManager might do it
                 const preview = document.getElementById('screenPreview');
                 if (preview) preview.style.display = 'block';
            }
         } catch (error) {
             console.error("App: Screen share toggle error:", error);
             setScreenError(error.message);
             alert(`Screen share error: ${error.message}. Please ensure you grant permission when prompted.`);
             // Ensure UI state reflects error (hook should set isScreenShareActive to false)
              const preview = document.getElementById('screenPreview');
              if (preview) preview.style.display = 'none';
         }
    };

    // Switch Camera (Example, needs CameraManager support)
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

    // Ensure preview containers exist (moved from App component useEffect to here)
    useEffect(() => {
        const ensurePreviewContainer = (id, styles) => {
             if (!document.getElementById(id)) {
                 const previewContainer = document.createElement('div');
                 previewContainer.id = id;
                 Object.assign(previewContainer.style, styles);
                 document.body.appendChild(previewContainer);
                 // Return cleanup function
                 return () => {
                    const el = document.getElementById(id);
                    if (el) el.remove();
                 };
             }
             return () => {}; // Return no-op cleanup if element exists
        };

        const camStyles = {
             position: 'fixed', bottom: '80px', right: '10px', // Position above footer
             width: '200px', height: '150px', zIndex: '1000',
             overflow: 'hidden', border: '1px solid #444',
             background: '#111', display: 'none' // Hidden by default
        };
        const screenStyles = {
             position: 'fixed', bottom: '80px', left: '10px', // Position above footer
             width: '240px', height: '135px', zIndex: '1000',
             overflow: 'hidden', border: '1px solid #444',
             background: '#111', display: 'none' // Hidden by default
        };

        const cleanupCam = ensurePreviewContainer('cameraPreview', camStyles);
        const cleanupScreen = ensurePreviewContainer('screenPreview', screenStyles);

        // Clean up on unmount
        return () => {
            cleanupCam();
            cleanupScreen();
        };
    }, []); // Empty dependency array ensures this runs only once on mount


    // --- JSX Return ---
    return (
        <div className="app-container">
            {/* Header */}
            <div className="app-header">
                <h1>Frontend</h1>
                <div className="controls">
                    {!isConnected && <button onClick={handleConnect} disabled={isInitializing}>Connect</button>}
                    {isConnected && <button onClick={handleDisconnect}>Disconnect</button>}
                    <button onClick={openSettings} disabled={isInitializing || isConnected} style={{ marginLeft: '10px' }}>Settings</button>
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
                        {/* Auto-scroll element is implicitly handled by setting scrollTop */}
                    </div>

                    {/* Audio Visualizer (only if agent is initialized) */}
                    {agent && agent.initialized && <AudioVisualizerComponent agent={agent} />}
                </div>

                {/* Sidebar Area (Placeholders for Previews) */}
                 <div className="sidebar">
                     {/* Previews will be absolutely positioned, but keep sidebar structure */}
                      {/* Camera Preview placeholder div (managed by CameraManager) */}
                     {/* <div id="cameraPreview"></div> handled by useEffect */}
                     {/* Screen Preview placeholder div (managed by ScreenManager) */}
                     {/* <div id="screenPreview"></div> handled by useEffect */}
                     {/* You could add other sidebar content here */}
                     <p>Previews:</p>
                     {isCameraActive && <button onClick={handleSwitchCamera} className="switch-camera-btn" title="Switch Camera (Mobile)">Switch Cam</button>}
                 </div>

            </main>

            {/* Footer with Input and Media Controls */}
            <footer className="app-footer">
                 <input
                     id="messageInput"
                     type="text"
                     placeholder={displayMicActive ? "Listening..." : "Type message or turn on mic..."}
                     disabled={!isConnected || displayMicActive} // Disable text input when mic is actively listening
                     onKeyPress={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { handleSendMessage(e.target.value); e.target.value = ''; } }}
                 />
                 <button onClick={() => { const input = document.getElementById('messageInput'); if (input && input.value.trim()) { handleSendMessage(input.value); input.value = ''; } }} disabled={!isConnected || displayMicActive}>Send</button>
                 <button
                    onClick={handleToggleMic}
                    className={`control-btn mic-btn ${displayMicActive ? 'active' : ''} ${isMicSuspended && isMicActive ? 'suspended' : ''}`}
                    disabled={!isConnected}
                    title={displayMicActive ? "Mute Mic (Listening)" : (isMicSuspended && isMicActive ? "Unmute Mic (Suspended)" : "Turn Mic On")}
                 >
                     Mic {isMicActive ? (isMicSuspended ? '(Suspended)' : '(On)') : '(Off)'}
                 </button>
                 <button
                    onClick={handleToggleCamera}
                    className={`control-btn cam-btn ${isCameraActive ? 'active' : ''} ${cameraError ? 'error' : ''}`}
                    disabled={!isConnected}
                    title={cameraError ? `Camera Error: ${cameraError}` : (isCameraActive ? 'Stop Camera' : 'Start Camera')}
                 >
                     Cam {isCameraActive ? '(On)' : '(Off)'}
                 </button>
                  <button
                    onClick={handleToggleScreenShare}
                    className={`control-btn screen-btn ${isScreenShareActive ? 'active' : ''} ${screenError ? 'error' : ''}`}
                    disabled={!isConnected}
                    title={screenError ? `Screen Share Error: ${screenError}` : (isScreenShareActive ? 'Stop Screen Share' : 'Start Screen Share')}
                 >
                     Screen {isScreenShareActive ? '(On)' : '(Off)'}
                 </button>
            </footer>

            {/* Status/Error Indicators */}
            <div className="status-bar">
                {isInitializing && <span className="status status-initializing">Connecting...</span>}
                {agentError && <span className="status status-error">Agent Error: {agentError}</span>}
                {cameraError && <span className="status status-warning">Camera Error: {cameraError}</span>}
                {screenError && <span className="status status-warning">Screen Error: {screenError}</span>}
                 {!isInitializing && !agentError && isConnected && <span className="status status-connected">Connected</span>}
                 {!isInitializing && !isConnected && !agentError && <span className="status status-disconnected">Disconnected</span>}
            </div>


            {/* Settings Dialog */}
             {isSettingsOpen && (
                 <SettingsDialog
                     isOpen={isSettingsOpen}
                     onClose={closeSettings}
                     initialSettings={settings}
                     onSave={(newSettings) => {
                         saveSettings(newSettings);
                         // Consider if reload is truly needed or if agent can reconfigure
                         // alert("Settings saved. Reloading for changes to take effect.");
                         // window.location.reload();
                         closeSettings(); // Close dialog after save
                     }}
                     thresholds={thresholds} // Pass thresholds map if needed by dialog
                 />
             )}
        </div>
    );
}

export default App;
