export class GoogleSearchTool {
  /**
   * Creates a new GoogleSearchTool instance
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - Google API Key (defaults to env variable)
   * @param {string} options.cx - Google Custom Search Engine ID (defaults to env variable)
   */
  constructor(options = {}) {
    //this.apiKey = options.apiKey || process.env.GOOGLE_API_KEY;
    this.apiKey = process.env.REACT_APP_GOOGLE_API_KEY;

    this.cx = options.cx || process.env.REACT_APP_GOOGLE_CX;
    //this.cx = "61c9c7e56aba94128";
    this.baseUrl = 'https://www.googleapis.com/customsearch/v1';

    if (!this.apiKey) {
      console.warn('GoogleSearchTool: No API key provided. Please provide an API key or set GOOGLE_API_KEY environment variable.');
    }

    if (!this.cx) {
      console.warn('GoogleSearchTool: No Custom Search Engine ID provided. Please provide a CX or set GOOGLE_CX environment variable.');
    }
  }

  /**
   * Return the tool declaration for the ToolManager
   * @returns {Object} Tool declaration object
   */
  getDeclaration() {
    return {
      name: "googleSearch",
      description: "Search the web for real-time information using Google Search API",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query"
          },
          numResults: {
            type: "integer",
            description: "Number of results to return",
            default: 5
          }
        },
        required: ["query"]
      }
    };
  }

  /**
   * Execute the search tool with the provided parameters
   * @param {Object} params - Tool parameters
   * @param {string} params.query - The search query
   * @param {number} params.numResults - Number of results to return
   * @returns {Promise<Object>} - Tool execution results
   */
  async execute(params) {
    const { query, numResults = 5 } = params;

    try {
      const results = await this.search(query, numResults);
      return {
        status: "success",
        data: results,
        formattedResults: this.formatResults(query, results)
      };
    } catch (error) {
      console.error('[GoogleSearchTool] Search execution error:', error);
      return {
        status: "error",
        error: error.message || "Failed to perform search",
        data: null
      };
    }
  }

  /**
   * Format search results for LLM consumption
   * @param {string} query - The original search query
   * @param {Array} results - Search results array
   * @returns {string} - Formatted results string
   */
  formatResults(query, results) {
    if (!results || results.length === 0) {
      return "No search results found.";
    }

    let formattedResults = `Search results for: "${query}"\n\n`;

    results.forEach((result, index) => {
      formattedResults += `[${index + 1}] ${result.title}\n`;
      formattedResults += `URL: ${result.link}\n`;
      formattedResults += `Snippet: ${result.snippet}\n\n`;
    });

    return formattedResults;
  }

  /**
   * Perform a Google search and return results
   * @param {string} query - The search query
   * @param {number} numResults - Number of results to return
   * @returns {Promise<Array>} - Array of search results
   */
  async search(query, numResults = 5) {
    if (!this.apiKey || !this.cx) {
      throw new Error('Google Search API key or Custom Search Engine ID is missing');
    }

    // Validate inputs
    if (!query || typeof query !== 'string') {
      throw new Error('Search query must be a non-empty string');
    }

    try {
      // Construct URL with parameters
      const searchUrl = new URL(this.baseUrl);
      searchUrl.searchParams.append('key', this.apiKey);
      searchUrl.searchParams.append('cx', this.cx);
      searchUrl.searchParams.append('q', query);
      searchUrl.searchParams.append('num', Math.min(numResults, 10)); // Google limits to 10 results per page

      // Make the request
      const response = await fetch(searchUrl.toString());

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Google Search API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();

      // Format results
      if (!data.items || data.items.length === 0) {
        return [];
      }

      return data.items.map(item => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        source: 'Google Search'
      }));
    } catch (error) {
      console.error('[GoogleSearchTool] Search error:', error);
      throw error;
    }
  }
}
