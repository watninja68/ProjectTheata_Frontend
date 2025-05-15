import React, { useState } from 'react';
import './BackgroundTaskManager.css'; // We'll create this CSS file

const BackgroundTaskManager = () => {
    const [toolName, setToolName] = useState('google_search');
    const [parameters, setParameters] = useState(''); // Store as JSON string for simplicity
    const [results, setResults] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const availableTools = [
        { value: 'google_search', label: 'Google Search' },
        { value: 'gmail_draft', label: 'Gmail Draft (Conceptual)' },
        { value: 'code_agent_execute', label: 'Code Agent (Conceptual)' },
    ];

    const handleExecuteTask = async () => {
        setIsLoading(true);
        setError(null);
        setResults(null);

        let parsedParameters;
        try {
            parsedParameters = parameters ? JSON.parse(parameters) : {};
        } catch (e) {
            setError('Invalid JSON in parameters.');
            setIsLoading(false);
            return;
        }

        try {
            // Assuming Go backend is on localhost:8080
            const response = await fetch(process.env.BACKEND_URL + '/api/tasks/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    tool_name: toolName,
                    parameters: parsedParameters,
                    // user_id and session_id can be added if needed by your ADK setup
                    // user_id: "frontend_user_for_task", 
                    // session_id: `task_${Date.now()}` 
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Task execution failed with status ${response.status}`);
            }
            setResults(data);
        } catch (err) {
            console.error("Error executing task:", err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="background-task-manager">
            <h4>Background Tasks (via ADK Agent)</h4>
            <div className="task-form">
                <div className="form-group">
                    <label htmlFor="toolName">Tool:</label>
                    <select
                        id="toolName"
                        value={toolName}
                        onChange={(e) => setToolName(e.target.value)}
                    >
                        {availableTools.map(tool => (
                            <option key={tool.value} value={tool.value}>{tool.label}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="parameters">Parameters (JSON):</label>
                    <textarea
                        id="parameters"
                        placeholder={'e.g., {"query": "latest AI news"}'}
                        value={parameters}
                        onChange={(e) => setParameters(e.target.value)}
                        rows="4"
                    />
                    <small>
                        Example for Google Search: {`{"query": "What is Project Theta?"}`}<br />
                        Example for Gmail (conceptual): {`{"to": "test@example.com", "subject": "Hello", "body_prompt": "Draft a friendly greeting."}`}
                    </small>
                </div>
                <button onClick={handleExecuteTask} disabled={isLoading}>
                    {isLoading ? 'Executing...' : 'Execute Task'}
                </button>
            </div>

            {error && <div className="task-error">Error: {error}</div>}

            {results && (
                <div className="task-results">
                    <h5>Task Results:</h5>
                    <pre>{JSON.stringify(results, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};

export default BackgroundTaskManager;
