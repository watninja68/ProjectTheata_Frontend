import React, { useState, useEffect, useCallback } from "react";
import {
  FaPlus,
  FaUsers,
  FaCrown,
  FaTrash,
  FaEdit,
  FaSpinner,
} from "react-icons/fa";
import ChatService from "../services/chatService";
import { useAuth } from "../hooks/useAuth";
import "./ChatList.css";

const ChatList = ({ selectedChatId, onCreateChat }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingChat, setEditingChat] = useState(null);
  const [editTitle, setEditTitle] = useState("");

  const loadChats = useCallback(async () => {
    if (!user) return; // Guard against running without a user
    try {
      setLoading(true);
      setError(null);
      const response = await ChatService.getChats(user.id, {
        include_preview: true,
        limit: 50,
      });
      const fetchedChats = response.chats || [];
      setChats(fetchedChats);

      // *** UX IMPROVEMENT: Auto-create first chat ***
      if (fetchedChats.length === 0) {
        console.log("No chats found for user, creating a default one.");
        // Use the passed-in onCreateChat function from App.js
        // This will create the chat and the App component will handle selecting it
        onCreateChat();
      } else if (!selectedChatId && fetchedChats.length > 0) {
        // If no chat is selected, select the most recent one
        onChatSelect(fetchedChats[0]);
      }
    } catch (err) {
      console.error("Failed to load chats:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, onCreateChat, onChatSelect, selectedChatId]); // Dependencies for loadChats

  useEffect(() => {
    if (user) {
      loadChats();
    }
    // This effect should run when the user logs in.
  }, [user]);

  const handleDeleteChat = async (chatId, event) => {
    event.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this chat? This action cannot be undone.")) {
      return;
    }

    try {
      await ChatService.deleteChat(chatId, user.id);
      await loadChats();
      if (selectedChatId === chatId) {
        const remainingChats = chats.filter((c) => c.id !== chatId);
        onChatSelect(remainingChats.length > 0 ? remainingChats[0] : null);
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
      alert(`Failed to delete chat: ${err.message}`);
    }
  };

  const handleEditChat = async (chatId, event) => {
    event.stopPropagation();
    if (!editTitle.trim()) {
      // If the title is empty, cancel the edit instead of saving an empty title
      cancelEditing(event);
      return;
    }

    try {
      await ChatService.updateChat(chatId, {
        title: editTitle,
        user_id: user.id,
      });
      await loadChats();
      setEditingChat(null);
    } catch (err) {
      console.error("Failed to update chat:", err);
      alert(`Failed to update chat: ${err.message}`);
    }
  };

  const startEditing = (chat, event) => {
    event.stopPropagation();
    setEditingChat(chat.id);
    setEditTitle(chat.title);
  };

  const cancelEditing = (event) => {
    if (event) event.stopPropagation();
    setEditingChat(null);
    setEditTitle("");
  };

  const formatLastMessageTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  // The rest of the component's render logic remains the same...
  if (loading && chats.length === 0) {
    return (
      <div className="chat-list-container">
        <div className="chat-list-header">
          <h3>Chats</h3>
          <button className="create-chat-btn" disabled>
            <FaPlus />
          </button>
        </div>
        <div className="chat-list-loading">
          <FaSpinner className="fa-spin" />
          <span>Loading chats...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chat-list-container">
        <div className="chat-list-header">
          <h3>Chats</h3>
          <button className="create-chat-btn" onClick={onCreateChat} disabled={!user}>
            <FaPlus />
          </button>
        </div>
        <div className="chat-list-error">
          <p>Failed to load chats: {error}</p>
          <button onClick={loadChats} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-list-container">
      <div className="chat-list-header">
        <h3>Chats</h3>
        <button
          className="create-chat-btn"
          onClick={onCreateChat}
          disabled={!user}
        >
          <FaPlus />
        </button>
      </div>

      <div className="chat-list">
        {chats.length === 0 && !loading ? (
          <div className="empty-chat-list">
            <p>Creating your first chat...</p>
            <FaSpinner className="fa-spin" />
          </div>
        ) : (
          chats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${
                selectedChatId === chat.id ? "selected" : ""
              }`}
              onClick={() => onChatSelect(chat)}
            >
              <div className="chat-item-main">
                <div className="chat-item-header">
                  {editingChat === chat.id ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={(e) => handleEditChat(chat.id, e)}
                      onKeyDown={(e) => {
                        // Using onKeyDown for better 'Escape' key handling
                        if (e.key === "Enter") {
                          handleEditChat(chat.id, e);
                        } else if (e.key === "Escape") {
                          cancelEditing(e);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="edit-chat-input"
                    />
                  ) : (
                    <h4 className="chat-title">{chat.title}</h4>
                  )}

                  <div className="chat-item-actions">
                    {chat.user_role === "owner" && (
                      <FaCrown
                        className="owner-icon"
                        title="You own this chat"
                      />
                    )}
                    <button
                      className="chat-action-btn edit-btn"
                      onClick={(e) => startEditing(chat, e)}
                      title="Edit chat title"
                    >
                      <FaEdit />
                    </button>
                    {/* *** THIS IS THE CORRECTED PART *** */}
                    {chat.user_role === "owner" && (
                      <button
                        className="chat-action-btn delete-btn"
                        onClick={(e) => handleDeleteChat(chat.id, e)}
                        title="Delete chat"
                      >
                        <FaTrash />
                      </button>
                    )}
                  </div>
                </div>

                <div className="chat-item-info">
                  <div className="chat-participants">
                    <FaUsers />
                    <span>{chat.participant_count}</span>
                  </div>
                  {chat.last_message && (
                    <div className="chat-last-message">
                      <span className="last-message-text">
                        {chat.last_message.speaker}: {chat.last_message.text}
                      </span>
                      <span className="last-message-time">
                        {formatLastMessageTime(chat.last_message.timestamp)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ChatList;