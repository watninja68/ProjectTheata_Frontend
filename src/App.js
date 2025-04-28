// src/App.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import './css/styles.css'; // Import global styles (Now contains the new theme)

// Only import components that you have actually implemented (assuming AudioVisualizerComponent exists)
import AudioVisualizerComponent from './components/AudioVisualizerComponent';
// Import SettingsDialog and Collapsible helper
import SettingsDialog from './components/SettingsDialog';
// Collapsible is now defined within SettingsDialog.js

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
            // Add a temporary ID for key prop
            return [...prev, { id: 'placeholder-' + Date.now(), sender: 'user', text: '🎤 Listening...', type: 'audio_input_placeholder', isStreaming: false }];
        });
       setLastUserMessageType('audio');
    }, []);

    const updateStreamingMessage = useCallback((transcriptChunk) => {
        const newFullTranscript = (currentTranscript + transcriptChunk).trimStart(); // Trim leading spaces only
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
        // Don't reset lastUserMessageType here, keep it until next message
    }, []);

     // Auto-scroll chat history
     useEffect(() => {
        if (chatHistoryRef.current) {
            // Optional: Add smooth scrolling
            // chatHistoryRef.current.scrollTo({ top: chatHistoryRef.current.scrollHeight, behavior: 'smooth' });
             chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
     }, [messages]); // Scroll whenever messages update


    // --- Agent Event Callbacks (Updated) ---
    useEffect(() => {
        // --- Transcription & Model Responses ---
        onTranscriptionRef.current = (transcript) => {
            // console.debug("App: onTranscription", transcript)
            if (!streamingMessageRef.current) {
                 // Starting a new message from the model
                 addMessage('model', transcript, true);
            } else {
                 // Append to existing streaming message
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
            setLastUserMessageType(null); // Reset type only when turn is fully complete
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
                     if (lastMsg?.sender !== 'user' || lastMsg?.type === 'text') { // Add placeholder if last wasn't user or was user text
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
             // console.log("User transcript:", transcript);
             // Example: Update a specific "user speaking" message or display elsewhere
             setMessages(prev => {
                 const lastMsg = prev[prev.length - 1];
                 if (lastMsg?.type === 'audio_input_placeholder') {
                     // Update the placeholder text
                     return prev.map(msg => msg.id === lastMsg.id ? { ...msg, text: `🎤 ${transcript}` } : msg);
                 } else if (lastMsg?.type === 'user_audio') {
                     // Append to existing audio message (if you create one)
                 } else {
                     // Or, if placeholder was removed but mic still on, add a new one
                     const placeholderExists = prev.some(msg => msg.type === 'audio_input_placeholder');
                     if (!placeholderExists && displayMicActive) {
                        // Create a new placeholder message containing the transcript
                        return [...prev, { id: 'placeholder-' + Date.now(), sender: 'user', text: `🎤 ${transcript}`, type: 'audio_input_placeholder', isStreaming: false }];
                     }
                 }
                 return prev; // No change if conditions aren't met
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
         const preview = document.getElementById('cameraPreview'); // Get element ref
        try {
            if (isCameraActive) {
                await stopCamera();
                 // Hide preview container manually if needed, CameraManager might do it
                 if (preview) preview.style.display = 'none';
            } else {
                await startCamera();
                // Show preview container, CameraManager might do it
                 if (preview) preview.style.display = 'block';
            }
        } catch (error) {
            console.error("App: Camera toggle error:", error);
            setCameraError(error.message);
            alert(`Camera error: ${error.message}. Please check permissions and ensure the camera is not in use by another application.`);
            // Ensure UI state reflects error (hook should set isCameraActive to false)
             if (preview) preview.style.display = 'none';
        }
    };

    const handleToggleScreenShare = async () => {
         if (!agent || !isConnected) return;
         setScreenError(null); // Clear previous screen errors
          const preview = document.getElementById('screenPreview'); // Get element ref
         try {
            if (isScreenShareActive) {
                await stopScreenShare();
                 // Hide preview container manually if needed, ScreenManager might do it
                 if (preview) preview.style.display = 'none';
            } else {
                await startScreenShare();
                 // Show preview container, ScreenManager might do it
                 if (preview) preview.style.display = 'block';
            }
         } catch (error) {
             console.error("App: Screen share toggle error:", error);
             setScreenError(error.message);
             alert(`Screen share error: ${error.message}. Please ensure you grant permission when prompted.`);
             // Ensure UI state reflects error (hook should set isScreenShareActive to false)
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

    // --- Ensure Preview Containers Exist (No change needed here) ---
    // useEffect(() => { ... }); // Keep the existing useEffect that creates preview divs if they don't exist

    // --- JSX Return (Updated with Icons and Classes) ---
    return (
        <div className="app-container">
            {/* Header */}
            <div className="app-header">
                <h1>Project Theata</h1> {/* Updated Title */}
                <div className="controls">
                    {!isConnected && <button onClick={handleConnect} disabled={isInitializing}>🔗 Connect</button>}
                    {isConnected && <button onClick={handleDisconnect}>🔌 Disconnect</button>}
                    <button onClick={openSettings} disabled={isInitializing || isConnected} title="Settings">⚙️</button> {/* Icon Only */}
                </div>
            </div>

            {/* Main Content Area */}
            <main className="main-content">
                {/* Chat History Area */}
                <div className="chat-area">
                    <div id="chatHistory" ref={chatHistoryRef} className="chat-history">
                        {messages.map(msg => (
                            <div
                                key={msg.id} /* Use unique ID */
                                className={`chat-message ${msg.sender === 'user' ? 'user-message' : 'model-message'} type-${msg.type || 'text'} ${msg.isStreaming ? 'streaming' : ''}`}
                            >
                                {msg.text}
                            </div>
                        ))}
                        {/* Auto-scroll element is implicitly handled by setting scrollTop */}
                    </div>

                    {/* Audio Visualizer (only if agent is initialized and connected) */}
                    {agent && agent.initialized && isConnected && <AudioVisualizerComponent agent={agent} />}
                </div>

                {/* Sidebar Area (For Previews) */}
                 <div className="sidebar">
                     <p>Media Previews</p>
                      {/* Preview divs are positioned by CSS now */}
                     <div id="cameraPreview"></div> {/* Managed by CameraManager/App.js */}
                     <div id="screenPreview"></div> {/* Managed by ScreenManager/App.js */}

                     {/* Switch camera button can be here or inside preview */}
                     {isCameraActive && /Mobi|Android/i.test(navigator.userAgent) &&
                        <button onClick={handleSwitchCamera} className="switch-camera-btn" title="Switch Camera">⟲</button>
                     }
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
                 <button onClick={() => { const input = document.getElementById('messageInput'); if (input && input.value.trim()) { handleSendMessage(input.value); input.value = ''; } }} disabled={!isConnected || displayMicActive} title="Send Message">
                    <span>Send</span> <span role="img" aria-label="send icon">➤</span> {/* Use span for icon */}
                 </button>
                 <button
                    onClick={handleToggleMic}
                    className={`control-btn mic-btn ${displayMicActive ? 'active' : ''} ${isMicSuspended && isMicActive ? 'suspended' : ''}`}
                    disabled={!isConnected}
                    title={displayMicActive ? "Mute Mic (Listening)" : (isMicSuspended && isMicActive ? "Resume Mic (Suspended)" : "Unmute Mic")}
                 >
                    <span role="img" aria-label="microphone icon">🎤</span>
                    {isMicActive ? (isMicSuspended ? ' (Suspended)' : ' (On)') : ' (Off)'}
                 </button>
                 <button
                    onClick={handleToggleCamera}
                    className={`control-btn cam-btn ${isCameraActive ? 'active' : ''} ${cameraError ? 'error' : ''}`}
                    disabled={!isConnected}
                    title={cameraError ? `Camera Error: ${cameraError}` : (isCameraActive ? 'Stop Camera' : 'Start Camera')}
                 >
                    <span role="img" aria-label="camera icon">📷</span>
                    {isCameraActive ? ' (On)' : ' (Off)'}
                 </button>
                  <button
                    onClick={handleToggleScreenShare}
                    className={`control-btn screen-btn ${isScreenShareActive ? 'active' : ''} ${screenError ? 'error' : ''}`}
                    disabled={!isConnected}
                    title={screenError ? `Screen Share Error: ${screenError}` : (isScreenShareActive ? 'Stop Screen Share' : 'Start Screen Share')}
                 >
                     <span role="img" aria-label="screen share icon">🖥️</span>
                     {isScreenShareActive ? ' (On)' : ' (Off)'}
                 </button>
            </footer>

            {/* Status/Error Indicators */}
            <div className="status-bar">
                {isInitializing && <span className="status status-initializing">Connecting...</span>}
                {agentError && <span className="status status-error">⚠️ Agent Error: {agentError}</span>}
                {cameraError && <span className="status status-warning">📷 Camera Error: {cameraError}</span>}
                {screenError && <span className="status status-warning">🖥️ Screen Error: {screenError}</span>}
                 {!isInitializing && !agentError && isConnected && <span className="status status-connected">🟢 Connected</span>}
                 {!isInitializing && !isConnected && !agentError && <span className="status status-disconnected">⚪ Disconnected</span>}
            </div>


            {/* Settings Dialog (No structural changes needed, styled via CSS) */}
             {isSettingsOpen && (
                 <SettingsDialog
                     isOpen={isSettingsOpen}
                     onClose={closeSettings}
                     initialSettings={settings}
                     onSave={(newSettings) => {
                         saveSettings(newSettings);
                         // Consider if reload is truly needed or if agent can reconfigure
                         // alert("Settings saved. Reloading for changes to take effect.");
                         // window.location.reload(); // Reload might still be needed for some settings
                         closeSettings(); // Close dialog after save
                     }}
                     thresholds={thresholds} // Pass thresholds map if needed by dialog
                 />
             )}
        </div>
    );
}

export default App;