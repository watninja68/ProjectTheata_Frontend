import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import ChatService from "../services/chatService";

const NewChatPage = () => {
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();

  const handleCreateChat = async () => {
    if (!title.trim()) return;

    setIsCreating(true);
    try {
      const chatData = {
        title: title.trim(),
        user_id: user.id,
      };
      const data = await ChatService.createChat(chatData);
      navigate(`/app/chat/${data.id}`);
    } catch (error) {
      console.error("Create chat error:", error);
      alert(`Failed to create chat: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="new-chat-page">
      <div className="new-chat-container">
        <h2>Create New Chat</h2>
        <div className="form-group">
          <label htmlFor="chatTitle">Chat Title:</label>
          <input
            id="chatTitle"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter chat title..."
            maxLength={100}
          />
        </div>
        <div className="form-actions">
          <button onClick={() => navigate("/app")} className="cancel-btn">
            Cancel
          </button>
          <button
            onClick={handleCreateChat}
            disabled={!title.trim() || isCreating}
            className="create-btn"
          >
            {isCreating ? "Creating..." : "Create Chat"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewChatPage;
