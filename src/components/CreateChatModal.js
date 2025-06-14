import React, { useState } from 'react';
import { FaTimes, FaSpinner } from 'react-icons/fa';
import ChatService from '../services/chatService';
import { useAuth } from '../hooks/useAuth';
import './CreateChatModal.css';

const CreateChatModal = ({ isOpen, onClose, onChatCreated }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [participants, setParticipants] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Chat title is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const chatData = {
        title: title.trim(),
        user_id: user.id,
      };

      if (initialMessage.trim()) {
        chatData.initial_message = initialMessage.trim();
      }

      // Parse participants if provided (comma-separated user IDs)
      if (participants.trim()) {
        const participantIds = participants
          .split(',')
          .map(id => parseInt(id.trim()))
          .filter(id => !isNaN(id) && id !== user.id); // Exclude invalid IDs and self
        
        if (participantIds.length > 0) {
          chatData.participants = participantIds;
        }
      }

      const response = await ChatService.createChat(chatData);
      onChatCreated(response.chat);
      handleClose();
    } catch (err) {
      console.error('Failed to create chat:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setInitialMessage('');
    setParticipants('');
    setError('');
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Create New Chat</h2>
          <button className="modal-close-btn" onClick={handleClose} disabled={loading}>
            <FaTimes />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="create-chat-form">
          <div className="form-group">
            <label htmlFor="chat-title">Chat Title *</label>
            <input
              id="chat-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter chat title..."
              maxLength={255}
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="initial-message">Initial Message (Optional)</label>
            <textarea
              id="initial-message"
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              placeholder="Welcome message for the chat..."
              rows={3}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="participants">Participants (Optional)</label>
            <input
              id="participants"
              type="text"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="Enter user IDs separated by commas (e.g., 1, 2, 3)"
              disabled={loading}
            />
            <small className="form-help">
              Enter user IDs of people to add to the chat. You'll be added automatically as the owner.
            </small>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              onClick={handleClose}
              className="cancel-btn"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="create-btn"
              disabled={loading || !title.trim()}
            >
              {loading ? (
                <>
                  <FaSpinner className="fa-spin" />
                  Creating...
                </>
              ) : (
                'Create Chat'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateChatModal;
