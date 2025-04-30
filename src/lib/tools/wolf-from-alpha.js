export class WolframAlphaTool {
  /**
   * Creates a new WolframAlphaTool instance
   * @param {Object} options - Configuration options
   * @param {string} options.appId - Wolfram Alpha AppID (defaults to env variable)
   */
  constructor(options = {}) {
    //this.appId = options.appId || process.env.WOLFRAM_APP_ID;
    this.appId = "TEWJ4U-U775T2KH95"; // Replace with your actual AppID
    this.baseUrl = 'https://api.wolframalpha.com/v2/query';
    
    if (!this.appId) {
      console.warn('WolframAlphaTool: No AppID provided. Please provide an AppID or set WOLFRAM_APP_ID environment variable.');
    }
  }

  /**
   * Return the tool declaration for the ToolManager
   * @returns {Object} Tool declaration object
   */
  getDeclaration() {
    return {
      name: "wolframAlpha",
      description: "Query Wolfram Alpha for mathematical calculations, factual data, and computational knowledge",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The query to send to Wolfram Alpha (e.g., mathematical expressions, factual queries)"
          },
          podFilter: {
            type: "string",
            description: "Optional filter for specific pod types (e.g., 'Result', 'Definition', 'Plot')",
            default: ""
          },
          includePods: {
            type: "boolean",
            description: "Whether to include detailed pod information in results",
            default: true
          }
        },
        required: ["query"]
      }
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
      const results = await this.query(query, podFilter);
      return {
        status: "success",
        data: results,
        formattedResults: this.formatResults(query, results, includePods)
      };
    } catch (error) {
      console.error('[WolframAlphaTool] Query execution error:', error);
      return {
        status: "error",
        error: error.message || "Failed to perform Wolfram Alpha query",
        data: null
      };
    }
  }

  /**
   * Format query results for LLM consumption
   * @param {string} query - The original query
   * @param {Object} results - Query results object
   * @param {boolean} includePods - Whether to include detailed pod information
   * @returns {string} - Formatted results string
   */
  formatResults(query, results, includePods) {
    if (!results || !results.queryresult || results.queryresult.success === false) {
      return `No results found for query: "${query}"`;
    }

    let formattedResults = `Wolfram Alpha results for: "${query}"\n\n`;
    
    // Add interpretation if available
    if (results.queryresult.pods) {
      const inputPod = results.queryresult.pods.find(p => p.id === 'Input');
      if (inputPod && inputPod.subpods && inputPod.subpods[0]) {
        formattedResults += `Interpreted as: ${inputPod.subpods[0].plaintext}\n\n`;
      }
      
      // Add primary result
      const resultPod = results.queryresult.pods.find(p => 
        p.id === 'Result' || p.primary === true || p.title === 'Result');
      
      if (resultPod && resultPod.subpods && resultPod.subpods[0]) {
        formattedResults += `Result: ${resultPod.subpods[0].plaintext}\n\n`;
      }
      
      // Include detailed pods if requested
      if (includePods) {
        results.queryresult.pods.forEach(pod => {
          if (pod.id !== 'Input' && (!resultPod || pod.id !== resultPod.id)) {
            formattedResults += `${pod.title}:\n`;
            pod.subpods.forEach(subpod => {
              if (subpod.plaintext) {
                formattedResults += `${subpod.plaintext}\n`;
              }
            });
            formattedResults += '\n';
          }
        });
      }
    }

    return formattedResults;
  }

  /**
   * Perform a Wolfram Alpha query and return results
   * @param {string} query - The query to send to Wolfram Alpha
   * @param {string} podFilter - Optional filter for specific pod types
   * @returns {Promise<Object>} - Query results object
   */
  async query(query, podFilter = "") {
    if (!this.appId) {
      throw new Error('Wolfram Alpha AppID is missing');
    }

    // Validate inputs
    if (!query || typeof query !== 'string') {
      throw new Error('Query must be a non-empty string');
    }

    try {
      // Construct URL with parameters
      const queryUrl = new URL(this.baseUrl);
      queryUrl.searchParams.append('appid', this.appId);
      queryUrl.searchParams.append('input', query);
      queryUrl.searchParams.append('format', 'json');
      queryUrl.searchParams.append('output', 'json');
      
      // Add pod filter if provided
      if (podFilter) {
        queryUrl.searchParams.append('podtitle', podFilter);
      }
      
      // Make the request
      const response = await fetch(queryUrl.toString());
      
      if (!response.ok) {
        throw new Error(`Wolfram Alpha API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return data;
    } catch (error) {
      console.error('[WolframAlphaTool] Query error:', error);
      throw error;
    }
  }
}
