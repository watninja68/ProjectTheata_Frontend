const API_BASE_URL =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:8080";

class ChatService {
  /**
   * Get user's chat list
   * @param {string} userId - User ID (UUID string)
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} Chat list response
   */
  async getChats(userId, options = {}) {
    if (!userId) {
        return Promise.reject(new Error("User ID is required to fetch chats."));
    }
    const params = new URLSearchParams({
      user_id: userId,
      ...options,
    });

    const response = await fetch(`${API_BASE_URL}/api/chats?${params}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to fetch chats");
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
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chatData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create chat");
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
    const response = await fetch(
      `${API_BASE_URL}/api/chats/update?chat_id=${chatId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update chat");
    }
    return response.json();
  }

  /**
   * Delete a chat
   * @param {number} chatId - Chat ID
   * @param {string} userId - User ID (UUID string)
   * @returns {Promise<Object>} Delete response
   */
  async deleteChat(chatId, userId) {
    const response = await fetch(
      `${API_BASE_URL}/api/chats/delete?chat_id=${chatId}&user_id=${userId}`,
      {
        method: "DELETE",
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to delete chat");
    }
    return response.json();
  }

  /**
   * Get chat message history
   * @param {number} chatId - Chat ID
   * @returns {Promise<Array>} A list of chat messages
   */
  async getChatHistory(chatId) {
    if (!chatId) {
      return Promise.resolve([]);
    }
    const response = await fetch(`${API_BASE_URL}/api/chat/history?chat_id=${chatId}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to fetch history and parse error' }));
      throw new Error(errorData.error || "Failed to fetch chat history");
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
    const response = await fetch(
      `${API_BASE_URL}/api/chats/${chatId}/participants`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(participantData),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to add participant");
    }
    return response.json();
  }

  /**
   * Remove participant from chat
   * @param {number} chatId - Chat ID
   * @param {number} participantId - Participant ID to remove
   * @param {string} requestingUserId - ID of user making the request (UUID string)
   * @returns {Promise<Object>} Remove participant response
   */
  async removeParticipant(chatId, participantId, requestingUserId) {
    const response = await fetch(
      `${API_BASE_URL}/api/chats/${chatId}/participants/${participantId}?requesting_user_id=${requestingUserId}`,
      {
        method: "DELETE",
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to remove participant");
    }
    return response.json();
  }
}

export default new ChatService();