import { useState, useEffect, useRef, useCallback } from "react";
import { GeminiAgent } from "../lib/main/agent";
import { ToolManager } from "../lib/tools/tool-manager";
import { GoogleSearchTool } from "../lib/tools/google-search";
import { WolframAlphaTool } from "../lib/tools/wolf-from-alpha.js";
import { BackgroundTaskTool } from "../lib/tools/background-agent"; // Import the new tool
import { useAuth } from "./useAuth"; // Import useAuth to get user context
import { RAGQueryTool } from "../lib/tools/rag-tool";

// ────────────────────────────────────────────────────────────────────────────────
//  useGeminiAgent -- now with robust SSE support and forwarding SSE messages to agent
// ────────────────────────────────────────────────────────────────────────────────
export const useGeminiAgent = (settings, getGeminiConfig, getWebsocketUrl) => {
  const { user } = useAuth(); // Get user context here
  const [agent, setAgent] = useState(null);
  const agentRef = useRef(null); // <<< NEW: Ref to hold the current agent instance
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  // Media‑state flags
  const [isMicActive, setIsMicActive] = useState(false);
  const [isMicSuspended, setIsMicSuspended] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScreenShareActive, setIsScreenShareActive] = useState(false);
  // Error
  const [error, setError] = useState(null);

  // ───── Callbacks injected by the consumer ─────
  const onTranscriptionRef = useRef(null);
  const onUserTranscriptionRef = useRef(null);
  const onTranscriptForBackendRef = useRef(null);
  const onTextSentRef = useRef(null);
  const onInterruptedRef = useRef(null);
  const onTurnCompleteRef = useRef(null);
  const onScreenShareStoppedRef = useRef(null);
  const onErrorRef = useRef(null);
  const onMicStateChangedRef = useRef(null);
  const onCameraStartedRef = useRef(null);
  const onCameraStoppedRef = useRef(null);
  const onScreenShareStartedRef = useRef(null);

  // ───── Tools ─────
  const toolManager = useRef(null);
  useEffect(() => {
    if (!toolManager.current && settings?.backendBaseUrl) {
      toolManager.current = new ToolManager();
      toolManager.current.registerTool("googleSearch", new GoogleSearchTool());
      toolManager.current.registerTool("wolframAlpha", new WolframAlphaTool());
      toolManager.current.registerTool("ragQuery", new RAGQueryTool({}));
      // Register the BackgroundTaskTool, providing the necessary backend URL
      toolManager.current.registerTool(
        "executeBackgroundTask",
        new BackgroundTaskTool({ backendBaseUrl: settings.backendBaseUrl }),
      );
      console.log("[useGeminiAgent] ToolManager ready with all tools");
    }
  }, [settings?.backendBaseUrl]); // Re-run if backend URL changes

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
      console.warn("[SSE] backendBaseUrl missing in settings – SSE disabled.");
      return;
    }

    // Clear any existing reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const connectSSE = () => {
      const url = `${settings.backendBaseUrl.replace(/\/$/, "")}/api/agent/events `; // /events endpoint

      console.log(
        `[SSE] Connecting to ${url} (attempt ${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`,
      );

      const es = new EventSource(url);

      es.onopen = () => {
        console.log("[SSE] Connection established");
        reconnectAttemptsRef.current = 0; // Reset attempt counter on successful connection
      };

      es.addEventListener("chat_message", (e) => {
        // <<< MODIFIED LISTENER
        try {
          const data = JSON.parse(e.data); // { role, text }
          console.log("[SSE DATA RECEIVED]", data);

          // 1. Call the original callback (for UI/logging, if still needed)
          onTranscriptForBackendRef.current?.(data.role, data.text);

          // 2. Send the text to the Gemini Agent if it's available
          if (agentRef.current && data.status) {
            // Check ref and connection status
            console.log("[SSE] Forwarding text to agent:", data.text);
            // Use an async IIFE or handle promise for error catching
            (async () => {
              try {
                // Assuming sendText is the correct method to inject external text
                await agentRef.current.sendText(data.answer);
                // Optionally call onTextSentRef if appropriate for SSE-injected text
                // onTextSentRef.current?.(data.text);
              } catch (sendErr) {
                console.error("[SSE] Error sending text to agent:", sendErr);
                // Optionally notify the main error handler
                // onErrorRef.current?.(`Failed to forward SSE message to agent: ${sendErr.message}`);
              }
            })();
          } else {
            console.warn(
              "[SSE] Agent not available or not connected, cannot forward text:",
              data.text,
            );
          }
        } catch (err) {
          console.error("[SSE] Malformed payload or processing error", err);
        }
      });

      es.onerror = (evt) => {
        console.error("[SSE] Stream error", evt);
        console.error("[SSE] ReadyState:", es.readyState);

        // Close the current connection
        es.close();
        sseRef.current = null;

        // Implement exponential back-off reconnect
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay =
            INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
          console.log(`[SSE] Reconnecting in ${delay}ms...`);

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connectSSE();
          }, delay);
        } else {
          console.error("[SSE] Max reconnection attempts reached, giving up");
          const errorMsg =
            "Connection to event stream failed after multiple attempts";
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
      console.log("[SSE] Disconnected");
    }

    // Reset the reconnection attempt counter
    reconnectAttemptsRef.current = 0;
  }, []);

  // ────────────────────────────────────────────────────────────────────────────
  //  Agent connection & initialization
  // ────────────────────────────────────────────────────────────────────────────
  const connectAgent = useCallback(
    async (conversationContextSummary = "") => {
      // Use agentRef.current to check if already connecting/connected
      if (agentRef.current || isInitializing) {
        console.warn(
          "[useGeminiAgent] connect cancelled – already busy/connected",
        );
        return;
      }

      const url = getWebsocketUrl();
      if (!url) {
        const errMsg =
          "API Key or WebSocket URL is missing. Please configure settings.";
        setError(errMsg);
        onErrorRef.current?.(errMsg);
        return;
      }

      setError(null);
      setIsInitializing(true);

      try {
        const agentConfig = {
          url,
          config: getGeminiConfig(
            toolManager.current?.getToolDeclarations() || [],
            conversationContextSummary,
          ),
          deepgramApiKey: settings.deepgramApiKey || null,
          modelSampleRate: settings.sampleRate,
          toolManager: toolManager.current,
          transcribeUsersSpeech: settings.transcribeUsersSpeech || false,
          transcribeModelsSpeech: settings.transcribeModelsSpeech || false,
          settings,
          user: user, // <<< PASS THE AUTHENTICATED USER
        };
        console.log(
          "[useGeminiAgent] Creating GeminiAgent with user:",
          user?.id,
          agentConfig,
        );
        const newAgent = new GeminiAgent(agentConfig);

        // ── Hook‑up agent events to refs ──
        newAgent.on("transcription", (t) => {
          onTranscriptionRef.current?.(t);
          onTranscriptForBackendRef.current?.("agent", t);
        });
        newAgent.on("user_transcription", (t) => {
          onUserTranscriptionRef.current?.(t);
          onTranscriptForBackendRef.current?.("user", t);
        });
        newAgent.on("text_sent", (txt) => onTextSentRef.current?.(txt));
        newAgent.on("interrupted", () => onInterruptedRef.current?.());
        newAgent.on("turn_complete", () => onTurnCompleteRef.current?.());
        newAgent.on("screenshare_stopped", () => {
          setIsScreenShareActive(false);
          onScreenShareStoppedRef.current?.();
        });
        newAgent.on("error", (err) => {
          console.error("[useGeminiAgent] Agent error", err);
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          onErrorRef.current?.(msg);
        });
        newAgent.on("mic_state_changed", (s) => {
          setIsMicActive(s.active);
          setIsMicSuspended(s.suspended);
          onMicStateChangedRef.current?.(s);
        });
        newAgent.on("camera_started", () => {
          setIsCameraActive(true);
          onCameraStartedRef.current?.();
        });
        newAgent.on("camera_stopped", () => {
          setIsCameraActive(false);
          onCameraStoppedRef.current?.();
        });
        newAgent.on("screenshare_started", () => {
          setIsScreenShareActive(true);
          onScreenShareStartedRef.current?.();
        });

        // ── Connect & init ──
        agentRef.current = newAgent; // <<< UPDATE REF
        setAgent(newAgent); // <<< Update state for consumers

        await newAgent.connect();

        await newAgent.initialize();

        setIsConnected(true); // <<< Set connected state AFTER successful connection/init
        setIsMicActive(newAgent.audioRecorder?.isRecording || false);
        setIsMicSuspended(newAgent.audioRecorder?.isSuspended !== false);

        console.log("[useGeminiAgent] Agent ready");

        // ── Start SSE once the agent is live ──
        startSSE();
      } catch (err) {
        console.error("[useGeminiAgent] connect/init failed", err);
        const errorMsg =
          err.message || "Failed to connect or initialize agent.";
        setError(errorMsg);
        onErrorRef.current?.(errorMsg);

        agentRef.current?.disconnect?.().catch(console.error);
        agentRef.current = null;
        setAgent(null);
        setIsConnected(false);
        setIsMicActive(false);
        setIsMicSuspended(true);
        setIsCameraActive(false);
        setIsScreenShareActive(false);
      } finally {
        setIsInitializing(false);
      }
    },
    [
      isInitializing,
      isConnected,
      settings,
      getGeminiConfig,
      getWebsocketUrl,
      startSSE,
      user, // Add user as a dependency
    ],
  );

  // ────────────────────────────────────────────────────────────────────────────
  //  Disconnect
  // ────────────────────────────────────────────────────────────────────────────
  const disconnectAgent = useCallback(async () => {
    const agentToDisconnect = agentRef.current;
    if (!agentToDisconnect) {
      console.warn("[useGeminiAgent] disconnect cancelled – no agent");
      return;
    }
    console.log("[useGeminiAgent] Disconnecting agent…");
    try {
      await agentToDisconnect.disconnect();
    } catch (err) {
      console.error("[useGeminiAgent] Disconnect error", err);
      const errorMsg = err.message || "Failed to disconnect agent.";
      setError(errorMsg);
      onErrorRef.current?.(errorMsg);
    } finally {
      setAgent(null);
      setIsConnected(false);
      setIsInitializing(false);
      setIsMicActive(false);
      setIsMicSuspended(true);
      setIsCameraActive(false);
      setIsScreenShareActive(false);
      agentRef.current = null;
      stopSSE();
      console.log("[useGeminiAgent] Agent disconnected");
    }
  }, [stopSSE]);

  // ───── Cleanup on unmount ─────
  useEffect(() => {
    const agentInstance = agentRef.current;
    return () => {
      if (agentInstance) {
        agentInstance.disconnect().catch(console.error);
      }
      stopSSE();
    };
  }, [stopSSE]);

  // ────────────────────────────────────────────────────────────────────────────
  //  Interaction helpers (use agentRef.current)
  // ────────────────────────────────────────────────────────────────────────────

  const sendText = useCallback(
    async (text) => {
      if (!agentRef.current || !isConnected) {
        console.warn(
          "[useGeminiAgent] sendText cancelled – not connected or no agent",
        );
        return;
      }
      try {
        await agentRef.current.sendText(text);
      } catch (err) {
        console.error("[useGeminiAgent] sendText error", err);
        const msg = err.message || "Failed to send text.";
        setError(msg);
        onErrorRef.current?.(msg);
      }
    },
    [isConnected],
  );

  const sendImage = useCallback(
    async (base64Image) => {
      if (!agentRef.current || !isConnected) {
        console.warn(
          "[useGeminiAgent] sendImage cancelled – not connected or no agent",
        );
        return;
      }
      try {
        await agentRef.current.sendImage(base64Image);
      } catch (err) {
        console.error("[useGeminiAgent] sendImage error", err);
        const msg = err.message || "Failed to send image.";
        setError(msg);
        onErrorRef.current?.(msg);
      }
    },
    [isConnected],
  );

  const toggleMic = useCallback(async () => {
    const currentAgent = agentRef.current;
    if (!currentAgent || !isConnected) {
      return Promise.reject(new Error("Agent not available or not connected."));
    }
    try {
      await currentAgent.toggleMic();
    } catch (err) {
      console.error("[useGeminiAgent] toggleMic error", err);
      const msg = err.message || "Failed to toggle microphone.";
      setError(msg);
      onErrorRef.current?.(msg);
      setIsMicActive(currentAgent.audioRecorder?.isRecording || false);
      setIsMicSuspended(currentAgent.audioRecorder?.isSuspended !== false);
      throw err;
    }
  }, [isConnected]);

  const startCamera = useCallback(async () => {
    const currentAgent = agentRef.current;
    if (!currentAgent || !isConnected) {
      return Promise.reject(new Error("Agent not available or not connected."));
    }
    if (isCameraActive) return;
    setError(null);
    try {
      await currentAgent.startCameraCapture();
    } catch (err) {
      console.error("[useGeminiAgent] startCamera error", err);
      const msg = err.message || "Failed to start camera.";
      setError(msg);
      onErrorRef.current?.(msg);
      setIsCameraActive(false);
      throw err;
    }
  }, [isConnected, isCameraActive]);

  const stopCamera = useCallback(async () => {
    const currentAgent = agentRef.current;
    if (!currentAgent || !isCameraActive) return;
    setError(null);
    try {
      await currentAgent.stopCameraCapture();
    } catch (err) {
      console.error("[useGeminiAgent] stopCamera error", err);
      const msg = err.message || "Failed to stop camera.";
      setError(msg);
      onErrorRef.current?.(msg);
      throw err;
    }
  }, [isCameraActive]);

  const startScreenShare = useCallback(async () => {
    const currentAgent = agentRef.current;
    if (!currentAgent || !isConnected) {
      return Promise.reject(new Error("Agent not available or not connected."));
    }
    if (isScreenShareActive) return;
    setError(null);
    try {
      await currentAgent.startScreenShare();
    } catch (err) {
      console.error("[useGeminiAgent] startScreenShare error", err);
      const msg = err.message || "Failed to start screen share.";
      setError(msg);
      onErrorRef.current?.(msg);
      setIsScreenShareActive(false);
      throw err;
    }
  }, [isConnected, isScreenShareActive]);

  const stopScreenShare = useCallback(async () => {
    const currentAgent = agentRef.current;
    if (!currentAgent || !isScreenShareActive) return;
    setError(null);
    try {
      await currentAgent.stopScreenShare();
    } catch (err) {
      console.error("[useGeminiAgent] stopScreenShare error", err);
      const msg = err.message || "Failed to stop screen share.";
      setError(msg);
      onErrorRef.current?.(msg);
      throw err;
    }
  }, [isScreenShareActive]);

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
    sendImage,
    toggleMic,
    startCamera,
    stopCamera,
    startScreenShare,
    stopScreenShare,

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
