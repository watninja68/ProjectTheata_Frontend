import React, { useState, useEffect, useCallback, useRef } from "react";
import { TfiReload } from "react-icons/tfi";
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
  FaCog,
  FaUser,
  FaRobot,
} from "react-icons/fa";
import { IoIosAddCircle } from "react-icons/io";
import ScreenAnnotationWrapper from "./ScreenAnnotationWrapper";
import { useGeminiAgent } from "../hooks/useGeminiAgent";
import { useToolCallTracking } from "../hooks/useToolCallTracking";
import ChatService from "../services/chatService";
import { fileToBase64 } from "../lib/utils/utils";

const ChatView = ({
  user,
  session,
  settings,
  getGeminiConfig,
  getWebsocketUrl,
  onConnectionChange,
  chatId,
}) => {
  const isExistingChat = !!chatId;

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
    sendImage,
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
  const [conversationContextSummary, setConversationContextSummary] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const streamingMessageRef = useRef(null);
  const agentTextBufferRef = useRef('');
  const userTranscriptBufferRef = useRef('');
  // NEW: Track if we've already sent the current user transcript
  const userTranscriptSentRef = useRef(false);
  // Add a lock to prevent concurrent sends
  const userTranscriptLockRef = useRef(false);
  const chatHistoryRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);
  const [screenError, setScreenError] = useState(null);
  const [hasBeenConnectedBefore, setHasBeenConnectedBefore] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [inputText, setInputText] = useState("");

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
        setConversationContextSummary('');
        setHistoryLoading(false);
        setHasBeenConnectedBefore(false); // Added for new chat
        return;
      }
      try {
        setHistoryLoading(true);
        setHistoryError(null);
        // Reset for existing chat before loading, in case of error or empty history
        setHasBeenConnectedBefore(false); 
        const history = await ChatService.getChatHistory(chatId);
        const formattedHistory = history.map(msg => ({
          id: msg.id,
          sender: msg.speaker === 'user' ? 'user' : 'model',
          text: msg.text,
          isStreaming: false,
          type: 'text'
        }));
        setMessages(formattedHistory);
        
        if (formattedHistory.length > 0) {
          const summary = formattedHistory
            .map(msg => `${msg.sender === 'user' ? 'User' : 'Agent'}: ${msg.text}`)
            .join('\n');
          setConversationContextSummary(summary);
        } else {
            setConversationContextSummary('');
        }

        if (formattedHistory.some(msg => msg.sender === 'model')) {
          setHasBeenConnectedBefore(true);
        }
        // If catch is hit, or formattedHistory is empty, it remains false from the reset above.
      } catch (err) {
        console.error("Failed to load chat history:", err);
        setHistoryError(err.message || "Could not load messages.");
        setConversationContextSummary('');
        // Ensure it's false on error
        setHasBeenConnectedBefore(false);
      } finally {
        setHistoryLoading(false);
      }
    };
    loadHistory();
  }, [chatId]); // No need to add setHasBeenConnectedBefore to deps, it's part of this effect's logic

  useEffect(() => {
    if (onConnectionChange) {
      onConnectionChange(isConnected);
    }
  }, [isConnected, onConnectionChange]);

  const addMessage = useCallback((sender, text, isStreaming = false, type = "text") => {
    const messageId = Date.now() + Math.random();
    setMessages((prev) => {
      const newMessage = { id: messageId, sender, text, isStreaming, type };
      if (sender === "model" && isStreaming) {
        streamingMessageRef.current = newMessage.id;
      }
      const filteredPrev = prev.filter(msg => !(msg.type === "audio_input_placeholder" && sender === "model"));
      return [...filteredPrev, newMessage];
    });
    return messageId; // Return the message ID
  }, []);

  const updateMessage = useCallback((messageId, updates) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      )
    );
  }, []);

  // Track tool calls and show them as chat messages
  useToolCallTracking(agent, addMessage, updateMessage);

  // Component for enhanced chat bubble with circular icon and user name
  const ChatBubble = useCallback(({ message, user, isAgentSpeaking }) => {
    const isUser = message.sender === "user";
    const isModel = message.sender === "model";
    const isSystem = message.sender === "system";

    // Don't render enhanced bubble for tool call messages
    if (message.type && message.type.startsWith("tool_call")) {
      return null;
    }

    const getUserName = () => {
      if (isUser && user?.user_metadata?.full_name) {
        return user.user_metadata.full_name;
      }
      if (isUser && user?.email) {
        return user.email.split('@')[0];
      }
      if (isUser) return "You";
      if (isModel) return "Theta";
      return "System";
    };

    const getIcon = () => {
      if (isUser) return <FaUser />;
      if (isModel) return <FaRobot />;
      return <FaCog />;
    };

    const getIconClass = () => {
      let baseClass = "chat-bubble-icon";
      if (isUser) baseClass += " user-icon";
      if (isModel) baseClass += " model-icon";
      if (isSystem) baseClass += " system-icon";
      return baseClass;
    };

    return (
      <div className={`chat-bubble ${isUser ? "user-bubble" : isModel ? "model-bubble" : "system-bubble"} ${message.isStreaming ? "streaming" : ""}`}>
        <div className="chat-bubble-header">
          <div className={getIconClass()}>
            {isModel && isAgentSpeaking ? (
              <div className="speaking-animation">
                <div className="wave"></div>
                <div className="wave"></div>
                <div className="wave"></div>
              </div>
            ) : (
              getIcon()
            )}
          </div>
          <span className="chat-bubble-name">{getUserName()}</span>
        </div>
        <div className="chat-bubble-content">
          {message.text}
        </div>
      </div>
    );
  }, []);

  // Function to render tool call messages with notification-style design
  const renderToolCallMessage = useCallback((msg) => {
    let messageData;
    try {
      messageData = JSON.parse(msg.text);
    } catch (e) {
      messageData = { toolName: msg.text, status: 'started' };
    }

    const isStarted = msg.type === "tool_call_started" || messageData.status === 'started';
    const isSuccess = msg.type === "tool_call_completed_success";
    const isError = msg.type === "tool_call_completed_error";

    let icon, title, message, bubbleClass;

    if (isStarted) {
      icon = <FaSpinner className="tool-call-icon spinning" />;
      title = "Tool Call Started";
      message = `Executing ${messageData.toolName}...`;
      bubbleClass = "";
    } else if (isSuccess) {
      icon = <FaCheckCircle className="tool-call-icon success" />;
      title = "Tool Call Completed";
      message = `${messageData.toolName} completed successfully`;
      bubbleClass = "success";
    } else if (isError) {
      icon = <FaExclamationTriangle className="tool-call-icon error" />;
      title = "Tool Call Failed";
      message = `${messageData.toolName} failed: ${messageData.error || 'Unknown error'}`;
      bubbleClass = "error";
    }

    return (
      <div key={msg.id} className={`tool-call-notification-bubble ${bubbleClass}`}>
        <div className="tool-call-content">
          <div className="tool-call-header">
            {icon}
            <span className="tool-call-title">{title}</span>
          </div>
          <div className="tool-call-message">
            {message}
          </div>
          <div className="tool-call-tool-name">
            Tool: {messageData.toolName}
          </div>
        </div>
      </div>
    );
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

  // IMPROVED: More robust buffer management
  const sendAndClearUserBuffer = useCallback(() => {
    // Prevent concurrent execution
    if (userTranscriptLockRef.current) {
      return;
    }
    
    userTranscriptLockRef.current = true;
    
    try {
      const currentTranscript = userTranscriptBufferRef.current.trim();
      const hasBeenSent = userTranscriptSentRef.current;
      
      if (currentTranscript && !hasBeenSent) {
        console.log('Sending user transcript to backend:', currentTranscript);
        sendTranscriptToBackend('user', currentTranscript);
        userTranscriptSentRef.current = true;
      }
      
      // Clear buffer and reset flags
      userTranscriptBufferRef.current = '';
      userTranscriptSentRef.current = false;
    } finally {
      userTranscriptLockRef.current = false;
    }
  }, [sendTranscriptToBackend]);

  // NEW: Function to start a new user transcript session
  const startNewUserTranscript = useCallback(() => {
    userTranscriptBufferRef.current = '';
    userTranscriptSentRef.current = false;
  }, []);

  // IMPROVED: Better transcript update logic
  useEffect(() => {
    onTranscriptionRef.current = (transcript) => {
      // IMPROVED: Add small delay to ensure user transcript is complete
      setTimeout(() => {
        sendAndClearUserBuffer();
      }, 100);

      // Track that agent is speaking when we receive transcription
      setIsAgentSpeaking(true);

      if (!streamingMessageRef.current) {
        agentTextBufferRef.current = transcript;
        addMessage("model", transcript, true);
      } else {
        agentTextBufferRef.current += transcript;
        updateStreamingMessage(transcript);
      }
    };
    
    // FIXED: Only update buffer if not currently being sent
    onTranscriptForBackendRef.current = (speaker, transcript) => {
      if (speaker === 'user' && !userTranscriptLockRef.current) {
        // Only update if we have a longer/newer transcript
        const currentBuffer = userTranscriptBufferRef.current;
        if (transcript.length >= currentBuffer.length) {
          userTranscriptBufferRef.current = transcript;
          userTranscriptSentRef.current = false;
          console.log('User transcript updated:', transcript);
        }
      }
    };

    const handleTurnComplete = () => {
      if (agentTextBufferRef.current.trim()) {
        sendTranscriptToBackend('model', agentTextBufferRef.current);
      }
      agentTextBufferRef.current = '';
      finalizeStreamingMessageUI();
      // Stop speaking animation when turn is complete
      setIsAgentSpeaking(false);
    };
    
    // IMPROVED: Handle interruptions more carefully
    const handleInterruption = () => {
      // Give a moment for any final transcript updates
      setTimeout(() => {
        sendAndClearUserBuffer();
        handleTurnComplete();
        if (displayMicActive) {
          addUserAudioPlaceholder();
          startNewUserTranscript();
        }
      }, 150);
    };
    
    onTurnCompleteRef.current = handleTurnComplete;
    onInterruptedRef.current = handleInterruption;
    
    // IMPROVED: Better mic state handling
    onMicStateChangedRef.current = (state) => {
      if (!state.active && !state.suspended) {
        // Add delay to ensure final transcript is captured
        setTimeout(() => {
          sendAndClearUserBuffer();
        }, 200);
      } else if (state.active && !state.suspended) {
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
      connectAgent(conversationContextSummary).catch((err) => console.error("ChatView: Connection failed", err));
    }
  }, [session, isConnected, isInitializing, connectAgent, conversationContextSummary]);

  const handleDisconnect = useCallback(() => {
    if (isConnected) {
      // Send any pending buffers before disconnect
      sendAndClearUserBuffer(); 
      onTurnCompleteRef.current?.(); // Finalize agent turn if it was interrupted
      disconnectAgent();
    }
  }, [isConnected, disconnectAgent, sendAndClearUserBuffer]);
  
  // IMPROVED: Better message sending
  const handleSendMessage = useCallback((text) => {
    const trimmedText = text.trim();
    if (trimmedText && agent && isConnected && session) {
      // Ensure any pending transcript is sent first
      setTimeout(() => {
        sendAndClearUserBuffer();
        onInterruptedRef.current?.();
        setMessages((prev) => prev.filter((msg) => msg.type !== "audio_input_placeholder"));
        sendText(trimmedText);
      }, 100);
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

  const handleImageUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!canInteract) {
      alert("Please connect the agent first.");
      return;
    }

    try {
      // Convert file to base64 using the utility function
      const base64Image = await fileToBase64(file, settings.resizeWidth || 1280, settings.quality || 0.8);

      // Send image to agent
      await sendImage(base64Image);

      // Add a message to show the image was sent
      addMessage("user", `📷 Image uploaded: ${file.name}`, false, "image");

      // Clear the file input
      event.target.value = '';
    } catch (error) {
      console.error("Error uploading image:", error);
      alert(`Failed to upload image: ${error.message}`);
    }
  }, [canInteract, sendImage, addMessage, settings.resizeWidth, settings.quality]);

  const handleImageButtonClick = () => {
    if (!canInteract) {
      alert("Please connect the agent first.");
      return;
    }
    document.getElementById("imageInput")?.click();
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
    // If not loading and no history error, always try to render messages.
    // Connect prompts/errors will be handled elsewhere or after this block.
    return messages.map((msg) => {
      // Check if this is a tool call message
      if (msg.type && (msg.type === "tool_call_started" || msg.type === "tool_call_completed_success" || msg.type === "tool_call_completed_error")) {
        return renderToolCallMessage(msg);
      }

      // Regular message rendering with enhanced chat bubble
      const chatBubble = (
        <ChatBubble
          key={msg.id}
          message={msg}
          user={user}
          isAgentSpeaking={isAgentSpeaking && msg.sender === "model" && msg.isStreaming}
        />
      );

      // If ChatBubble returns null (for tool calls), fall back to old rendering
      if (chatBubble) {
        return chatBubble;
      }

      return (
        <div
          key={msg.id}
          className={`chat-message ${msg.sender === "user" ? "user-message" : "model-message"} type-${msg.type || "text"} ${msg.isStreaming ? "streaming" : ""}`}
        >
          {msg.text}
        </div>
      );
    });
  };

  return (
    <div className="chat-area">
      <div id="chatHistory" ref={chatHistoryRef} className="chat-history">
        {renderChatContent()}
      </div>

      {/* Prompts for NEW or NEVER-CONNECTED chats */}
      {!hasBeenConnectedBefore && session && !isConnected && !isInitializing && !agentError && (
        <div className="connect-prompt-container">
          <p>Ready to start?</p>
          <p>Connect to the live agent to begin this conversation.</p>
          <button onClick={handleConnect} className="connect-prompt-button" disabled={isInitializing}>
            {isInitializing ? <FaSpinner className="fa-spin" /> : <FaLink />}
            {isInitializing ? " Connecting..." : " Connect Agent"}
          </button>
        </div>
      )}

      {!hasBeenConnectedBefore && session && agentError && !isConnected && !isInitializing && (
        <div className="chat-message system-message error-message">
          <FaExclamationTriangle /> Connection failed: {agentError}
          <button onClick={handleConnect} className="connect-prompt-button retry-button" disabled={isInitializing}>
            {isInitializing ? <FaSpinner className="fa-spin" style={{ marginRight: '5px' }} /> : <FaSyncAlt style={{ marginRight: '5px' }} />}
            {isInitializing ? " Connecting..." : " Retry Connect"}
          </button>
        </div>
      )}



      {/* Screen Annotation Wrapper - positioned to overlay the screen preview */}
      <ScreenAnnotationWrapper
        isScreenShareActive={isScreenShareActive}
        agent={agent}
      />

      {session && (
        <div className="footer-controls-stacked">

          {!isConnected ? (
            <div className="reconnect-section">
              <button
                onClick={handleConnect}
                className="reconnect-button"
                title="Reconnect to agent"
                disabled={isInitializing}
              >
                {isInitializing ? <FaSpinner className="fa-spin" style={{ marginRight: '8px' }} /> : <TfiReload style={{ marginRight: '8px' }} />}
                {isInitializing ? "Connecting..." : "Reconnect"}
              </button>
            </div>
          ) : (
            <div className="floating-media-controls">
              <button onClick={handleDisconnect} className="control-btn error" title="Disconnect Agent Session">
                <FaUnlink />
                <span className="button-text">Disconnect</span>
              </button>
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
                <span className="button-text">Camera</span>
              </button>
              <button
                onClick={handleToggleScreenShare}
                className={`control-btn screen-btn ${isScreenShareActive ? "active" : ""} ${screenError ? "error" : ""}`}
                disabled={!canInteract}
                title={screenError ? `Screen Error: ${screenError}` : isScreenShareActive ? "Stop Screen" : "Start Screen"}
              >
                <FaDesktop />
                <span className="button-text">Screen Share</span>
              </button>
            </div>
          )}
          <div className="text-input-container">
            <input
              id="imageInput"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={handleImageButtonClick}
              className="image-upload-button"
              disabled={!canInteract || displayMicActive}
              title="Upload Image"
            >
              <IoIosAddCircle />
            </button>
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