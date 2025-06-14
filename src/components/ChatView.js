import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FaLink,
  FaUnlink,
  FaPaperPlane,
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaDesktop,
  FaSyncAlt,
  FaExclamationTriangle,
  FaSpinner,
  FaCheckCircle,
  FaTimesCircle,
} from "react-icons/fa";
import AudioVisualizerComponent from "./AudioVisualizerComponent";
import { useGeminiAgent } from "../hooks/useGeminiAgent";

const ChatView = ({
  user,
  session,
  settings,
  getGeminiConfig,
  getWebsocketUrl,
  onConnectionChange,
  chatId,
}) => {
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
    onTranscriptionRef,
    onTextSentRef,
    onInterruptedRef,
    onTurnCompleteRef,
    onScreenShareStoppedRef,
    onUserTranscriptionRef,
    onTranscriptForBackendRef,
    onMicStateChangedRef,
    onCameraStartedRef,
    onCameraStoppedRef,
    onScreenShareStartedRef,
  } = useGeminiAgent(settings, getGeminiConfig, getWebsocketUrl);

  const [messages, setMessages] = useState([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const streamingMessageRef = useRef(null);
  const chatHistoryRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);
  const [screenError, setScreenError] = useState(null);

  const displayMicActive = isMicActive && !isMicSuspended;
  const canInteract = session && isConnected && !isInitializing;
  const showConnectPrompt = session && !isConnected && !isInitializing && !agentError;
  const showConnectError = session && agentError && !isConnected && !isInitializing;

  // Notify parent of connection changes
  useEffect(() => {
    if (onConnectionChange) {
      onConnectionChange(isConnected);
    }
  }, [isConnected, onConnectionChange]);

  // Auto-scroll chat history
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = useCallback(
    (sender, text, isStreaming = false, type = "text") => {
      setMessages((prev) => {
        const newMessage = {
          id: Date.now() + Math.random(),
          sender,
          text,
          isStreaming,
          type,
        };
        if (sender === "model" && isStreaming) {
          streamingMessageRef.current = newMessage.id;
        }
        const filteredPrev = prev.filter(
          (msg) =>
            !(msg.type === "audio_input_placeholder" && sender === "model"),
        );
        return [...filteredPrev, newMessage];
      });
      if (sender === "model" && isStreaming) {
        setCurrentTranscript(text);
      }
    },
    [],
  );

  const addUserAudioPlaceholder = useCallback(() => {
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.type === "audio_input_placeholder") return prev;
      return [
        ...prev,
        {
          id: "placeholder-" + Date.now(),
          sender: "user",
          text: "Listening...",
          type: "audio_input_placeholder",
          isStreaming: false,
        },
      ];
    });
  }, []);

  const updateStreamingMessage = useCallback((transcriptChunk) => {
    setCurrentTranscript((prevTranscript) => {
      const newFullTranscript = (prevTranscript + transcriptChunk).trimStart();
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === streamingMessageRef.current
            ? { ...msg, text: newFullTranscript, isStreaming: true }
            : msg,
        ),
      );
      return newFullTranscript;
    });
  }, []);

  const finalizeStreamingMessage = useCallback(() => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === streamingMessageRef.current
          ? { ...msg, isStreaming: false }
          : msg,
      ),
    );
    streamingMessageRef.current = null;
    setCurrentTranscript("");
  }, []);

  const sendTranscriptToBackend = useCallback(
    async (speaker, transcript) => {
      if (!transcript || transcript.trim() === "") return;
      if (!chatId) {
        console.warn("sendTranscriptToBackend called without a chatId. Skipping log.");
        return;
      }
      const backendUrl = `${settings.backendBaseUrl || "http://localhost:8080"}/api/text`;
      console.log(
        `Sending to Go backend (for main agent log): Speaker=${speaker}, Text=${transcript.substring(0, 50)}... via ${backendUrl}`,
      );

      try {
        const payload = {
          speaker,
          text: transcript,
          timestamp: new Date().toISOString(),
          session_id: "main_gemini_session",
          ChatId: chatId,
          UserId: user?.id || 1,
        };

        const response = await fetch(backendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error(
            `Go Backend Logging Error (${response.status}): ${errorData}`,
          );
        }
      } catch (error) {
        console.error(
          `Network Error logging transcript for ${speaker}:`,
          error,
        );
      }
    },
    [settings.backendBaseUrl, chatId, user?.id],
  );

  // Set up agent callbacks
  useEffect(() => {
    onTranscriptionRef.current = (transcript) => {
      if (!streamingMessageRef.current) {
        addMessage("model", transcript, true);
      } else {
        updateStreamingMessage(" " + transcript);
      }
    };

    onUserTranscriptionRef.current = (transcript) => {
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.type === "audio_input_placeholder") {
          return prev.map((msg) =>
            msg.id === lastMsg.id ? { ...msg, text: ` ${transcript}` } : msg,
          );
        } else if (
          !prev.some((msg) => msg.type === "audio_input_placeholder") &&
          displayMicActive
        ) {
          return [
            ...prev,
            {
              id: "placeholder-" + Date.now(),
              sender: "user",
              text: ` ${transcript}`,
              type: "audio_input_placeholder",
              isStreaming: false,
            },
          ];
        }
        return prev;
      });
    };

    onTranscriptForBackendRef.current = sendTranscriptToBackend;

    onTextSentRef.current = (text) => {
      finalizeStreamingMessage();
      addMessage("user", text, false, "text");
    };

    onInterruptedRef.current = () => {
      finalizeStreamingMessage();
      if (displayMicActive) {
        addUserAudioPlaceholder();
      }
    };

    onTurnCompleteRef.current = finalizeStreamingMessage;

    onScreenShareStoppedRef.current = () => {
      console.log("Screen share stopped (event received in ChatView)");
      setScreenError(null);
    };

    onMicStateChangedRef.current = (state) => {
      if (state.active && !state.suspended) {
        addUserAudioPlaceholder();
      } else {
        setMessages((prev) =>
          prev.filter((msg) => msg.type !== "audio_input_placeholder"),
        );
      }
    };

    onCameraStartedRef.current = () => {
      console.log("ChatView: Camera Started");
      setCameraError(null);
    };

    onCameraStoppedRef.current = () => {
      console.log("ChatView: Camera Stopped");
    };

    onScreenShareStartedRef.current = () => {
      console.log("ChatView: Screen Share Started");
      setScreenError(null);
    };
  }, [
    addMessage,
    updateStreamingMessage,
    finalizeStreamingMessage,
    addUserAudioPlaceholder,
    displayMicActive,
    sendTranscriptToBackend,
  ]);

  const handleConnect = useCallback(() => {
    if (!session) {
      alert("Please log in first to connect.");
      return;
    }
    if (!isConnected && !isInitializing) {
      setCameraError(null);
      setScreenError(null);
      setMessages([]);
      connectAgent().catch((err) =>
        console.error("ChatView: Connection failed", err),
      );
    }
  }, [session, isConnected, isInitializing, connectAgent]);

  const handleDisconnect = useCallback(() => {
    if (isConnected) {
      disconnectAgent();
      setMessages([]);
      setCurrentTranscript("");
      streamingMessageRef.current = null;
      setCameraError(null);
      setScreenError(null);
    }
  }, [isConnected, disconnectAgent]);

  const handleSendMessage = useCallback(
    (text) => {
      const trimmedText = text.trim();
      if (trimmedText && agent && isConnected && session) {
        finalizeStreamingMessage();
        setMessages((prev) =>
          prev.filter((msg) => msg.type !== "audio_input_placeholder"),
        );
        sendText(trimmedText);
      }
    },
    [agent, isConnected, session, finalizeStreamingMessage, sendText],
  );

  const handleToggleMic = useCallback(() => {
    if (agent && isConnected && session) {
      toggleMic().catch((err) => {
        console.error("ChatView: Toggle mic error", err);
        alert(`Mic error: ${err.message}`);
      });
    } else if (!session) {
      alert("Please log in to use the microphone.");
    } else if (!isConnected) {
      alert("Please connect the agent first.");
    }
  }, [agent, isConnected, session, toggleMic]);

  const handleToggleCamera = useCallback(async () => {
    if (!agent || !isConnected || !session) {
      if (!session) alert("Please log in to use the camera.");
      else if (!isConnected) alert("Please connect the agent first.");
      return;
    }

    setCameraError(null);
    const preview = document.getElementById("cameraPreview");

    try {
      if (isCameraActive) {
        await stopCamera();
        if (preview) preview.style.display = "none";
      } else {
        await startCamera();
        if (preview) preview.style.display = "block";
      }
    } catch (error) {
      console.error("ChatView: Camera toggle error:", error);
      setCameraError(error.message);
      if (preview) preview.style.display = "none";
    }
  }, [agent, isConnected, session, isCameraActive, startCamera, stopCamera]);

  const handleToggleScreenShare = useCallback(async () => {
    if (!agent || !isConnected || !session) {
      if (!session) alert("Please log in to use screen sharing.");
      else if (!isConnected) alert("Please connect the agent first.");
      return;
    }

    setScreenError(null);
    const preview = document.getElementById("screenPreview");

    try {
      if (isScreenShareActive) {
        await stopScreenShare();
        if (preview) preview.style.display = "none";
      } else {
        await startScreenShare();
        if (preview) preview.style.display = "block";
      }
    } catch (error) {
      console.error("ChatView: Screen share toggle error:", error);
      setScreenError(error.message);
      if (preview) preview.style.display = "none";
    }
  }, [
    agent,
    isConnected,
    session,
    isScreenShareActive,
    startScreenShare,
    stopScreenShare,
  ]);

  const handleSwitchCamera = useCallback(async () => {
    if (
      agent?.cameraManager &&
      isCameraActive &&
      session &&
      /Mobi|Android/i.test(navigator.userAgent)
    ) {
      try {
        setCameraError(null);
        await agent.cameraManager.switchCamera();
        console.log("ChatView: Switched camera");
      } catch (e) {
        console.error("ChatView: Error switching camera:", e);
        setCameraError(`Switch failed: ${e.message}`);
      }
    }
  }, [agent, isCameraActive, session]);

  const handleInputKeyPress = useCallback(
    (e) => {
      if (e.key === "Enter" && e.target.value.trim()) {
        handleSendMessage(e.target.value);
        e.target.value = "";
      }
    },
    [handleSendMessage],
  );

  const handleSendButtonClick = useCallback(() => {
    const input = document.getElementById("messageInput");
    if (input && input.value.trim()) {
      handleSendMessage(input.value);
      input.value = "";
    }
  }, [handleSendMessage]);

  const getUserDisplayName = useCallback(() => {
    if (!user) return "Guest";
    return (
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "User"
    );
  }, [user]);

  return (
    <div className="chat-area">
      <div id="chatHistory" ref={chatHistoryRef} className="chat-history">
        {showConnectPrompt && (
          <div className="connect-prompt-container">
            <p>Welcome, {getUserDisplayName()}!</p>
            <p>Connect to the main agent to start the session.</p>
            <button
              onClick={handleConnect}
              className="connect-prompt-button"
              disabled={isInitializing}
            >
              {isInitializing ? (
                <FaSpinner className="fa-spin" />
              ) : (
                <FaLink />
              )}
              {isInitializing ? " Connecting..." : " Connect Main Agent"}
            </button>
          </div>
        )}

        {showConnectError && (
          <div className="chat-message system-message error-message">
            <FaExclamationTriangle /> Connection failed: {agentError}
            <br /> Please check settings or try again.
            <button
              onClick={handleConnect}
              className="connect-prompt-button retry-button"
              disabled={isInitializing}
            >
              {isInitializing ? (
                <FaSpinner className="fa-spin" />
              ) : (
                <FaSyncAlt />
              )}
              {isInitializing ? " Retrying..." : " Retry Connect"}
            </button>
          </div>
        )}

        {isConnected && messages.length === 0 && (
          <div className="chat-message system-message">
            Agent connected. Say hello or use the mic!
          </div>
        )}

        {isConnected &&
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-message ${
                msg.sender === "user" ? "user-message" : "model-message"
              } type-${msg.type || "text"} ${msg.isStreaming ? "streaming" : ""}`}
            >
              {msg.text}
            </div>
          ))}
      </div>

      {canInteract && agent?.initialized && (
        <AudioVisualizerComponent agent={agent} />
      )}

      {session && (
        <div className="footer-controls-stacked">
          <div className="floating-media-controls">
            <button
              onClick={handleToggleMic}
              className={`control-btn mic-btn ${displayMicActive ? "active" : ""} ${
                isMicSuspended && isMicActive ? "suspended" : ""
              }`}
              disabled={!canInteract}
              title={
                !session
                  ? "Login Required"
                  : !isConnected
                    ? "Connect First"
                    : (displayMicActive
                        ? "Mute Microphone"
                        : "Unmute Microphone") +
                      (isMicSuspended && isMicActive
                        ? " (Suspended - Click to Unmute)"
                        : "")
              }
            >
              {displayMicActive ? <FaMicrophone /> : <FaMicrophoneSlash />}
              <span className="button-text">Mic</span>
            </button>

            <button
              onClick={handleToggleCamera}
              className={`control-btn cam-btn ${isCameraActive ? "active" : ""} ${
                cameraError ? "error" : ""
              }`}
              disabled={!canInteract}
              title={
                !session
                  ? "Login Required"
                  : !isConnected
                    ? "Connect First"
                    : cameraError
                      ? `Camera Error: ${cameraError}`
                      : isCameraActive
                        ? "Stop Camera"
                        : "Start Camera"
              }
            >
              {isCameraActive ? <FaVideo /> : <FaVideoSlash />}
              <span className="button-text">Cam</span>
            </button>

            <button
              onClick={handleToggleScreenShare}
              className={`control-btn screen-btn ${
                isScreenShareActive ? "active" : ""
              } ${screenError ? "error" : ""}`}
              disabled={!canInteract}
              title={
                !session
                  ? "Login Required"
                  : !isConnected
                    ? "Connect First"
                    : screenError
                      ? `Screen Share Error: ${screenError}`
                      : isScreenShareActive
                        ? "Stop Screen Sharing"
                        : "Start Screen Sharing"
              }
            >
              <FaDesktop />
              <span className="button-text">Screen</span>
            </button>
          </div>

          <div className="text-input-container">
            <input
              id="messageInput"
              type="text"
              placeholder={
                !session
                  ? "Please log in first"
                  : !isConnected
                    ? "Connect agent to chat"
                    : displayMicActive
                      ? "Listening..."
                      : "Type message or turn on mic..."
              }
              disabled={!canInteract || displayMicActive}
              onKeyPress={handleInputKeyPress}
            />
            <button
              onClick={handleSendButtonClick}
              className="send-icon-button"
              disabled={
                !canInteract ||
                displayMicActive ||
                (typeof document !== "undefined" &&
                  (!document.getElementById("messageInput") ||
                    document
                      .getElementById("messageInput")
                      .value.trim() === ""))
              }
              title="Send Message"
            >
              <FaPaperPlane />
            </button>
          </div>
        </div>
      )}

      {/* Camera Switch Button for Mobile */}
      {isCameraActive &&
        /Mobi|Android/i.test(navigator.userAgent) &&
        session &&
        agent?.cameraManager?.stream && (
          <button
            onClick={handleSwitchCamera}
            className="switch-camera-btn"
            title="Switch Camera"
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              zIndex: 1000,
            }}
          >
            <FaSyncAlt />
          </button>
        )}
    </div>
  );
};

export default ChatView;
