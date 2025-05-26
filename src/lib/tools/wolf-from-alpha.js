export class WolframAlphaTool {
  /**
   * Creates a new WolframAlphaTool instance.
   * The constructor currently doesn't require any options as the backend
   * URL is determined by environment variables or defaults, and the
   * AppID is handled by the backend.
   * @param {Object} options - Configuration options (currently unused)
   */
  constructor(options = {}) {
    // No specific initialization needed here when using the backend proxy.
    // The base URL for direct Wolfram Alpha calls is not used.
  }

  /**
   * Queries the backend API, which in turn queries Wolfram Alpha.
   * @param {string} input - The query to send to Wolfram Alpha.
   * @returns {Promise<any>} - A promise that resolves to the JSON response from Wolfram Alpha.
   * @throws {Error} - Throws an error if the backend API call fails.
   */
  async queryWA(input) {
    // Determine the backend URL, defaulting to localhost:8080
    // We use '/wolfram' as defined in your Go backend code.
    const backendUrl = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8080"}/wolf`;

    // Create a URL object for the backend endpoint
    const url = new URL(backendUrl);

    // Set only the 'input' parameter, as the backend handles the rest (appid, output, format)
    url.searchParams.set("input", input);

    try {
      // Make the fetch request to your backend API
      const res = await fetch(url.toString());

      // Check if the response was successful (status code 2xx)
      if (!res.ok) {
        // Try to get more error details from the backend response body
        let errorBody = await res.text();
        try {
          // If the backend sent JSON error, try to parse it
          const jsonError = JSON.parse(errorBody);
          errorBody = jsonError.error || jsonError.message || errorBody;
        } catch (e) {
          // Keep it as text if not JSON
        }
        throw new Error(
          `Backend Error (HTTP ${res.status}): ${res.statusText} - ${errorBody}`,
        );
      }

      // If successful, parse and return the JSON response (forwarded from Wolfram Alpha)
      return res.json();
    } catch (error) {
      // Catch network errors or errors thrown above
      console.error("Failed to query backend API:", error);
      // Re-throw the error so the calling code can handle it
      throw error;
    }
  }

  /**
   * Return the tool declaration for the ToolManager
   * @returns {Object} Tool declaration object
   */
  getDeclaration() {
    return {
      name: "wolframAlpha",
      description:
        "Query Wolfram Alpha for mathematical calculations, factual data, and computational knowledge",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The query to send to Wolfram Alpha (e.g., mathematical expressions, factual queries)",
          },
          podFilter: {
            type: "string",
            description:
              "Optional filter for specific pod titles (e.g., 'Result', 'Definition', 'Plot'). Filters by matching pod titles.",
            default: "",
          },
          includePods: {
            type: "boolean",
            description:
              "Whether to include detailed pod information in results",
            default: true,
          },
        },
        required: ["query"],
      },
    };
  }

  /**
   * Execute the Wolfram Alpha tool with the provided parameters
   * @param {Object} params - Tool parameters
   * @param {string} params.query - The query to send to Wolfram Alpha
   * @param {string} params.podFilter - Optional filter for specific pod types
   * @param {boolean} params.includePods - Whether to include detailed pod information
   * @returns {Promise<Object>} - Tool execution results
   */
  async execute(params) {
    const { query, podFilter = "", includePods = true } = params;

    try {
      // Call 'query' which now uses the backend via 'queryWA'
      const results = await this.query(query, podFilter);

      // Check for success within the Wolfram Alpha response
      if (
        !results ||
        !results.queryresult ||
        results.queryresult.success === false
      ) {
        const errorMessage =
          results?.queryresult?.error?.msg ||
          `Wolfram Alpha query failed or returned no results for: "${query}"`;
        console.error(
          "[WolframAlphaTool] Query unsuccessful:",
          errorMessage,
          results,
        );
        return {
          status: "error",
          error: errorMessage,
          data: results, // Return data for inspection if available
        };
      }

      return {
        status: "success",
        data: results,
        formattedResults: this.formatResults(
          query,
          results,
          includePods,
          podFilter,
        ),
      };
    } catch (error) {
      console.error("[WolframAlphaTool] Query execution error:", error);
      return {
        status: "error",
        error:
          error.message || "Failed to perform Wolfram Alpha query via backend",
        data: null,
      };
    }
  }

  /**
   * Format query results for LLM consumption
   * @param {string} query - The original query
   * @param {Object} results - Query results object
   * @param {boolean} includePods - Whether to include detailed pod information
   * @param {string} podFilter - Optional filter for specific pod titles
   * @returns {string} - Formatted results string
   */
  formatResults(query, results, includePods, podFilter = "") {
    if (
      !results ||
      !results.queryresult ||
      results.queryresult.success === false
    ) {
      const errorMsg =
        results?.queryresult?.error?.msg || "No results found or query failed";
      return `No results found for query: "${query}". Reason: ${errorMsg}`;
    }

    let formattedResults = `Wolfram Alpha results for: "${query}"\n\n`;
    const pods = results.queryresult.pods || [];

    // Add interpretation if available
    const inputPod = pods.find((p) => p.id === "Input");
    if (inputPod && inputPod.subpods && inputPod.subpods[0]?.plaintext) {
      formattedResults += `Interpreted as: ${inputPod.subpods[0].plaintext}\n\n`;
    }

    // Add primary result or first "Result" pod
    const resultPod = pods.find(
      (p) => p.primary === true || p.id === "Result" || p.title === "Result",
    );

    if (resultPod && resultPod.subpods && resultPod.subpods[0]?.plaintext) {
      formattedResults += `Result: ${resultPod.subpods[0].plaintext}\n\n`;
    } else if (
      !resultPod &&
      pods.length > 1 &&
      pods[1]?.subpods?.[0]?.plaintext
    ) {
      // If no explicit result pod, try to use the second pod as a guess
      formattedResults += `${pods[1].title}: ${pods[1].subpods[0].plaintext}\n\n`;
    }

    // Include detailed pods if requested, applying the filter
    if (includePods) {
      formattedResults += "--- Additional Pods ---\n";
      pods.forEach((pod) => {
        const podTitle = pod.title || "Untitled";
        // Check if this pod should be included (not input, not already shown, and matches filter if present)
        const shouldInclude =
          pod.id !== "Input" &&
          (!resultPod || pod.id !== resultPod.id) &&
          (!podFilter ||
            podTitle.toLowerCase().includes(podFilter.toLowerCase()));

        if (shouldInclude) {
          formattedResults += `\n${podTitle}:\n`;
          (pod.subpods || []).forEach((subpod) => {
            if (subpod.plaintext) {
              formattedResults += `  - ${subpod.plaintext}\n`;
            }
          });
        }
      });
    }

    return formattedResults.trim();
  }

  /**
   * Perform a Wolfram Alpha query via the backend and return results.
   * This method now acts as a wrapper for queryWA, ensuring validation
   * and providing a consistent interface for 'execute'.
   * @param {string} query - The query to send to Wolfram Alpha.
   * @param {string} podFilter - (Currently unused in query, passed to formatResults via execute)
   * @returns {Promise<Object>} - Query results object from the backend.
   */
  async query(query, podFilter = "") {
    // Validate inputs
    if (!query || typeof query !== "string" || query.trim() === "") {
      throw new Error("Query must be a non-empty string");
    }

    // No AppID check is needed as we're using the backend.
    // No direct Wolfram Alpha API call is made here.

    try {
      // Call the backend via queryWA and return the full data.
      const data = await this.queryWA(query);
      return data;
    } catch (err) {
      // Re-throw the error (already logged by queryWA) so 'execute' can catch it.
      throw err;
    }
  }
}
