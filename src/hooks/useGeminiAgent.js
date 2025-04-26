import { useState, useEffect, useRef, useCallback } from 'react';
import { GeminiAgent } from '../lib/main/agent';
import { ToolManager } from '../lib/tools/tool-manager';
import { GoogleSearchTool } from '../lib/tools/google-search'; // Assuming this exists

export const useGeminiAgent = (settings, getGeminiConfig, getWebsocketUrl) => {
    const [agent, setAgent] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [isMicActive, setIsMicActive] = useState(false); // Reflects recording state (not necessarily suspended state)
    const [isMicSuspended, setIsMicSuspended] = useState(true); // Starts suspended
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isScreenShareActive, setIsScreenShareActive] = useState(false);
    const [error, setError] = useState(null);

    // Store callbacks in refs to avoid dependency issues in useEffect
    const onTranscriptionRef = useRef(null);
    const onTextSentRef = useRef(null);
    const onInterruptedRef = useRef(null);
    const onTurnCompleteRef = useRef(null);
    const onScreenShareStoppedRef = useRef(null);
    const onUserTranscriptionRef = useRef(null); // If using user transcription

    // Tool Manager Setup
    const toolManager = useRef(new ToolManager());
    useEffect(() => {
        toolManager.current.registerTool('googleSearch', new GoogleSearchTool());
        // Register other tools if needed
    }, []);

    const connectAgent = useCallback(async () => {
        if (agent || isInitializing) return;

        const url = getWebsocketUrl();
        if (!url) {
            setError('API Key is missing. Please configure settings.');
            console.error('API Key is missing.');
            return; // Don't try to connect without API key
        }
        setError(null); // Clear previous errors
        setIsInitializing(true);

        try {
            const config = getGeminiConfig(toolManager.current.getToolDeclarations());
            const newAgent = new GeminiAgent({
                url,
                config,
                deepgramApiKey: settings.deepgramApiKey || null,
                modelSampleRate: settings.sampleRate,
                toolManager: toolManager.current,
                // Add transcribeUsersSpeech: true if needed
            });

            // --- Setup Event Listeners ---
            newAgent.on('transcription', (transcript) => onTranscriptionRef.current?.(transcript));
            newAgent.on('text_sent', (text) => onTextSentRef.current?.(text));
            newAgent.on('interrupted', () => onInterruptedRef.current?.());
            newAgent.on('turn_complete', () => onTurnCompleteRef.current?.());
            newAgent.on('screenshare_stopped', () => {
                 setIsScreenShareActive(false);
                 onScreenShareStoppedRef.current?.();
             });
            // newAgent.on('user_transcription', (transcript) => onUserTranscriptionRef.current?.(transcript));
            // --- End Event Listeners ---

            await newAgent.connect();
            await newAgent.initialize(); // Initialize includes starting audio context, streamer, recorder (but not recording yet)

            setAgent(newAgent);
            setIsConnected(true);
            setIsMicSuspended(true); // Ensure mic starts suspended after init
             // Trigger initial model response after successful init
            await newAgent.sendText('.');

        } catch (err) {
            console.error('Agent Connection/Initialization Error:', err);
            setError(err.message || 'Failed to connect or initialize agent.');
            setAgent(null);
            setIsConnected(false);
        } finally {
            setIsInitializing(false);
        }
    }, [settings, getGeminiConfig, getWebsocketUrl, agent, isInitializing]); // Add dependencies

    const disconnectAgent = useCallback(async () => {
        if (!agent) return;
        try {
            await agent.disconnect();
        } catch (err) {
            console.error('Agent Disconnect Error:', err);
            setError(err.message || 'Failed to disconnect agent cleanly.');
        } finally {
            setAgent(null);
            setIsConnected(false);
            setIsMicActive(false);
            setIsMicSuspended(true);
            setIsCameraActive(false);
            setIsScreenShareActive(false);
            // No need to setIsInitializing(false) here
        }
    }, [agent]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            agent?.disconnect();
        };
    }, [agent]);

    // --- Agent Interaction Methods ---

    const sendText = useCallback(async (text) => {
        if (!agent || !isConnected) return;
        try {
            await agent.sendText(text);
        } catch (err) {
            console.error("Send Text Error:", err);
            setError(err.message || 'Failed to send text.');
        }
    }, [agent, isConnected]);

    const toggleMic = useCallback(async () => {
        if (!agent || !isConnected) return;
        try {
             // If the recorder stream doesn't exist yet, start it first
            if (!agent.audioRecorder?.stream) {
                await agent.startRecording(); // This initializes the stream
                 setIsMicActive(true); // Mark as active (recording started)
                 setIsMicSuspended(false); // It starts un-suspended
                 console.log("Mic started and recording");
                 return;
            }

             // Otherwise, toggle suspension
            await agent.toggleMic();
            const suspended = agent.audioRecorder.isSuspended;
            setIsMicSuspended(suspended);
            console.log("Mic toggled, suspended:", suspended);

        } catch (err) {
            console.error("Toggle Mic Error:", err);
            setError(err.message || 'Failed to toggle microphone.');
            // Revert state on error?
            setIsMicActive(false);
            setIsMicSuspended(true);
        }
    }, [agent, isConnected]);


     const startCamera = useCallback(async () => {
        if (!agent || !isConnected || isCameraActive) return;
         try {
            await agent.startCameraCapture();
            setIsCameraActive(true);
        } catch (err) {
            console.error("Start Camera Error:", err);
            setError(err.message || 'Failed to start camera.');
            setIsCameraActive(false);
        }
    }, [agent, isConnected, isCameraActive]);

    const stopCamera = useCallback(async () => {
         if (!agent || !isCameraActive) return;
        try {
            await agent.stopCameraCapture();
            setIsCameraActive(false);
        } catch (err) {
            console.error("Stop Camera Error:", err);
            setError(err.message || 'Failed to stop camera.');
            // State might be inconsistent, force false
            setIsCameraActive(false);
        }
    }, [agent, isCameraActive]);


     const startScreenShare = useCallback(async () => {
        if (!agent || !isConnected || isScreenShareActive) return;
        try {
            await agent.startScreenShare();
            setIsScreenShareActive(true);
        } catch (err) {
             console.error("Start Screen Share Error:", err);
             setError(err.message || 'Failed to start screen share.');
             setIsScreenShareActive(false); // Ensure state is correct on error
        }
    }, [agent, isConnected, isScreenShareActive]);

    const stopScreenShare = useCallback(async () => {
        if (!agent || !isScreenShareActive) return;
        try {
            await agent.stopScreenShare();
            // The 'screenshare_stopped' event handler in connectAgent will set isScreenShareActive to false.
        } catch (err) {
            console.error("Stop Screen Share Error:", err);
            setError(err.message || 'Failed to stop screen share.');
            // Force state just in case
             setIsScreenShareActive(false);
        }
    }, [agent, isScreenShareActive]);


    return {
        agent, // Expose agent if direct access is needed (e.g., for visualizer)
        isConnected,
        isInitializing,
        isMicActive,
        isMicSuspended,
        isCameraActive,
        isScreenShareActive,
        error,
        connectAgent,
        disconnectAgent,
        sendText,
        toggleMic,
        startCamera,
        stopCamera,
        startScreenShare,
        stopScreenShare,
        // Refs for setting callbacks
        onTranscriptionRef,
        onTextSentRef,
        onInterruptedRef,
        onTurnCompleteRef,
        onScreenShareStoppedRef,
        onUserTranscriptionRef,
    };
};
