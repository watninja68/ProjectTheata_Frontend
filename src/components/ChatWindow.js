import React from "react";
import useChatHistory from "../hooks/useChatHistory";
import { FaSpinner } from "react-icons/fa";
import "./ChatWindow.css";

const ChatWindow = ({ chat }) => {
  // If no chat is selected, show a placeholder.
  const { messages, loading, error, hasMore, chatInfo, loadMoreMessages } =
    useChatHistory(chat.id);

  if (!chat) {
    return (
      <div className="chat-window-container placeholder">
        <div>
          <h2>Welcome!</h2>
          <p>Select a chat from the list or create a new one.</p>
        </div>
      </div>
    );
  }

  // Mock function for sending a message since it's not in the service
  const handleSendMessage = (e) => {
    e.preventDefault();
    const input = e.target.elements.message;
    if (input.value.trim()) {
      alert(
        `Sending message: "${input.value}" to chat ${chat.id}.\n(This is a mock front-end action.)`,
      );
      input.value = "";
    }
  };

  return (
    <div className="chat-window-container">
      <header className="chat-header">
        <h3>{chatInfo?.title || chat.title}</h3>
        <p>{chat.participant_count} participants</p>
      </header>

      <div className="message-list">
        {loading && messages.length === 0 ? (
          <div className="status-indicator">
            <FaSpinner className="fa-spin" /> <span>Loading Messages...</span>
          </div>
        ) : error ? (
          <div className="status-indicator error">
            <p>Error: {error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="status-indicator">
            <p>No messages yet. Be the first to say something!</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <button
                onClick={loadMoreMessages}
                className="load-more-btn"
                disabled={loading}
              >
                {loading ? "Loading..." : "Load More"}
              </button>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className="message-item">
                <strong>{msg.speaker}:</strong> {msg.text}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="message-input-area">
        <form onSubmit={handleSendMessage}>
          <input
            name="message"
            type="text"
            placeholder="Type your message here..."
            autoComplete="off"
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatWindow;
