import { GeminiWebsocketClient } from "../ws/client.js";
import { AudioRecorder } from "../audio/recorder.js";
import { AudioStreamer } from "../audio/streamer.js"; // Import updated streamer

// import { DeepgramTranscriber } from "../transcribe/deepgram.js";
import { CameraManager } from "../camera/camera.js";
import { ScreenManager } from "../screen/screen.js";
import { base64ToArrayBuffer } from "../utils/utils.js";

// Simple EventEmitter (or use library like 'eventemitter3')
class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }
  on(eventName, callback) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, []);
    }
    this._listeners.get(eventName).push(callback);
  }
  emit(eventName, ...args) {
    // Allow multiple arguments
    if (this._listeners.has(eventName)) {
      // Use slice to prevent issues if a listener modifies the array during iteration
      this._listeners
        .get(eventName)
        .slice()
        .forEach((callback) => {
          try {
            callback(...args);
          } catch (e) {
            console.error(`Error in '${eventName}' event listener:`, e);
          }
        });
    }
  }
  off(eventName, callback) {
    if (this._listeners.has(eventName)) {
      const listeners = this._listeners.get(eventName);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }
  removeAllListeners(eventName) {
    if (eventName) {
      this._listeners.delete(eventName);
    } else {
      this._listeners.clear();
    }
  }
  // Helper to wait for a specific event once
  waitForEvent(eventName, timeout = 100000) {
    return new Promise((resolve, reject) => {
      let timeoutId = null;
      const listener = (data) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.off(eventName, listener); // Remove listener immediately
        resolve(data);
      };
      this.once(eventName, listener); // Assuming EventEmitter has 'once' or implement it

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          this.off(eventName, listener); // Remove listener on timeout
          reject(new Error(`Timeout waiting for event '${eventName}'`));
        }, timeout);
      }
    });
  }
  // Add 'once' method if EventEmitter doesn't have it
  once(eventName, callback) {
    const onceWrapper = (...args) => {
      this.off(eventName, onceWrapper);
      callback(...args);
    };
    this.on(eventName, onceWrapper);
  }
}

export class GeminiAgent extends EventEmitter {
  constructor({
    name = "GeminiAgent",
    url,
    config,
    deepgramApiKey = null,
    transcribeModelsSpeech = true,
    transcribeUsersSpeech = false,
    modelSampleRate = 24000,
    toolManager = null,
    settings, // Pass the whole settings object
  } = {}) {
    super(); // Call EventEmitter constructor

    if (!url) throw new Error("WebSocket URL is required");
    if (!config) throw new Error("Config is required");
    if (!settings) throw new Error("Settings object is required");

    this.initialized = false;
    this.connected = false;
    this.connecting = false; // Added connecting flag

    // For audio components
    this.audioContext = null;
    this.audioRecorder = null;
    this.audioStreamer = null;

    // For transcribers
    this.transcribeModelsSpeech = transcribeModelsSpeech;
    this.transcribeUsersSpeech = transcribeUsersSpeech;
    // this.deepgramApiKey = deepgramApiKey;
    this.modelSampleRate = modelSampleRate;
    this.userSampleRate = 16000; // Common rate for user mic input / Deepgram

    // Screen & camera settings from passed settings object
    this.fps = settings.fps || 3; // Default lower FPS (e.g., 3) might be more stable
    this.captureInterval = 1000 / this.fps;
    this.resizeWidth = settings.resizeWidth || 1280; // Use screen manager default?
    this.quality = settings.quality || 0.5; // Slightly lower default quality?

    // Initialize camera
    this.cameraManager = new CameraManager({
      width: this.resizeWidth,
      quality: this.quality,
      facingMode:
        settings.facingMode ||
        (/Mobi|Android/i.test(navigator.userAgent) ? "environment" : undefined), // Use setting or default based on device
    });
    this.cameraInterval = null;

    // Initialize screen sharing
    this.screenManager = new ScreenManager({
      width: this.resizeWidth,
      quality: this.quality,
      onStop: () => {
        // *** IMPORTANT: This links ScreenManager's dispose to agent's state ***
        console.info("Agent: ScreenManager onStop callback triggered.");
        if (this.screenInterval) {
          clearInterval(this.screenInterval);
          this.screenInterval = null;
          console.info(
            "Agent: Screen capture interval cleared via onStop callback.",
          );
        }
        // Ensure the agent emits the stop event, even if interval was already cleared
        this.emit("screenshare_stopped");
      },
    });
    this.screenInterval = null;

    // Tool Manager
    this.toolManager = toolManager;
    // Ensure config.tools exists before assigning
    config.tools = config.tools || {}; // Initialize if missing
    config.tools.functionDeclarations =
      toolManager?.getToolDeclarations() || [];

    this.config = config;

    this.name = name;
    this.url = url;
    this.client = null; // Initialize client as null

    /*
    // Keep alive intervals for Deepgram
    this.modelsKeepAliveInterval = null;
    this.userKeepAliveInterval = null;
    */
  }

  // --- WebSocket Client Event Setup ---
  setupEventListeners() {
    if (!this.client) return;

    // --- REFINED 'audio' EVENT HANDLER ---
    this.client.on("audio", async (data) => {
      // 1. Check if streamer exists and is initialized
      if (
        !this.audioStreamer ||
        !this.audioStreamer.isInitialized ||
        this.audioStreamer.isDisposed
      ) {
        // Added isDisposed check
        // Log less frequently to avoid spam if streamer is consistently missing
        if (Math.random() < 0.1) {
          console.warn(
            `Agent: Audio received but streamer missing/uninitialized/disposed (Init: ${this.audioStreamer?.isInitialized}, Disposed: ${this.audioStreamer?.isDisposed}). Skipping.`,
          );
        }
        // Optionally try to re-initialize if streamer exists but isn't initialized
        if (
          this.audioStreamer &&
          !this.audioStreamer.isInitialized &&
          !this.audioStreamer.isDisposed &&
          this.audioContext &&
          this.audioContext.state !== "closed"
        ) {
          console.warn("Agent: Attempting lazy re-initialization of streamer.");
          try {
            await this.audioStreamer.initialize();
            // If init succeeds, try processing *this* chunk immediately
            if (this.audioStreamer.isInitialized) {
              await this.audioStreamer.streamAudio(new Uint8Array(data));
            }
          } catch (initErr) {
            console.error(
              "Agent: Lazy streamer re-initialization failed:",
              initErr,
            );
          }
        }
        return; // Skip processing if streamer is fundamentally not ready
      }

      // 2. Let the streamer handle context checks and streaming
      try {
        // The updated streamer now handles context checks internally
        await this.audioStreamer.streamAudio(new Uint8Array(data));

        /*
        // Send to Deepgram if configured (remains same)
        if (this.modelTranscriber && this.modelTranscriber.isConnected) {
          // Deepgram expects raw PCM data (ArrayBuffer or Uint8Array)
          this.modelTranscriber.sendAudio(data);
        }
        */
      } catch (error) {
        console.error("Agent: Error during audio streaming call:", error);
        this.emit(
          "error",
          new Error("Audio processing/streaming error: " + error.message),
        );
      }
    });
    // --- END OF REFINED 'audio' HANDLER ---

    this.client.on("inputTranscription", (transcript) => {
      if (transcript && transcript.trim().length > 0) {
        this.emit("user_transcription", transcript);
/*        console.log("user speech transcription:", transcript);*/
        /*console.debug("user speech transcription:", transcript);*/
      }
    });
    this.client.on("outputTranscription", (transcript) => {
      if (transcript && transcript.trim().length > 0) {
        // Use a more specific event for model transcription
        this.emit("transcription", transcript);
  /*      console.log("Model speech transcription:", transcript);*/
        /*console.debug("Model speech transcription:", transcript);*/
      }
    });
    this.client.on("interrupted", () => {
      console.info(`${this.name}: Model interrupted.`);
      if (this.audioStreamer && !this.audioStreamer.isDisposed) {
        // Added isDisposed check
        this.audioStreamer.stop(); // Should handle internal state reset
      }
      this.emit("interrupted");
    });

    // Handle model turn completion
    this.client.on("turn_complete", () => {
      console.info(`${this.name}: Model finished speaking turn.`);
      this.emit("turn_complete");
    });

    // Handle tool calls from the model
    this.client.on("tool_call", async (toolCall) => {
      await this.handleToolCall(toolCall);
    });

    // Handle other potential client events if needed (e.g., 'disconnect', 'error')
    this.client.on("error", (error) => {
      console.error(`${this.name} WebSocket Client Error:`, error);
      this.emit(
        "error",
        new Error("WebSocket client error: " + (error.message || error)),
      );
      // Consider triggering a disconnect or cleanup here if the error is fatal
    });

    this.client.on("disconnect", () => {
      console.info(
        `${this.name} WebSocket Client disconnected event received.`,
      );
      // This event is emitted BY the client class. Agent listens and can react.
      // We might want to trigger the agent's disconnect cleanup here too.
      // Avoid calling disconnect directly if it emits 'disconnect' to prevent loops
      // Instead, perhaps set flags and let the main disconnect logic handle cleanup.
      this.connected = false; // Mark as disconnected
      // Let higher-level logic (hook) decide if full disconnect/cleanup is needed
      // Emitting an internal event might be useful for the hook
      this.emit("internal_ws_disconnected");
    });
  }

  // --- Tool Call Handling ---
  async handleToolCall(toolCall) {
    if (!this.toolManager) {
      console.error("Received tool call but no tool manager is configured.");
      // TODO: Send back an error response to the model? Requires client support.
      // Example: await this.client.sendToolResponse({ id: toolCall?.functionCalls?.[0]?.id, error: "Tool manager not available" });
      return;
    }
    if (
      !toolCall ||
      !Array.isArray(toolCall.functionCalls) ||
      toolCall.functionCalls.length === 0
    ) {
      console.warn("Received empty or invalid tool call:", toolCall);
      return;
    }

    // Handle multiple calls sequentially for now
    const responses = [];
    for (const functionCall of toolCall.functionCalls) {
      console.info(`${this.name}: Handling tool call: ${functionCall.name}`, {
        args: functionCall.args,
      });
      const response = await this.toolManager.handleToolCall(functionCall); // Assuming { output, id, error }
      responses.push(response);
    }

    if (this.client && this.connected) {
      // Assuming client.sendToolResponse can handle an array or needs individual calls
      // Let's assume it needs the specific format expected by the API (array of functionResponses)
      const apiResponseFormat = {
        toolResponse: {
          functionResponses: responses.map((r) => ({
            id: r.id,
            response: r.error ? { error: r.error } : { output: r.output },
          })),
        },
      };
      await this.client.sendJSON(apiResponseFormat); // Use sendJSON directly if sendToolResponse isn't flexible
      console.debug("Sent tool responses:", apiResponseFormat);
    } else {
      console.error("Cannot send tool response, client is not connected.");
    }
  }

  // --- Connection Management ---
  async connect() {
    // Prevent multiple connection attempts
    if (this.connected) {
      console.warn(`${this.name}: Already connected.`);
      return;
    }
    if (this.connecting) {
      console.warn(`${this.name}: Connection already in progress.`);
      // Optionally return the existing connection promise
      return (
        this.connectionPromise ||
        Promise.reject("Connection in progress, but promise missing")
      );
      // return;
    }

    this.connecting = true;
    try {
      console.info(`${this.name}: Connecting to WebSocket...`);
      this.client = new GeminiWebsocketClient(this.name, this.url, this.config);
      this.setupEventListeners(); // Setup listeners *before* calling connect on client
      this.connectionPromise = this.client.connect(); // Store promise
      await this.connectionPromise; // Wait for WS connection and setup message send
      this.connected = true;
      console.info(`${this.name}: WebSocket connected successfully.`);
      // Don't call initialize() here automatically, let the hook manage it
    } catch (error) {
      console.error(`${this.name}: Failed to connect.`, error);
      // Clean up partially created client and listeners
      if (this.client) {
        this.client.removeAllListeners(); // Clean up listeners on failure
      }
      this.client = null;
      this.connected = false;
      this.connectionPromise = null;
      throw error; // Re-throw for the hook to catch
    } finally {
      this.connecting = false; // Ensure flag is reset regardless of outcome
    }
  }

  async disconnect() {
    if (
      !this.connected &&
      !this.connecting &&
      !this.client &&
      !this.initialized
    ) {
      console.warn(
        `${this.name}: Already disconnected or never connected/initialized.`,
      );
      return;
    }
    console.info(`${this.name}: Disconnecting...`);
    this.connecting = false; // Stop any potential connection attempts

    try {
      // Stop intervals first
      if (this.cameraInterval) clearInterval(this.cameraInterval);
      if (this.screenInterval) clearInterval(this.screenInterval);
      /*
      if (this.modelsKeepAliveInterval)
        clearInterval(this.modelsKeepAliveInterval);
      if (this.userKeepAliveInterval) clearInterval(this.userKeepAliveInterval);
      */
      this.cameraInterval = null;
      this.screenInterval = null;
      /*
      this.modelsKeepAliveInterval = null;
      this.userKeepAliveInterval = null;
      */
      console.debug(`${this.name}: Intervals cleared.`);

      // Stop capture managers gracefully
      try {
        if (this.cameraManager) {
          await this.stopCameraCapture();
        }
      } catch (e) {
        console.warn("Error stopping camera capture during disconnect:", e);
      }
      try {
        if (this.screenManager) {
          await this.stopScreenShare();
        }
      } catch (e) {
        console.warn("Error stopping screen share during disconnect:", e);
      }
      console.debug(`${this.name}: Capture managers stopped.`);

      // Cleanup audio resources
      if (this.audioRecorder) {
        this.audioRecorder.stop();
        console.debug(`${this.name}: Audio recorder stopped.`);
      }
      if (this.audioStreamer) {
        this.audioStreamer.dispose();
        console.debug(`${this.name}: Audio streamer disposed.`);
      }

      /*
      // Cleanup transcribers
      if (this.modelTranscriber) {
        this.modelTranscriber.disconnect();
        console.debug(`${this.name}: Model transcriber disconnected.`);
      }
      if (this.userTranscriber) {
        this.userTranscriber.disconnect();
        console.debug(`${this.name}: User transcriber disconnected.`);
      }
      */

      // **FIX:** Remove listener BEFORE closing/nullifying context
      if (this.audioContext) {
        this.audioContext.onstatechange = null; // Remove listener
        console.debug(
          `${this.name}: AudioContext onstatechange listener removed.`,
        );
        if (this.audioContext.state !== "closed") {
          try {
            await this.audioContext.close();
            console.info(`${this.name}: AudioContext closed.`);
          } catch (acError) {
            console.warn(`${this.name}: Error closing AudioContext:`, acError);
          }
        }
      }

      // Disconnect WebSocket client
      if (this.client) {
        this.client.disconnect(); // Assumes client class has disconnect logic
        console.debug(`${this.name}: WebSocket client disconnect called.`);
      }
    } catch (error) {
      console.error(`${this.name}: Error during disconnect cleanup:`, error);
      // State will be reset in finally block
    } finally {
      // Reset state flags and resources definitively
      this.initialized = false;
      this.connected = false;
      this.connecting = false;
      this.client = null;
      this.audioContext = null; // Nullify context AFTER removing listener and closing
      this.audioStreamer = null;
      this.audioRecorder = null;
      /*
      this.modelTranscriber = null;
      this.userTranscriber = null;
      */

      // Ensure managers are disposed if cleanup errored before reaching them
      if (this.cameraManager) {
        this.cameraManager.dispose();
      }
      if (this.screenManager) {
        this.screenManager.dispose();
      }
      this.removeAllListeners(); // Clear agent's own listeners
      console.info(`${this.name}: Disconnect process finished. State reset.`);
      this.emit("disconnected_cleanup_complete"); // Example custom event
    }
  }

  // --- Initialization (Audio, Transcribers) ---
  async initialize() {
    if (this.initialized) {
      console.warn(`${this.name}: Already initialized.`);
      return;
    }
    if (!this.connected || !this.client) {
      throw new Error(`${this.name}: Cannot initialize, not connected.`);
    }

    console.info(`${this.name}: Initializing core components...`);
    try {
      // --- AudioContext Creation/Management ---
      if (!this.audioContext || this.audioContext.state === "closed") {
        try {
          this.audioContext = new AudioContext();
          console.info(`${this.name}: New AudioContext created.`);
          this.audioContext.onstatechange = () => {
            // Guard check inside the listener
            if (!this.audioContext) {
              console.debug(
                "Agent: AudioContext state changed, but context is null (likely during disconnect). Ignoring.",
              );
              return;
            }
            console.log(
              `Agent: AudioContext state changed to: ${this.audioContext.state}`,
            );
            this.emit("audio_context_state_changed", this.audioContext.state);

            // Attempt resume only if context exists, is suspended, and streamer is playing
            if (
              this.audioContext.state === "suspended" &&
              this.audioStreamer?.isPlaying &&
              !this.audioStreamer?.isDisposed
            ) {
              console.warn(
                "Agent: AudioContext suspended unexpectedly, attempting resume from state change handler...",
              );
              this.audioContext
                .resume()
                .catch((e) =>
                  console.error("Error resuming context on state change:", e),
                );
            }
          };
        } catch (contextError) {
          console.error(
            `${this.name}: Failed to create AudioContext:`,
            contextError,
          );
          throw new Error(
            `Failed to create AudioContext. User interaction might be required first. Error: ${contextError.message}`,
          );
        }
      } else if (this.audioContext.state === "suspended") {
        console.warn(
          `${this.name}: AudioContext is suspended during initialization. Attempting resume...`,
        );
        try {
          await this.audioContext.resume();
          console.info(`${this.name}: Resumed existing AudioContext.`);
        } catch (resumeError) {
          console.error(
            `${this.name}: Failed to resume AudioContext during initialization:`,
            resumeError,
          );
          throw new Error(
            `Failed to resume existing AudioContext. Error: ${resumeError.message}`,
          );
        }
      }
      // --- End AudioContext ---

      // Initialize Streamer (pass the potentially resumed context)
      this.audioStreamer = new AudioStreamer(this.audioContext);
      await this.audioStreamer.initialize(); // Streamer's initialize now handles context checks
      console.info(`${this.name}: AudioStreamer initialized.`);

      // Initialize Recorder
      this.audioRecorder = new AudioRecorder();
      console.info(`${this.name}: AudioRecorder created.`);

      /*
      // Initialize Transcribers (no changes needed here)
      if (this.deepgramApiKey) {
        console.info(
          `${this.name}: Deepgram API key found, initializing transcribers...`,
        );
        if (this.transcribeModelsSpeech) {
          this.modelTranscriber = new DeepgramTranscriber(
            this.deepgramApiKey,
            this.modelSampleRate,
          );
          await this.initializeModelSpeechTranscriber(); // Connects and sets up keep-alive
        }
        if (this.transcribeUsersSpeech) {
          this.userTranscriber = new DeepgramTranscriber(
            this.deepgramApiKey,
            this.userSampleRate,
          );
          await this.initializeUserSpeechTranscriber(); // Connects and sets up keep-alive
        }
      } else {
        console.warn(
          `${this.name}: No Deepgram API key provided, transcription disabled.`,
        );
      }
      */

      this.initialized = true;
      console.info(`${this.name}: Initialized successfully.`);

      // Send initial prompt (no changes needed here)
      if (this.client && this.connected) {
        console.info(`${this.name}: Sending initial '.' prompt to model.`);
        await this.client.sendText("."); // Trigger the model to start speaking first
      }
    } catch (error) {
      console.error(`${this.name}: Initialization error:`, error);
      // Cleanup partially initialized resources
      try {
        if (this.audioStreamer) this.audioStreamer.dispose();
        /*
        if (this.modelTranscriber) this.modelTranscriber.disconnect();
        if (this.userTranscriber) this.userTranscriber.disconnect();
        */
        if (this.audioContext) {
          this.audioContext.onstatechange = null; // Remove listener here too
          if (this.audioContext.state !== "closed")
            await this.audioContext.close();
        }
      } catch (cleanupError) {
        console.warn(
          "Error during initialization failure cleanup:",
          cleanupError,
        );
      }
      // Nullify resources
      this.audioContext = null;
      this.audioStreamer = null;
      this.audioRecorder = null;
      /*
      this.modelTranscriber = null;
      this.userTranscriber = null;
      */
      this.initialized = false;
      throw new Error(`Agent initialization failed: ${error.message}`);
    }
  }

  /*
  // --- Deepgram Initializers ---
  async initializeModelSpeechTranscriber() {
    if (!this.modelTranscriber) {
      console.warn(`${this.name}: Model transcriber instance not available.`);
      return;
    }
    console.info(
      `${this.name}: Initializing Deepgram model speech transcriber...`,
    );
    const connectionPromise = new Promise((resolve, reject) => {
      const onError = (err) => {
        console.error("Model transcriber connection error:", err);
        this.modelTranscriber.off("error", onError); // Clean up listener
        if (this.modelsKeepAliveInterval)
          clearInterval(this.modelsKeepAliveInterval); // Clear interval on error too
        this.modelsKeepAliveInterval = null;
        reject(new Error("Failed to connect model transcriber"));
      };
      // Use once for setup error tracking
      this.modelTranscriber.once("error", onError);

      this.modelTranscriber.once("connected", () => {
        console.info(`${this.name}: Model speech transcriber connected.`);
        this.modelTranscriber.off("error", onError); // Clean up error listener on success

        // Clear previous interval just in case
        if (this.modelsKeepAliveInterval)
          clearInterval(this.modelsKeepAliveInterval);

        this.modelsKeepAliveInterval = setInterval(() => {
          if (this.modelTranscriber && this.modelTranscriber.isConnected) {
            try {
              // console.debug('Sending keep-alive to model speech transcriber');
              this.modelTranscriber.ws.send(
                JSON.stringify({ type: "KeepAlive" }),
              );
            } catch (e) {
              console.error(
                "Error sending keep-alive to model transcriber:",
                e,
              );
              // Consider stopping interval or attempting reconnect if keep-alive fails
            }
          } else {
            console.warn(
              "Model transcriber disconnected, stopping keep-alive.",
            );
            if (this.modelsKeepAliveInterval)
              clearInterval(this.modelsKeepAliveInterval);
            this.modelsKeepAliveInterval = null;
          }
        }, 10000); // 10 seconds
        resolve();
      });
    });

    // Handle transcriptions (persistent listener)
    // Remove previous listener if re-initializing
    this.modelTranscriber.removeAllListeners("transcription");
    this.modelTranscriber.on("transcription", (transcript) => {
      if (transcript && transcript.trim().length > 0) {
        this.emit("transcription", transcript);
        // console.debug('Model speech transcription:', transcript);
      }
    });

    // Handle disconnection (persistent listener)
    // Remove previous listener if re-initializing
    this.modelTranscriber.removeAllListeners("disconnected");
    this.modelTranscriber.on("disconnected", () => {
      console.warn(`${this.name}: Model speech transcriber disconnected.`);
      if (this.modelsKeepAliveInterval)
        clearInterval(this.modelsKeepAliveInterval);
      this.modelsKeepAliveInterval = null;
    });

    // Connect and wait for setup
    try {
      await this.modelTranscriber.connect();
      await connectionPromise;
    } catch (connectError) {
      console.error(
        "Failed during model transcriber connect/setup:",
        connectError,
      );
      // Ensure interval is clear even if connect() or promise rejects
      if (this.modelsKeepAliveInterval)
        clearInterval(this.modelsKeepAliveInterval);
      this.modelsKeepAliveInterval = null;
      throw connectError; // Re-throw
    }
  }

  async initializeUserSpeechTranscriber() {
    if (!this.userTranscriber) {
      console.warn(`${this.name}: User transcriber instance not available.`);
      return;
    }
    console.info(
      `${this.name}: Initializing Deepgram user speech transcriber...`,
    );
    const connectionPromise = new Promise((resolve, reject) => {
      const onError = (err) => {
        console.error("User transcriber connection error:", err);
        this.userTranscriber.off("error", onError);
        if (this.userKeepAliveInterval)
          clearInterval(this.userKeepAliveInterval);
        this.userKeepAliveInterval = null;
        reject(new Error("Failed to connect user transcriber"));
      };
      this.userTranscriber.once("error", onError);

      this.userTranscriber.once("connected", () => {
        console.info(`${this.name}: User speech transcriber connected.`);
        this.userTranscriber.off("error", onError);

        if (this.userKeepAliveInterval)
          clearInterval(this.userKeepAliveInterval);

        this.userKeepAliveInterval = setInterval(() => {
          if (this.userTranscriber && this.userTranscriber.isConnected) {
            try {
              // console.debug('Sending keep-alive to user transcriber');
              this.userTranscriber.ws.send(
                JSON.stringify({ type: "KeepAlive" }),
              );
            } catch (e) {
              console.error("Error sending keep-alive to user transcriber:", e);
            }
          } else {
            console.warn("User transcriber disconnected, stopping keep-alive.");
            if (this.userKeepAliveInterval)
              clearInterval(this.userKeepAliveInterval);
            this.userKeepAliveInterval = null;
          }
        }, 10000);
        resolve();
      });
    });

    // Remove previous listener if re-initializing
    this.userTranscriber.removeAllListeners("transcription");
    this.userTranscriber.on("transcription", (transcript) => {
      if (transcript && transcript.trim().length > 0) {
        this.emit("user_transcription", transcript);
        // console.debug('User speech transcription:', transcript);
      }
    });

    // Remove previous listener if re-initializing
    this.userTranscriber.removeAllListeners("disconnected");
    this.userTranscriber.on("disconnected", () => {
      console.warn(`${this.name}: User speech transcriber disconnected.`);
      if (this.userKeepAliveInterval) clearInterval(this.userKeepAliveInterval);
      this.userKeepAliveInterval = null;
    });

    try {
      await this.userTranscriber.connect();
      await connectionPromise;
    } catch (connectError) {
      console.error(
        "Failed during user transcriber connect/setup:",
        connectError,
      );
      if (this.userKeepAliveInterval) clearInterval(this.userKeepAliveInterval);
      this.userKeepAliveInterval = null;
      throw connectError; // Re-throw
    }
  }
  */

  // --- Agent Actions ---
  async sendText(text) {
    if (!this.client || !this.connected) {
      console.error(`${this.name}: Cannot send text, not connected.`);
      this.emit("error", new Error("Cannot send text, not connected."));
      return;
    }
    try {
      await this.client.sendText(text);
      this.emit("text_sent", text); // Emit event *after* successful sending attempt
    } catch (error) {
      console.error(`${this.name}: Error sending text:`, error);
      this.emit("error", new Error("Error sending text: " + error.message));
    }
  }

  async sendAudio(base64Audio) {
    if (!this.client || !this.connected) {
      // Don't log error here, as it might be frequent if connection drops during speech
      // console.error(`${this.name}: Cannot send audio, not connected.`);
      return; // Fail silently for audio chunks
    }
    try {
      await this.client.sendAudio(base64Audio);
      // Don't emit text_sent here
    } catch (error) {
      console.error(`${this.name}: Error sending audio chunk:`, error);
      // Optionally emit error, but be mindful of frequency
      // this.emit('error', new Error('Error sending audio: ' + error.message));
    }
  }

  async sendImage(base64Image) {
    if (!this.client || !this.connected) {
      // console.warn(`${this.name}: Cannot send image, not connected.`); // Less noisy log
      return;
    }

    // Skip empty images explicitly
    if (!base64Image || base64Image.length === 0) {
      // console.debug(`${this.name}: Attempted to send empty image data, skipping.`);
      return;
    }

    // Debug image size (helpful to identify issues) - Log less frequently
    if (Math.random() < 0.05) {
      // Log size ~5% of the time
      const sizeKB = Math.round((base64Image.length * 3) / 4 / 1024); // Estimate KB size
      console.debug(
        `${this.name}: Preparing to send image, estimated size: ~${sizeKB} KB`,
      );
    }

    try {
      const startTime = performance.now();
      // *** CHANGE: Non-blocking send ***
      this.client.sendImage(base64Image).catch((error) => {
        // Catch potential errors from the async sendImage call itself
        console.error(`${this.name}: Error sending image (async):`, error);
        this.emit("error", new Error("Error sending image: " + error.message));
      });
      const queueTime = performance.now() - startTime; // Time to queue the send

      // Log performance occasionally
      if (Math.random() < 0.02) {
        // ~2% of frames
        console.debug(
          `${this.name}: Image queued for sending in ${queueTime.toFixed(1)}ms`,
        );
      }
    } catch (error) {
      // Catch potential synchronous errors (less likely but possible)
      console.error(`${this.name}: Error queueing image send:`, error);
      this.emit(
        "error",
        new Error("Error queueing image send: " + error.message),
      );
      // Consider stopping capture interval if sending consistently fails
    }
  }

  // --- Media Controls ---
  async startRecording() {
    if (!this.initialized || !this.audioRecorder) {
      const msg = `${this.name}: Cannot start recording, not initialized.`;
      console.error(msg);
      this.emit("error", new Error(msg));
      return;
    }
    if (this.audioRecorder.isRecording) {
      console.warn(`${this.name}: Already recording.`);
      return;
    }

    try {
      console.info(`${this.name}: Starting audio recording...`);
      // Start recording with callback to send audio data
      await this.audioRecorder.start(async (base64Data) => {
        // Send audio to Gemini if connected
        if (this.connected && this.client) {
          this.sendAudio(base64Data); // Already handles connection check internally
        }

        /*
        // Send audio to Deepgram user transcriber if active
        if (this.userTranscriber && this.userTranscriber.isConnected) {
          try {
            // Deepgram expects raw PCM data (ArrayBuffer or Uint8Array)
            // We need to decode base64 first.
            const buffer = base64ToArrayBuffer(base64Data);
            if (buffer && buffer.byteLength > 0) {
              this.userTranscriber.sendAudio(buffer);
            } else {
              console.warn(
                "Failed to convert base64 audio to buffer for Deepgram.",
              );
            }
          } catch (error) {
            console.error(
              `${this.name}: Error sending audio to user transcriber:`,
              error,
            );
          }
        }
        */
      });
      console.info(
        `${this.name}: Audio recording started. State: recording=${this.audioRecorder.isRecording}, suspended=${this.audioRecorder.isSuspended}`,
      );
      // Emit state? e.g., this.emit('mic_state_changed', { active: true, suspended: false });
      this.emit("mic_state_changed", {
        active: this.audioRecorder.isRecording,
        suspended: this.audioRecorder.isSuspended,
      });
    } catch (error) {
      const msg = `${this.name}: Failed to start audio recording: ${error.message}`;
      console.error(msg, error);
      this.emit("error", new Error(msg));
      // Ensure recorder state is reset if start failed
      if (this.audioRecorder) this.audioRecorder.stop();
      this.emit("mic_state_changed", { active: false, suspended: true });
    }
  }

  async toggleMic() {
    if (!this.audioRecorder) {
      const msg = `${this.name}: Cannot toggle mic, audio recorder not available.`;
      console.error(msg);
      this.emit("error", new Error(msg));
      this.emit("mic_state_changed", { active: false, suspended: true }); // Emit consistent state on failure
      return;
    }

    try {
      // If stream doesn't exist (never started), start recording first
      // Check isRecording AND stream existence
      if (!this.audioRecorder.isRecording || !this.audioRecorder.stream) {
        console.info(`${this.name}: Mic not active, starting recording first.`);
        await this.startRecording();
        // startRecording now handles the initial state and emits mic_state_changed
        return; // Exit after starting
      }

      // If stream exists, toggle suspension state
      console.info(`${this.name}: Toggling mic suspension...`);
      await this.audioRecorder.toggleMic(); // Handles suspend/resume internally
      console.info(
        `${this.name}: Mic suspension toggled. Suspended: ${this.audioRecorder.isSuspended}`,
      );
      this.emit("mic_state_changed", {
        active: true,
        suspended: this.audioRecorder.isSuspended,
      });
    } catch (error) {
      const msg = `${this.name}: Failed to toggle mic: ${error.message}`;
      console.error(msg, error);
      this.emit("error", new Error(msg));
      // Emit current (likely failed) state
      this.emit("mic_state_changed", {
        active: this.audioRecorder?.isRecording || false,
        suspended: this.audioRecorder?.isSuspended !== false,
      });
    }
  }

  async startCameraCapture() {
    if (!this.initialized || !this.connected) {
      const msg = `${this.name}: Must be initialized and connected to start camera capture`;
      console.error(msg);
      this.emit("error", new Error(msg));
      throw new Error(msg); // Throw to prevent hook state change
    }
    if (this.cameraInterval) {
      console.warn(`${this.name}: Camera capture already running.`);
      return;
    }

    try {
      console.info(`${this.name}: Initializing camera...`);
      await this.cameraManager.initialize(); // Ensure camera is ready

      console.info(
        `${this.name}: Starting camera capture interval (FPS: ${this.fps})...`,
      );
      // Clear any zombie interval first
      if (this.cameraInterval) clearInterval(this.cameraInterval);

      let consecutiveCaptureErrors = 0;
      const maxErrors = 10; // Stop after N errors

      this.cameraInterval = setInterval(async () => {
        // Check conditions within interval callback too
        if (
          !this.cameraManager?.isInitialized ||
          !this.connected ||
          !this.client
        ) {
          console.warn(
            `${this.name}: Stopping camera capture interval - conditions not met (manager init: ${this.cameraManager?.isInitialized}, connected: ${this.connected}).`,
          );
          if (this.cameraInterval) clearInterval(this.cameraInterval);
          this.cameraInterval = null;
          // Trigger stop process
          await this.stopCameraCapture(); // Ensure cleanup and event emission
          return;
        }
        try {
          const imageBase64 = await this.cameraManager.capture();
          if (imageBase64) {
            this.sendImage(imageBase64); // Non-blocking send
            consecutiveCaptureErrors = 0; // Reset errors on success
          } else {
            consecutiveCaptureErrors++;
            console.debug(
              `${this.name}: Camera capture returned null/empty data (Errors: ${consecutiveCaptureErrors})`,
            );
          }
        } catch (captureError) {
          consecutiveCaptureErrors++;
          console.error(
            `${this.name}: Error capturing/sending camera image:`,
            captureError,
          );
        }

        // Stop if too many errors
        if (consecutiveCaptureErrors >= maxErrors) {
          console.error(
            `${this.name}: Stopping camera capture due to ${maxErrors} consecutive errors.`,
          );
          if (this.cameraInterval) clearInterval(this.cameraInterval); // Clear interval first
          this.cameraInterval = null;
          await this.stopCameraCapture(); // Trigger cleanup and event
          this.emit(
            "error",
            new Error(`Camera capture stopped after ${maxErrors} errors.`),
          );
        }
      }, this.captureInterval);

      console.info(`${this.name}: Camera capture started.`);
      this.emit("camera_started"); // Emit event for UI update
    } catch (error) {
      console.error(`${this.name}: Failed to start camera capture:`, error);
      // Attempt cleanup
      if (this.cameraInterval) clearInterval(this.cameraInterval);
      this.cameraInterval = null;
      // Ensure dispose is called even if initialize failed
      if (this.cameraManager) {
        this.cameraManager.dispose();
      }
      // Rethrow or emit error
      const msg = `Failed to start camera capture: ${error.message}`;
      this.emit("error", new Error(msg));
      this.emit("camera_stopped"); // Ensure UI reflects stopped state on error
      throw new Error(msg); // Throw to prevent hook state change
    }
  }

  async stopCameraCapture() {
    console.info(`${this.name}: Stopping camera capture...`);
    let wasRunning = !!this.cameraInterval; // Check if it was running before clearing

    if (this.cameraInterval) {
      clearInterval(this.cameraInterval);
      this.cameraInterval = null;
      console.debug(`${this.name}: Camera interval cleared.`);
    } else {
      // console.debug(`${this.name}: No active camera interval to clear.`);
    }
    if (this.cameraManager) {
      // Dispose only if initialized to avoid errors during disconnect cleanup
      if (this.cameraManager.isInitialized) {
        this.cameraManager.dispose(); // Handles stopping stream and cleanup
        console.debug(`${this.name}: Camera manager dispose called.`);
      } else {
        console.debug(
          `${this.name}: Camera manager exists but was not initialized, skipping dispose.`,
        );
      }
    } else {
      console.debug(`${this.name}: No camera manager instance to dispose.`);
    }

    // Emit stopped event only if it was running or if manager exists (to ensure state update)
    if (wasRunning || this.cameraManager) {
      console.info(`${this.name}: Camera capture stopped.`);
      this.emit("camera_stopped"); // Emit event for UI update
    }
  }

  async startScreenShare() {
    if (!this.initialized || !this.connected) {
      const msg = `${this.name}: Must be initialized and connected to start screen sharing`;
      console.error(msg);
      this.emit("error", new Error(msg));
      throw new Error(msg); // Throw to prevent hook state change
    }
    if (this.screenInterval) {
      console.warn(`${this.name}: Screen share already running.`);
      return;
    }

    try {
      console.info(`${this.name}: Initializing screen share...`);
      // ScreenManager.initialize now includes retry logic
      await this.screenManager.initialize(); // Ensure screen manager is ready

      console.info(
        `${this.name}: Starting screen share interval (FPS: ${this.fps})...`,
      );
      // Clear any potential zombie interval
      if (this.screenInterval) clearInterval(this.screenInterval);

      let frameCount = 0;
      let successFrames = 0;
      let consecutiveErrors = 0;
      // *** INCREASED ERROR TOLERANCE ***
      const maxConsecutiveErrors = 30; // Stop after 30 failed captures/sends in a row

      this.screenInterval = setInterval(async () => {
        // Check conditions rigorously inside interval
        // Use optional chaining and check screenManager's initialized state specifically
        if (
          !this.screenManager?.isInitialized ||
          !this.connected ||
          !this.client
        ) {
          console.warn(
            `${this.name}: Stopping screen share interval - conditions not met (SM Init: ${this.screenManager?.isInitialized}, Connected: ${this.connected}, Client: ${!!this.client}).`,
          );
          if (this.screenInterval) clearInterval(this.screenInterval); // Clear interval first
          this.screenInterval = null;
          // Manually trigger stop process if conditions fail unexpectedly
          // Check if screenManager exists before calling dispose
          if (this.screenManager) {
            // Calling dispose here will trigger the onStop callback, which clears the interval again (harmless) and emits screenshare_stopped
            this.screenManager.dispose();
          } else {
            // If manager somehow gone, ensure event is emitted
            this.emit("screenshare_stopped");
          }
          return; // Exit interval callback
        }

        frameCount++;
        try {
          const imageBase64 = await this.screenManager.capture();

          if (imageBase64) {
            // *** USE NON-BLOCKING SEND ***
            this.sendImage(imageBase64); // Fire and forget
            successFrames++;
            consecutiveErrors = 0; // Reset error count on success
          } else {
            // Capture returned null/empty - could be transient or stream ended
            consecutiveErrors++;
            // Log less frequently for null captures
            if (frameCount % this.fps === 0) {
              // Log once per second approx
              console.warn(
                `${this.name}: Screen capture returned empty data (Frame ${frameCount}, Consecutive Errors: ${consecutiveErrors}/${maxConsecutiveErrors}).`,
              );
            }
          }

          // Stop if too many consecutive errors
          if (consecutiveErrors >= maxConsecutiveErrors) {
            console.error(
              `${this.name}: Stopping screen share due to ${maxConsecutiveErrors} consecutive capture errors.`,
            );
            if (this.screenInterval) clearInterval(this.screenInterval); // Clear interval first
            this.screenInterval = null;
            // Dispose should trigger the onStop callback which emits the event
            if (this.screenManager) this.screenManager.dispose();
            else this.emit("screenshare_stopped"); // Fallback emit
            this.emit(
              "error",
              new Error(
                `Screen share stopped after ${maxConsecutiveErrors} capture errors.`,
              ),
            );
            return; // Exit interval callback
          }
        } catch (intervalError) {
          // Catch errors from capture() call itself within the interval
          console.error(
            `${this.name}: Error within screen share interval capture (Frame ${frameCount}):`,
            intervalError,
          );
          consecutiveErrors++;
          if (consecutiveErrors >= maxConsecutiveErrors) {
            console.error(
              `${this.name}: Stopping screen share due to ${maxConsecutiveErrors} consecutive interval errors.`,
            );
            if (this.screenInterval) clearInterval(this.screenInterval); // Clear interval first
            this.screenInterval = null;
            if (this.screenManager) this.screenManager.dispose();
            else this.emit("screenshare_stopped"); // Fallback emit
            this.emit(
              "error",
              new Error(
                `Screen share stopped after ${maxConsecutiveErrors} interval errors.`,
              ),
            );
            return; // Exit interval callback
          }
        }
      }, this.captureInterval);

      console.info(`${this.name}: Screen sharing started successfully.`);
      this.emit("screenshare_started"); // For UI update
    } catch (error) {
      console.error(
        `${this.name}: Failed to start screen sharing process:`,
        error,
      );
      // Cleanup interval if it somehow got created before error
      if (this.screenInterval) clearInterval(this.screenInterval);
      this.screenInterval = null;
      // Ensure manager is disposed if initialize failed
      if (this.screenManager) {
        this.screenManager.dispose();
      }
      // Emit error and throw to prevent UI state change
      const msg = `Failed to start screen sharing: ${error.message}`;
      this.emit("error", new Error(msg));
      this.emit("screenshare_stopped"); // Ensure UI reflects stopped state on error
      throw new Error(msg);
    }
  }

  async stopScreenShare() {
    console.info(`${this.name}: Attempting to stop screen sharing...`);
    let wasRunning = !!this.screenInterval; // Check if interval existed

    if (this.screenInterval) {
      clearInterval(this.screenInterval);
      this.screenInterval = null;
      console.debug(`${this.name}: Screen interval cleared manually.`);
    } else {
      console.debug(
        `${this.name}: No active screen interval found to clear manually.`,
      );
    }

    // ScreenManager's dispose should be called automatically when the user stops sharing
    // via the browser UI, triggering the 'onStop' callback configured in the constructor.
    // Manually calling dispose here ensures cleanup if stopped programmatically OR if the onStop didn't fire correctly.
    if (this.screenManager && this.screenManager.isInitialized) {
      console.debug(`${this.name}: Manually calling screen manager dispose...`);
      // Calling dispose will trigger the onStop callback if it hasn't already been called.
      // The onStop callback will emit 'screenshare_stopped'.
      this.screenManager.dispose();
    } else {
      console.debug(
        `${this.name}: No initialized screen manager instance to dispose manually.`,
      );
      // If dispose wasn't called (e.g., manager failed init or wasn't running),
      // ensure the event is emitted if it was previously considered running.
      if (wasRunning) {
        console.warn(
          `${this.name}: Manually emitting screenshare_stopped as interval existed but manager was not disposed.`,
        );
        this.emit("screenshare_stopped");
      }
    }
    // Note: 'screenshare_stopped' event is primarily emitted by the onStop callback
    // in the ScreenManager constructor to accurately reflect when the *stream* ends.
    // The logic here ensures it gets emitted even if stopped programmatically or if manager state is inconsistent.
    console.info(`${this.name}: Screen sharing stop request processed.`);
  }
}
