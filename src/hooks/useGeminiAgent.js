import { useState, useEffect, useRef, useCallback } from 'react';
import { GeminiAgent } from '../lib/main/agent';
import { ToolManager } from '../lib/tools/tool-manager';
import { GoogleSearchTool } from '../lib/tools/google-search';   // Assuming this exists
import { WolframAlphaTool } from '../lib/tools/wolf-from-alpha.js';

// ────────────────────────────────────────────────────────────────────────────────
//  useGeminiAgent ‑‑ now with robust SSE support
// ────────────────────────────────────────────────────────────────────────────────
export const useGeminiAgent = (settings, getGeminiConfig, getWebsocketUrl) => {
    const [agent, setAgent]               = useState(null);
    const [isConnected, setIsConnected]   = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    // Media‑state flags
    const [isMicActive, setIsMicActive]               = useState(false);
    const [isMicSuspended, setIsMicSuspended]         = useState(true);
    const [isCameraActive, setIsCameraActive]         = useState(false);
    const [isScreenShareActive, setIsScreenShareActive] = useState(false);
    // Error
    const [error, setError] = useState(null);

    // ───── Callbacks injected by the consumer ─────
    const onTranscriptionRef       = useRef(null);
    const onUserTranscriptionRef   = useRef(null);
    const onTranscriptForBackendRef = useRef(null);   // NEW (already in original code)
    const onTextSentRef            = useRef(null);
    const onInterruptedRef         = useRef(null);
    const onTurnCompleteRef        = useRef(null);
    const onScreenShareStoppedRef  = useRef(null);
    const onErrorRef               = useRef(null);
    const onMicStateChangedRef     = useRef(null);
    const onCameraStartedRef       = useRef(null);
    const onCameraStoppedRef       = useRef(null);
    const onScreenShareStartedRef  = useRef(null);

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
    const sseRef = useRef(null);          // keeps current EventSource instance
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

            es.addEventListener('chat_message', (e) => {
                try {
                    const data = JSON.parse(e.data);   // { role, text }
                    console.log("[SSE DATA]", data);
                    onTranscriptForBackendRef.current?.(data.role, data.text);
                } catch (err) {
                    console.error('[SSE] Malformed payload', err);
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
                    setError('Connection to event stream failed after multiple attempts');
                    onErrorRef.current?.('Connection to event stream failed after multiple attempts');
                }
            };

            sseRef.current = es;
        };

        // Start the initial connection
        connectSSE();
        
    }, [settings?.backendBaseUrl]);

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
        if (agent || isInitializing || isConnected) {
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
            newAgent.on('transcription',      (t) => {
                onTranscriptionRef.current?.(t);
                onTranscriptForBackendRef.current?.('agent', t);
            });
            newAgent.on('user_transcription', (t) => {
                onUserTranscriptionRef.current?.(t);
                onTranscriptForBackendRef.current?.('user', t);
            });
            newAgent.on('text_sent',          (txt) => onTextSentRef.current?.(txt));
            newAgent.on('interrupted',        ()    => onInterruptedRef.current?.());
            newAgent.on('turn_complete',      ()    => onTurnCompleteRef.current?.());
            newAgent.on('screenshare_stopped',()    => {
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
            newAgent.on('camera_started',     () => {
                setIsCameraActive(true);
                onCameraStartedRef.current?.();
            });
            newAgent.on('camera_stopped',     () => {
                setIsCameraActive(false);
                onCameraStoppedRef.current?.();
            });
            newAgent.on('screenshare_started',() => {
                setIsScreenShareActive(true);
                onScreenShareStartedRef.current?.();
            });

            // ── Connect & init ──
            setAgent(newAgent);
            await newAgent.connect();
            await newAgent.initialize();

            setIsConnected(true);
            setIsMicActive(newAgent.audioRecorder?.isRecording || false);
            setIsMicSuspended(newAgent.audioRecorder?.isSuspended !== false);

            console.log('[useGeminiAgent] Agent ready');

            // ── Start SSE once the agent is live ──
            startSSE();

        } catch (err) {
            console.error('[useGeminiAgent] connect/init failed', err);
            setError(err.message || 'Failed to connect or initialize agent.');
            onErrorRef.current?.(err.message || 'Failed to connect or initialize agent.');

            agent?.disconnect?.();
            setAgent(null);
            setIsConnected(false);
            setIsMicActive(false);
            setIsMicSuspended(true);
            setIsCameraActive(false);
            setIsScreenShareActive(false);
        } finally {
            setIsInitializing(false);
        }
    }, [
        agent,
        isInitializing,
        isConnected,
        settings,
        getGeminiConfig,
        getWebsocketUrl,
        startSSE
    ]);

    // ────────────────────────────────────────────────────────────────────────────
    //  Disconnect
    // ────────────────────────────────────────────────────────────────────────────
    const disconnectAgent = useCallback(async () => {
        if (!agent) {
            console.warn('[useGeminiAgent] disconnect cancelled – no agent');
            return;
        }
        console.log('[useGeminiAgent] Disconnecting agent…');
        try {
            await agent.disconnect();
        } catch (err) {
            console.error('[useGeminiAgent] Disconnect error', err);
            setError(err.message || 'Failed to disconnect agent.');
            onErrorRef.current?.(err.message || 'Failed to disconnect agent.');
        } finally {
            setAgent(null);
            setIsConnected(false);
            setIsInitializing(false);
            setIsMicActive(false);
            setIsMicSuspended(true);
            setIsCameraActive(false);
            setIsScreenShareActive(false);
            setError(null);
            stopSSE();                       // ─── SSE off ───
            console.log('[useGeminiAgent] Agent disconnected');
        }
    }, [agent, stopSSE]);

    // ───── Cleanup on unmount ─────
    useEffect(() => () => {
        if (agent) agent.disconnect().catch(console.error);
        stopSSE();                           // ensure SSE closed
    }, [agent, stopSSE]);

    // ────────────────────────────────────────────────────────────────────────────
    //  Interaction helpers (sendText, toggleMic, camera, screenshare)
    // ────────────────────────────────────────────────────────────────────────────

    const sendText = useCallback(async (text) => {
        if (!agent || !isConnected) {
            console.warn('[useGeminiAgent] sendText cancelled – not connected');
            return;
        }
        try {
            await agent.sendText(text);
        } catch (err) {
            console.error('[useGeminiAgent] sendText error', err);
            setError(err.message || 'Failed to send text.');
            onErrorRef.current?.(err.message || 'Failed to send text.');
        }
    }, [agent, isConnected]);

    const toggleMic = useCallback(async () => {
        if (!agent || !isConnected) {
            return Promise.reject(new Error('Agent not available or not connected.'));
        }
        try {
            await agent.toggleMic();
        } catch (err) {
            console.error('[useGeminiAgent] toggleMic error', err);
            const msg = err.message || 'Failed to toggle microphone.';
            setError(msg);
            onErrorRef.current?.(msg);
            setIsMicActive(agent.audioRecorder?.isRecording || false);
            setIsMicSuspended(agent.audioRecorder?.isSuspended !== false);
            throw err;
        }
    }, [agent, isConnected]);

    const startCamera = useCallback(async () => {
        if (!agent || !isConnected) {
            return Promise.reject(new Error('Agent not available or not connected.'));
        }
        if (isCameraActive) return;
        setError(null);
        try {
            await agent.startCameraCapture();
        } catch (err) {
            console.error('[useGeminiAgent] startCamera error', err);
            const msg = err.message || 'Failed to start camera.';
            setError(msg);
            onErrorRef.current?.(msg);
            setIsCameraActive(false);
            throw err;
        }
    }, [agent, isConnected, isCameraActive]);

    const stopCamera = useCallback(async () => {
        if (!agent || !isCameraActive) return;
        setError(null);
        try {
            await agent.stopCameraCapture();
        } catch (err) {
            console.error('[useGeminiAgent] stopCamera error', err);
            const msg = err.message || 'Failed to stop camera.';
            setError(msg);
            onErrorRef.current?.(msg);
            setIsCameraActive(false);
            throw err;
        }
    }, [agent, isCameraActive]);

    const startScreenShare = useCallback(async () => {
        if (!agent || !isConnected) {
            return Promise.reject(new Error('Agent not available or not connected.'));
        }
        if (isScreenShareActive) return;
        setError(null);
        try {
            await agent.startScreenShare();
        } catch (err) {
            console.error('[useGeminiAgent] startScreenShare error', err);
            const msg = err.message || 'Failed to start screen share.';
            setError(msg);
            onErrorRef.current?.(msg);
            setIsScreenShareActive(false);
            throw err;
        }
    }, [agent, isConnected, isScreenShareActive]);

    const stopScreenShare = useCallback(async () => {
        if (!agent || !isScreenShareActive) return;
        setError(null);
        try {
            await agent.stopScreenShare();
        } catch (err) {
            console.error('[useGeminiAgent] stopScreenShare error', err);
            const msg = err.message || 'Failed to stop screen share.';
            setError(msg);
            onErrorRef.current?.(msg);
            setIsScreenShareActive(false);
            throw err;
        }
    }, [agent, isScreenShareActive]);

    // ────────────────────────────────────────────────────────────────────────────
    //  Public API
    // ────────────────────────────────────────────────────────────────────────────
    return {
        // state
        agent,
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
        startSSE,
        stopSSE,

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
