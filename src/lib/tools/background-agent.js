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
      description: "Sends a natural language task to a backend agent for execution. This is useful for complex, multi-step tasks or tasks requiring authenticated access to user data (like Gmail, Google Drive, or Google Calendar). The agent will have access to the user's authenticated context.",
      parameters: {
        type: "object",
        properties: {
          taskQuery: {
            type: "string",
            description: "The natural language instruction or query for the agent. For example: 'Search my Gmail for emails from boss@example.com about the Q3 report' or 'Find my next event on Google Calendar'."
          }
        },
        required: ["taskQuery"]
      }
    };
  }

  /**
   * Executes the background task by calling the backend API.
   * @param {Object} params - The parameters for executing the tool, provided by the LLM.
   * @param {string} params.taskQuery - The natural language task for the agent.
   * @param {Object} user - The authenticated user object, provided by the agent.
   * @returns {Promise<Object>} A promise that resolves to an object containing the status and result of the execution.
   */
  async execute(params, user) {
    const { taskQuery } = params;
    const userId = user?.id; // Get user ID from the context passed by the agent

    if (!taskQuery) {
      return {
        status: "error",
        error: "'taskQuery' is a required parameter."
      };
    }

    if (!userId) {
      return {
        status: "error",
        error: "User is not authenticated. Cannot execute a background task without a user context."
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
