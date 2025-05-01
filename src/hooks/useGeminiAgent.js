import { useState, useEffect, useRef, useCallback } from 'react';
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
            return;
        }

        const url = getWebsocketUrl();
        if (!url) {
            const errMsg = 'API Key or WebSocket URL is missing. Please configure settings.';
            setError(errMsg);
            onErrorRef.current?.(errMsg);
            console.error(errMsg);
            return;
        }
        setError(null); // Clear previous errors
        setIsInitializing(true);

        try {
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

            setAgent(newAgent); // Set agent instance first
            await newAgent.connect(); // Connect WebSocket
            await newAgent.initialize(); // Initialize includes starting audio context, streamer, recorder, transcribers etc.

            // Update state after successful initialization
            setIsConnected(true);
             // Reflect initial mic state after init (should be inactive/suspended)
            setIsMicActive(newAgent.audioRecorder?.isRecording || false);
            setIsMicSuspended(newAgent.audioRecorder?.isSuspended !== false); // Assume suspended if not explicitly false

            console.log("Hook: Agent connected and initialized successfully.");

        } catch (err) {
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
    };
};
