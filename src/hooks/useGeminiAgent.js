// src/hooks/useGeminiAgent.js
import { useState, useEffect, useRef, useCallback } from 'react';
<<<<<<< Updated upstream
<<<<<<< Updated upstream
import { GeminiAgent } from '../lib/main/agent';
import { ToolManager } from '../lib/tools/tool-manager';
import { GoogleSearchTool } from '../lib/tools/google-search'; // Assuming this exists
import { WolframAlphaTool } from "../lib/tools/wolf-from-alpha.js"

export const useGeminiAgent = (settings, getGeminiConfig, getWebsocketUrl) => {
    const [agent, setAgent] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    // --- State derived from agent/recorder/managers ---
    const [isMicActive, setIsMicActive] = useState(false); // True if recorder is started (even if suspended)
    const [isMicSuspended, setIsMicSuspended] = useState(true); // True if mic input is paused
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isScreenShareActive, setIsScreenShareActive] = useState(false);
    // --- Error state ---
    const [error, setError] = useState(null);

    // Store callbacks in refs to avoid dependency issues in useEffect/useCallback
    // These refs are set by the consuming component (App.js)
    const onTranscriptionRef = useRef(null); // For UI display of model speech
    const onUserTranscriptionRef = useRef(null); // For UI display of user speech
    const onTranscriptForBackendRef = useRef(null); // <<< NEW: For sending any transcript to backend
    const onTextSentRef = useRef(null);
    const onInterruptedRef = useRef(null);
    const onTurnCompleteRef = useRef(null);
    const onScreenShareStoppedRef = useRef(null);
    const onErrorRef = useRef(null); // General error callback
    const onMicStateChangedRef = useRef(null); // Callback for mic state changes
    const onCameraStartedRef = useRef(null);
    const onCameraStoppedRef = useRef(null);
    const onScreenShareStartedRef = useRef(null);


    // Tool Manager Setup
    const toolManager = useRef(null); // Initialize as null
    useEffect(() => {
        // Initialize ToolManager only once
        if (!toolManager.current) {
             toolManager.current = new ToolManager();
             toolManager.current.registerTool('googleSearch', new GoogleSearchTool());

             toolManager.current.registerTool('wolframalpha', new WolframAlphaTool());
             // Register other tools if needed
             console.log("ToolManager initialized and tools registered.");
        }
    }, []); // Empty dependency array ensures this runs only once

    // --- Agent Connection and Initialization ---
    const connectAgent = useCallback(async () => {
        if (agent || isInitializing || isConnected) {
            console.warn("Connect cancelled: Agent exists, is initializing, or already connected.");
=======

export const useGeminiAgent = (settings, getGeminiConfig, getWebsocketUrl, authUser, authSession) => {
    const [isConnected, setIsConnected] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
=======

export const useGeminiAgent = (settings, getGeminiConfig, getWebsocketUrl, authUser, authSession) => {
    const [isConnected, setIsConnected] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
>>>>>>> Stashed changes
    const [error, setError] = useState(null);
    const eventSourceRef = useRef(null);
    const currentSessionIdRef = useRef(null);

    const [manualTasks, setManualTasks] = useState({});

    const [isMicActive, setIsMicActive] = useState(false);
    const [isMicSuspended, setIsMicSuspended] = useState(true);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isScreenShareActive, setIsScreenShareActive] = useState(false);

    const onPrimaryAgentResponseRef = useRef(null);
    const onTurnCompleteRef = useRef(null);
    const onErrorRef = useRef(null);
    const onManualTaskUpdateRef = useRef(null);
    const onUserTranscriptionRef = useRef(null);
    const onMicStateChangedRef = useRef(null);
    const onCameraStartedRef = useRef(null);
    const onCameraStoppedRef = useRef(null);
    const onScreenShareStartedRef = useRef(null);
    const onScreenShareStoppedRef = useRef(null);

    const goBackendUrl = settings.goBackendBaseUrl;

    // --- Define disconnectSSE and connectSSE first ---
    const disconnectSSE = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
            console.log("[SSE] Disconnected.");
        }
    }, []); // No dependencies needed for disconnectSSE itself

    const connectSSE = useCallback(() => {
        if (!goBackendUrl) {
            console.error("[SSE] Go backend URL is not configured.");
            setError("SSE URL not configured.");
            onErrorRef.current?.("SSE URL not configured.");
            return;
        }
        if (eventSourceRef.current && eventSourceRef.current.readyState !== EventSource.CLOSED) {
            console.warn("[SSE] Attempted to connect SSE, but already connected or connecting.");
            return;
        }

        const sseUrl = `${goBackendUrl}/api/agent/events?session_id=${currentSessionIdRef.current || 'general'}`;
        console.log(`[SSE] Connecting to ${sseUrl}`);
        const es = new EventSource(sseUrl, { withCredentials: true });

        es.onopen = () => {
            console.log("[SSE] Connection established.");
            setError(null);
        };

        es.onmessage = (event) => {
            try {
                const eventData = JSON.parse(event.data);
                console.log("[SSE] Received data:", eventData);

                switch (eventData.type) {
                    case 'connection_ack':
                        console.log("[SSE] Connection Acknowledged by backend:", eventData.payload);
                        if(eventData.payload && eventData.payload.session_id) {
                            if (!currentSessionIdRef.current) {
                                currentSessionIdRef.current = eventData.payload.session_id;
                                console.log("[SSE] Main agent session_id set/confirmed by SSE ack:", currentSessionIdRef.current);
                            }
                        }
                        break;
                    case 'main_agent_response_chunk':
                        onPrimaryAgentResponseRef.current?.(eventData.payload.text_chunk, false);
                        break;
                    case 'main_agent_audio_chunk':
                        console.log("[SSE] Received audio chunk (playback not implemented in this hook yet).");
                        break;
                    case 'main_agent_turn_complete':
                        onPrimaryAgentResponseRef.current?.("", true);
                        onTurnCompleteRef.current?.();
                        break;
                    case 'manual_task_submitted':
                    case 'manual_task_update':
                    case 'manual_task_result':
                        setManualTasks(prevTasks => ({
                            ...prevTasks,
                            [eventData.payload.task_id]: {
                                ...(prevTasks[eventData.payload.task_id] || {}),
                                ...eventData.payload,
                                type: eventData.type,
                                last_update: new Date().toISOString(),
                            }
                        }));
                        onManualTaskUpdateRef.current?.(eventData.payload);
                        break;
                    case 'agent_error':
                        console.error("[SSE] Agent error from backend:", eventData.payload.message);
                        setError(eventData.payload.message);
                        onErrorRef.current?.(eventData.payload.message);
                        break;
                    case 'user_transcript_chunk':
                        onUserTranscriptionRef.current?.(eventData.payload.text_chunk);
                        break;
                    default:
                        console.warn("[SSE] Received unhandled event type:", eventData.type);
                }
            } catch (e) {
                console.error("[SSE] Error parsing message or handling event:", e, event.data);
            }
        };

        es.onerror = (err) => {
            console.error("[SSE] EventSource error:", err);
            setError("SSE connection error.");
            onErrorRef.current?.("SSE connection error.");
            if (es) es.close();
            eventSourceRef.current = null;
        };

        eventSourceRef.current = es;
    }, [goBackendUrl, onErrorRef, onPrimaryAgentResponseRef, onTurnCompleteRef, onManualTaskUpdateRef, onUserTranscriptionRef]); // Dependencies for connectSSE


    // --- Agent Lifecycle ---
    const connectAgent = useCallback(async () => {
        if (isConnected || isInitializing) {
            console.warn("Connect cancelled: Already connected or initializing.");
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
            return;
        }
        if (!goBackendUrl) {
            const errMsg = "Go Backend URL not set in settings.";
            setError(errMsg);
            onErrorRef.current?.(errMsg);
            console.error(errMsg);
            return;
        }
<<<<<<< Updated upstream
        setError(null); // Clear previous errors
=======

<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
        setIsInitializing(true);
        setError(null);

        try {
<<<<<<< Updated upstream
<<<<<<< Updated upstream
            // Pass the current settings object to the agent constructor
             const agentConfig = {
                 url,
                 config: getGeminiConfig(toolManager.current?.getToolDeclarations() || []), // Get latest config
                 deepgramApiKey: settings.deepgramApiKey || null,
                 modelSampleRate: settings.sampleRate,
                 toolManager: toolManager.current, // Pass ToolManager instance
                 transcribeUsersSpeech: settings.transcribeUsersSpeech || false, // Example: Get from settings
                 transcribeModelsSpeech: settings.transcribeModelsSpeech || false, // Example: Get from settings
                 settings: settings // Pass the whole settings object
            };
             console.log("Creating GeminiAgent with config:", agentConfig);
             const newAgent = new GeminiAgent(agentConfig);


            // --- Setup Agent Event Listeners ---
            // These listeners bridge events from the Agent class to the hook's callbacks
            newAgent.on('transcription', (transcript) => {
                // For UI:
                onTranscriptionRef.current?.(transcript);
                // <<< NEW: For Backend >>>
                onTranscriptForBackendRef.current?.('agent', transcript);
            });
            newAgent.on('user_transcription', (transcript) => {
                // For UI:
                onUserTranscriptionRef.current?.(transcript);
                 // <<< NEW: For Backend >>>
                onTranscriptForBackendRef.current?.('user', transcript);
            });
            newAgent.on('text_sent', (text) => onTextSentRef.current?.(text));
            newAgent.on('interrupted', () => onInterruptedRef.current?.());
            newAgent.on('turn_complete', () => onTurnCompleteRef.current?.());
            newAgent.on('screenshare_stopped', () => {
                 console.log("Hook: screenshare_stopped event received");
                 setIsScreenShareActive(false); // Update state based on event
                 onScreenShareStoppedRef.current?.();
              });
            newAgent.on('error', (err) => {
                console.error("Hook: Agent emitted error:", err);
                const errMsg = err instanceof Error ? err.message : String(err);
                setError(errMsg); // Update hook's error state
                onErrorRef.current?.(errMsg); // Call external error handler
            });
            // Listen for specific media state changes from Agent
            newAgent.on('mic_state_changed', (state) => {
                 // console.log("Hook: mic_state_changed", state);
                 setIsMicActive(state.active);
                 setIsMicSuspended(state.suspended);
                 onMicStateChangedRef.current?.(state);
=======
            const sessionPayload = {
                user_id: authUser?.id || 'default_user',
                session_id: '',
            };

=======
            const sessionPayload = {
                user_id: authUser?.id || 'default_user',
                session_id: '',
            };

>>>>>>> Stashed changes
            const response = await fetch(`${goBackendUrl}/api/agent/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sessionPayload),
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
            });
             newAgent.on('camera_started', () => {
                 console.log("Hook: camera_started event received");
                 setIsCameraActive(true);
                 onCameraStartedRef.current?.();
             });
             newAgent.on('camera_stopped', () => {
                  console.log("Hook: camera_stopped event received");
                 setIsCameraActive(false);
                 onCameraStoppedRef.current?.();
             });
              newAgent.on('screenshare_started', () => {
                 console.log("Hook: screenshare_started event received");
                 setIsScreenShareActive(true);
                 onScreenShareStartedRef.current?.();
             });
              // Add listener for agent disconnect? Agent class needs to emit 'disconnected'
             // newAgent.on('disconnected', () => { ... handle agent-side disconnect ... });
            // --- End Agent Event Listeners ---

<<<<<<< Updated upstream
<<<<<<< Updated upstream
            setAgent(newAgent); // Set agent instance first
            await newAgent.connect(); // Connect WebSocket
            await newAgent.initialize(); // Initialize includes starting audio context, streamer, recorder, transcribers etc.

            // Update state after successful initialization
            setIsConnected(true);
             // Reflect initial mic state after init (should be inactive/suspended)
            setIsMicActive(newAgent.audioRecorder?.isRecording || false);
            setIsMicSuspended(newAgent.audioRecorder?.isSuspended !== false); // Assume suspended if not explicitly false

            console.log("Hook: Agent connected and initialized successfully.");
=======
            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); }
                catch (e) { errorData = { error: `Session creation failed: ${response.status} - ${response.statusText}` }; }
                throw new Error(errorData.error || `Session creation failed: ${response.status}`);
            }

=======
            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); }
                catch (e) { errorData = { error: `Session creation failed: ${response.status} - ${response.statusText}` }; }
                throw new Error(errorData.error || `Session creation failed: ${response.status}`);
            }

>>>>>>> Stashed changes
            const sessionData = await response.json();
            if (!sessionData.session_id) {
                throw new Error("Backend did not return a session_id for the main agent.");
            }
            currentSessionIdRef.current = sessionData.session_id;
            console.log("Main voice agent session created with backend, session_id:", currentSessionIdRef.current);
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes

            connectSSE();
            setIsConnected(true);
        } catch (err) {
<<<<<<< Updated upstream
<<<<<<< Updated upstream
            console.error('Hook: Agent Connection/Initialization Error:', err);
            const errMsg = err.message || 'Failed to connect or initialize agent.';
            setError(errMsg);
            onErrorRef.current?.(errMsg);
            // Clean up failed agent attempt
            agent?.disconnect(); // Attempt cleanup if agent object was created
            setAgent(null);
            setIsConnected(false);
            // Reset media states on failure
            setIsMicActive(false);
            setIsMicSuspended(true);
            setIsCameraActive(false);
            setIsScreenShareActive(false);
        } finally {
            setIsInitializing(false);
        }
    }, [settings, getGeminiConfig, getWebsocketUrl, agent, isInitializing, isConnected]); // Dependencies

    // --- Agent Disconnection ---
    const disconnectAgent = useCallback(async () => {
        if (!agent) {
             console.warn("Disconnect cancelled: No agent instance.");
             return;
        }
        console.log("Hook: Disconnecting agent...");
        try {
            await agent.disconnect(); // Agent's disconnect handles internal cleanup
        } catch (err) {
            console.error('Hook: Agent Disconnect Error:', err);
            setError(err.message || 'Failed to disconnect agent cleanly.');
            onErrorRef.current?.(err.message || 'Failed to disconnect agent cleanly.');
        } finally {
            // Reset all state regardless of cleanup success
            setAgent(null);
            setIsConnected(false);
            setIsInitializing(false); // Ensure initializing is false
            setIsMicActive(false);
            setIsMicSuspended(true);
            setIsCameraActive(false);
            setIsScreenShareActive(false);
            setError(null); // Clear errors on disconnect
            console.log("Hook: Agent disconnected state updated.");
        }
    }, [agent]);

    // --- Cleanup on Unmount ---
    useEffect(() => {
        // This cleanup function runs when the component using the hook unmounts
        return () => {
            console.log("Hook: Unmounting, ensuring agent is disconnected.");
            // Use the current value of agent ref/state inside cleanup
            if (agent) {
                agent.disconnect().catch(err => {
                     console.error("Hook: Error during unmount disconnect:", err);
                });
            }
        };
    }, [agent]); // Depend on agent instance

    // --- Agent Interaction Methods ---

    const sendText = useCallback(async (text) => {
        if (!agent || !isConnected) {
            console.warn("SendText cancelled: Agent not available or not connected.");
            return;
        }
        try {
            await agent.sendText(text);
            // Text sent confirmation handled by agent's 'text_sent' event -> onTextSentRef
        } catch (err) {
            console.error("Hook: Send Text Error:", err);
            setError(err.message || 'Failed to send text.');
            onErrorRef.current?.(err.message || 'Failed to send text.');
        }
    }, [agent, isConnected]);

    const toggleMic = useCallback(async () => {
        if (!agent || !isConnected) {
             console.warn("ToggleMic cancelled: Agent not available or not connected.");
             return Promise.reject(new Error("Agent not available or not connected.")); // Return rejected promise
        }
        try {
            // Agent's toggleMic handles starting recorder if needed and toggling suspension
            await agent.toggleMic();
            // State (isMicActive, isMicSuspended) updated via 'mic_state_changed' event listener setup in connectAgent
        } catch (err) {
            console.error("Hook: Toggle Mic Error:", err);
            const errMsg = err.message || 'Failed to toggle microphone.';
            setError(errMsg);
            onErrorRef.current?.(errMsg);
            // Revert state potentially? The agent event might not fire on error.
            // Check agent's state directly after error?
             setIsMicActive(agent.audioRecorder?.isRecording || false);
             setIsMicSuspended(agent.audioRecorder?.isSuspended !== false);
             throw err; // Re-throw error for component to catch
        }
    }, [agent, isConnected]);


     const startCamera = useCallback(async () => {
        if (!agent || !isConnected) {
             console.warn("StartCamera cancelled: Agent not available or not connected.");
             return Promise.reject(new Error("Agent not available or not connected."));
        }
         if (isCameraActive) {
             console.warn("StartCamera cancelled: Camera already active.");
             return;
         }
         setError(null); // Clear previous errors before trying
         try {
            await agent.startCameraCapture();
            // State (isCameraActive) updated via 'camera_started' event listener
        } catch (err) {
            console.error("Hook: Start Camera Error:", err);
            const errMsg = err.message || 'Failed to start camera.';
            setError(errMsg);
            onErrorRef.current?.(errMsg);
            setIsCameraActive(false); // Ensure state is false on error
            throw err; // Re-throw
        }
    }, [agent, isConnected, isCameraActive]);

    const stopCamera = useCallback(async () => {
         if (!agent || !isCameraActive) {
             console.warn("StopCamera cancelled: Agent not available or camera not active.");
             return;
         }
         setError(null);
        try {
            await agent.stopCameraCapture();
             // State (isCameraActive) updated via 'camera_stopped' event listener
        } catch (err) {
            console.error("Hook: Stop Camera Error:", err);
            const errMsg = err.message || 'Failed to stop camera.';
            setError(errMsg);
            onErrorRef.current?.(errMsg);
            // State might be inconsistent, force false? Agent event should handle it ideally.
             setIsCameraActive(false); // Force state just in case
             throw err; // Re-throw
        }
    }, [agent, isCameraActive]);


     const startScreenShare = useCallback(async () => {
        if (!agent || !isConnected) {
             console.warn("StartScreenShare cancelled: Agent not available or not connected.");
             return Promise.reject(new Error("Agent not available or not connected."));
        }
         if (isScreenShareActive) {
             console.warn("StartScreenShare cancelled: Screen share already active.");
             return;
         }
         setError(null);
        try {
            await agent.startScreenShare();
            // State (isScreenShareActive) updated via 'screenshare_started' event listener
        } catch (err) {
             console.error("Hook: Start Screen Share Error:", err);
             const errMsg = err.message || 'Failed to start screen share.';
             setError(errMsg);
             onErrorRef.current?.(errMsg);
             setIsScreenShareActive(false); // Ensure state is correct on error
             throw err; // Re-throw
        }
    }, [agent, isConnected, isScreenShareActive]);

    const stopScreenShare = useCallback(async () => {
        if (!agent || !isScreenShareActive) {
             console.warn("StopScreenShare cancelled: Agent not available or screen share not active.");
             return;
        }
        setError(null);
        try {
            await agent.stopScreenShare();
            // State (isScreenShareActive) updated via 'screenshare_stopped' event listener triggered by agent/manager
        } catch (err) {
            console.error("Hook: Stop Screen Share Error:", err);
            const errMsg = err.message || 'Failed to stop screen share.';
            setError(errMsg);
            onErrorRef.current?.(errMsg);
            // Force state just in case event doesn't fire correctly on error
             setIsScreenShareActive(false);
             throw err; // Re-throw
        }
    }, [agent, isScreenShareActive]);
=======
            console.error("Error connecting main voice agent via backend:", err);
            setError(err.message);
            onErrorRef.current?.(err.message);
            setIsConnected(false);
            disconnectSSE(); // Now defined
        } finally {
            setIsInitializing(false);
        }
    }, [goBackendUrl, connectSSE, disconnectSSE, isConnected, isInitializing, authUser, onErrorRef]); // Added disconnectSSE, authUser, onErrorRef

    const disconnectAgent = useCallback(async () => {
        console.log("Disconnecting main voice agent via backend...");
        disconnectSSE();
        setIsConnected(false);
        setIsInitializing(false);
        if (currentSessionIdRef.current && goBackendUrl) {
            try {
                await fetch(`${goBackendUrl}/api/agent/session/${currentSessionIdRef.current}`, {
                    method: 'DELETE',
                });
                console.log("Backend main agent session close signaled for session:", currentSessionIdRef.current);
            } catch (err) {
                console.warn("Error signaling backend main agent session close:", err);
            }
        }
        currentSessionIdRef.current = null;
        setError(null);
        setManualTasks({});
        setIsMicActive(false);
        setIsMicSuspended(true);
        setIsCameraActive(false);
        setIsScreenShareActive(false);
    }, [disconnectSSE, goBackendUrl]); // Added disconnectSSE

    // --- Interactions ---
    const sendTextToMainAgent = useCallback(async (text) => {
        if (!isConnected || !currentSessionIdRef.current || !goBackendUrl) {
            const msg = "Cannot send text to main agent: Not connected or session ID/URL missing.";
            console.warn(msg);
            onErrorRef.current?.(msg);
            return;
        }
        if (!text || text.trim() === "") {
            console.warn("Cannot send empty text to main agent.");
            return;
        }

        const payload = {
            user_id: authUser?.id || 'default_user',
            session_id: currentSessionIdRef.current,
            text: text,
        };

        try {
            const response = await fetch(`${goBackendUrl}/api/agent/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); }
                catch (e) { errorData = { error: `Failed to send query to main agent: ${response.status} - ${response.statusText}` };}
                throw new Error(errorData.error || `Failed to send query to main agent: ${response.status}`);
            }
        } catch (err) {
            console.error("Error sending text query to main agent (backend):", err);
            setError(err.message);
            onErrorRef.current?.(err.message);
        }
    }, [isConnected, goBackendUrl, authUser, onErrorRef]); // Added onErrorRef and authUser

    const submitManualTask = useCallback(async (taskQuery) => {
        if (!goBackendUrl) {
            const msg = "Cannot submit manual task: Go Backend URL missing.";
            console.error(msg);
            onErrorRef.current?.(msg);
            return null;
        }
        if (!taskQuery || taskQuery.trim() === "") {
            console.warn("Cannot submit empty manual task query.");
            return null;
        }

        const payload = {
            user_id: authUser?.id || 'default_user',
            session_id: currentSessionIdRef.current || 'manual_task_session',
            query: taskQuery,
        };

        try {
            if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
                console.log("[SSE] SSE not active, attempting to connect for manual task updates...");
                connectSSE();
            }

            const response = await fetch(`${goBackendUrl}/api/task/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); }
                catch (e) { errorData = { error: `Failed to submit manual task: ${response.status} - ${response.statusText}` };}
                throw new Error(errorData.error || `Failed to submit manual task: ${response.status}`);
            }

            const responseData = await response.json();
            console.log("Manual task submitted to backend, response:", responseData);
            return responseData.task_id;

        } catch (err) {
            console.error("Error submitting manual task to backend:", err);
            setError(err.message);
            onErrorRef.current?.(err.message);
            const tempErrorTaskId = `error-${Date.now()}`;
            setManualTasks(prev => ({
                ...prev,
                [tempErrorTaskId]: {
                    task_id: tempErrorTaskId,
                    query: taskQuery,
                    status_text: "Submission Failed",
                    is_error: true,
                    error_message: err.message,
                    type: 'manual_task_result',
                    last_update: new Date().toISOString()
                }
            }));
            onManualTaskUpdateRef.current?.({ task_id: tempErrorTaskId, error_message: err.message, is_error: true, type: 'manual_task_result' });
            return null;
        }
    }, [goBackendUrl, authUser, connectSSE, onErrorRef, onManualTaskUpdateRef]); // Added dependencies

    const sendCommandToBackend = useCallback(async (command, commandPayload = {}) => {
        if (!isConnected || !currentSessionIdRef.current || !goBackendUrl) {
            console.warn(`Cannot send command '${command}' to main agent: Not connected or session ID/URL missing.`);
            return Promise.reject(new Error("Main agent not connected"));
        }
        try {
            const response = await fetch(`${goBackendUrl}/api/agent/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: currentSessionIdRef.current,
                    user_id: authUser?.id || 'default_user',
                    command: command,
                    payload: commandPayload
                }),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({error: `Command '${command}' failed with status ${response.status}`}));
                throw new Error(errData.error);
            }
            return await response.json();
        } catch (err) {
            console.error(`Error sending command '${command}' to backend for main agent:`, err);
            setError(err.message);
            onErrorRef.current?.(err.message);
            throw err;
        }
    }, [isConnected, goBackendUrl, authUser, onErrorRef]); // Added dependencies

    const toggleMic = useCallback(async () => {
        const newMicActiveState = !isMicActive || isMicSuspended;
        setIsMicActive(newMicActiveState);
        setIsMicSuspended(false);
        onMicStateChangedRef.current?.({ active: newMicActiveState, suspended: false });
        try { await sendCommandToBackend('toggle_microphone'); }
        catch (err) {
            setIsMicActive(!newMicActiveState);
            setIsMicSuspended(newMicActiveState ? false : true);
            onMicStateChangedRef.current?.({ active: !newMicActiveState, suspended: newMicActiveState ? false : true });
            throw err;
        }
    }, [isMicActive, isMicSuspended, sendCommandToBackend, onMicStateChangedRef]);

    const startCamera = useCallback(async () => {
        setIsCameraActive(true); onCameraStartedRef.current?.();
        try { await sendCommandToBackend('start_camera'); }
        catch (err) { setIsCameraActive(false); onCameraStoppedRef.current?.(); throw err; }
    }, [sendCommandToBackend, onCameraStartedRef, onCameraStoppedRef]);

    const stopCamera = useCallback(async () => {
        setIsCameraActive(false); onCameraStoppedRef.current?.();
        try { await sendCommandToBackend('stop_camera'); }
        catch (err) { setIsCameraActive(true); onCameraStartedRef.current?.(); throw err; }
    }, [sendCommandToBackend, onCameraStartedRef, onCameraStoppedRef]);

    const startScreenShare = useCallback(async () => {
        setIsScreenShareActive(true); onScreenShareStartedRef.current?.();
        try { await sendCommandToBackend('start_screen_share'); }
        catch (err) { setIsScreenShareActive(false); onScreenShareStoppedRef.current?.(); throw err; }
    }, [sendCommandToBackend, onScreenShareStartedRef, onScreenShareStoppedRef]);

    const stopScreenShare = useCallback(async () => {
        setIsScreenShareActive(false); onScreenShareStoppedRef.current?.();
        try { await sendCommandToBackend('stop_screen_share'); }
        catch (err) { setIsScreenShareActive(true); onScreenShareStartedRef.current?.(); throw err; }
    }, [sendCommandToBackend, onScreenShareStartedRef, onScreenShareStoppedRef]);
>>>>>>> Stashed changes

    // --- Cleanup ---
    useEffect(() => {
        return () => {
            disconnectAgent();
        };
    }, [disconnectAgent]); // disconnectAgent is memoized

<<<<<<< Updated upstream
    // --- Return hook state and methods ---
    return {
        agent, // Expose agent if direct access is needed (e.g., for visualizer, switching camera)
        isConnected,
        isInitializing,
        // Media states
        isMicActive,
        isMicSuspended,
        isCameraActive,
        isScreenShareActive,
        // Error state
        error,
        // Core methods
        connectAgent,
        disconnectAgent,
        sendText,
        // Media control methods
        toggleMic,
        startCamera,
        stopCamera,
        startScreenShare,
        stopScreenShare,
        // Refs for setting callbacks from the consuming component
        onTranscriptionRef,         // For UI (model)
        onUserTranscriptionRef,     // For UI (user)
        onTranscriptForBackendRef,  // <<< NEW: For Backend (user+model)
        onTextSentRef,
        onInterruptedRef,
        onTurnCompleteRef,
        onScreenShareStoppedRef,
        onErrorRef,
        onMicStateChangedRef,
        onCameraStartedRef,
        onCameraStoppedRef,
        onScreenShareStartedRef,
=======
    return {
        isConnected, isInitializing, error,
        manualTasks,
        isMicActive, isMicSuspended, isCameraActive, isScreenShareActive,
        connectAgent,
        disconnectAgent,
=======
            console.error("Error connecting main voice agent via backend:", err);
            setError(err.message);
            onErrorRef.current?.(err.message);
            setIsConnected(false);
            disconnectSSE(); // Now defined
        } finally {
            setIsInitializing(false);
        }
    }, [goBackendUrl, connectSSE, disconnectSSE, isConnected, isInitializing, authUser, onErrorRef]); // Added disconnectSSE, authUser, onErrorRef

    const disconnectAgent = useCallback(async () => {
        console.log("Disconnecting main voice agent via backend...");
        disconnectSSE();
        setIsConnected(false);
        setIsInitializing(false);
        if (currentSessionIdRef.current && goBackendUrl) {
            try {
                await fetch(`${goBackendUrl}/api/agent/session/${currentSessionIdRef.current}`, {
                    method: 'DELETE',
                });
                console.log("Backend main agent session close signaled for session:", currentSessionIdRef.current);
            } catch (err) {
                console.warn("Error signaling backend main agent session close:", err);
            }
        }
        currentSessionIdRef.current = null;
        setError(null);
        setManualTasks({});
        setIsMicActive(false);
        setIsMicSuspended(true);
        setIsCameraActive(false);
        setIsScreenShareActive(false);
    }, [disconnectSSE, goBackendUrl]); // Added disconnectSSE

    // --- Interactions ---
    const sendTextToMainAgent = useCallback(async (text) => {
        if (!isConnected || !currentSessionIdRef.current || !goBackendUrl) {
            const msg = "Cannot send text to main agent: Not connected or session ID/URL missing.";
            console.warn(msg);
            onErrorRef.current?.(msg);
            return;
        }
        if (!text || text.trim() === "") {
            console.warn("Cannot send empty text to main agent.");
            return;
        }

        const payload = {
            user_id: authUser?.id || 'default_user',
            session_id: currentSessionIdRef.current,
            text: text,
        };

        try {
            const response = await fetch(`${goBackendUrl}/api/agent/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); }
                catch (e) { errorData = { error: `Failed to send query to main agent: ${response.status} - ${response.statusText}` };}
                throw new Error(errorData.error || `Failed to send query to main agent: ${response.status}`);
            }
        } catch (err) {
            console.error("Error sending text query to main agent (backend):", err);
            setError(err.message);
            onErrorRef.current?.(err.message);
        }
    }, [isConnected, goBackendUrl, authUser, onErrorRef]); // Added onErrorRef and authUser

    const submitManualTask = useCallback(async (taskQuery) => {
        if (!goBackendUrl) {
            const msg = "Cannot submit manual task: Go Backend URL missing.";
            console.error(msg);
            onErrorRef.current?.(msg);
            return null;
        }
        if (!taskQuery || taskQuery.trim() === "") {
            console.warn("Cannot submit empty manual task query.");
            return null;
        }

        const payload = {
            user_id: authUser?.id || 'default_user',
            session_id: currentSessionIdRef.current || 'manual_task_session',
            query: taskQuery,
        };

        try {
            if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
                console.log("[SSE] SSE not active, attempting to connect for manual task updates...");
                connectSSE();
            }

            const response = await fetch(`${goBackendUrl}/api/task/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); }
                catch (e) { errorData = { error: `Failed to submit manual task: ${response.status} - ${response.statusText}` };}
                throw new Error(errorData.error || `Failed to submit manual task: ${response.status}`);
            }

            const responseData = await response.json();
            console.log("Manual task submitted to backend, response:", responseData);
            return responseData.task_id;

        } catch (err) {
            console.error("Error submitting manual task to backend:", err);
            setError(err.message);
            onErrorRef.current?.(err.message);
            const tempErrorTaskId = `error-${Date.now()}`;
            setManualTasks(prev => ({
                ...prev,
                [tempErrorTaskId]: {
                    task_id: tempErrorTaskId,
                    query: taskQuery,
                    status_text: "Submission Failed",
                    is_error: true,
                    error_message: err.message,
                    type: 'manual_task_result',
                    last_update: new Date().toISOString()
                }
            }));
            onManualTaskUpdateRef.current?.({ task_id: tempErrorTaskId, error_message: err.message, is_error: true, type: 'manual_task_result' });
            return null;
        }
    }, [goBackendUrl, authUser, connectSSE, onErrorRef, onManualTaskUpdateRef]); // Added dependencies

    const sendCommandToBackend = useCallback(async (command, commandPayload = {}) => {
        if (!isConnected || !currentSessionIdRef.current || !goBackendUrl) {
            console.warn(`Cannot send command '${command}' to main agent: Not connected or session ID/URL missing.`);
            return Promise.reject(new Error("Main agent not connected"));
        }
        try {
            const response = await fetch(`${goBackendUrl}/api/agent/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: currentSessionIdRef.current,
                    user_id: authUser?.id || 'default_user',
                    command: command,
                    payload: commandPayload
                }),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({error: `Command '${command}' failed with status ${response.status}`}));
                throw new Error(errData.error);
            }
            return await response.json();
        } catch (err) {
            console.error(`Error sending command '${command}' to backend for main agent:`, err);
            setError(err.message);
            onErrorRef.current?.(err.message);
            throw err;
        }
    }, [isConnected, goBackendUrl, authUser, onErrorRef]); // Added dependencies

    const toggleMic = useCallback(async () => {
        const newMicActiveState = !isMicActive || isMicSuspended;
        setIsMicActive(newMicActiveState);
        setIsMicSuspended(false);
        onMicStateChangedRef.current?.({ active: newMicActiveState, suspended: false });
        try { await sendCommandToBackend('toggle_microphone'); }
        catch (err) {
            setIsMicActive(!newMicActiveState);
            setIsMicSuspended(newMicActiveState ? false : true);
            onMicStateChangedRef.current?.({ active: !newMicActiveState, suspended: newMicActiveState ? false : true });
            throw err;
        }
    }, [isMicActive, isMicSuspended, sendCommandToBackend, onMicStateChangedRef]);

    const startCamera = useCallback(async () => {
        setIsCameraActive(true); onCameraStartedRef.current?.();
        try { await sendCommandToBackend('start_camera'); }
        catch (err) { setIsCameraActive(false); onCameraStoppedRef.current?.(); throw err; }
    }, [sendCommandToBackend, onCameraStartedRef, onCameraStoppedRef]);

    const stopCamera = useCallback(async () => {
        setIsCameraActive(false); onCameraStoppedRef.current?.();
        try { await sendCommandToBackend('stop_camera'); }
        catch (err) { setIsCameraActive(true); onCameraStartedRef.current?.(); throw err; }
    }, [sendCommandToBackend, onCameraStartedRef, onCameraStoppedRef]);

    const startScreenShare = useCallback(async () => {
        setIsScreenShareActive(true); onScreenShareStartedRef.current?.();
        try { await sendCommandToBackend('start_screen_share'); }
        catch (err) { setIsScreenShareActive(false); onScreenShareStoppedRef.current?.(); throw err; }
    }, [sendCommandToBackend, onScreenShareStartedRef, onScreenShareStoppedRef]);

    const stopScreenShare = useCallback(async () => {
        setIsScreenShareActive(false); onScreenShareStoppedRef.current?.();
        try { await sendCommandToBackend('stop_screen_share'); }
        catch (err) { setIsScreenShareActive(true); onScreenShareStartedRef.current?.(); throw err; }
    }, [sendCommandToBackend, onScreenShareStartedRef, onScreenShareStoppedRef]);

    // --- Cleanup ---
    useEffect(() => {
        return () => {
            disconnectAgent();
        };
    }, [disconnectAgent]); // disconnectAgent is memoized

    return {
        isConnected, isInitializing, error,
        manualTasks,
        isMicActive, isMicSuspended, isCameraActive, isScreenShareActive,
        connectAgent,
        disconnectAgent,
>>>>>>> Stashed changes
        sendTextToMainAgent,
        submitManualTask,
        toggleMic, startCamera, stopCamera, startScreenShare, stopScreenShare,
        onPrimaryAgentResponseRef, onTurnCompleteRef, onErrorRef,
        onManualTaskUpdateRef,
        onUserTranscriptionRef,
        onMicStateChangedRef, onCameraStartedRef, onCameraStoppedRef,
        onScreenShareStartedRef, onScreenShareStoppedRef,
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
    };
};