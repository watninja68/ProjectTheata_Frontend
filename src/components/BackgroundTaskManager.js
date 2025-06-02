// FILE: watninja68-projecttheata_frontend/src/components/BackgroundTaskManager.js
import React, { useState, useEffect } from 'react';
import './BackgroundTaskManager.css';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { FaGoogle, FaExclamationTriangle, FaInfoCircle } from 'react-icons/fa';

const BackgroundTaskManager = () => {
    const [taskQuery, setTaskQuery] = useState('');
    const [results, setResults] = useState(null);
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
                console.log("Attempting to fetch Google Auth Status from URL:", statusUrl);
                const response = await fetch(statusUrl);

                if (response.ok) {
                    const data = await response.json();
                    if (data.connected) {
                        setGmailConnectionInfo("Your Google account appears to be connected for background tasks.");
                    } else {
                        setGmailConnectionInfo("Google account not connected. Use 'Connect/Refresh Google Account' to enable Gmail/Drive tools.");
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


    const handleExecuteTask = async () => {
        if (!taskQuery.trim()) {
            setTaskError('Please enter a query for the task.');
            return;
        }
        setIsLoading(true);
        setTaskError(null);
        setResults(null);

        if (!settings.backendBaseUrl) {
            console.error("BackgroundTaskManager: backendBaseUrl is not set for task execution.");
            setTaskError("Backend URL not configured. Cannot execute task.");
            setIsLoading(false);
            return;
        }

        const goBackendPayload = {
            user_id: user ? user.id : "",
            // --- CORRECTED FIELD NAME TO MATCH GO BACKEND EXPECTATION ---
            text: taskQuery, // This field is expected by Go backend as `json:"text,omitempty"`
            // If you want to send structured tool calls in the future, you'd use:
            // tool_name: "specific_tool_name_here",
            // parameters: { /* tool specific params */ }
        };

        try {
            const endpoint = `${settings.backendBaseUrl}/api/tasks/execute`;
            console.log(`Sending task to Go backend (${endpoint}):`, goBackendPayload);
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', },
                body: JSON.stringify(goBackendPayload),
            });

            const responseText = await response.text();
            console.log("Go Backend Task Response (Raw):", responseText);

            if (!response.ok) {
                let errorDetail = `Task execution via Go backend failed (Status: ${response.status}).`;
                try {
                    const errorJson = JSON.parse(responseText);
                    errorDetail = errorJson.error?.message || errorJson.error || errorJson.detail || errorDetail;
                } catch (e) { /* Ignore if not JSON */ }
                errorDetail += ` Response: ${responseText.substring(0,300)}`;
                throw new Error(errorDetail);
            }

            try {
                const data = JSON.parse(responseText);
                let agentResponseText = "Task processed. No specific text output from agent.";
                if (data.adk_response) {
                    agentResponseText = typeof data.adk_response === 'string' ? data.adk_response : JSON.stringify(data.adk_response, null, 2);
                } else if (data.raw_adk_response) {
                    agentResponseText = data.raw_adk_response;
                } else if (data.result && data.result.tool_response && data.result.tool_response.outputs) {
                    agentResponseText = data.result.tool_response.outputs.map(o => o.text || JSON.stringify(o.tool_code_output) || JSON.stringify(o)).join("\n");
                } else if (data.error) {
                    setTaskError(data.error.message || data.error);
                    agentResponseText = `Error: ${data.error.message || data.error}`;
                } else if (Object.keys(data).length > 0) {
                    agentResponseText = JSON.stringify(data, null, 2);
                }
                setResults(agentResponseText.trim());
            } catch (e) {
                console.warn("Go backend task response was not valid JSON, showing raw text:", e);
                setResults(responseText);
            }
        } catch (err) {
            console.error("Error during task execution call:", err);
            setTaskError(err.message || "Network error or unexpected issue during task execution.");
            setResults(null);
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
            console.error("BackgroundTaskManager: backendBaseUrl is missing from settings for Google Auth initiation.");
        } else {
            alert("Please log in to your main application account first to connect your Google Account.");
        }
    };

    return (
        <div className="background-task-manager">
            <h4>Background Tasks (via ADK Agent)</h4>
            <div className="gmail-auth-section">
                <h5>Google Account for Gmail/Drive Tools</h5>
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
                        Enter a natural language instruction for the ADK agent.
                        The Go backend will forward this. If it involves Gmail/Drive, ensure Google Account is connected.
                    </small>
                </div>
                <button onClick={handleExecuteTask} disabled={isLoading || !taskQuery.trim() || !user}>
                    {isLoading ? 'Executing...' : 'Send Task to Agent'}
                </button>
            </div>

            {taskError && <div className="task-error">Error: {taskError}</div>}

            {results && (
                <div className="task-results">
                    <h5>Agent Task Response:</h5>
                    <pre>{results}</pre>
                </div>
            )}
        </div>
    );
};

export default BackgroundTaskManager;