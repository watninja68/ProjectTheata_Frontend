// FILE: watninja68-projecttheata_frontend/src/components/BackgroundTaskManager.js
import React, { useState, useEffect } from 'react';
import './BackgroundTaskManager.css';
import { useAuth } from '../hooks/useAuth';
import { FaGoogle, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

const GO_BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8080';

const BackgroundTaskManager = () => {
    const [taskQuery, setTaskQuery] = useState('');
    const [results, setResults] = useState(null); // This will now store the extracted text or error
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const { user } = useAuth();
    const [isGmailAuthChecking, setIsGmailAuthChecking] = useState(false);
    const [gmailAuthStatus, setGmailAuthStatus] = useState(null);

    const checkGmailAuth = async () => {
        setIsGmailAuthChecking(true);
        setGmailAuthStatus('checking');
        setError(null);
        try {
            const ADK_AGENT_URL_FOR_AUTH_CHECK = 'http://localhost:8000';
            const response = await fetch(`${ADK_AGENT_URL_FOR_AUTH_CHECK}/check-gmail-auth`, {
                method: 'GET',
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({ detail: "Failed to check Gmail auth status." }));
                throw new Error(errData.detail || `Auth check failed: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.authenticated) {
                setGmailAuthStatus('success');
            } else {
                setGmailAuthStatus('error');
                setError(data.message || "Gmail service not authenticated. Please run the authentication script for the agent.");
            }
        } catch (err) {
            console.error("Error checking Gmail auth status:", err);
            setGmailAuthStatus('error');
            setError(err.message || "Could not connect to agent to check Gmail auth status. Ensure the ADK agent is running and CORS is configured if direct calling.");
        } finally {
            setIsGmailAuthChecking(false);
        }
    };

    const handleExecuteTask = async () => {
        if (!taskQuery.trim()) {
            setError('Please enter a query for the task.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setResults(null); // Clear previous results

        const goBackendPayload = {
            user_id: user ? user.id : "frontend_task_user",
            session_id: `task_session_fg_${Date.now()}`,
            text: taskQuery
        };

        try {
            const endpoint = `${GO_BACKEND_URL}/api/tasks/execute`;
            console.log(`Sending task query to Go backend (${endpoint}):`, goBackendPayload);
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(goBackendPayload),
            });

            const responseText = await response.text();
            console.log("Go Backend (for ADK Task) Raw Response:", responseText);

            if (!response.ok) {
                let errorDetail = `Task execution failed via Go backend with status ${response.status}.`;
                try {
                    const errorJson = JSON.parse(responseText);
                    errorDetail = errorJson.detail || errorJson.error?.message || errorJson.error || errorDetail;
                } catch (e) {
                    errorDetail += ` Response: ${responseText.substring(0, 200)}`;
                }
                throw new Error(errorDetail);
            }

            let data;
            try {
                data = JSON.parse(responseText);
                
                // --- MODIFIED RESPONSE HANDLING ---
                let agentResponseText = "No text response from agent."; // Default if parsing fails

                if (data && data.adk_response && Array.isArray(data.adk_response) && data.adk_response.length > 0) {
                    const firstAdkEvent = data.adk_response[0];
                    if (firstAdkEvent.content && firstAdkEvent.content.parts && Array.isArray(firstAdkEvent.content.parts) && firstAdkEvent.content.parts.length > 0) {
                        const firstPart = firstAdkEvent.content.parts[0];
                        if (firstPart.text) {
                            agentResponseText = firstPart.text.trim();
                        }
                    }
                } else if (data.raw_adk_response) { // Fallback for non-JSON or differently structured ADK responses proxied
                     agentResponseText = typeof data.raw_adk_response === 'string' ? data.raw_adk_response : JSON.stringify(data.raw_adk_response);
                } else if (data.error) { // If the Go backend itself returned an error in the JSON
                    setError(data.error); // Set error state
                    agentResponseText = `Error from backend: ${data.error}`; // Display error as result
                } else if (typeof data === 'string') { // If the whole response was a string
                    agentResponseText = data;
                }

                setResults(agentResponseText); // Store only the extracted text
                // --- END MODIFIED RESPONSE HANDLING ---

            } catch (e) {
                console.warn("Go backend response was not valid JSON or parsing ADK response failed, treating as plain text:", responseText, e);
                setResults(responseText); // Show raw text if parsing fails
            }
        } catch (err) {
            console.error("Error executing task via Go backend:", err);
            setError(err.message); // This will now show the parsed "Session not found" or other errors
            setResults(null); // Clear results on error
        } finally {
            setIsLoading(false);
        }
    };

    const handleInitiateGmailAuth = () => {
        alert("Gmail authentication flow needs to be implemented.\n\nFor now, please ensure you have run 'gmail_auth.py' manually in the ADK agent's environment if Gmail tools are needed by the agent.");
    };

    return (
        <div className="background-task-manager">
            <h4>Background Task (Via Go Backend)</h4>

            <div className="gmail-auth-section">
                <h5>Gmail Integration Status (ADK Agent)</h5>
                {gmailAuthStatus === 'success' && (
                    <p className="auth-status success"><FaCheckCircle /> Gmail access appears to be authorized for the ADK agent.</p>
                )}
                {gmailAuthStatus === 'error' && (
                    <p className="auth-status error"><FaExclamationTriangle /> {error || "Gmail access might not be authorized for the ADK agent."}</p>
                )}
                <button 
                    onClick={checkGmailAuth} 
                    disabled={isGmailAuthChecking}
                    className="gmail-auth-button"
                    style={{backgroundColor: 'var(--info-color)', marginBottom: '1rem'}}
                >
                    {isGmailAuthChecking ? 'Checking...' : 'Check ADK Gmail Auth'}
                </button>
                <br/> 
                
                <button
                    onClick={handleInitiateGmailAuth}
                    className="gmail-auth-button"
                >
                    <FaGoogle style={{ marginRight: '8px' }} />
                    Initiate Gmail Auth for ADK Agent
                </button>
                 <p><small>Note: For Gmail tasks, the ADK agent needs prior authorization. If status above is error, ensure <code>token.pickle</code> is present for the agent.</small></p>
            </div>


            <div className="task-form">
                <div className="form-group">
                    <label htmlFor="taskQuery">Task Query for Agent:</label>
                    <input
                        type="text"
                        id="taskQuery"
                        placeholder="e.g., Summarize the latest AI news from Google"
                        value={taskQuery}
                        onChange={(e) => setTaskQuery(e.target.value)}
                        className="task-query-input"
                    />
                    <small>
                        Enter a natural language query for the ADK agent.
                        The Go backend will forward this to the ADK agent for non-streaming execution.
                    </small>
                </div>
                <button onClick={handleExecuteTask} disabled={isLoading || !taskQuery.trim()}>
                    {isLoading ? 'Executing...' : 'Send Task Query'}
                </button>
            </div>

            {error && <div className="task-error">Error: {error}</div>}

            {/* MODIFIED: Displaying results (which is now just the agent's text response) */}
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