import React, { useState, useEffect } from 'react';
import './BackgroundTaskManager.css';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { useNotifications } from '../contexts/NotificationContext';
import { FaGoogle, FaInfoCircle, FaRobot, FaCog, FaTerminal, FaCheckCircle, FaTimes } from 'react-icons/fa';

const BackgroundTaskManager = () => {
    const [taskQuery, setTaskQuery] = useState('');
    const [processedResults, setProcessedResults] = useState([]);
    const [rawResponse, setRawResponse] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [taskError, setTaskError] = useState(null);
    const { user } = useAuth();
    const { settings } = useSettings();
    const { showToolCallStarted, showToolCallCompleted, removeNotification } = useNotifications();
    const [gmailConnectionStatus, setGmailConnectionStatus] = useState({ loading: true, message: "Verifying Google connection..." });

    const checkBackendGoogleTokenStatus = async () => {
        if (!user || !user.id) {
            setGmailConnectionStatus({ loading: false, message: "Log in to connect your Google account for background tasks." });
            return;
        }
        if (!settings.backendBaseUrl) {
            console.error("BackgroundTaskManager: backendBaseUrl is not set in settings.");
            setGmailConnectionStatus({ loading: false, message: "Backend URL not configured. Cannot check Google connection status." });
            return;
        }
        setGmailConnectionStatus({ loading: true, message: "Verifying Google connection..." });
        try {
            const statusUrl = `${settings.backendBaseUrl}/api/auth/google/status?supabase_user_id=${user.id}`;
            const response = await fetch(statusUrl);
            const data = await response.json();
            if (response.ok) {
                if (data.connected) {
                    setGmailConnectionStatus({ loading: false, message: "Account is authenticated.", connected: true });
                } else {
                    setGmailConnectionStatus({ loading: false, message: `Account not connected. Reason: ${data.reason || 'Unknown'}.`, connected: false });
                }
            } else {
                setGmailConnectionStatus({ loading: false, message: `Could not verify connection (Status: ${response.status}).`, connected: false });
            }
        } catch (e) {
            console.error("Error checking backend Google token status:", e);
            setGmailConnectionStatus({ loading: false, message: "Error checking connection. Ensure backend is running.", connected: false });
        }
    };

    useEffect(() => {
        checkBackendGoogleTokenStatus();
    }, [user, settings.backendBaseUrl]);

    const processAdkResponse = (responseData) => {
        const processed = [];
        if (Array.isArray(responseData)) {
            responseData.forEach(event => {
                if (event.content && event.content.parts) {
                    event.content.parts.forEach(part => {
                        if (part.text) {
                            processed.push({ type: 'text', author: event.author || 'Agent', content: part.text.trim() });
                        } else if (part.functionCall) {
                            processed.push({
                                type: 'functionCall',
                                author: event.author || 'Agent',
                                name: part.functionCall.name,
                                args: part.functionCall.args,
                                id: part.functionCall.id,
                            });
                        } else if (part.functionResponse) {
                            processed.push({
                                type: 'functionResponse',
                                author: event.author || 'Tool',
                                name: part.functionResponse.name,
                                response: part.functionResponse.response,
                                id: part.functionResponse.id,
                            });
                        }
                    });
                }
            });
        } else if (responseData && responseData.text) {
             processed.push({ type: 'text', author: 'Agent', content: responseData.text.trim() });
        } else if (typeof responseData === 'string') {
            processed.push({ type: 'text', author: 'Agent', content: responseData });
        }
        
        if (processed.length === 0 && responseData) {
            processed.push({ type: 'raw', content: JSON.stringify(responseData, null, 2) });
        }
        return processed;
    };

    const handleExecuteTask = async () => {
        if (!taskQuery.trim()) {
            setTaskError('Please enter a query for the task.');
            return;
        }
        setIsLoading(true);
        setTaskError(null);
        setProcessedResults([]);
        setRawResponse(null);

        if (!settings.backendBaseUrl) {
            setTaskError("Backend URL not configured. Cannot execute task.");
            setIsLoading(false);
            return;
        }

        // Show notification that background task execution started
        const notificationId = showToolCallStarted('Background Agent Task');

        const goBackendPayload = {
            user_id: user ? user.id : "",
            text: taskQuery,
        };

        try {
            const endpoint = `${settings.backendBaseUrl}/api/tasks/execute`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(goBackendPayload),
            });

            const responseText = await response.text();
            setRawResponse(responseText);

            if (!response.ok) {
                let errorDetail = `Task execution failed (Status: ${response.status}).`;
                try {
                    const errorJson = JSON.parse(responseText);
                    errorDetail = errorJson.error?.message || errorJson.error || errorJson.detail || errorDetail;
                } catch (e) { /* Ignore if not JSON */ }
                throw new Error(errorDetail);
            }

            const data = JSON.parse(responseText);

            let adkDataToProcess = data; 

            if (data.adk_response) { 
                adkDataToProcess = data.adk_response;
            } else if (Array.isArray(data) && data.length > 0 && data[0].content) {
                adkDataToProcess = data;
            } else if (data.content && data.content.parts) { 
                adkDataToProcess = [data]; 
            } else if (data.text) { 
                 adkDataToProcess = [{ content: { parts: [{ text: data.text }] } }];
            }

            setProcessedResults(processAdkResponse(adkDataToProcess));

            // Remove started notification and show success notification
            removeNotification(notificationId);
            showToolCallCompleted('Background Agent Task', true);

        } catch (err) {
            console.error("Error during task execution call:", err);
            setTaskError(err.message || "Network error or unexpected issue during task execution.");
            setProcessedResults([]);

            // Remove started notification and show error notification
            removeNotification(notificationId);
            showToolCallCompleted('Background Agent Task', false, err.message || "Task execution failed");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleInitiateGoogleAuthViaGo = () => {
        if (user && user.id && settings.backendBaseUrl) {
            const googleLoginUrl = `${settings.backendBaseUrl}/api/auth/google/login?supabase_user_id=${user.id}`;
            window.location.href = googleLoginUrl;
        } else if (!settings.backendBaseUrl) {
            alert("Backend URL is not configured in settings. Cannot connect Google Account.");
        } else {
            alert("Please log in to your main application account first to connect your Google Account.");
        }
    };

    return (
        <div className="background-task-manager">
            <div className="background-agent-header">
                <h4>Background Agent</h4>
            </div>

            <div className="gmail-auth-section">
                <div className="auth-header">
                    <h5>Google Integration</h5>
                </div>

                <div className="auth-status-container">
                    {gmailConnectionStatus.loading ? (
                        <div className="auth-status info">
                            <FaInfoCircle className="auth-icon" />
                            <span className="auth-message">Verifying status...</span>
                        </div>
                    ) : (
                        <div className={`auth-status ${gmailConnectionStatus.connected ? 'success' : 'error'}`}>
                            {gmailConnectionStatus.connected ? (
                                <div className="auth-icon-wrapper success">
                                    <FaCheckCircle className="auth-icon" />
                                </div>
                            ) : (
                                <div className="auth-icon-wrapper error">
                                    <FaTimes className="auth-icon" />
                                </div>
                            )}
                            <span className="auth-message">{gmailConnectionStatus.message}</span>
                        </div>
                    )}
                </div>

                <div className="auth-button-container">
                    <button
                        onClick={handleInitiateGoogleAuthViaGo}
                        className="gmail-auth-button"
                        disabled={!user || !settings.backendBaseUrl || gmailConnectionStatus.loading}
                        title={!user ? "Log in first" : !settings.backendBaseUrl ? "Backend URL not set" : "Connect or Refresh Google Account"}
                    >
                        <FaGoogle className="button-icon" />
                        <span className="button-text">
                            {gmailConnectionStatus.connected ? "Refresh Google Connection" : "Connect Google Account"}
                        </span>
                    </button>
                </div>

                <div className="auth-info-section">
                    <div className="info-icon-container">
                        <FaInfoCircle className="info-icon" />
                    </div>
                    <div className="info-note">
                        <p>For tasks involving Gmail or Google Drive, your Google account needs to be connected.</p>
                    </div>
                </div>
            </div>

            <div className="task-form">
                <div className="form-group">
                    <label htmlFor="taskQuery">Task Instruction for Agent:</label>
                    <textarea
                        id="taskQuery"
                        placeholder="e.g., Search my Gmail for emails from 'boss@example.com' with subject 'report'"
                        value={taskQuery}
                        onChange={(e) => setTaskQuery(e.target.value)}
                        className="task-query-input"
                        rows="3" // Added rows attribute
                    />
                    <small>
                        Enter your request. If it involves Google tools, ensure Google Account is connected.
                    </small>
                </div>
                <button onClick={handleExecuteTask} disabled={isLoading || !taskQuery.trim() || !user}>
                    {isLoading ? 'Executing...' : 'Send Task to Agent'}
                </button>
            </div>

            {taskError && <div className="task-error">Error: {taskError}</div>}

            {processedResults.length > 0 && (
                <div className="task-results">
                    <h5>Agent Task Response:</h5>
                    <div className="task-response-steps">
                        {processedResults.map((item, index) => (
                            <div key={index} className={`response-step step-type-${item.type}`}>
                                {item.type === 'text' && (
                                    <div className="text-response">
                                        <div className="response-header">
                                            <FaRobot className="step-icon" /> <strong>{item.author || 'Agent'}:</strong>
                                        </div>
                                        <div className="response-content">
                                            {item.content}
                                        </div>
                                    </div>
                                )}
                                {item.type === 'functionCall' && (
                                    <div className="function-call-details">
                                        <FaCog className="step-icon" /> <strong>Tool Call ({item.author}):</strong> <code>{item.name}</code>
                                        <pre>Args: {JSON.stringify(item.args, null, 2)}</pre>
                                    </div>
                                )}
                                {item.type === 'functionResponse' && (
                                    <div className="function-response-details">
                                        <FaTerminal className="step-icon" /> <strong>Tool Response ({item.name}):</strong>
                                        <pre>{typeof item.response?.result === 'string' ? item.response.result : JSON.stringify(item.response, null, 2)}</pre>
                                    </div>
                                )}
                                 {item.type === 'raw' && (
                                    <div className="raw-response-details">
                                        <strong>Raw Agent Output:</strong>
                                        <pre>{item.content}</pre>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BackgroundTaskManager;