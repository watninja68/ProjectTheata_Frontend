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
    user = null, // <<< ACCEPT USER OBJECT
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
    this.fps = settings.fps || 3;
    this.captureInterval = 1000 / this.fps;
    this.resizeWidth = settings.resizeWidth || 1280;
    this.quality = settings.quality || 0.5;

    // Initialize camera
    this.cameraManager = new CameraManager({
      width: this.resizeWidth,
      quality: this.quality,
      facingMode:
        settings.facingMode ||
        (/Mobi|Android/i.test(navigator.userAgent) ? "environment" : undefined),
    });
    this.cameraInterval = null;

    // Initialize screen sharing
    this.screenManager = new ScreenManager({
      width: this.resizeWidth,
      quality: this.quality,
      onStop: () => {
        console.info("Agent: ScreenManager onStop callback triggered.");
        if (this.screenInterval) {
          clearInterval(this.screenInterval);
          this.screenInterval = null;
          console.info(
            "Agent: Screen capture interval cleared via onStop callback.",
          );
        }
        this.emit("screenshare_stopped");
      },
    });
    this.screenInterval = null;

    // Tool Manager
    this.toolManager = toolManager;
    // Ensure config.tools exists before assigning
    config.tools = config.tools || {};
    config.tools.functionDeclarations =
      toolManager?.getToolDeclarations() || [];

    this.config = config;

    this.name = name;
    this.url = url;
    this.client = null;
    this.user = user; // <<< STORE THE USER OBJECT
  }

  // --- WebSocket Client Event Setup ---
  setupEventListeners() {
    if (!this.client) return;

    this.client.on("audio", async (data) => {
      if (
        !this.audioStreamer ||
        !this.audioStreamer.isInitialized ||
        this.audioStreamer.isDisposed
      ) {
        if (Math.random() < 0.1) {
          console.warn(
            `Agent: Audio received but streamer missing/uninitialized/disposed (Init: ${this.audioStreamer?.isInitialized}, Disposed: ${this.audioStreamer?.isDisposed}). Skipping.`,
          );
        }
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
        return;
      }

      try {
        await this.audioStreamer.streamAudio(new Uint8Array(data));
      } catch (error) {
        console.error("Agent: Error during audio streaming call:", error);
        this.emit(
          "error",
          new Error("Audio processing/streaming error: " + error.message),
        );
      }
    });

    this.client.on("inputTranscription", (transcript) => {
      if (transcript && transcript.trim().length > 0) {
        this.emit("user_transcription", transcript);
      }
    });
    this.client.on("outputTranscription", (transcript) => {
      if (transcript && transcript.trim().length > 0) {
        this.emit("transcription", transcript);
      }
    });
    this.client.on("interrupted", () => {
      console.info(`${this.name}: Model interrupted.`);
      if (this.audioStreamer && !this.audioStreamer.isDisposed) {
        this.audioStreamer.stop();
      }
      this.emit("interrupted");
    });

    this.client.on("turn_complete", () => {
      console.info(`${this.name}: Model finished speaking turn.`);
      this.emit("turn_complete");
    });

    this.client.on("tool_call", async (toolCall) => {
      await this.handleToolCall(toolCall);
    });

    this.client.on("error", (error) => {
      console.error(`${this.name} WebSocket Client Error:`, error);
      this.emit(
        "error",
        new Error("WebSocket client error: " + (error.message || error)),
      );
    });

    this.client.on("disconnect", () => {
      console.info(
        `${this.name} WebSocket Client disconnected event received.`,
      );
      this.connected = false;
      this.emit("internal_ws_disconnected");
    });
  }

  // --- Tool Call Handling ---
  async handleToolCall(toolCall) {
    if (!this.toolManager) {
      console.error("Received tool call but no tool manager is configured.");
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

    const responses = [];
    for (const functionCall of toolCall.functionCalls) {
      console.info(`${this.name}: Handling tool call: ${functionCall.name}`, {
        args: functionCall.args,
      });
      // <<< PASS USER CONTEXT TO THE TOOL MANAGER >>>
      const response = await this.toolManager.handleToolCall(functionCall, this.user);
      responses.push(response);
    }

    if (this.client && this.connected) {
      const apiResponseFormat = {
        toolResponse: {
          functionResponses: responses.map((r) => ({
            id: r.id,
            response: r.error ? { error: r.error } : { output: r.output },
          })),
        },
      };
      await this.client.sendJSON(apiResponseFormat);
      console.debug("Sent tool responses:", apiResponseFormat);
    } else {
      console.error("Cannot send tool response, client is not connected.");
    }
  }

  // --- Connection Management ---
  async connect() {
    if (this.connected) {
      console.warn(`${this.name}: Already connected.`);
      return;
    }
    if (this.connecting) {
      console.warn(`${this.name}: Connection already in progress.`);
      return (
        this.connectionPromise ||
        Promise.reject("Connection in progress, but promise missing")
      );
    }

    this.connecting = true;
    try {
      console.info(`${this.name}: Connecting to WebSocket...`);
      this.client = new GeminiWebsocketClient(this.name, this.url, this.config);
      this.setupEventListeners();
      this.connectionPromise = this.client.connect();
      await this.connectionPromise;
      this.connected = true;
      console.info(`${this.name}: WebSocket connected successfully.`);
    } catch (error) {
      console.error(`${this.name}: Failed to connect.`, error);
      if (this.client) {
        this.client.removeAllListeners();
      }
      this.client = null;
      this.connected = false;
      this.connectionPromise = null;
      throw error;
    } finally {
      this.connecting = false;
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
    this.connecting = false;

    try {
      if (this.cameraInterval) clearInterval(this.cameraInterval);
      if (this.screenInterval) clearInterval(this.screenInterval);
      this.cameraInterval = null;
      this.screenInterval = null;
      console.debug(`${this.name}: Intervals cleared.`);

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

      if (this.audioRecorder) {
        this.audioRecorder.stop();
        console.debug(`${this.name}: Audio recorder stopped.`);
      }
      if (this.audioStreamer) {
        this.audioStreamer.dispose();
        console.debug(`${this.name}: Audio streamer disposed.`);
      }

      if (this.audioContext) {
        this.audioContext.onstatechange = null;
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

      if (this.client) {
        this.client.disconnect();
        console.debug(`${this.name}: WebSocket client disconnect called.`);
      }
    } catch (error) {
      console.error(`${this.name}: Error during disconnect cleanup:`, error);
    } finally {
      this.initialized = false;
      this.connected = false;
      this.connecting = false;
      this.client = null;
      this.audioContext = null;
      this.audioStreamer = null;
      this.audioRecorder = null;

      if (this.cameraManager) {
        this.cameraManager.dispose();
      }
      if (this.screenManager) {
        this.screenManager.dispose();
      }
      this.removeAllListeners();
      console.info(`${this.name}: Disconnect process finished. State reset.`);
      this.emit("disconnected_cleanup_complete");
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
      if (!this.audioContext || this.audioContext.state === "closed") {
        try {
          this.audioContext = new AudioContext();
          console.info(`${this.name}: New AudioContext created.`);
          this.audioContext.onstatechange = () => {
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

      this.audioStreamer = new AudioStreamer(this.audioContext);
      await this.audioStreamer.initialize();
      console.info(`${this.name}: AudioStreamer initialized.`);

      this.audioRecorder = new AudioRecorder();
      console.info(`${this.name}: AudioRecorder created.`);

      this.initialized = true;
      console.info(`${this.name}: Initialized successfully.`);

      if (this.client && this.connected) {
        console.info(`${this.name}: Sending initial '.' prompt to model.`);
        await this.client.sendText(".");
      }
    } catch (error) {
      console.error(`${this.name}: Initialization error:`, error);
      try {
        if (this.audioStreamer) this.audioStreamer.dispose();
        if (this.audioContext) {
          this.audioContext.onstatechange = null;
          if (this.audioContext.state !== "closed")
            await this.audioContext.close();
        }
      } catch (cleanupError) {
        console.warn(
          "Error during initialization failure cleanup:",
          cleanupError,
        );
      }
      this.audioContext = null;
      this.audioStreamer = null;
      this.audioRecorder = null;
      this.initialized = false;
      throw new Error(`Agent initialization failed: ${error.message}`);
    }
  }

  // --- Agent Actions ---
  async sendText(text) {
    if (!this.client || !this.connected) {
      console.error(`${this.name}: Cannot send text, not connected.`);
      this.emit("error", new Error("Cannot send text, not connected."));
      return;
    }
    try {
      await this.client.sendText(text);
      this.emit("text_sent", text);
    } catch (error) {
      console.error(`${this.name}: Error sending text:`, error);
      this.emit("error", new Error("Error sending text: " + error.message));
    }
  }

  async sendAudio(base64Audio) {
    if (!this.client || !this.connected) {
      return;
    }
    try {
      await this.client.sendAudio(base64Audio);
    } catch (error) {
      console.error(`${this.name}: Error sending audio chunk:`, error);
    }
  }

  async sendImage(base64Image) {
    if (!this.client || !this.connected) {
      return;
    }

    if (!base64Image || base64Image.length === 0) {
      return;
    }

    if (Math.random() < 0.05) {
      const sizeKB = Math.round((base64Image.length * 3) / 4 / 1024);
      console.debug(
        `${this.name}: Preparing to send image, estimated size: ~${sizeKB} KB`,
      );
    }

    try {
      const startTime = performance.now();
      this.client.sendImage(base64Image).catch((error) => {
        console.error(`${this.name}: Error sending image (async):`, error);
        this.emit("error", new Error("Error sending image: " + error.message));
      });
      const queueTime = performance.now() - startTime;

      if (Math.random() < 0.02) {
        console.debug(
          `${this.name}: Image queued for sending in ${queueTime.toFixed(1)}ms`,
        );
      }
    } catch (error) {
      console.error(`${this.name}: Error queueing image send:`, error);
      this.emit(
        "error",
        new Error("Error queueing image send: " + error.message),
      );
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
      await this.audioRecorder.start(async (base64Data) => {
        if (this.connected && this.client) {
          this.sendAudio(base64Data);
        }
      });
      console.info(
        `${this.name}: Audio recording started. State: recording=${this.audioRecorder.isRecording}, suspended=${this.audioRecorder.isSuspended}`,
      );
      this.emit("mic_state_changed", {
        active: this.audioRecorder.isRecording,
        suspended: this.audioRecorder.isSuspended,
      });
    } catch (error) {
      const msg = `${this.name}: Failed to start audio recording: ${error.message}`;
      console.error(msg, error);
      this.emit("error", new Error(msg));
      if (this.audioRecorder) this.audioRecorder.stop();
      this.emit("mic_state_changed", { active: false, suspended: true });
    }
  }

  async toggleMic() {
    if (!this.audioRecorder) {
      const msg = `${this.name}: Cannot toggle mic, audio recorder not available.`;
      console.error(msg);
      this.emit("error", new Error(msg));
      this.emit("mic_state_changed", { active: false, suspended: true });
      return;
    }

    try {
      if (!this.audioRecorder.isRecording || !this.audioRecorder.stream) {
        console.info(`${this.name}: Mic not active, starting recording first.`);
        await this.startRecording();
        return;
      }

      console.info(`${this.name}: Toggling mic suspension...`);
      await this.audioRecorder.toggleMic();
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
      throw new Error(msg);
    }
    if (this.cameraInterval) {
      console.warn(`${this.name}: Camera capture already running.`);
      return;
    }

    try {
      console.info(`${this.name}: Initializing camera...`);
      await this.cameraManager.initialize();

      console.info(
        `${this.name}: Starting camera capture interval (FPS: ${this.fps})...`,
      );
      if (this.cameraInterval) clearInterval(this.cameraInterval);

      let consecutiveCaptureErrors = 0;
      const maxErrors = 10;

      this.cameraInterval = setInterval(async () => {
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
          await this.stopCameraCapture();
          return;
        }
        try {
          const imageBase64 = await this.cameraManager.capture();
          if (imageBase64) {
            this.sendImage(imageBase64);
            consecutiveCaptureErrors = 0;
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

        if (consecutiveCaptureErrors >= maxErrors) {
          console.error(
            `${this.name}: Stopping camera capture due to ${maxErrors} consecutive errors.`,
          );
          if (this.cameraInterval) clearInterval(this.cameraInterval);
          this.cameraInterval = null;
          await this.stopCameraCapture();
          this.emit(
            "error",
            new Error(`Camera capture stopped after ${maxErrors} errors.`),
          );
        }
      }, this.captureInterval);

      console.info(`${this.name}: Camera capture started.`);
      this.emit("camera_started");
    } catch (error) {
      console.error(`${this.name}: Failed to start camera capture:`, error);
      if (this.cameraInterval) clearInterval(this.cameraInterval);
      this.cameraInterval = null;
      if (this.cameraManager) {
        this.cameraManager.dispose();
      }
      const msg = `Failed to start camera capture: ${error.message}`;
      this.emit("error", new Error(msg));
      this.emit("camera_stopped");
      throw new Error(msg);
    }
  }

  async stopCameraCapture() {
    console.info(`${this.name}: Stopping camera capture...`);
    let wasRunning = !!this.cameraInterval;

    if (this.cameraInterval) {
      clearInterval(this.cameraInterval);
      this.cameraInterval = null;
      console.debug(`${this.name}: Camera interval cleared.`);
    }
    if (this.cameraManager) {
      if (this.cameraManager.isInitialized) {
        this.cameraManager.dispose();
        console.debug(`${this.name}: Camera manager dispose called.`);
      } else {
        console.debug(
          `${this.name}: Camera manager exists but was not initialized, skipping dispose.`,
        );
      }
    } else {
      console.debug(`${this.name}: No camera manager instance to dispose.`);
    }

    if (wasRunning || this.cameraManager) {
      console.info(`${this.name}: Camera capture stopped.`);
      this.emit("camera_stopped");
    }
  }

  async startScreenShare() {
    if (!this.initialized || !this.connected) {
      const msg = `${this.name}: Must be initialized and connected to start screen sharing`;
      console.error(msg);
      this.emit("error", new Error(msg));
      throw new Error(msg);
    }
    if (this.screenInterval) {
      console.warn(`${this.name}: Screen share already running.`);
      return;
    }

    try {
      console.info(`${this.name}: Initializing screen share...`);
      await this.screenManager.initialize();

      console.info(
        `${this.name}: Starting screen share interval (FPS: ${this.fps})...`,
      );
      if (this.screenInterval) clearInterval(this.screenInterval);

      let frameCount = 0;
      let successFrames = 0;
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 30;

      this.screenInterval = setInterval(async () => {
        if (
          !this.screenManager?.isInitialized ||
          !this.connected ||
          !this.client
        ) {
          console.warn(
            `${this.name}: Stopping screen share interval - conditions not met (SM Init: ${this.screenManager?.isInitialized}, Connected: ${this.connected}, Client: ${!!this.client}).`,
          );
          if (this.screenInterval) clearInterval(this.screenInterval);
          this.screenInterval = null;
          if (this.screenManager) {
            this.screenManager.dispose();
          } else {
            this.emit("screenshare_stopped");
          }
          return;
        }

        frameCount++;
        try {
          const imageBase64 = await this.screenManager.capture();

          if (imageBase64) {
            this.sendImage(imageBase64);
            successFrames++;
            consecutiveErrors = 0;
          } else {
            consecutiveErrors++;
            if (frameCount % this.fps === 0) {
              console.warn(
                `${this.name}: Screen capture returned empty data (Frame ${frameCount}, Consecutive Errors: ${consecutiveErrors}/${maxConsecutiveErrors}).`,
              );
            }
          }

          if (consecutiveErrors >= maxConsecutiveErrors) {
            console.error(
              `${this.name}: Stopping screen share due to ${maxConsecutiveErrors} consecutive capture errors.`,
            );
            if (this.screenInterval) clearInterval(this.screenInterval);
            this.screenInterval = null;
            if (this.screenManager) this.screenManager.dispose();
            else this.emit("screenshare_stopped");
            this.emit(
              "error",
              new Error(
                `Screen share stopped after ${maxConsecutiveErrors} capture errors.`,
              ),
            );
            return;
          }
        } catch (intervalError) {
          console.error(
            `${this.name}: Error within screen share interval capture (Frame ${frameCount}):`,
            intervalError,
          );
          consecutiveErrors++;
          if (consecutiveErrors >= maxConsecutiveErrors) {
            console.error(
              `${this.name}: Stopping screen share due to ${maxConsecutiveErrors} consecutive interval errors.`,
            );
            if (this.screenInterval) clearInterval(this.screenInterval);
            this.screenInterval = null;
            if (this.screenManager) this.screenManager.dispose();
            else this.emit("screenshare_stopped");
            this.emit(
              "error",
              new Error(
                `Screen share stopped after ${maxConsecutiveErrors} interval errors.`,
              ),
            );
            return;
          }
        }
      }, this.captureInterval);

      console.info(`${this.name}: Screen sharing started successfully.`);
      this.emit("screenshare_started");
    } catch (error) {
      console.error(
        `${this.name}: Failed to start screen sharing process:`,
        error,
      );
      if (this.screenInterval) clearInterval(this.screenInterval);
      this.screenInterval = null;
      if (this.screenManager) {
        this.screenManager.dispose();
      }
      const msg = `Failed to start screen sharing: ${error.message}`;
      this.emit("error", new Error(msg));
      this.emit("screenshare_stopped");
      throw new Error(msg);
    }
  }

  async stopScreenShare() {
    console.info(`${this.name}: Attempting to stop screen sharing...`);
    let wasRunning = !!this.screenInterval;

    if (this.screenInterval) {
      clearInterval(this.screenInterval);
      this.screenInterval = null;
      console.debug(`${this.name}: Screen interval cleared manually.`);
    } else {
      console.debug(
        `${this.name}: No active screen interval found to clear manually.`,
      );
    }

    if (this.screenManager && this.screenManager.isInitialized) {
      console.debug(`${this.name}: Manually calling screen manager dispose...`);
      this.screenManager.dispose();
    } else {
      console.debug(
        `${this.name}: No initialized screen manager instance to dispose manually.`,
      );
      if (wasRunning) {
        console.warn(
          `${this.name}: Manually emitting screenshare_stopped as interval existed but manager was not disposed.`,
        );
        this.emit("screenshare_stopped");
      }
    }
    console.info(`${this.name}: Screen sharing stop request processed.`);
  }
}
