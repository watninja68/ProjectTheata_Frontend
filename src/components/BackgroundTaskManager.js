// FILE: watninja68-projecttheata_frontend/src/components/BackgroundTaskManager.js
import React, { useState, useEffect } from 'react';
import './BackgroundTaskManager.css';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { FaGoogle, FaExclamationTriangle, FaInfoCircle, FaRobot, FaCog, FaTerminal } from 'react-icons/fa'; // Added new icons

const BackgroundTaskManager = () => {
    const [taskQuery, setTaskQuery] = useState('');
    // Store results as an array of processed events or a structured object
    const [processedResults, setProcessedResults] = useState([]);
    const [rawResponse, setRawResponse] = useState(null); // For debugging or raw view
    const [isLoading, setIsLoading] = useState(false);
    const [taskError, setTaskError] = useState(null);
    const { user } = useAuth();
    const { settings } = useSettings();
    const [gmailConnectionInfo, setGmailConnectionInfo] = useState("Verifying Google connection...");

    useEffect(() => {
        const checkBackendGoogleTokenStatus = async () => {
            if (!user || !user.id) {
                setGmailConnectionInfo("Log in to connect your Google account for background tasks.");
                return;
            }
            if (!settings.backendBaseUrl) {
                console.error("BackgroundTaskManager: backendBaseUrl is not set in settings.");
                setGmailConnectionInfo("Backend URL not configured. Cannot check Google connection status.");
                return;
            }

            try {
                const statusUrl = `${settings.backendBaseUrl}/api/auth/google/status?supabase_user_id=${user.id}`;
                const response = await fetch(statusUrl);
                if (response.ok) {
                    const data = await response.json();
                    if (data.connected) {
                        setGmailConnectionInfo("Account is authenticated.");
                    } else {
                        setGmailConnectionInfo(`Account is not connected. Reason: ${data.reason || 'Unknown'}. Use 'Connect/Refresh Google Account' to enable Gmail/Drive tools.`);
                    }
                } else {
                    const errorText = await response.text();
                    console.error("Failed to fetch Google auth status:", response.status, errorText);
                    setGmailConnectionInfo(`Could not verify Google account connection (Status: ${response.status}). Try connecting again.`);
                }
            } catch (e) {
                console.error("Error checking backend Google token status:", e);
                setGmailConnectionInfo("Error checking Google connection. Ensure backend is running.");
            }
        };
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
                                author: event.author || 'Tool', // Or determine based on context
                                name: part.functionResponse.name,
                                response: part.functionResponse.response,
                                id: part.functionResponse.id,
                            });
                        }
                    });
                }
            });
        } else if (responseData && responseData.text) { // Simple text response
             processed.push({ type: 'text', author: 'Agent', content: responseData.text.trim() });
        } else if (typeof responseData === 'string') { // Raw string response
            processed.push({ type: 'text', author: 'Agent', content: responseData });
        }
        
        // If nothing was processed but we have a response, show raw
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
        setProcessedResults([]); // Clear previous results
        setRawResponse(null);

        if (!settings.backendBaseUrl) {
            setTaskError("Backend URL not configured. Cannot execute task.");
            setIsLoading(false);
            return;
        }

        const goBackendPayload = {
            user_id: user ? user.id : "",
            text: taskQuery, // This is the natural language instruction
        };

        try {
            const endpoint = `${settings.backendBaseUrl}/api/tasks/execute`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(goBackendPayload),
            });

            const responseText = await response.text();
            setRawResponse(responseText); // Store raw response for debugging

            if (!response.ok) {
                let errorDetail = `Task execution via Go backend failed (Status: ${response.status}).`;
                try {
                    const errorJson = JSON.parse(responseText);
                    errorDetail = errorJson.error?.message || errorJson.error || errorJson.detail || errorDetail;
                } catch (e) { /* Ignore if not JSON */ }
                errorDetail += ` Response: ${responseText.substring(0, 300)}`;
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

        } catch (err) {
            console.error("Error during task execution call:", err);
            setTaskError(err.message || "Network error or unexpected issue during task execution.");
            setProcessedResults([]);
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
            <h4>Background Agent</h4>
            <div className="gmail-auth-section">
                <h5>Authenticate account for Background Agents to use Google tools</h5>
                {gmailConnectionInfo && (
                    <p className={`auth-status ${gmailConnectionInfo.includes("Error") || gmailConnectionInfo.includes("not connected") || gmailConnectionInfo.includes("Could not verify") || gmailConnectionInfo.includes("not configured") ? 'error' : 'info'}`}>
                        {gmailConnectionInfo.includes("Error") || gmailConnectionInfo.includes("not connected") || gmailConnectionInfo.includes("Could not verify") || gmailConnectionInfo.includes("not configured") ? <FaExclamationTriangle /> : <FaInfoCircle />}
                        {gmailConnectionInfo}
                    </p>
                )}
                <button
                    onClick={handleInitiateGoogleAuthViaGo}
                    className="gmail-auth-button"
                    disabled={!user || !settings.backendBaseUrl}
                    title={!user ? "Log in first" : !settings.backendBaseUrl ? "Backend URL not set" : "Connect or Refresh Google Account"}
                >
                    <FaGoogle style={{ marginRight: '8px' }} />
                    Connect/Refresh Google Account
                </button>
                 <p><small>
                    For tasks involving Gmail or Google Drive, your Google account needs to be connected via the application.
                    This allows the background agent to use your permissions securely.
                 </small></p>
            </div>

            <div className="task-form">
                <div className="form-group">
                    <label htmlFor="taskQuery">Task Instruction for Agent:</label>
                    <input
                        type="text"
                        id="taskQuery"
                        placeholder="e.g., Search my Gmail for emails from 'boss@example.com' with subject 'report'"
                        value={taskQuery}
                        onChange={(e) => setTaskQuery(e.target.value)}
                        className="task-query-input"
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

            {/* This 'task-results' div will now be scrollable if content overflows */}
            {processedResults.length > 0 && (
                <div className="task-results">
                    <h5>Agent Task Response:</h5>
                    <div className="task-response-steps">
                        {processedResults.map((item, index) => (
                            <div key={index} className={`response-step step-type-${item.type}`}>
                                {item.type === 'text' && (
                                    <div className="text-response">
                                        <FaRobot className="step-icon" /> <strong>{item.author || 'Agent'}:</strong> {item.content}
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