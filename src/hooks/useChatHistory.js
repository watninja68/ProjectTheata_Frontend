import { useState, useEffect, useCallback } from 'react';
import ChatService from '../services/chatService';
import { useAuth } from './useAuth';

const useChatHistory = (chatId) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [chatInfo, setChatInfo] = useState(null);

  const loadMessages = useCallback(async (options = {}) => {
    if (!chatId || !user) return;

    try {
      setLoading(true);
      setError(null);

      const response = await ChatService.getChatHistory(chatId, user.id, {
        limit: 50,
        ...options
      });

      if (options.offset > 0) {
        setMessages(prev => [...response.messages, ...prev]);
      } else {
        setMessages(response.messages);
      }

      setHasMore(response.has_more);
      setChatInfo(response.chat);
    } catch (err) {
      console.error('Failed to load chat history:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [chatId, user]);

  const loadMoreMessages = useCallback(() => {
    if (!hasMore || loading) return;
    
    loadMessages({
      offset: messages.length,
      before: messages[0]?.created_at
    });
  }, [hasMore, loading, messages, loadMessages]);

  const refreshMessages = useCallback(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (chatId) {
      setMessages([]);
      setHasMore(true);
      setChatInfo(null);
      loadMessages();
    } else {
      setMessages([]);
      setChatInfo(null);
      setError(null);
    }
  }, [chatId, loadMessages]);

  return {
    messages,
    loading,
    error,
    hasMore,
    chatInfo,
    loadMoreMessages,
    refreshMessages
  };
};

export default useChatHistory;
