import React, { useState, useEffect, useCallback, useRef } from 'react';
import './css/styles.css'; // Import global styles

// Only import components that you have actually implemented (assuming AudioVisualizerComponent exists)
import AudioVisualizerComponent from './components/AudioVisualizerComponent';

// Keep hook imports
import { useSettings } from './hooks/useSettings';
import { useGeminiAgent } from './hooks/useGeminiAgent';

// Removed imports for: Header, Footer, ChatHistory, Sidebar, SettingsDialog

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
        // onUserTranscriptionRef,
    } = useGeminiAgent(settings, getGeminiConfig, getWebsocketUrl);

    // State management for messages and transcripts remains
    const [messages, setMessages] = useState([]);
    const [currentTranscript, setCurrentTranscript] = useState('');
    const [lastUserMessageType, setLastUserMessageType] = useState(null);
    const streamingMessageRef = useRef(null);

    // Add new state for camera error
    const [cameraError, setCameraError] = useState(null);

    // --- Chat Management Logic (remains the same) ---
    const addMessage = useCallback((sender, text, isStreaming = false) => {
        setMessages(prev => {
            const newMessage = { id: Date.now() + Math.random(), sender, text, isStreaming };
            if (sender === 'model' && isStreaming) {
                streamingMessageRef.current = newMessage.id;
            }
            return [...prev, newMessage];
        });
        if (sender === 'model' && isStreaming) {
            setCurrentTranscript(text);
        }
        setLastUserMessageType(sender === 'user' ? 'text' : null);
    }, []);

    const addUserAudioMessage = useCallback(() => {
        addMessage('user', 'User sent audio');
       setLastUserMessageType('audio');
    }, [addMessage]);

    const updateStreamingMessage = useCallback((transcriptChunk) => {
        const newFullTranscript = currentTranscript + transcriptChunk;
        setCurrentTranscript(newFullTranscript);
        setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageRef.current
                ? { ...msg, text: newFullTranscript.trim(), isStreaming: true }
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
        setLastUserMessageType(null);
    }, []);


    // --- Agent Event Callbacks (remains the same) ---
    useEffect(() => {
        onTranscriptionRef.current = (transcript) => {
            if (!streamingMessageRef.current) {
                if (!lastUserMessageType) {
                    addUserAudioMessage();
                 }
                addMessage('model', transcript, true);
            } else {
                updateStreamingMessage(' ' + transcript);
            }
        };
        onTextSentRef.current = (text) => {
            finalizeStreamingMessage();
            addMessage('user', text);
        };
        onInterruptedRef.current = () => {
            finalizeStreamingMessage();
             if (!lastUserMessageType) {
                 addUserAudioMessage();
             }
        };
        onTurnCompleteRef.current = () => {
            finalizeStreamingMessage();
        };
        onScreenShareStoppedRef.current = () => {
             console.log("Screen share stopped (event received in App)");
        };
    }, [addMessage, updateStreamingMessage, finalizeStreamingMessage, addUserAudioMessage, lastUserMessageType]);

    // --- UI Event Handlers (mostly the same, camera handler updated) ---
    const handleConnect = () => {
        if (!isConnected) {
            connectAgent();
        }
    };
    const handleDisconnect = () => {
        if (isConnected) {
            disconnectAgent();
            setMessages([]);
        }
    };
    const handleSendMessage = (text) => {
        if (text.trim() && agent) {
            sendText(text.trim());
        }
    };
    const handleToggleMic = () => {
        toggleMic();
    };

    // Modify the handleToggleCamera function to include error handling
    const handleToggleCamera = async () => {
        try {
            setCameraError(null); // Clear any previous errors
            if (isCameraActive) {
                stopCamera();
            } else {
                await startCamera();
            }
        } catch (error) {
            console.error("Camera toggle error:", error);
            setCameraError(error.message);
            // Provide user feedback about the camera error
            alert(`Camera error: ${error.message}. Please check your camera permissions and try again.`);
        }
    };

    const cameraStream = agent?.cameraManager?.stream || null; // Keep for potential direct use later
    const screenStream = agent?.screenManager?.stream || null; // Keep for potential direct use later

    const handleSwitchCamera = useCallback(async () => {
        if (agent?.cameraManager) {
             try { await agent.cameraManager.switchCamera(); }
             catch (e) { console.error("Error switching camera:", e); }
        }
    }, [agent]);

    const handleToggleScreenShare = () => {
        if (isScreenShareActive) stopScreenShare(); else startScreenShare();
    };

    // Add a useEffect to automatically create a camera preview container if it doesn't exist
    useEffect(() => {
        if (!document.getElementById('cameraPreview')) {
            const previewContainer = document.createElement('div');
            previewContainer.id = 'cameraPreview';
            previewContainer.style.position = 'fixed';
            previewContainer.style.bottom = '10px';
            previewContainer.style.right = '10px';
            previewContainer.style.width = '200px';
            previewContainer.style.height = '150px';
            previewContainer.style.zIndex = '1000';
            previewContainer.style.overflow = 'hidden';
            previewContainer.style.border = '1px solid #444';
            previewContainer.style.background = '#111'; // Added a background for visibility
            previewContainer.style.display = 'none'; // Hidden by default
            document.body.appendChild(previewContainer);

            // Clean up function
            return () => {
                const el = document.getElementById('cameraPreview');
                if (el) {
                    el.remove();
                }
            };
        }
    }, []); // Empty dependency array ensures this runs only once on mount


    // --- Simplified JSX Return (with updated camera button and error display) ---
    return (
        <div className="app-container">
            {/* Placeholder for Header */}
            <div style={{ padding: '10px', background: '#2a2a2a', borderBottom: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Gemini Live Agent (React)</h1>
                <div>
                    {!isConnected && <button onClick={handleConnect} disabled={isInitializing}>Connect</button>}
                    {isConnected && <button onClick={handleDisconnect}>Disconnect</button>}
                    <button onClick={openSettings} style={{ marginLeft: '10px' }}>Settings</button>
                </div>
            </div>

            <main className="main-content">
                <div className="chat-area">
                    {/* Placeholder for ChatHistory - Render messages directly */}
                    <div id="chatHistory" className="chat-history" style={{ height: 'calc(100% - 120px)', overflowY: 'auto', padding: '20px' }}>
                        {messages.map(msg => (
                            <div
                                key={msg.id}
                                className={`chat-message ${msg.sender === 'user' ? 'user-message' : 'model-message'} ${msg.isStreaming ? 'streaming' : ''}`}
                            >
                                {msg.text}
                            </div>
                        ))}
                         <div style={{ float:"left", clear: "both" }} ref={(el) => { el?.scrollIntoView({ behavior: "smooth" }); }}> {/* Auto-scroll element */}
                         </div>
                    </div>

                    {/* Render visualizer if agent is ready */}
                     {agent && <AudioVisualizerComponent agent={agent} />}
                </div>

                {/* Placeholder for Sidebar - Add later */}
                {/* <div className="sidebar"> ... </div> */}
            </main>

            {/* Placeholder for Footer - Basic controls */}
            <div className="app-footer" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                 <input
                     type="text"
                     placeholder="Type message..."
                     onKeyPress={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { handleSendMessage(e.target.value); e.target.value = ''; } }} // Clear input on send
                     style={{ flexGrow: 1, padding: '10px' }}
                 />
                 {/* Updated Send button to correctly reference the input */}
                 <button onClick={(e) => { const input = e.target.previousElementSibling; if (input && input.value.trim()) { handleSendMessage(input.value); input.value = ''; }}}>Send</button>
                 <button onClick={handleToggleMic} className={`control-btn ${isMicActive && !isMicSuspended ? 'active' : ''}`}>Mic</button>
                 {/* Updated Camera button with error state */}
                 <button
                    onClick={handleToggleCamera}
                    className={`control-btn ${isCameraActive ? 'active' : ''} ${cameraError ? 'error' : ''}`} // Add 'error' class if cameraError exists
                    title={cameraError ? `Camera error: ${cameraError}` : (isCameraActive ? 'Stop Camera' : 'Start Camera')} // Show error in title
                 >
                     Cam
                 </button>
                 <button onClick={handleToggleScreenShare} className={`control-btn ${isScreenShareActive ? 'active' : ''}`}>Screen</button>
                 {/* Optional: Add Switch Camera button if needed */}
                 {/* {isCameraActive && <button onClick={handleSwitchCamera} className="control-btn">Switch Cam</button>} */}
            </div>


            {/* Status indicators (with added camera error) */}
            {agentError && <div style={{ color: 'red', textAlign: 'center', padding: '5px', background: '#333' }}>Error: {agentError}</div>}
            {cameraError && <div style={{ color: 'orange', textAlign: 'center', padding: '5px', background: '#333' }}>Camera error: {cameraError}</div>}
            {isInitializing && <div style={{ textAlign: 'center', padding: '5px', background: '#333' }}>Connecting...</div>}

            {/* Rudimentary settings display/trigger */}
             {isSettingsOpen && (
                 <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999 }} onClick={closeSettings}>
                     <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#333', padding: '20px', border: '1px solid #555', color: '#eee', zIndex: 1000 }} onClick={e => e.stopPropagation()}>
                         <h2>Settings (Basic - Implement SettingsDialog)</h2>
                         <p>API Key: {settings.apiKey ? '********' : 'Not Set'}</p>
                         {/* Add more settings display as needed */}
                         <pre style={{ background: '#222', padding: '10px', maxHeight: '200px', overflow: 'auto' }}>{JSON.stringify(settings, null, 2)}</pre>
                         <button onClick={closeSettings}>Close (No Save)</button>
                         {/* Add inputs and save button when SettingsDialog is implemented */}
                         {/* Example:
                         <button onClick={() => {
                             const newSettings = { ...settings, someValue: 'new' };
                             saveSettings(newSettings);
                             closeSettings();
                         }}>Save Example</button>
                         */}
                     </div>
                 </div>
             )}
        </div>
    );
}

export default App;
