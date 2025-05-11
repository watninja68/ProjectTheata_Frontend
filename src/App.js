// src/App.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
<<<<<<< Updated upstream
import './css/styles.css'; // Import global styles

// Import Icons from react-icons
=======
import "./App.css";
>>>>>>> Stashed changes
import {
    FaLink, FaUnlink, FaAtom, FaCog, FaPaperPlane, FaMicrophone, FaMicrophoneSlash,
    FaVideo, FaVideoSlash, FaDesktop, FaStopCircle, FaSyncAlt, FaExclamationTriangle,
    FaSpinner, FaCheckCircle, FaTimesCircle, FaSun, FaMoon, FaGoogle, FaSignOutAlt,
    FaUserCircle, FaTasks, FaChevronDown, FaChevronUp, FaPlusCircle // For manual task submit
} from 'react-icons/fa';

import AudioVisualizerComponent from './components/AudioVisualizerComponent';
import SettingsDialog from './components/SettingsDialog';
import { useSettings } from './hooks/useSettings';
import { useGeminiAgent } from './hooks/useGeminiAgent';
import { useAuth } from './hooks/useAuth';

const generateMsgId = () => `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function App() {
    const { session, user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
    const {
        settings, isSettingsOpen, saveSettings, openSettings, closeSettings,
        getGeminiConfig, getWebsocketUrl, thresholds, theme, toggleTheme
    } = useSettings();

    const {
        isConnected, isInitializing, error: agentError,
        manualTasks, // Renamed from delegatedTasks
        isMicActive: agentHookMicActive,
        isMicSuspended: agentHookMicSuspended,
        isCameraActive: agentHookCameraActive,
        isScreenShareActive: agentHookScreenShareActive,
        connectAgent, disconnectAgent,
        sendTextToMainAgent, // Renamed
        submitManualTask,    // New function
        toggleMic: agentToggleMic,
        startCamera: agentStartCamera,
        stopCamera: agentStopCamera,
        startScreenShare: agentStartScreenShare,
        stopScreenShare: agentStopScreenShare,
        onPrimaryAgentResponseRef,
        onTurnCompleteRef,
        onErrorRef,
        onManualTaskUpdateRef, // Renamed
        onUserTranscriptionRef,
        onMicStateChangedRef,
        onCameraStartedRef,
        onCameraStoppedRef,
        onScreenShareStartedRef,
        onScreenShareStoppedRef,
    } = useGeminiAgent(settings, getGeminiConfig, getWebsocketUrl, user, session);

    const [messages, setMessages] = useState([]);
    const [streamingMessageId, setStreamingMessageId] = useState(null);
    const chatHistoryRef = useRef(null);
    const [cameraError, setCameraError] = useState(null);
    const [screenError, setScreenError] = useState(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef(null);
    const profileIconRef = useRef(null);
    const [showTasksPanel, setShowTasksPanel] = useState(true);
    const [manualTaskInput, setManualTaskInput] = useState(""); // For the new input field

    const [uiMicActive, setUiMicActive] = useState(false);
    const [uiCameraActive, setUiCameraActive] = useState(false);
    const [uiScreenShareActive, setUiScreenShareActive] = useState(false);

    const canInteractWithMainAgent = session && isConnected && !isInitializing;
    // Manual tasks can potentially be submitted even if main agent isn't fully "connected",
    // as long as the backend is reachable and SSE can be established.
    const canSubmitManualTask = session && !authLoading && settings.goBackendBaseUrl;


    const showAuthSpinner = authLoading && !session;
    const showConnectPrompt = session && !isConnected && !isInitializing && !authLoading && !agentError;
    const showConnectError = session && agentError && !isConnected && !isInitializing && !authLoading;
    const profileImageUrl = user?.user_metadata?.avatar_url;

    const toggleProfileMenu = () => setIsProfileMenuOpen(prev => !prev);
    const toggleTasksPanel = () => setShowTasksPanel(prev => !prev);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isProfileMenuOpen &&
                profileMenuRef.current && !profileMenuRef.current.contains(event.target) &&
                profileIconRef.current && !profileIconRef.current.contains(event.target)) {
                setIsProfileMenuOpen(false);
            }
        };
        if (isProfileMenuOpen) { document.addEventListener('mousedown', handleClickOutside); }
        return () => { document.removeEventListener('mousedown', handleClickOutside); };
    }, [isProfileMenuOpen]);

    const addMessageToHistory = useCallback((sender, text, type = 'text', id = null, isStreaming = false) => {
        setMessages(prev => {
            const newMessage = {
                id: id || generateMsgId(),
                sender, text, type,
                timestamp: new Date().toISOString(),
                isStreaming
            };
            const filteredPrev = prev.filter(msg => !(msg.type === 'user_audio_placeholder' && sender === 'model'));
            return [...filteredPrev, newMessage];
        });
    }, []);

    const finalizeStream = useCallback((messageId) => {
        setMessages(prev => prev.map(msg =>
            msg.id === messageId ? { ...msg, isStreaming: false } : msg
        ));
        setStreamingMessageId(null);
    }, []);

    useEffect(() => {
        onPrimaryAgentResponseRef.current = (textChunk, isFinal) => {
            if (isFinal) {
                if (streamingMessageId) finalizeStream(streamingMessageId);
            } else {
                if (!streamingMessageId) {
                    const newId = generateMsgId();
                    addMessageToHistory('model', textChunk, 'text', newId, true);
                    setStreamingMessageId(newId);
                } else {
                    setMessages(prevMessages => prevMessages.map(msg =>
                        msg.id === streamingMessageId
                            ? { ...msg, text: (msg.text + textChunk).trimStart(), isStreaming: true }
                            : msg
                    ));
                }
            }
        };

        onTurnCompleteRef.current = () => {
            if (streamingMessageId) finalizeStream(streamingMessageId);
        };

        onErrorRef.current = (errorMessage) => {
            addMessageToHistory('system', `Error: ${errorMessage}`, 'error_message');
        };

        onManualTaskUpdateRef.current = (taskPayload) => {
            let taskMessage = `Task [${taskPayload.task_id?.slice(0,8) || 'New'}]: `;
            if (taskPayload.type === 'manual_task_submitted') {
                taskMessage += `${taskPayload.query ? `"${taskPayload.query.substring(0,30)}..."` : ''} Submitted. Status: ${taskPayload.status_text || 'Pending...'}`;
            } else if (taskPayload.type === 'manual_task_update') {
                taskMessage += `Status - ${taskPayload.status_text || 'Updating...'}`;
                if (taskPayload.progress !== undefined) taskMessage += ` (${taskPayload.progress}%)`;
            } else if (taskPayload.type === 'manual_task_result') {
                if (taskPayload.is_error) {
                    taskMessage += `Failed. Error: ${taskPayload.error_message || 'Unknown error'}`;
                } else {
                    taskMessage += `Completed. Result: ${taskPayload.result_data?.summary || JSON.stringify(taskPayload.result_data || "Done")}`;
                }
            } else { // For locally created error tasks
                 taskMessage += `Submission for "${taskPayload.query?.substring(0,30) || 'task'}" failed: ${taskPayload.error_message}`;
            }
            addMessageToHistory('system', taskMessage, 'task_update'); // Use a specific type for styling
        };


        onUserTranscriptionRef.current = (transcriptChunk) => {
            setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg?.type === 'user_audio_placeholder') {
                    return prev.map(msg => msg.id === lastMsg.id ? { ...msg, text: `${transcriptChunk}` } : msg);
                } else if (uiMicActive) {
                    const newId = `placeholder-${Date.now()}`;
                    return [...prev, { id: newId, sender: 'user', text: ` ${transcriptChunk}`, type: 'user_audio_placeholder', isStreaming: false }];
                }
                return prev;
            });
        };

        onMicStateChangedRef.current = (state) => {
             setUiMicActive(state.active && !state.suspended);
             if (state.active && !state.suspended) {
                setMessages(prev => {
                    if (!prev.some(m => m.type === 'user_audio_placeholder')) {
                        return [...prev, { id: generateMsgId(), sender: 'user', text: 'Listening...', type: 'user_audio_placeholder' }];
                    } return prev;
                });
             } else {
                 setMessages(prev => prev.filter(msg => msg.type !== 'user_audio_placeholder'));
             }
        };
        onCameraStartedRef.current = () => { setUiCameraActive(true); setCameraError(null);};
        onCameraStoppedRef.current = () => { setUiCameraActive(false);};
        onScreenShareStartedRef.current = () => { setUiScreenShareActive(true); setScreenError(null);};
        onScreenShareStoppedRef.current = () => { setUiScreenShareActive(false);};

    }, [addMessageToHistory, streamingMessageId, finalizeStream, uiMicActive]);

    useEffect(() => {
        if (chatHistoryRef.current) {
            chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
    }, [messages, manualTasks]);

    const handleConnectMainAgent = useCallback(() => { // Renamed
        if (!session) { alert("Please log in first to connect main agent."); return; }
        if (!isConnected && !isInitializing) {
            setCameraError(null); setScreenError(null); setMessages([]);
            connectAgent().catch(err => {}); // Error handled by onErrorRef
        }
    }, [session, isConnected, isInitializing, connectAgent]);

    const handleDisconnectMainAgent = useCallback(() => { // Renamed
        if (isConnected) {
            disconnectAgent();
            setMessages([]); setStreamingMessageId(null);
            setCameraError(null); setScreenError(null);
            setUiMicActive(false); setUiCameraActive(false); setUiScreenShareActive(false);
        }
    }, [isConnected, disconnectAgent]);

    const handleSendToMainAgent = useCallback((text) => { // Renamed
        const trimmedText = text.trim();
        if (trimmedText && canInteractWithMainAgent) {
            if (streamingMessageId) finalizeStream(streamingMessageId);
            addMessageToHistory('user', trimmedText, 'text');
            sendTextToMainAgent(trimmedText); // Use renamed function
        }
    }, [canInteractWithMainAgent, sendTextToMainAgent, addMessageToHistory, streamingMessageId, finalizeStream]);

    const handleMainInputKeyPress = useCallback((e) => { // Renamed
        if (e.key === 'Enter' && e.target.value.trim() && canInteractWithMainAgent && !uiMicActive) {
            handleSendToMainAgent(e.target.value);
            e.target.value = '';
        }
    }, [handleSendToMainAgent, canInteractWithMainAgent, uiMicActive]);

    const handleSendToMainAgentClick = useCallback(() => { // Renamed
        const input = document.getElementById('messageInput');
        if (input && input.value.trim() && canInteractWithMainAgent && !uiMicActive) {
            handleSendToMainAgent(input.value);
            input.value = '';
        }
    }, [handleSendToMainAgent, canInteractWithMainAgent, uiMicActive]);

    // --- Manual Task Submission Handler ---
    const handleManualTaskSubmit = useCallback(async () => {
        if (!manualTaskInput.trim() || !canSubmitManualTask) return;
        addMessageToHistory('user', `Manual Task: ${manualTaskInput}`, 'manual_task_submission');
        const taskId = await submitManualTask(manualTaskInput);
        if (taskId) {
            console.log("Manual task submitted, app received task ID:", taskId);
            // Updates will come via SSE and onManualTaskUpdateRef
        } else {
            // Error handled by submitManualTask in the hook (sets error state, calls onErrorRef)
            addMessageToHistory('system', `Failed to submit manual task: "${manualTaskInput}"`, 'error_message');
        }
        setManualTaskInput(""); // Clear input
    }, [manualTaskInput, submitManualTask, addMessageToHistory, canSubmitManualTask]);

    const handleManualTaskInputKeyPress = useCallback((e) => {
        if (e.key === 'Enter' && manualTaskInput.trim() && canSubmitManualTask) {
            handleManualTaskSubmit();
        }
    }, [handleManualTaskSubmit, manualTaskInput, canSubmitManualTask]);


    const handleToggleMic = useCallback(async () => {
        if (!session) { alert("Please log in to use the microphone."); return; }
        if (!isConnected) { alert("Please connect the main agent first to use its mic controls."); return; }
        try { await agentToggleMic(); }
        catch (err) { addMessageToHistory('system', `Mic error: ${err.message}`, 'error_message');}
    }, [session, isConnected, agentToggleMic, addMessageToHistory]);

    const handleToggleCamera = useCallback(async () => {
        if (!session) { alert("Please log in to use the camera."); return; }
        if (!isConnected) { alert("Please connect the main agent first for camera control."); return; }
        setCameraError(null);
        try {
            if (uiCameraActive) await agentStopCamera(); else await agentStartCamera();
        } catch (error) {
            setCameraError(error.message);
            addMessageToHistory('system', `Camera error: ${error.message}.`, 'error_message');
        }
    }, [session, isConnected, uiCameraActive, agentStartCamera, agentStopCamera, addMessageToHistory]);

    const handleToggleScreenShare = useCallback(async () => {
        if (!session) { alert("Please log in to use screen sharing."); return; }
        if (!isConnected) { alert("Please connect the main agent first for screen share control."); return; }
        setScreenError(null);
        try {
            if (uiScreenShareActive) await agentStopScreenShare(); else await agentStartScreenShare();
        } catch (error) {
            setScreenError(error.message);
            addMessageToHistory('system', `Screen share error: ${error.message}.`, 'error_message');
        }
    }, [session, isConnected, uiScreenShareActive, agentStartScreenShare, agentStopScreenShare, addMessageToHistory]);

    const handleSwitchCamera = useCallback(async () => {
        if (!session || !isConnected || !uiCameraActive) return;
        if (!/Mobi|Android/i.test(navigator.userAgent)) return;
        alert("Camera switching command needs backend implementation.");
    }, [session, isConnected, uiCameraActive]);

    const handleLogout = useCallback(() => {
        setIsProfileMenuOpen(false); signOut();
    }, [signOut]);

    const renderStatus = useCallback(() => {
        if (!session && !authLoading) return <span className="status status-disconnected"><FaTimesCircle /> Not Logged In</span>;
        if (authLoading) return <span className="status status-initializing"><FaSpinner className="fa-spin" /> Auth Loading...</span>;
        if (agentError && !isInitializing && !isConnected) return <span className="status status-error" title={agentError}><FaTimesCircle /> Agent Error</span>;
        if (isInitializing) return <span className="status status-initializing"><FaSpinner className="fa-spin" /> Connecting Main Agent...</span>;
        if (isConnected) return <span className="status status-connected"><FaCheckCircle /> Main Agent Connected</span>;
        return <span className="status status-disconnected"><FaTimesCircle /> Main Agent Disconnected</span>;
    }, [session, authLoading, agentError, isInitializing, isConnected]);

    const getUserDisplayName = useCallback(() => {
        if (!user) return "Guest";
        return user.user_metadata?.full_name || user.user_metadata?.name || user.email || "User";
    }, [user]);

    return (
        <div className="app-container">
            <div className="app-header">
                <div className="header-left"> <FaAtom /> <h1>Project Theta</h1> </div>
                <div className="header-center">
                    <div className="header-status">
                        {renderStatus()}
                        {canInteractWithMainAgent && cameraError && <span className="status status-warning" title={cameraError}><FaVideoSlash /> Cam Err</span>}
                        {canInteractWithMainAgent && screenError && <span className="status status-warning" title={screenError}><FaDesktop /> Screen Err</span>}
                    </div>
                </div>
                <div className="header-right controls">
                    {showAuthSpinner && <FaSpinner className="fa-spin" title="Loading..." />}
                    {!session && !authLoading && (<button onClick={signInWithGoogle} title="Login with Google"> <FaGoogle /> <span className="button-text">Login</span> </button>)}
                    {isConnected && session && (<button onClick={handleDisconnectMainAgent} title="Disconnect Main Agent"> <FaUnlink /> <span className="button-text">Disconnect</span> </button>)}
                    <button onClick={toggleTheme} title="Toggle Theme"> {theme === 'dark' ? <FaSun /> : <FaMoon />} </button>
                    {session && (
                        <div className="profile-container">
                            <button ref={profileIconRef} onClick={toggleProfileMenu} className="profile-btn" title="User Profile" aria-haspopup="true" aria-expanded={isProfileMenuOpen} >
                                {profileImageUrl ? (<img src={profileImageUrl} alt="User profile" className="profile-img" />) : (<FaUserCircle />)}
                            </button>
                            {isProfileMenuOpen && (
                                <div ref={profileMenuRef} className="profile-dropdown" role="menu">
                                    <div className="profile-user-info" role="menuitem"> Signed in as:<br /> <strong>{getUserDisplayName()}</strong> {user.email && <div className="profile-user-email">({user.email})</div>} </div>
                                    <hr className="profile-divider" />
                                    <button onClick={handleLogout} className="profile-logout-btn" role="menuitem"> <FaSignOutAlt /> Logout </button>
                                </div>
                            )}
                        </div>
                    )}
                    <button onClick={openSettings} disabled={isInitializing || isConnected || authLoading} title="Settings"> <FaCog /> </button>
                </div>
            </div>

            <main className="main-content">
                <div className="chat-area">
                    <div id="chatHistory" ref={chatHistoryRef} className="chat-history">
                        {!session && !authLoading && (<div className="chat-message system-message">Please log in to start.</div>)}
                        {authLoading && (<div className="chat-message system-message"><FaSpinner className="fa-spin" /> Checking auth...</div>)}
                        {showConnectPrompt && (
                            <div className="connect-prompt-container">
                                <p>Welcome, {getUserDisplayName()}!</p>
                                <p>Connect to the main voice agent to start the session.</p>
                                <button onClick={handleConnectMainAgent} className="connect-prompt-button"> <FaLink /> Connect Main Agent </button>
                            </div>
                        )}
                        {showConnectError && (
                            <div className="chat-message system-message error-message">
                                <FaExclamationTriangle /> Connection failed: {agentError}. <br /> Please check settings or try again.
                                <button onClick={handleConnectMainAgent} className="connect-prompt-button retry-button"> <FaSyncAlt /> Retry Connect </button>
                            </div>
                        )}
                        {isConnected && messages.map(msg => (
                            <div key={msg.id} className={`chat-message ${msg.sender}-message type-${msg.type} ${msg.isStreaming ? 'streaming' : ''}`} > {msg.text} </div>
                        ))}
                    </div>
                    {canInteractWithMainAgent && <AudioVisualizerComponent agent={null} /> }
                </div>

                <div className="sidebar">
                    {/* Manual Tasks Panel */}
                    <div className="manual-tasks-panel"> {/* Updated class name */}
                        <div className="panel-header" onClick={toggleTasksPanel}>
                            <p><FaTasks /> Manual Tasks ({Object.keys(manualTasks).length})</p>
                            <span>{showTasksPanel ? <FaChevronUp /> : <FaChevronDown />}</span>
                        </div>
                        {showTasksPanel && (
                            <div className="panel-content">
                                <div className="manual-task-input-area">
                                    <input
                                        type="text"
                                        placeholder="Enter manual task query..."
                                        value={manualTaskInput}
                                        onChange={(e) => setManualTaskInput(e.target.value)}
                                        onKeyPress={handleManualTaskInputKeyPress}
                                        disabled={!canSubmitManualTask}
                                    />
                                    <button onClick={handleManualTaskSubmit} disabled={!canSubmitManualTask || !manualTaskInput.trim()} title="Submit Manual Task">
                                        <FaPlusCircle />
                                    </button>
                                </div>
                                {Object.keys(manualTasks).length === 0 && <p className="no-tasks">No active manual tasks.</p>}
                                {Object.entries(manualTasks).map(([taskId, task]) => (
                                    <div key={taskId} className={`task-item task-type-${task.type} ${task.is_error ? 'task-error' : (task.type==='manual_task_result' && !task.is_error ? 'task-success' : '')}`}>
                                        <strong>ID: {taskId.slice(0,8)}...</strong>
                                        <p>Query: "{task.query ? task.query.substring(0,50) : (task.id === taskId ? 'Processing...' : 'N/A')}{task.query && task.query.length > 50 ? '...' : ''}"</p>
                                        <p>Status: {
                                            task.type === 'manual_task_submitted' ? (task.status_text || 'Submitted') :
                                            task.type === 'manual_task_update' ? (task.status_text || 'Updating...') :
                                            task.type === 'manual_task_result' ? (task.is_error ? `Failed: ${task.error_message || 'Unknown'}`: `Completed: ${task.result_data?.summary || JSON.stringify(task.result_data || "Done")}`) :
                                            task.status_text || 'Unknown' // Fallback for initial state before SSE update
                                        } {task.progress !== undefined ? `(${task.progress}%)` : ''}</p>
                                        <small>Last updated: {new Date(task.last_update).toLocaleTimeString()}</small>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <p>Media Previews (Main Agent)</p>
                    <div id="cameraPreview" style={{ display: uiCameraActive ? 'block' : 'none', backgroundColor: 'var(--bg-placeholder)' }}>
                        {uiCameraActive && <em style={{color: 'var(--text-secondary)', padding: '10px', display: 'block'}}>Camera active (preview from agent)</em>}
                    </div>
                    <div id="screenPreview" style={{ display: uiScreenShareActive ? 'block' : 'none', backgroundColor: 'var(--bg-placeholder)' }}>
                        {uiScreenShareActive && <em style={{color: 'var(--text-secondary)', padding: '10px', display: 'block'}}>Screen share active (preview from agent)</em>}
                    </div>
                    {uiCameraActive && /Mobi|Android/i.test(navigator.userAgent) && session &&
                        <button onClick={handleSwitchCamera} className="switch-camera-btn" title="Switch Camera"> <FaSyncAlt /> </button>
                    }
                </div>
            </main>

            <footer className="app-footer">
                <input id="messageInput" type="text"
                    placeholder={!session ? "Log in" : (!isConnected ? "Connect main agent" : (uiMicActive ? "Listening..." : "Chat with main agent..."))}
                    disabled={!canInteractWithMainAgent || uiMicActive || authLoading}
                    onKeyPress={handleMainInputKeyPress} />
                <button onClick={handleSendToMainAgentClick} disabled={!canInteractWithMainAgent || uiMicActive || authLoading} title="Send Message">
                    <FaPaperPlane /> <span className="button-text">Send</span>
                </button>
                <button onClick={handleToggleMic} className={`control-btn mic-btn ${uiMicActive ? 'active' : ''} ${(agentHookMicActive && agentHookMicSuspended) ? 'suspended' : ''}`} disabled={!canInteractWithMainAgent || authLoading} title={!session ? "Login" : (!isConnected ? "Connect First" : (uiMicActive ? "Mute" : "Unmute"))}>
                    {uiMicActive ? <FaMicrophone /> : <FaMicrophoneSlash />} <span className="button-text">{uiMicActive ? ' (On)' : ' (Off)'}</span> </button>
                <button onClick={handleToggleCamera} className={`control-btn cam-btn ${uiCameraActive ? 'active' : ''} ${cameraError ? 'error' : ''}`} disabled={!canInteractWithMainAgent || authLoading} title={!session ? "Login" : (!isConnected ? "Connect First" : (cameraError ? `Cam Err: ${cameraError}` : (uiCameraActive ? 'Stop Cam' : 'Start Cam')))}>
                    {uiCameraActive ? <FaVideo /> : <FaVideoSlash />} <span className="button-text">{uiCameraActive ? ' (On)' : ' (Off)'}</span> </button>
                <button onClick={handleToggleScreenShare} className={`control-btn screen-btn ${uiScreenShareActive ? 'active' : ''} ${screenError ? 'error' : ''}`} disabled={!canInteractWithMainAgent || authLoading} title={!session ? "Login" : (!isConnected ? "Connect First" : (screenError ? `Screen Err: ${screenError}` : (uiScreenShareActive ? 'Stop Screen' : 'Start Screen')))}>
                    {uiScreenShareActive ? <FaDesktop /> : <FaStopCircle />} <span className="button-text">{uiScreenShareActive ? ' (On)' : ' (Off)'}</span> </button>
            </footer>

            {isSettingsOpen && (<SettingsDialog isOpen={isSettingsOpen} onClose={closeSettings} initialSettings={settings} onSave={saveSettings} thresholds={thresholds} />)}
        </div>
    );
}

export default App;