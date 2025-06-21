export class RAGQueryTool {
  /**
   * Creates a new RAGQueryTool instance
   * @param {Object} options - Configuration options
   * @param {string} options.googleApiKey - Google API key for Gemini
   * @param {string} options.openaiApiKey - OpenAI API key for embeddings
   */
  constructor(options = {}) {
    // The Qdrant URL now points to your Go backend's proxy endpoint.
    this.qdrantUrl = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8080"}/api/qdrant`;

    this.googleApiKey = 
      options.googleApiKey || process.env.REACT_APP_GOOGLE_API_KEY;
    this.openaiApiKey = 
      options.openaiApiKey || process.env.REACT_APP_OPENAI_API_KEY;

    // Default configuration
    this.defaultCollectionName = "personal_document_query_system";
    this.defaultTopK = 5;
    this.defaultSimilarityThreshold = 0.5;
    this.defaultModelName = "gemini-1.5-flash";

    // Validate required configuration
    if (!this.qdrantUrl) {
      console.error(
        "RAGQueryTool: The Qdrant proxy URL is not set. This is a critical internal error."
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

      // Check if collection exists via the backend proxy
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

      // Search for relevant documents via the backend proxy
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
   * Check if a Qdrant collection exists via the backend proxy
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
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        console.log(`[RAGQueryTool] Collection '${collectionName}' exists`);
        return true;
      } else {
        console.log(`[RAGQueryTool] Collection '${collectionName}' does not exist or is inaccessible`);
        return false;
      }
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
      if (!this.openaiApiKey) {
        throw new Error("OpenAI API key is not configured");
      }

      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: text,
          model: "text-embedding-3-small",
          dimensions: 1536, // Reduce dimensions to 768
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log(`[RAGQueryTool] Generated embedding for query: "${text.substring(0, 50)}..."`);
      return data.data[0].embedding;
    } catch (error) {
      console.error("[RAGQueryTool] Embedding generation error:", error);
      return null;
    }
  }

  /**
   * Search for relevant documents in Qdrant via the backend proxy
   * @param {string} collectionName - Collection to search in
   * @param {number[]} queryVector - Query embedding vector
   * @param {number} limit - Maximum results to return
   * @param {number} scoreThreshold - Minimum similarity score
   * @returns {Promise<Array|null>} - Search results or null on failure
   */
  async searchDocuments(collectionName, queryVector, limit, scoreThreshold) {
    try {
      const searchPayload = {
        vector: queryVector,
        limit: limit,
        score_threshold: scoreThreshold,
        with_payload: true,
      };

      console.log(`[RAGQueryTool] Searching documents in collection '${collectionName}' with limit ${limit} and threshold ${scoreThreshold}`);

      const response = await fetch(
        `${this.qdrantUrl}/collections/${collectionName}/points/search`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(searchPayload),
        }
      );

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: await response.text() };
        }
        throw new Error(`Qdrant search error: ${response.statusText} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log(`[RAGQueryTool] Found ${data.result?.length || 0} matching documents`);
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
    console.log(`[RAGQueryTool] Processed ${retrievedChunks.length} chunks from ${sources.length} unique sources`);

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
      if (!this.googleApiKey) {
        throw new Error("Google API key is not configured");
      }

      const prompt = `You are a helpful assistant. Answer the following question based only on the context provided.
If the context doesn't contain the answer, state that you cannot answer based on the provided documents. Be concise.

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

      console.log(`[RAGQueryTool] Generating response using ${modelName}`);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API error: ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const responseJson = await response.json();
      
      if (!responseJson.candidates || responseJson.candidates.length === 0) {
        throw new Error("Gemini API returned no candidates in the response.");
      }

      const generatedResponse = 
        responseJson.candidates[0].content.parts[0].text.trim();

      console.log(`[RAGQueryTool] Successfully generated response`);
      return generatedResponse;
    } catch (error) {
      console.error("[RAGQueryTool] Response generation error:", error);
      return null;
    }
  }
}
