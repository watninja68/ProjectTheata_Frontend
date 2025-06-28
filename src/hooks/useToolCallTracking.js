import { useEffect, useRef } from 'react';
import { useNotifications } from '../contexts/NotificationContext';

/**
 * Hook to track tool calls from the Gemini agent and show notifications
 * @param {Object} agent - The Gemini agent instance
 * @returns {Object} Tool call tracking utilities
 */
export const useToolCallTracking = (agent) => {
  const { showToolCallStarted, showToolCallCompleted, removeNotification } = useNotifications();
  const activeToolCalls = useRef(new Map()); // Track active tool calls by ID

  useEffect(() => {
    if (!agent) return;

    const handleToolCallStarted = (toolCallData) => {
      const { name, id } = toolCallData;
      
      // Show notification for tool call started
      const notificationId = showToolCallStarted(name);
      
      // Store the mapping between tool call ID and notification ID
      activeToolCalls.current.set(id, {
        notificationId,
        toolName: name,
        startTime: Date.now(),
      });
      
      console.log(`[ToolCallTracking] Tool call started: ${name} (ID: ${id})`);
    };

    const handleToolCallCompleted = (toolCallData) => {
      const { name, id, success, error } = toolCallData;
      
      // Get the active tool call info
      const activeCall = activeToolCalls.current.get(id);
      
      if (activeCall) {
        // Remove the "started" notification
        removeNotification(activeCall.notificationId);
        
        // Show completion notification
        showToolCallCompleted(name, success, error);
        
        // Calculate duration
        const duration = Date.now() - activeCall.startTime;
        
        // Remove from active calls
        activeToolCalls.current.delete(id);
        
        console.log(`[ToolCallTracking] Tool call completed: ${name} (ID: ${id}) - Success: ${success} - Duration: ${duration}ms`);
      } else {
        // Fallback: show completion notification even if we didn't track the start
        showToolCallCompleted(name, success, error);
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
