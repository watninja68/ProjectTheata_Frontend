import React from 'react';
import { FaCog, FaCheckCircle, FaExclamationTriangle, FaTimes, FaSpinner } from 'react-icons/fa';
import { useNotifications } from '../contexts/NotificationContext';
import './NotificationPopup.css';

const NotificationPopup = () => {
  const { notifications, removeNotification } = useNotifications();

  if (notifications.length === 0) {
    return null;
  }

  const getIcon = (notification) => {
    switch (notification.type) {
      case 'tool_call_started':
        return <FaSpinner className="notification-icon spinning" />;
      case 'tool_call_completed':
        return notification.success 
          ? <FaCheckCircle className="notification-icon success" />
          : <FaExclamationTriangle className="notification-icon error" />;
      default:
        return <FaCog className="notification-icon" />;
    }
  };

  const getNotificationClass = (notification) => {
    const baseClass = 'notification-item';
    switch (notification.type) {
      case 'tool_call_started':
        return `${baseClass} tool-call-started`;
      case 'tool_call_completed':
        return `${baseClass} tool-call-completed ${notification.success ? 'success' : 'error'}`;
      default:
        return baseClass;
    }
  };

  return (
    <div className="notification-container">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={getNotificationClass(notification)}
        >
          <div className="notification-content">
            <div className="notification-header">
              {getIcon(notification)}
              <span className="notification-title">{notification.title}</span>
              <button
                className="notification-close"
                onClick={() => removeNotification(notification.id)}
                aria-label="Close notification"
              >
                <FaTimes />
              </button>
            </div>
            <div className="notification-message">
              {notification.message}
            </div>
            {notification.toolName && (
              <div className="notification-tool-name">
                Tool: {notification.toolName}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationPopup;
