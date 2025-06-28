import React, { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const addNotification = useCallback((notification) => {
    const id = Date.now() + Math.random();
    const newNotification = {
      id,
      ...notification,
      timestamp: new Date(),
    };

    setNotifications(prev => [...prev, newNotification]);

    // Auto-remove notification after duration (default 5 seconds)
    const duration = notification.duration || 5000;
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }

    return id;
  }, [removeNotification]);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Tool call specific notifications
  const showToolCallStarted = useCallback((toolName) => {
    return addNotification({
      type: 'tool_call_started',
      title: 'Tool Call Started',
      message: `Executing ${toolName}...`,
      toolName,
      duration: 0, // Don't auto-remove, will be updated when completed
    });
  }, [addNotification]);

  const showToolCallCompleted = useCallback((toolName, success, error = null) => {
    return addNotification({
      type: 'tool_call_completed',
      title: success ? 'Tool Call Completed' : 'Tool Call Failed',
      message: success 
        ? `${toolName} completed successfully` 
        : `${toolName} failed: ${error || 'Unknown error'}`,
      toolName,
      success,
      error,
      duration: 3000, // Auto-remove after 3 seconds
    });
  }, [addNotification]);

  const updateToolCallNotification = useCallback((id, updates) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id 
          ? { ...notification, ...updates }
          : notification
      )
    );
  }, []);

  const value = {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    showToolCallStarted,
    showToolCallCompleted,
    updateToolCallNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
