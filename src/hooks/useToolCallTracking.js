import { useEffect, useRef } from 'react';
import { useNotifications } from '../contexts/NotificationContext';

/**
 * Hook to track tool calls from the Gemini agent and show notifications or chat messages
 * @param {Object} agent - The Gemini agent instance
 * @param {Function} addMessage - Function to add messages to chat (optional, if provided will use chat messages instead of notifications)
 * @param {Function} updateMessage - Function to update existing messages (optional, used with addMessage)
 * @returns {Object} Tool call tracking utilities
 */
export const useToolCallTracking = (agent, addMessage = null, updateMessage = null) => {
  const { showToolCallStarted, showToolCallCompleted, removeNotification } = useNotifications();
  const activeToolCalls = useRef(new Map()); // Track active tool calls by ID

  useEffect(() => {
    if (!agent) return;

    const handleToolCallStarted = (toolCallData) => {
      const { name, id } = toolCallData;

      console.log(`[ToolCallTracking] Tool call started: ${name} (ID: ${id})`, toolCallData);

      if (addMessage) {
        // Add chat message for tool call started
        const messageData = {
          toolName: name,
          status: 'started',
          startTime: Date.now()
        };
        const messageId = addMessage("model", JSON.stringify(messageData), false, "tool_call_started");

        // Store the mapping between tool call ID and message ID
        activeToolCalls.current.set(id, {
          messageId,
          toolName: name,
          startTime: Date.now(),
          isMessage: true,
        });

        console.log(`[ToolCallTracking] Stored message tracking for ID: ${id}, messageId: ${messageId}`);
      } else {
        // Show notification for tool call started
        const notificationId = showToolCallStarted(name);

        // Store the mapping between tool call ID and notification ID
        activeToolCalls.current.set(id, {
          notificationId,
          toolName: name,
          startTime: Date.now(),
          isMessage: false,
        });
      }
    };

    const handleToolCallCompleted = (toolCallData) => {
      const { name, id, success, error } = toolCallData;

      console.log(`[ToolCallTracking] Tool call completed: ${name} (ID: ${id}) - Success: ${success}`, toolCallData);

      // Get the active tool call info
      const activeCall = activeToolCalls.current.get(id);

      console.log(`[ToolCallTracking] Active call found:`, activeCall);

      if (activeCall) {
        // Calculate duration
        const duration = Date.now() - activeCall.startTime;

        if (activeCall.isMessage && updateMessage) {
          // Update existing message to show completion
          const messageData = {
            toolName: name,
            status: 'completed',
            success: success,
            error: error,
            duration: duration
          };
          const messageType = success ? "tool_call_completed_success" : "tool_call_completed_error";

          console.log(`[ToolCallTracking] Updating message ${activeCall.messageId} with:`, messageData);

          updateMessage(activeCall.messageId, {
            text: JSON.stringify(messageData),
            type: messageType
          });
        } else {
          // Remove the "started" notification and show completion notification
          removeNotification(activeCall.notificationId);
          showToolCallCompleted(name, success, error);
        }

        // Remove from active calls
        activeToolCalls.current.delete(id);

        console.log(`[ToolCallTracking] Tool call completed: ${name} (ID: ${id}) - Success: ${success} - Duration: ${duration}ms`);
      } else {
        console.log(`[ToolCallTracking] No active call found for ID: ${id}, creating fallback`);

        // Fallback: show completion notification even if we didn't track the start
        if (addMessage) {
          const messageData = {
            toolName: name,
            success: success,
            error: error
          };
          const messageType = success ? "tool_call_completed_success" : "tool_call_completed_error";
          addMessage("model", JSON.stringify(messageData), false, messageType);
        } else {
          showToolCallCompleted(name, success, error);
        }
        console.log(`[ToolCallTracking] Tool call completed (not tracked): ${name} (ID: ${id}) - Success: ${success}`);
      }
    };

    // Add event listeners
    agent.on('tool_call_started', handleToolCallStarted);
    agent.on('tool_call_completed', handleToolCallCompleted);

    // Cleanup function
    return () => {
      agent.off('tool_call_started', handleToolCallStarted);
      agent.off('tool_call_completed', handleToolCallCompleted);

      // Clear any remaining active tool calls
      const currentActiveToolCalls = activeToolCalls.current;
      currentActiveToolCalls.clear();
    };
  }, [agent, showToolCallStarted, showToolCallCompleted, removeNotification]);

  // Return utilities for manual tracking if needed
  return {
    getActiveToolCalls: () => Array.from(activeToolCalls.current.entries()),
    clearActiveToolCalls: () => activeToolCalls.current.clear(),
  };
};
