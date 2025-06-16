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
} from "react-icons/fa";
import AudioVisualizerComponent from "./AudioVisualizerComponent";
import { useGeminiAgent } from "../hooks/useGeminiAgent";
import ChatService from "../services/chatService";

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
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const streamingMessageRef = useRef(null);
  const agentTextBufferRef = useRef('');
  const userTranscriptBufferRef = useRef('');
  // NEW: Track if we've already sent the current user transcript
  const userTranscriptSentRef = useRef(false);
  const chatHistoryRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);
  const [screenError, setScreenError] = useState(null);

  const displayMicActive = isMicActive && !isMicSuspended;
  const canInteract = session && isConnected && !isInitializing;
  const showConnectPrompt = session && !isConnected && !isInitializing && !agentError;
  const showConnectError = session && agentError && !isConnected && !isInitializing;

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [messages, historyLoading]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!chatId) {
        setMessages([]);
        setHistoryLoading(false);
        return;
      }
      try {
        setHistoryLoading(true);
        setHistoryError(null);
        const history = await ChatService.getChatHistory(chatId);
        const formattedHistory = history.map(msg => ({
          id: msg.id,
          sender: msg.speaker === 'user' ? 'user' : 'model',
          text: msg.text,
          isStreaming: false,
          type: 'text'
        }));
        setMessages(formattedHistory);
      } catch (err) {
        console.error("Failed to load chat history:", err);
        setHistoryError(err.message || "Could not load messages.");
      } finally {
        setHistoryLoading(false);
      }
    };
    loadHistory();
  }, [chatId]);

  useEffect(() => {
    if (onConnectionChange) {
      onConnectionChange(isConnected);
    }
  }, [isConnected, onConnectionChange]);

  const addMessage = useCallback((sender, text, isStreaming = false, type = "text") => {
    setMessages((prev) => {
      const newMessage = { id: Date.now() + Math.random(), sender, text, isStreaming, type };
      if (sender === "model" && isStreaming) {
        streamingMessageRef.current = newMessage.id;
      }
      const filteredPrev = prev.filter(msg => !(msg.type === "audio_input_placeholder" && sender === "model"));
      return [...filteredPrev, newMessage];
    });
  }, []);

  const addUserAudioPlaceholder = useCallback(() => {
    setMessages((prev) => {
      if (prev[prev.length - 1]?.type === "audio_input_placeholder") return prev;
      return [...prev, { id: "placeholder-" + Date.now(), sender: "user", text: "Listening...", type: "audio_input_placeholder", isStreaming: false }];
    });
  }, []);

  const updateStreamingMessage = useCallback((transcriptChunk) => {
    setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === streamingMessageRef.current ? { ...msg, text: msg.text + transcriptChunk, isStreaming: true } : msg
        )
      );
  }, []);
  
  const finalizeStreamingMessageUI = useCallback(() => {
    if (streamingMessageRef.current) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingMessageRef.current ? { ...msg, isStreaming: false } : msg
          )
        );
        streamingMessageRef.current = null;
    }
  }, []);

  const sendTranscriptToBackend = useCallback(async (speaker, transcript) => {
    if (!transcript || transcript.trim() === "" || !chatId) return;
    console.log(`SENDING TO BACKEND: [${speaker}] - "${transcript}"`);
    const backendUrl = `${settings.backendBaseUrl}/api/text`;
    try {
      const payload = { speaker, text: transcript, timestamp: new Date().toISOString(), chat_id: chatId };
      const response = await fetch(backendUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const errorData = await response.text();
        console.error(`Go Backend Logging Error (${response.status}): ${errorData}`);
      }
    } catch (error) {
      console.error(`Network Error logging transcript for ${speaker}:`, error);
    }
  }, [settings.backendBaseUrl, chatId]);

  // IMPROVED: Send user buffer only if it hasn't been sent yet
  const sendAndClearUserBuffer = useCallback(() => {
    if (userTranscriptBufferRef.current.trim() && !userTranscriptSentRef.current) {
      sendTranscriptToBackend('user', userTranscriptBufferRef.current);
      userTranscriptSentRef.current = true; // Mark as sent
      console.log('User transcript sent to backend:', userTranscriptBufferRef.current);
    }
    // Always clear the buffer and reset the sent flag when clearing
    userTranscriptBufferRef.current = '';
    userTranscriptSentRef.current = false;
  }, [sendTranscriptToBackend]);

  // NEW: Function to start a new user transcript session
  const startNewUserTranscript = useCallback(() => {
    userTranscriptBufferRef.current = '';
    userTranscriptSentRef.current = false;
  }, []);

  useEffect(() => {
    onTranscriptionRef.current = (transcript) => {
      // The agent is starting to speak, so the user's turn is officially over.
      // Send the complete buffered user transcript now.
      sendAndClearUserBuffer();

      if (!streamingMessageRef.current) {
        agentTextBufferRef.current = transcript;
        addMessage("model", transcript, true);
      } else {
        agentTextBufferRef.current += transcript;
        updateStreamingMessage(transcript);
      }
    };

    // FIXED: This now properly accumulates the COMPLETE user transcript
    onTranscriptForBackendRef.current = (speaker, transcript) => {
      if (speaker === 'user') {
        // Update the buffer with the latest COMPLETE transcript from the speech recognition
        // This gives us the full sentence as it's being built up
        userTranscriptBufferRef.current = transcript;
        // Reset the sent flag since we have new content
        userTranscriptSentRef.current = false;
        console.log('User transcript updated:', transcript);
      }
    };

    const handleTurnComplete = () => {
      if (agentTextBufferRef.current.trim()) {
        sendTranscriptToBackend('model', agentTextBufferRef.current);
      }
      agentTextBufferRef.current = '';
      finalizeStreamingMessageUI();
    };
    
    const handleInterruption = () => {
        // Send any pending user transcript before handling agent interruption
        sendAndClearUserBuffer();
        handleTurnComplete();
        if (displayMicActive) {
          addUserAudioPlaceholder();
          startNewUserTranscript(); // Start fresh for the new user turn
        }
    };
    
    onTurnCompleteRef.current = handleTurnComplete;
    onInterruptedRef.current = handleInterruption;
    
    onMicStateChangedRef.current = (state) => {
      if (!state.active && !state.suspended) {
        // Mic was just turned off, which ends the user's turn.
        sendAndClearUserBuffer();
      } else if (state.active && !state.suspended) {
        // Mic was just turned on, start a new transcript session
        startNewUserTranscript();
        addUserAudioPlaceholder();
      } else {
        setMessages((prev) => prev.filter((msg) => msg.type !== "audio_input_placeholder"));
      }
    };

    // UI update for live user transcription (this does not send to backend)
    onUserTranscriptionRef.current = (transcript) => {
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.type === "audio_input_placeholder") {
          return prev.map((msg) =>
            msg.id === lastMsg.id ? { ...msg, text: ` ${transcript}` } : msg,
          );
        } else if (!prev.some((msg) => msg.type === "audio_input_placeholder") && displayMicActive) {
          return [...prev, { id: "placeholder-" + Date.now(), sender: "user", text: ` ${transcript}`, type: "audio_input_placeholder", isStreaming: false }];
        }
        return prev;
      });
    };

    onTextSentRef.current = (text) => addMessage("user", text, false, "text");
    onScreenShareStoppedRef.current = () => setScreenError(null);
    onCameraStartedRef.current = () => setCameraError(null);
    onCameraStoppedRef.current = () => {};
    onScreenShareStartedRef.current = () => setScreenError(null);
    
  }, [
    addMessage,
    updateStreamingMessage,
    finalizeStreamingMessageUI,
    addUserAudioPlaceholder,
    displayMicActive,
    sendTranscriptToBackend,
    sendAndClearUserBuffer,
    startNewUserTranscript
  ]);
  
  const handleConnect = useCallback(() => {
    if (!session) return alert("Please log in first to connect.");
    if (!isConnected && !isInitializing) {
      setCameraError(null);
      setScreenError(null);
      connectAgent().catch((err) => console.error("ChatView: Connection failed", err));
    }
  }, [session, isConnected, isInitializing, connectAgent]);

  const handleDisconnect = useCallback(() => {
    if (isConnected) {
      // Send any pending buffers before disconnect
      sendAndClearUserBuffer(); 
      onTurnCompleteRef.current?.(); // Finalize agent turn if it was interrupted
      disconnectAgent();
    }
  }, [isConnected, disconnectAgent, sendAndClearUserBuffer]);
  
  const handleSendMessage = useCallback((text) => {
    const trimmedText = text.trim();
    if (trimmedText && agent && isConnected && session) {
      // Send any pending user transcript before sending text message
      sendAndClearUserBuffer();
      onInterruptedRef.current?.();
      setMessages((prev) => prev.filter((msg) => msg.type !== "audio_input_placeholder"));
      sendText(trimmedText);
    }
  }, [agent, isConnected, session, sendText, sendAndClearUserBuffer]);

  const handleToggleMic = useCallback(() => {
    if (!canInteract) return alert("Please connect the agent first.");
    toggleMic().catch((err) => alert(`Mic error: ${err.message}`));
  }, [canInteract, toggleMic]);

  const handleToggleCamera = useCallback(async () => {
    if (!canInteract) return alert("Please connect the agent first.");
    setCameraError(null);
    try {
      if (isCameraActive) await stopCamera();
      else await startCamera();
    } catch (error) {
      console.error("ChatView: Camera toggle error:", error);
      setCameraError(error.message);
    }
  }, [canInteract, isCameraActive, startCamera, stopCamera]);

  const handleToggleScreenShare = useCallback(async () => {
    if (!canInteract) return alert("Please connect the agent first.");
    setScreenError(null);
    try {
      if (isScreenShareActive) await stopScreenShare();
      else await startScreenShare();
    } catch (error) {
      console.error("ChatView: Screen share toggle error:", error);
      setScreenError(error.message);
    }
  }, [canInteract, isScreenShareActive, startScreenShare, stopScreenShare]);

  const handleInputKeyPress = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      handleSendMessage(e.target.value);
      e.target.value = '';
    }
  };

  const handleSendButtonClick = () => {
    const input = document.getElementById("messageInput");
    if (input && input.value.trim()) {
      handleSendMessage(input.value);
      input.value = "";
    }
  };
  
  const renderChatContent = () => {
    if (historyLoading) {
      return (
        <div className="chat-message system-message">
          <FaSpinner className="fa-spin" /> Loading conversation...
        </div>
      );
    }
    if (historyError) {
      return (
          <div className="chat-message system-message error-message">
            <FaExclamationTriangle /> {historyError}
          </div>
      );
    }
    if (showConnectPrompt) {
        return (
          <div className="connect-prompt-container">
            <p>Ready to start?</p>
            <p>Connect to the live agent to begin this conversation.</p>
            <button onClick={handleConnect} className="connect-prompt-button" disabled={isInitializing}>
              {isInitializing ? <FaSpinner className="fa-spin" /> : <FaLink />}
              {isInitializing ? " Connecting..." : " Connect Agent"}
            </button>
          </div>
        );
    }
    if (showConnectError) {
        return (
          <div className="chat-message system-message error-message">
            <FaExclamationTriangle /> Connection failed: {agentError}
            <button onClick={handleConnect} className="connect-prompt-button retry-button" disabled={isInitializing}>
              <FaSyncAlt /> Retry Connect
            </button>
          </div>
        );
    }
    return messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-message ${msg.sender === "user" ? "user-message" : "model-message"} type-${msg.type || "text"} ${msg.isStreaming ? "streaming" : ""}`}
            >
              {msg.text}
            </div>
          ));
  };

  return (
    <div className="chat-area">
      <div id="chatHistory" ref={chatHistoryRef} className="chat-history">
        {renderChatContent()}
      </div>

      {isConnected && agent?.initialized && (
        <AudioVisualizerComponent agent={agent} />
      )}

      {session && (
        <div className="footer-controls-stacked">
          <div className="floating-media-controls">
            {isConnected && (
              <button onClick={handleDisconnect} className="control-btn error" title="Disconnect Agent Session">
                <FaUnlink />
                <span className="button-text">Disconnect</span>
              </button>
            )}
            <button
              onClick={handleToggleMic}
              className={`control-btn mic-btn ${displayMicActive ? "active" : ""} ${isMicSuspended && isMicActive ? "suspended" : ""}`}
              disabled={!canInteract}
              title={(displayMicActive ? "Mute" : "Unmute") + (isMicSuspended ? " (Suspended)" : "")}
            >
              {displayMicActive ? <FaMicrophone /> : <FaMicrophoneSlash />}
              <span className="button-text">Mic</span>
            </button>
            <button
              onClick={handleToggleCamera}
              className={`control-btn cam-btn ${isCameraActive ? "active" : ""} ${cameraError ? "error" : ""}`}
              disabled={!canInteract}
              title={cameraError ? `Camera Error: ${cameraError}` : isCameraActive ? "Stop Camera" : "Start Camera"}
            >
              {isCameraActive ? <FaVideo /> : <FaVideoSlash />}
              <span className="button-text">Cam</span>
            </button>
            <button
              onClick={handleToggleScreenShare}
              className={`control-btn screen-btn ${isScreenShareActive ? "active" : ""} ${screenError ? "error" : ""}`}
              disabled={!canInteract}
              title={screenError ? `Screen Error: ${screenError}` : isScreenShareActive ? "Stop Screen" : "Start Screen"}
            >
              <FaDesktop />
              <span className="button-text">Screen</span>
            </button>
          </div>
          <div className="text-input-container">
            <input
              id="messageInput"
              type="text"
              placeholder={!canInteract ? "Connect agent to chat" : displayMicActive ? "Listening..." : "Type message or turn on mic..."}
              disabled={!canInteract || displayMicActive}
              onKeyPress={handleInputKeyPress}
            />
            <button
              onClick={handleSendButtonClick}
              className="send-icon-button"
              disabled={!canInteract || displayMicActive || (typeof document !== "undefined" && !document.getElementById("messageInput")?.value.trim())}
              title="Send Message"
            >
              <FaPaperPlane />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatView;
