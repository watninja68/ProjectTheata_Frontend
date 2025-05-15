// FILE: watninja68-projecttheata_frontend/src/components/BackgroundTaskManager.js
// --- Updated File Content ---
import React, { useState, useEffect } from 'react';
import './BackgroundTaskManager.css';
import { useAuth } from '../hooks/useAuth';
import { FaGoogle, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

const ADK_AGENT_URL = 'http://localhost:8000'; // Your Python ADK agent URL

const BackgroundTaskManager = () => {
    const [taskQuery, setTaskQuery] = useState('');
    const [results, setResults] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const { user } = useAuth();
    const [isGmailAuthChecking, setIsGmailAuthChecking] = useState(false);
    const [gmailAuthStatus, setGmailAuthStatus] = useState(null); // null, 'checking', 'success', 'error'

    // Placeholder: Function to check Gmail Auth Status with ADK agent
    // This would require an endpoint on your ADK agent.
    const checkGmailAuth = async () => {
        setIsGmailAuthChecking(true);
        setGmailAuthStatus('checking');
        setError(null);
        try {
            // Conceptual: ADK agent would need an endpoint like /check-gmail-auth
            // that tries to initialize the Gmail service and returns its status.
            const response = await fetch(`${ADK_AGENT_URL}/check-gmail-auth`, { // Replace with actual ADK endpoint
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

    // useEffect(() => {
    //     checkGmailAuth(); // Optional: Check auth status on component mount
    // }, []);


    const handleExecuteTask = async () => {
        if (!taskQuery.trim()) {
            setError('Please enter a query for the task.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setResults(null);

        // Construct payload for ADK /run endpoint
        const adkPayload = {
            app_name: "agents", // As defined in your agent.py
            user_id: user ? user.id : "frontend_task_user", // Provide a user ID
            session_id: `task_session_${Date.now()}`, // Generate a unique session ID for the task
            new_message: {
                role: "user",
                parts: [{ text: taskQuery }]
            },
            stream: false // Typically background tasks might not need streaming responses
        };

        try {
            console.log(`Sending task to ADK agent (${ADK_AGENT_URL}/run):`, adkPayload);
            const response = await fetch(`${ADK_AGENT_URL}/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Add any other headers your ADK agent might expect
                },
                body: JSON.stringify(adkPayload),
            });

            const responseText = await response.text(); // Get raw text first for debugging
            console.log("ADK Agent Raw Response:", responseText);

            if (!response.ok) {
                let errorDetail = `Task execution failed with status ${response.status}.`;
                try {
                    const errorJson = JSON.parse(responseText);
                    errorDetail = errorJson.detail || errorJson.error?.message || errorDetail;
                } catch (e) {
                    errorDetail += ` Response: ${responseText.substring(0, 200)}`;
                }
                throw new Error(errorDetail);
            }

            // Assuming the ADK agent's /run response (non-streaming) is JSON
            // containing the task result or a message.
            // The structure depends on how your root_agent in agent.py formats its final response.
            // If it's text, you might get it from event.content.parts[0].text in the ADK event loop.
            // If you send stream: false, the ADK runner by default wraps the final agent message.
            let data;
            try {
                data = JSON.parse(responseText);
                 // The ADK runner's default /run response for stream=false looks like:
                 // { "session": {...}, "messages": [ { "role": "model", "parts": [{"text": "final agent output"}] } ] }
                 if (data.messages && data.messages.length > 0 && data.messages[0].parts && data.messages[0].parts.length > 0) {
                    setResults({ agent_response: data.messages[0].parts[0].text, raw_adk_response: data });
                 } else {
                    setResults({ raw_adk_response: data }); // Store whatever JSON was received
                 }

            } catch (e) {
                // If response is not JSON, but was status 200, treat as plain text result
                console.warn("ADK response was not JSON, treating as plain text:", responseText);
                setResults({ agent_response: responseText });
            }

            // setTaskQuery(''); // Optionally clear input
        } catch (err) {
            console.error("Error executing task directly with ADK agent:", err);
            setError(err.message + ". Make sure the Python ADK agent is running on " + ADK_AGENT_URL + " and CORS is configured if you are calling it directly from the browser.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleInitiateGmailAuth = () => {
        // This is where you'd redirect to your Go backend's Google OAuth initiation endpoint
        // For example: window.location.href = 'http://localhost:8080/auth/google/gmail/login';
        // That Go endpoint would then handle the OAuth dance and eventually create token.pickle
        alert("Gmail authentication flow needs to be implemented.\n\nFor now, please ensure you have run 'gmail_auth.py' manually in the ADK agent's environment if Gmail tools are needed by the agent.");
        // After backend handles auth and creates token.pickle, user might need to "recheck" status
        // Or the ADK agent automatically picks up the new token on its next Gmail tool use.
    };

    return (
        <div className="background-task-manager">
            <h4>Background Task (Direct to ADK Agent)</h4>

            {/* Gmail Auth Placeholder */}
            <div className="gmail-auth-section">
                <h5>Gmail Integration</h5>
                {gmailAuthStatus === 'success' && (
                    <p className="auth-status success"><FaCheckCircle /> Gmail access appears to be authorized for the agent.</p>
                )}
                {gmailAuthStatus === 'error' && (
                    <p className="auth-status error"><FaExclamationTriangle /> {error || "Gmail access might not be authorized for the agent."}</p>
                )}
                {gmailAuthStatus !== 'success' && (
                    <button
                        onClick={handleInitiateGmailAuth}
                        disabled={isGmailAuthChecking}
                        className="gmail-auth-button"
                    >
                        <FaGoogle style={{ marginRight: '8px' }} />
                        {isGmailAuthChecking ? 'Checking...' : 'Authorize Gmail for Agent'}
                    </button>
                )}
                 <p><small>Note: For Gmail tasks, the ADK agent needs prior authorization. If not done, click above or ensure <code>token.pickle</code> is present for the agent.</small></p>
            </div>


            <div className="task-form">
                <div className="form-group">
                    <label htmlFor="taskQuery">Describe the task for the agent:</label>
                    <input
                        type="text"
                        id="taskQuery"
                        placeholder="e.g., Summarize the latest AI news from Google"
                        value={taskQuery}
                        onChange={(e) => setTaskQuery(e.target.value)}
                        className="task-query-input"
                    />
                    <small>
<<<<<<< HEAD
                        Example for Google Search: {`{"query": "What is Project Theta?"}`}<br />
                        Example for Gmail (conceptual): {`{"to": "test@example.com", "subject": "Hello", "body_prompt": "Draft a friendly greeting."}`}
=======
                        The agent will interpret your query and use its available tools (e.g., Google Search, Gmail).
>>>>>>> 8de06f22939d3450098628b0d3e66ed142f2a156
                    </small>
                </div>
                <button onClick={handleExecuteTask} disabled={isLoading || !taskQuery.trim()}>
                    {isLoading ? 'Executing...' : 'Send Task to Agent'}
                </button>
            </div>

<<<<<<< HEAD
            {error && <div className="task-error">Error: {error}</div>}
=======
            {error && !isLoading && <div className="task-error">Error: {error}</div>} {/* Show error only if not loading */}
>>>>>>> 8de06f22939d3450098628b0d3e66ed142f2a156

            {results && (
                <div className="task-results">
                    <h5>Agent Task Response:</h5>
                    <pre>{results.agent_response ? results.agent_response : JSON.stringify(results.raw_adk_response || results, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};

export default BackgroundTaskManager;
