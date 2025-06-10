const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

class ChatService {
  /**
   * Get user's chat list
   * @param {number} userId - User ID
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} Chat list response
   */
  async getChats(userId, options = {}) {
    const params = new URLSearchParams({
      user_id: userId.toString(),
      ...options
    });

    const response = await fetch(`${API_BASE_URL}/api/chats?${params}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch chats');
    }
    return response.json();
  }

  /**
   * Create a new chat
   * @param {Object} chatData - Chat creation data
   * @returns {Promise<Object>} Created chat response
   */
  async createChat(chatData) {
    const response = await fetch(`${API_BASE_URL}/api/chats/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chatData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create chat');
    }
    return response.json();
  }

  /**
   * Update chat details
   * @param {number} chatId - Chat ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Updated chat response
   */
  async updateChat(chatId, updateData) {
    const response = await fetch(`${API_BASE_URL}/api/chats/update?chat_id=${chatId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update chat');
    }
    return response.json();
  }

  /**
   * Delete a chat
   * @param {number} chatId - Chat ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Delete response
   */
  async deleteChat(chatId, userId) {
    const response = await fetch(`${API_BASE_URL}/api/chats/delete?chat_id=${chatId}&user_id=${userId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete chat');
    }
    return response.json();
  }

  /**
   * Get chat message history
   * @param {number} chatId - Chat ID
   * @param {number} userId - User ID
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} Chat history response
   */
  async getChatHistory(chatId, userId, options = {}) {
    const params = new URLSearchParams({
      chat_id: chatId.toString(),
      user_id: userId.toString(),
      ...options
    });

    const response = await fetch(`${API_BASE_URL}/api/chat/history?${params}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch chat history');
    }
    return response.json();
  }

  /**
   * Add participant to chat
   * @param {number} chatId - Chat ID
   * @param {Object} participantData - Participant data
   * @returns {Promise<Object>} Add participant response
   */
  async addParticipant(chatId, participantData) {
    const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}/participants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(participantData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add participant');
    }
    return response.json();
  }

  /**
   * Remove participant from chat
   * @param {number} chatId - Chat ID
   * @param {number} participantId - Participant ID to remove
   * @param {number} requestingUserId - ID of user making the request
   * @returns {Promise<Object>} Remove participant response
   */
  async removeParticipant(chatId, participantId, requestingUserId) {
    const response = await fetch(
      `${API_BASE_URL}/api/chats/${chatId}/participants/${participantId}?requesting_user_id=${requestingUserId}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove participant');
    }
    return response.json();
  }
}

export default new ChatService();
