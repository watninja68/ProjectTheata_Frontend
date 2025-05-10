import { useState, useEffect, useRef, useCallback } from 'react';
import { GeminiAgent } from '../lib/main/agent';
import { ToolManager } from '../lib/tools/tool-manager';
import { GoogleSearchTool } from '../lib/tools/google-search'; // Assuming this exists
import { WolframAlphaTool } from '../lib/tools/wolf-from-alpha.js'; // Corrected import path assumed

// ────────────────────────────────────────────────────────────────────────────────
//  useGeminiAgent -- now with robust SSE support and forwarding SSE messages to agent
// ────────────────────────────────────────────────────────────────────────────────
export const useGeminiAgent = (settings, getGeminiConfig, getWebsocketUrl) => {
    const [agent, setAgent]              = useState(null);
    const agentRef                       = useRef(null); // <<< NEW: Ref to hold the current agent instance
    const [isConnected, setIsConnected]  = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    // Media‑state flags
    const [isMicActive, setIsMicActive]       = useState(false);
    const [isMicSuspended, setIsMicSuspended] = useState(true);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isScreenShareActive, setIsScreenShareActive] = useState(false);
    // Error
    const [error, setError] = useState(null);

    // ───── Callbacks injected by the consumer ─────
    const onTranscriptionRef        = useRef(null);
    const onUserTranscriptionRef    = useRef(null);
    const onTranscriptForBackendRef = useRef(null);
    const onTextSentRef             = useRef(null);
    const onInterruptedRef          = useRef(null);
    const onTurnCompleteRef         = useRef(null);
    const onScreenShareStoppedRef   = useRef(null);
    const onErrorRef                = useRef(null);
    const onMicStateChangedRef      = useRef(null);
    const onCameraStartedRef        = useRef(null);
    const onCameraStoppedRef        = useRef(null);
    const onScreenShareStartedRef   = useRef(null);

    // ───── Tools ─────
    const toolManager = useRef(null);
    useEffect(() => {
        if (!toolManager.current) {
            toolManager.current = new ToolManager();
            toolManager.current.registerTool('googleSearch', new GoogleSearchTool());
            toolManager.current.registerTool('wolframalpha', new WolframAlphaTool());
            console.log('[useGeminiAgent] ToolManager ready');
        }
    }, []);

    // ────────────────────────────────────────────────────────────────────────────
    //  SSE plumbing with robust reconnection handling
    // ────────────────────────────────────────────────────────────────────────────
    const sseRef = useRef(null); // keeps current EventSource instance
    const reconnectTimeoutRef = useRef(null);
    const reconnectAttemptsRef = useRef(0);
    const MAX_RECONNECT_ATTEMPTS = 5;
    const INITIAL_RECONNECT_DELAY = 1000; // 1 second

    const startSSE = useCallback(() => {
        if (sseRef.current) return; // already open
        if (!settings?.backendBaseUrl) {
            console.warn('[SSE] backendBaseUrl missing in settings – SSE disabled.');
            return;
        }

        // Clear any existing reconnection attempts
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        const connectSSE = () => {
            const url = `${settings.backendBaseUrl.replace(/\/$/, '')}/sse`; // /events endpoint

            console.log(`[SSE] Connecting to ${url} (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);

            const es = new EventSource(url);

            es.onopen = () => {
                console.log('[SSE] Connection established');
                reconnectAttemptsRef.current = 0; // Reset attempt counter on successful connection
            };

            es.addEventListener('chat_message', (e) => { // <<< MODIFIED LISTENER
                try {
                    const data = JSON.parse(e.data); // { role, text }
                    console.log("[SSE DATA RECEIVED]", data);

                    // 1. Call the original callback (for UI/logging, if still needed)
                    onTranscriptForBackendRef.current?.(data.role, data.text);

                    // 2. Send the text to the Gemini Agent if it's available
                    if (agentRef.current  && data.status) { // Check ref and connection status
                        console.log('[SSE] Forwarding text to agent:', data.text);
                        // Use an async IIFE or handle promise for error catching
                        (async () => {
                            try {
                                // Assuming sendText is the correct method to inject external text
                                await agentRef.current.sendText(data.answer);
                                // Optionally call onTextSentRef if appropriate for SSE-injected text
                                // onTextSentRef.current?.(data.text);
                            } catch (sendErr) {
                                console.error('[SSE] Error sending text to agent:', sendErr);
                                // Optionally notify the main error handler
                                // onErrorRef.current?.(`Failed to forward SSE message to agent: ${sendErr.message}`);
                            }
                        })();
                    } else {
                        console.warn('[SSE] Agent not available or not connected, cannot forward text:', data.text);
                    }

                } catch (err) {
                    console.error('[SSE] Malformed payload or processing error', err);
                }
            });

            es.onerror = (evt) => {
                console.error('[SSE] Stream error', evt);
                console.error('[SSE] ReadyState:', es.readyState);

                // Close the current connection
                es.close();
                sseRef.current = null;

                // Implement exponential back-off reconnect
                if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                    const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
                    console.log(`[SSE] Reconnecting in ${delay}ms...`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttemptsRef.current++;
                        connectSSE();
                    }, delay);
                } else {
                    console.error('[SSE] Max reconnection attempts reached, giving up');
                    const errorMsg = 'Connection to event stream failed after multiple attempts';
                    setError(errorMsg);
                    onErrorRef.current?.(errorMsg);
                }
            };

            sseRef.current = es;
        };

        // Start the initial connection
        connectSSE();

    // **Important**: Keep dependencies minimal for startSSE to avoid unnecessary SSE reconnections.
    // Accessing agent via agentRef.current inside the listener avoids needing 'agent' or 'isConnected' here.
    }, [settings?.backendBaseUrl /*, isConnected */]); // isConnected removed to prevent churn, check inside listener

    const stopSSE = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (sseRef.current) {
            sseRef.current.close();
            sseRef.current = null;
            console.log('[SSE] Disconnected');
        }

        // Reset the reconnection attempt counter
        reconnectAttemptsRef.current = 0;
    }, []);

    // ────────────────────────────────────────────────────────────────────────────
    //  Agent connection & initialization
    // ────────────────────────────────────────────────────────────────────────────
    const connectAgent = useCallback(async () => {
        // Use agentRef.current to check if already connecting/connected
        if (agentRef.current || isInitializing /*|| isConnected - redundant if agentRef exists */) {
            console.warn('[useGeminiAgent] connect cancelled – already busy/connected');
            return;
        }

        const url = getWebsocketUrl();
        if (!url) {
            const errMsg = 'API Key or WebSocket URL is missing. Please configure settings.';
            setError(errMsg);
            onErrorRef.current?.(errMsg);
            return;
        }

        setError(null);
        setIsInitializing(true);

        try {
            const agentConfig = {
                url,
                config: getGeminiConfig(toolManager.current?.getToolDeclarations() || []),
                deepgramApiKey: settings.deepgramApiKey || null,
                modelSampleRate: settings.sampleRate,
                toolManager: toolManager.current,
                transcribeUsersSpeech : settings.transcribeUsersSpeech || false,
                transcribeModelsSpeech: settings.transcribeModelsSpeech || false,
                settings
            };
            console.log('[useGeminiAgent] Creating GeminiAgent', agentConfig);
            const newAgent = new GeminiAgent(agentConfig);

            // ── Hook‑up agent events to refs ──
            // ... (event listeners remain the same) ...
             newAgent.on('transcription',      (t) => {
                onTranscriptionRef.current?.(t);
                onTranscriptForBackendRef.current?.('agent', t);
            });
            newAgent.on('user_transcription', (t) => {
                onUserTranscriptionRef.current?.(t);
                onTranscriptForBackendRef.current?.('user', t);
            });
            newAgent.on('text_sent',           (txt) => onTextSentRef.current?.(txt));
            newAgent.on('interrupted',         ()   => onInterruptedRef.current?.());
            newAgent.on('turn_complete',       ()   => onTurnCompleteRef.current?.());
            newAgent.on('screenshare_stopped',()   => {
                setIsScreenShareActive(false);
                onScreenShareStoppedRef.current?.();
            });
            newAgent.on('error', (err) => {
                console.error('[useGeminiAgent] Agent error', err);
                const msg = err instanceof Error ? err.message : String(err);
                setError(msg);
                onErrorRef.current?.(msg);
            });
            newAgent.on('mic_state_changed',  (s) => {
                setIsMicActive(s.active);
                setIsMicSuspended(s.suspended);
                onMicStateChangedRef.current?.(s);
            });
            newAgent.on('camera_started',      () => {
                setIsCameraActive(true);
                onCameraStartedRef.current?.();
            });
            newAgent.on('camera_stopped',      () => {
                setIsCameraActive(false);
                onCameraStoppedRef.current?.();
            });
            newAgent.on('screenshare_started',() => {
                setIsScreenShareActive(true);
                onScreenShareStartedRef.current?.();
            });


            // ── Connect & init ──
            // Set refs and state *before* potential async operations that might change them
            agentRef.current = newAgent; // <<< UPDATE REF
            setAgent(newAgent);          // <<< Update state for consumers

            await newAgent.connect();
            // Verify connection status if connect doesn't throw
            // const connected = newAgent.isConnected ? newAgent.isConnected() : true; // Example check
            // if (!connected) throw new Error("Agent failed to connect.");

            await newAgent.initialize();
            // Verify initialization if initialize doesn't throw

            setIsConnected(true); // <<< Set connected state AFTER successful connection/init
            setIsMicActive(newAgent.audioRecorder?.isRecording || false);
            setIsMicSuspended(newAgent.audioRecorder?.isSuspended !== false);

            console.log('[useGeminiAgent] Agent ready');

            // ── Start SSE once the agent is live ──
            startSSE();

        } catch (err) {
            console.error('[useGeminiAgent] connect/init failed', err);
            const errorMsg = err.message || 'Failed to connect or initialize agent.';
            setError(errorMsg);
            onErrorRef.current?.(errorMsg);

            // Clean up agent state and ref
            agentRef.current?.disconnect?.().catch(console.error); // Try to disconnect if ref exists
            agentRef.current = null; // <<< CLEAR REF
            setAgent(null);          // <<< Clear state
            setIsConnected(false);
            setIsMicActive(false);
            setIsMicSuspended(true);
            setIsCameraActive(false);
            setIsScreenShareActive(false);
        } finally {
            setIsInitializing(false);
        }
    // Removed 'agent' from dependencies, using agentRef now
    }, [
        /* agent, */ // No longer needed due to agentRef
        isInitializing,
        isConnected,   // Keep isConnected to prevent multiple connection attempts
        settings,
        getGeminiConfig,
        getWebsocketUrl,
        startSSE // Keep startSSE if its identity matters (it shouldn't change often now)
    ]);

    // ────────────────────────────────────────────────────────────────────────────
    //  Disconnect
    // ────────────────────────────────────────────────────────────────────────────
    const disconnectAgent = useCallback(async () => {
        const agentToDisconnect = agentRef.current; // Use the ref
        if (!agentToDisconnect) {
            console.warn('[useGeminiAgent] disconnect cancelled – no agent');
            return;
        }
        console.log('[useGeminiAgent] Disconnecting agent…');
        try {
            await agentToDisconnect.disconnect();
        } catch (err) {
            console.error('[useGeminiAgent] Disconnect error', err);
            // Keep existing error state logic
            const errorMsg = err.message || 'Failed to disconnect agent.';
            setError(errorMsg);
            onErrorRef.current?.(errorMsg);
        } finally {
             // Reset state variables
            setAgent(null);
            setIsConnected(false);
            setIsInitializing(false); // Should already be false, but reset for safety
            setIsMicActive(false);
            setIsMicSuspended(true);
            setIsCameraActive(false);
            setIsScreenShareActive(false);
            // Clear the primary ref *after* attempting disconnect
            agentRef.current = null; // <<< CLEAR REF
            // Don't clear error state here, let connectAgent clear it on next attempt
            // setError(null);
            stopSSE(); // Stop SSE when agent disconnects
            console.log('[useGeminiAgent] Agent disconnected');
        }
    }, [stopSSE /* No dependency on agent state needed */]);


    // ───── Cleanup on unmount ─────
    useEffect(() => {
        // Capture the ref value at the time the effect runs
        const agentInstance = agentRef.current;
        return () => {
            // Disconnect the captured instance if it exists
            if (agentInstance) {
                 agentInstance.disconnect().catch(console.error);
            }
            stopSSE(); // Ensure SSE closed on unmount
        };
    // agentRef itself is stable, stopSSE dependency might be needed if its identity changes
    }, [stopSSE]);

    // ────────────────────────────────────────────────────────────────────────────
    //  Interaction helpers (use agentRef.current)
    // ────────────────────────────────────────────────────────────────────────────

    const sendText = useCallback(async (text) => {
        // Check ref and connection status
        if (!agentRef.current || !isConnected) {
            console.warn('[useGeminiAgent] sendText cancelled – not connected or no agent');
            return;
        }
        try {
            await agentRef.current.sendText(text);
        } catch (err) {
            console.error('[useGeminiAgent] sendText error', err);
            const msg = err.message || 'Failed to send text.';
            setError(msg);
            onErrorRef.current?.(msg);
        }
    // Depend on isConnected; agentRef.current is stable
    }, [isConnected]);

    const toggleMic = useCallback(async () => {
        const currentAgent = agentRef.current; // Use ref
        if (!currentAgent || !isConnected) {
            return Promise.reject(new Error('Agent not available or not connected.'));
        }
        try {
            await currentAgent.toggleMic();
            // State updates for mic status are handled by the 'mic_state_changed' event listener
        } catch (err) {
            console.error('[useGeminiAgent] toggleMic error', err);
            const msg = err.message || 'Failed to toggle microphone.';
            setError(msg);
            onErrorRef.current?.(msg);
             // Ensure state reflects reality after error
            setIsMicActive(currentAgent.audioRecorder?.isRecording || false);
            setIsMicSuspended(currentAgent.audioRecorder?.isSuspended !== false);
            throw err; // Re-throw error for consumer
        }
    // Depend on isConnected; agentRef.current is stable
    }, [isConnected]);

     const startCamera = useCallback(async () => {
        const currentAgent = agentRef.current; // Use ref
        if (!currentAgent || !isConnected) {
            return Promise.reject(new Error('Agent not available or not connected.'));
        }
        if (isCameraActive) return; // Already active
        setError(null); // Clear previous errors
        try {
            await currentAgent.startCameraCapture();
            // State update (setIsCameraActive(true)) is handled by the 'camera_started' event
        } catch (err) {
            console.error('[useGeminiAgent] startCamera error', err);
            const msg = err.message || 'Failed to start camera.';
            setError(msg);
            onErrorRef.current?.(msg);
            setIsCameraActive(false); // Ensure state is correct on error
            throw err; // Re-throw error for consumer
        }
    // Depend on isConnected, isCameraActive; agentRef.current is stable
    }, [isConnected, isCameraActive]);

    const stopCamera = useCallback(async () => {
        const currentAgent = agentRef.current; // Use ref
        // Only stop if agent exists and camera is active
        if (!currentAgent || !isCameraActive) return;
        setError(null); // Clear previous errors
        try {
            await currentAgent.stopCameraCapture();
             // State update (setIsCameraActive(false)) is handled by the 'camera_stopped' event
        } catch (err) {
            console.error('[useGeminiAgent] stopCamera error', err);
            const msg = err.message || 'Failed to stop camera.';
            setError(msg);
            onErrorRef.current?.(msg);
            // Camera state might be stuck if stop fails, the event handler is the source of truth
            // setIsCameraActive(false); // Event handler updates state
            throw err; // Re-throw error for consumer
        }
    // Depend on isCameraActive; agentRef.current is stable
    }, [isCameraActive]);


    const startScreenShare = useCallback(async () => {
        const currentAgent = agentRef.current; // Use ref
        if (!currentAgent || !isConnected) {
            return Promise.reject(new Error('Agent not available or not connected.'));
        }
        if (isScreenShareActive) return; // Already active
        setError(null); // Clear previous errors
        try {
            await currentAgent.startScreenShare();
             // State update (setIsScreenShareActive(true)) is handled by 'screenshare_started'
        } catch (err) {
            console.error('[useGeminiAgent] startScreenShare error', err);
            const msg = err.message || 'Failed to start screen share.';
            setError(msg);
            onErrorRef.current?.(msg);
            setIsScreenShareActive(false); // Ensure state is correct on error
            throw err; // Re-throw error for consumer
        }
    // Depend on isConnected, isScreenShareActive; agentRef.current is stable
    }, [isConnected, isScreenShareActive]);

    const stopScreenShare = useCallback(async () => {
        const currentAgent = agentRef.current; // Use ref
         // Only stop if agent exists and screenshare is active
        if (!currentAgent || !isScreenShareActive) return;
        setError(null); // Clear previous errors
        try {
            await currentAgent.stopScreenShare();
            // State update (setIsScreenShareActive(false)) is handled by 'screenshare_stopped'
        } catch (err) {
            console.error('[useGeminiAgent] stopScreenShare error', err);
            const msg = err.message || 'Failed to stop screen share.';
            setError(msg);
            onErrorRef.current?.(msg);
             // setIsScreenShareActive(false); // Event handler updates state
            throw err; // Re-throw error for consumer
        }
     // Depend on isScreenShareActive; agentRef.current is stable
    }, [isScreenShareActive]);


    // ────────────────────────────────────────────────────────────────────────────
    //  Public API
    // ────────────────────────────────────────────────────────────────────────────
    return {
        // state
        agent, // Provide agent state for potential direct inspection by consumer (read-only recommended)
        isConnected,
        isInitializing,
        isMicActive,
        isMicSuspended,
        isCameraActive,
        isScreenShareActive,
        error,

        // lifecycle
        connectAgent,
        disconnectAgent,

        // interaction
        sendText,
        toggleMic,
        startCamera,
        stopCamera,
        startScreenShare,
        stopScreenShare,

        // SSE helpers (optional for consumers)
        // Exposing these might be less useful now that SSE is tightly coupled
        // startSSE, // Consider if consumer still needs manual control
        // stopSSE,

        // callback refs
        onTranscriptionRef,
        onUserTranscriptionRef,
        onTranscriptForBackendRef,
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
