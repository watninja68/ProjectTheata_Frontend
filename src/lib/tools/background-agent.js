/**
 * A tool for an agent to execute background tasks via a dedicated backend service.
 * This class encapsulates the logic for making API calls to the /api/tasks/execute endpoint,
 * abstracting away the raw fetch call into a structured tool format.
 */
export class BackgroundTaskTool {
  /**
   * Creates a new BackgroundTaskTool instance.
   * @param {Object} options - Configuration options for the tool.
   * @param {string} options.backendBaseUrl - The base URL of the backend server (e.g., 'http://localhost:8080').
   */
  constructor(options = {}) {
    this.backendBaseUrl = options.backendBaseUrl;

    if (!this.backendBaseUrl) {
      throw new Error('BackgroundTaskTool: backendBaseUrl is required in options.');
    }
  }

  /**
   * Returns the tool's declaration for registration with an agent or tool manager.
   * This describes what the tool does and what parameters it expects.
   * @returns {Object} The tool declaration object.
   */
  getDeclaration() {
    return {
      name: "executeBackgroundTask",
      description: "Sends a natural language task to a backend agent for execution. Useful for complex, multi-step tasks or tasks requiring authenticated access to user data (like Gmail or Google Drive or Google Calander).",
      parameters: {
        type: "object",
        properties: {
          taskQuery: {
            type: "string",
            description: "The natural language instruction or query for the agent. For example: 'Search my Gmail for emails from boss@example.com about the Q3 report'."
          },
          userId: {
            type: "string",
            description: "The unique identifier of the user initiating the task. This is required for authentication and context on the backend."
          }
        },
        required: ["taskQuery", "userId"]
      }
    };
  }

  /**
   * Executes the background task by calling the backend API.
   * @param {Object} params - The parameters for executing the tool.
   * @param {string} params.taskQuery - The natural language task for the agent.
   * @param {string} params.userId - The ID of the user.
   * @returns {Promise<Object>} A promise that resolves to an object containing the status and result of the execution.
   */
  async execute(params) {
    const { taskQuery, userId } = params;

    if (!taskQuery || !userId) {
      return {
        status: "error",
        error: "Both 'taskQuery' and 'userId' are required parameters."
      };
    }

    const endpoint = `${this.backendBaseUrl}/api/tasks/execute`;
    const payload = {
      user_id: userId,
      text: taskQuery,
      client_datetime: new Date().toISOString(), // Include client time for context
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();

      if (!response.ok) {
        let errorDetail = `Task execution failed with status: ${response.status}`;
        try {
          // Attempt to parse a more specific error message from the backend
          const errorJson = JSON.parse(responseText);
          errorDetail = errorJson.error?.message || errorJson.error || errorJson.detail || errorDetail;
        } catch (e) {
          // If response is not JSON, use the raw text if available
          errorDetail = responseText || errorDetail;
        }
        throw new Error(errorDetail);
      }

      const data = JSON.parse(responseText);

      // Return the full structured response from the backend.
      // The calling agent can then process the `adk_response` or other fields as needed.
      return {
        status: "success",
        result: data
      };

    } catch (err) {
      console.error('[BackgroundTaskTool] Execution error:', err);
      return {
        status: "error",
        error: err.message || "An unexpected error occurred during task execution."
      };
    }
  }
}
