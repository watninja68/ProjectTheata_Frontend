/**
 * Client for interacting with the Gemini 2.0 Flash Multimodal Live API via WebSockets.
 * This class handles the connection, sending and receiving messages, and processing responses.
 *
 * @extends EventEmitter
 */
import { EventEmitter } from "eventemitter3";
import { blobToJSON, base64ToArrayBuffer } from "../utils/utils.js";

export class GeminiWebsocketClient extends EventEmitter {
  /**
   * Creates a new GeminiWebsocketClient with the given configuration.
   * @param {string} name - Name for the websocket client.
   * @param {string} url - URL for the Gemini API that contains the API key at the end.
   * @param {Object} config - Configuration object for the Gemini API.
   */
  constructor(name, url, config) {
    super();
    this.name = name || "WebSocketClient";
    const apiKey = process.env.REACT_APP_GOOGLE_API_KEY;
    this.url =
      url ||
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    this.ws = null;
    this.config = config;
    this.isConnecting = false;
    this.connectionPromise = null;
  }

  /**
   * Establishes a WebSocket connection and initializes the session with a configuration.
   * @returns {Promise} Resolves when the connection is established and setup is complete
   */
  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return this.connectionPromise;
    }

    if (this.isConnecting) {
      return this.connectionPromise;
    }

    console.info("🔗 Establishing WebSocket connection...");
    this.isConnecting = true;
    this.connectionPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);

      // Send setup message upon successful connection
      ws.addEventListener("open", () => {
        console.info("🔗 Successfully connected to websocket");
        this.ws = ws;
        this.isConnecting = false;

        // Configure
        this.sendJSON({ setup: this.config });
        console.debug(
          "Setup message with the following configuration was sent:",
          this.config,
        );
        resolve();
      });

      // Handle connection errors
      ws.addEventListener("error", (error) => {
        this.disconnect(ws);
        const reason = error.reason || "Unknown";
        const message = `Could not connect to "${this.url}. Reason: ${reason}"`;
        console.error(message, error);
        reject(error);
      });

      // Listen for incoming messages, expecting Blob data for binary streams
      ws.addEventListener("message", async (event) => {
        if (event.data instanceof Blob) {
          this.receive(event.data);
        } else {
          console.error("Non-blob message received", event);
        }
      });
    });

    return this.connectionPromise;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnecting = false;
      this.connectionPromise = null;
      console.info(`${this.name} successfully disconnected from websocket`);
    }
  }

  /**
   * Processes incoming WebSocket messages.
   * Handles various response types including tool calls, setup completion,
   * and content delivery (text/audio).
   */
  async receive(blob) {
    const response = await blobToJSON(blob);

    //console.log(`${this.name} received raw WebSocket data:`, response);
    // Handle tool call responses
    if (response.toolCall) {
      console.debug(`${this.name} received tool call`, response);
      this.emit("tool_call", response.toolCall);
      return;
    }
    if (response.transcription) {
      console.debug(
        `${this.name} received transcription`,
        response.transcription,
      );
      this.emit("transcription", response.transcription.text); // Assuming the object is { text: "..." }
      return;
    }

    // Handle tool call cancellation
    if (response.toolCallCancellation) {
      console.debug(`${this.name} received tool call cancellation`, response);
      this.emit("tool_call_cancellation", response.toolCallCancellation);
      return;
    }

    // Process server content (text/audio/interruptions)
    if (response.serverContent) {
      const { serverContent } = response;
      if (serverContent.interrupted) {
        console.debug(`${this.name} is interrupted`);
        this.emit("interrupted");
        return;
      }
      if (serverContent.turnComplete) {
        //console.debug(`${this.name} has completed its turn`);
        this.emit("turn_complete");
      }
      if (serverContent.inputTranscription) {
        let text = serverContent.inputTranscription.text;

        this.emit("inputTranscription", text);
      }

      if (serverContent.outputTranscription) {
        let text = serverContent.outputTranscription.text;

        this.emit("outputTranscription", text);
      }
      if (serverContent.modelTurn) {
        // console.debug(`${this.name} is sending content`);
        // Split content into audio and non-audio parts
        let parts = serverContent.modelTurn.parts;

        // Filter out audio parts from the model's content parts
        const audioParts = parts.filter(
          (p) => p.inlineData && p.inlineData.mimeType.startsWith("audio/pcm"),
        );

        // Extract base64 encoded audio data from the audio parts
        const base64s = audioParts.map((p) => p.inlineData?.data);

        // Create an array of non-audio parts by excluding the audio parts
        const otherParts = parts.filter((p) => !audioParts.includes(p));

        // Process audio data
        base64s.forEach((b64) => {
          if (b64) {
            const data = base64ToArrayBuffer(b64);
            this.emit("audio", data);
          }
        });

        // Emit remaining content
        if (otherParts.length) {
          this.emit("content", { modelTurn: { parts: otherParts } });
          console.debug(`${this.name} sent:`, otherParts);
        }
      }
    } else {
      console.debug(`${this.name} received unmatched message:`, response);
    }
  }

  /**
   * Sends encoded audio chunk to the Gemini API.
   *
   * @param {string} base64audio - The base64 encoded audio string.
   */
  async sendAudio(base64audio) {
    const data = {
      realtimeInput: {
        mediaChunks: [{ mimeType: "audio/pcm", data: base64audio }],
      },
    };
    await this.sendJSON(data);
    console.debug(`Sending audio chunk to ${this.name}.`);
  }

  /**
   * Sends encoded image to the Gemini API.
   *
   * @param {string} base64image - The base64 encoded image string.
   */
  async sendImage(base64image) {
    const data = {
      realtimeInput: {
        mediaChunks: [{ mimeType: "image/jpeg", data: base64image }],
      },
    };
    await this.sendJSON(data);
    console.debug(
      `Image with a size of ${Math.round(base64image.length / 1024)} KB was sent to the ${this.name}.`,
    );
  }

  /**
   * Sends a text message to the Gemini API.
   *
   * @param {string} text - The text to send to Gemini.
   * @param {boolean} endOfTurn - If false model will wait for more input without sending a response.
   */
  async sendText(text, endOfTurn = true) {
    const formattedText = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: { text: text }, // TODO: Should it be in the list or not?
          },
        ],
        turnComplete: endOfTurn,
      },
    };
    await this.sendJSON(formattedText);
    console.debug(`Text sent to ${this.name}:`, text);
  }
  /**
   * Sends the result of the tool call to Gemini.
   * @param {Object} toolResponse - The response object
   * @param {any} toolResponse.output - The output of the tool execution (string, number, object, etc.)
   * @param {string} toolResponse.id - The identifier of the tool call from toolCall.functionCalls[0].id
   * @param {string} toolResponse.error - Send the output as null and the error message if the tool call failed (optional)
   */
  async sendToolResponse(toolResponse) {
    if (!toolResponse || !toolResponse.id) {
      throw new Error("Tool response must include an id");
    }

    const { output, id, error } = toolResponse;
    let result = [];

    if (error) {
      result = [
        {
          response: { error: error },
          id,
        },
      ];
    } else if (output === undefined) {
      throw new Error(
        "Tool response must include an output when no error is provided",
      );
    } else {
      result = [
        {
          response: { output: output },
          id,
        },
      ];
    }

    await this.sendJSON({ toolResponse: { functionResponses: result } });
    console.debug(`Tool response sent to ${this.name}:`, toolResponse);
  }

  /**
   * Sends a JSON object to the Gemini API.
   *
   * @param {Object} json - The JSON object to send.
   */

  async sendJSON(json) {
    try {
      this.ws.send(JSON.stringify(json));
      // console.debug(`JSON Object was sent to ${this.name}:`, json);
    } catch (error) {
      throw new Error(`Failed to send ${json} to ${this.name}:` + error);
    }
  }
}
