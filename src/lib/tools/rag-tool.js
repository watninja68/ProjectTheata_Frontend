export class RAGQueryTool {
  /**
   * Creates a new RAGQueryTool instance
   * @param {Object} options - Configuration options
   * @param {string} options.qdrantUrl - Qdrant database URL
   * @param {string} options.qdrantApiKey - Qdrant API key
   * @param {string} options.googleApiKey - Google API key for Gemini
   * @param {string} options.openaiApiKey - OpenAI API key for embeddings
   */
  constructor(options = {}) {
    this.qdrantUrl = options.qdrantUrl || process.env.REACT_APP_QDRANT_URL;
    this.qdrantApiKey = 
      options.qdrantApiKey || process.env.REACT_APP_QDRANT_API_KEY;
    this.googleApiKey = 
      options.googleApiKey || process.env.REACT_APP_GOOGLE_API_KEY;
    this.openaiApiKey = 
      options.openaiApiKey || process.env.REACT_APP_OPENAI_API_KEY;

    // Default configuration
    this.defaultCollectionName = "nigga_work";
    this.defaultTopK = 5;
    this.defaultSimilarityThreshold = 0.7;
    this.defaultModelName = "gemini-1.5-flash";

    // Validate required configuration
    if (!this.qdrantUrl) {
      console.warn(
        "RAGQueryTool: No Qdrant URL provided. Please provide qdrantUrl or set REACT_APP_QDRANT_URL environment variable."
      );
    }

    if (!this.qdrantApiKey) {
      console.warn(
        "RAGQueryTool: No Qdrant API key provided. Please provide qdrantApiKey or set REACT_APP_QDRANT_API_KEY environment variable."
      );
    }

    if (!this.googleApiKey) {
      console.warn(
        "RAGQueryTool: No Google API key provided. Please provide googleApiKey or set REACT_APP_GOOGLE_API_KEY environment variable."
      );
    }

    if (!this.openaiApiKey) {
      console.warn(
        "RAGQueryTool: No OpenAI API key provided. Please provide openaiApiKey or set REACT_APP_OPENAI_API_KEY environment variable."
      );
    }
  }

  /**
   * Return the tool declaration for the ToolManager
   * @returns {Object} Tool declaration object
   */
  getDeclaration() {
    return {
      name: "ragQuery",
      description:
        "Perform Retrieval-Augmented Generation (RAG) query to search document knowledge base and generate contextual responses",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question or query to search for in the knowledge base",
          },
          collectionName: {
            type: "string",
            description: "Name of the Qdrant collection to search in",
            default: this.defaultCollectionName,
          },
          topK: {
            type: "integer",
            description: "Maximum number of relevant documents to retrieve",
            default: this.defaultTopK,
            minimum: 1,
            maximum: 20,
          },
          similarityThreshold: {
            type: "number",
            description: "Minimum similarity score for retrieved documents",
            default: this.defaultSimilarityThreshold,
            minimum: 0,
            maximum: 1,
          },
          modelName: {
            type: "string",
            description: "Gemini model to use for response generation",
            default: this.defaultModelName,
          },
        },
        required: ["query"],
      },
    };
  }

  /**
   * Execute the RAG query tool with the provided parameters
   * @param {Object} params - Tool parameters
   * @param {string} params.query - The search query
   * @param {string} params.collectionName - Qdrant collection name
   * @param {number} params.topK - Number of documents to retrieve
   * @param {number} params.similarityThreshold - Similarity threshold
   * @param {string} params.modelName - Gemini model name
   * @param {Object|null} user - The authenticated user object
   * @returns {Promise<Object>} - Tool execution results
   */
  async execute(params, user = null) {
    const {
      query,
      collectionName = this.defaultCollectionName,
      topK = this.defaultTopK,
      similarityThreshold = this.defaultSimilarityThreshold,
      modelName = this.defaultModelName,
    } = params;

    const result = {
      success: false,
      query: query,
      response: "",
      retrievedChunks: [],
      sources: [],
      error: "",
      userId: user?.id || null,
    };

    try {
      // Validate query
      if (!query || !query.trim()) {
        result.error = "Query cannot be empty";
        return result;
      }

      // Check if collection exists
      const collectionExists = await this.checkCollectionExists(collectionName);
      if (!collectionExists) {
        result.error = `Collection '${collectionName}' not found. Please ingest documents first.`;
        return result;
      }

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);
      if (!queryEmbedding) {
        result.error = "Failed to generate query embedding";
        return result;
      }

      // Search for relevant documents
      const searchResults = await this.searchDocuments(
        collectionName,
        queryEmbedding,
        topK,
        similarityThreshold
      );

      if (!searchResults || searchResults.length === 0) {
        result.error = 
          `No relevant documents found for query with similarity threshold ${similarityThreshold}`;
        return result;
      }

      // Process search results
      const { retrievedChunks, sources, combinedContext } = 
        this.processSearchResults(searchResults);

      // Generate response using Gemini
      const generatedResponse = await this.generateResponse(
        query,
        combinedContext,
        modelName
      );

      if (!generatedResponse) {
        result.error = "Failed to generate response";
        return result;
      }

      // Success result
      result.success = true;
      result.response = generatedResponse;
      result.retrievedChunks = retrievedChunks;
      result.sources = sources;

      return result;
    } catch (error) {
      console.error("[RAGQueryTool] Execution error:", error);
      result.error = `An unexpected error occurred: ${error.message}`;
      return result;
    }
  }

  /**
   * Check if a Qdrant collection exists
   * @param {string} collectionName - Name of the collection
   * @returns {Promise<boolean>} - Whether the collection exists
   */
  async checkCollectionExists(collectionName) {
    try {
      const response = await fetch(
        `${this.qdrantUrl}/collections/${collectionName}`,
        {
          method: "GET",
          headers: {
            "api-key": this.qdrantApiKey,
            "Content-Type": "application/json",
          },
        }
      );

      return response.ok;
    } catch (error) {
      console.error("[RAGQueryTool] Collection check error:", error);
      return false;
    }
  }

  /**
   * Generate embedding for the query using OpenAI
   * @param {string} text - Text to embed
   * @returns {Promise<number[]|null>} - Embedding vector or null on failure
   */
  async generateEmbedding(text) {
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: text,
          model: "text-embedding-3-small", // More cost-effective than ada-002
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error("[RAGQueryTool] Embedding generation error:", error);
      return null;
    }
  }

  /**
   * Search for relevant documents in Qdrant
   * @param {string} collectionName - Collection to search in
   * @param {number[]} queryVector - Query embedding vector
   * @param {number} limit - Maximum results to return
   * @param {number} scoreThreshold - Minimum similarity score
   * @returns {Promise<Array|null>} - Search results or null on failure
   */
  async searchDocuments(collectionName, queryVector, limit, scoreThreshold) {
    try {
      const response = await fetch(
        `${this.qdrantUrl}/collections/${collectionName}/points/search`,
        {
          method: "POST",
          headers: {
            "api-key": this.qdrantApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vector: queryVector,
            limit: limit,
            score_threshold: scoreThreshold,
            with_payload: true,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Qdrant search error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.result;
    } catch (error) {
      console.error("[RAGQueryTool] Document search error:", error);
      return null;
    }
  }

  /**
   * Process search results and format context
   * @param {Array} searchResults - Results from Qdrant search
   * @returns {Object} - Processed results with chunks, sources, and context
   */
  processSearchResults(searchResults) {
    const retrievedChunks = [];
    const sources = [];
    const contextParts = [];

    for (const hit of searchResults) {
      const text = hit.payload?.text || "";
      const sourceFile = hit.payload?.source_file || "Unknown";

      retrievedChunks.push({
        text: text,
        source: sourceFile,
        score: hit.score,
      });

      if (!sources.includes(sourceFile)) {
        sources.push(sourceFile);
      }

      contextParts.push(`Source: ${sourceFile}\nContent: ${text}`);
    }

    const combinedContext = contextParts.join("\n\n---\n\n");

    return { retrievedChunks, sources, combinedContext };
  }

  /**
   * Generate response using Google Gemini
   * @param {string} query - Original user query
   * @param {string} context - Combined context from retrieved documents
   * @param {string} modelName - Gemini model to use
   * @returns {Promise<string|null>} - Generated response or null on failure
   */
  async generateResponse(query, context, modelName) {
    try {
      const prompt = `You are a helpful assistant. Answer the following question based only on the context provided.
If the context doesn't contain the answer, state that clearly. Be concise.

Context:
${context}

Question: ${query}

Answer:`;

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.googleApiKey}`;
      
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1000,
        },
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const responseJson = await response.json();
      const generatedResponse = 
        responseJson.candidates[0].content.parts[0].text.trim();

      return generatedResponse;
    } catch (error) {
      console.error("[RAGQueryTool] Response generation error:", error);
      return null;
    }
  }
}
