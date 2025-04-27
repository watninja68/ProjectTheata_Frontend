import { GeminiWebsocketClient } from '../ws/client.js';
import { AudioRecorder } from '../audio/recorder.js';
import { AudioStreamer } from '../audio/streamer.js';
// Removed: import { AudioVisualizer } from '../audio/visualizer.js'; // Agent no longer directly manages this

import { DeepgramTranscriber } from '../transcribe/deepgram.js'; // Keep if using Deepgram
import { CameraManager } from '../camera/camera.js';
import { ScreenManager } from '../screen/screen.js';
import { base64ToArrayBuffer } from '../utils/utils.js'; // Import if needed for Deepgram


// Helper for event emitter functionality (can be simple Map based)
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
    emit(eventName, ...args) { // Allow multiple arguments
        if (this._listeners.has(eventName)) {
            // Use slice to prevent issues if a listener modifies the array during iteration
            this._listeners.get(eventName).slice().forEach(callback => {
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
    waitForEvent(eventName, timeout = 5000) {
        return new Promise((resolve, reject) => {
            let timeoutId = null;
            const listener = (data) => {
                if (timeoutId) clearTimeout(timeoutId);
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


export class GeminiAgent extends EventEmitter { // Inherit from EventEmitter
    constructor({
        name = 'GeminiAgent',
        url,
        config,
        deepgramApiKey = null,
        transcribeModelsSpeech = true, // Set default based on your needs
        transcribeUsersSpeech = false,  // Set default based on your needs
        modelSampleRate = 24000, // Match your config's expected rate
        toolManager = null,
        settings // Pass the whole settings object
    } = {}) {
        super(); // Call EventEmitter constructor

        if (!url) throw new Error('WebSocket URL is required');
        if (!config) throw new Error('Config is required');
        if (!settings) throw new Error('Settings object is required');

        this.initialized = false;
        this.connected = false;
        this.connecting = false; // Added connecting flag

        // For audio components
        this.audioContext = null;
        this.audioRecorder = null;
        this.audioStreamer = null;
        // REMOVED: this.visualizer = null; // Agent no longer manages visualizer instance

        // For transcribers
        this.transcribeModelsSpeech = transcribeModelsSpeech;
        this.transcribeUsersSpeech = transcribeUsersSpeech;
        this.deepgramApiKey = deepgramApiKey;
        this.modelSampleRate = modelSampleRate;
        this.userSampleRate = 16000; // Common rate for user mic input / Deepgram

        // Screen & camera settings from passed settings object
        this.fps = settings.fps || 5;
        this.captureInterval = 1000 / this.fps;
        this.resizeWidth = settings.resizeWidth || 640;
        this.quality = settings.quality || 0.4;

        // Initialize camera
        this.cameraManager = new CameraManager({
            width: this.resizeWidth,
            quality: this.quality,
            facingMode: settings.facingMode || ( /Mobi|Android/i.test(navigator.userAgent) ? 'environment' : undefined) // Use setting or default based on device
        });
        this.cameraInterval = null;

        // Initialize screen sharing
        this.screenManager = new ScreenManager({
            width: this.resizeWidth,
            quality: this.quality,
            onStop: () => {
                // Clean up interval and emit event when screen sharing stops
                console.info("ScreenManager onStop callback triggered.");
                if (this.screenInterval) {
                    clearInterval(this.screenInterval);
                    this.screenInterval = null;
                    console.info("Screen capture interval cleared.");
                }
                // Emit screen share stopped event - Ensure hook/App listens for this exact name
                this.emit('screenshare_stopped');
            }
        });
        this.screenInterval = null;

        // Tool Manager
        this.toolManager = toolManager;
        // Ensure config.tools exists before assigning
        if (config.tools) {
           config.tools.functionDeclarations = toolManager?.getToolDeclarations() || [];
        } else {
             // Handle case where config object might not have a tools property initially
             console.warn("Config object provided to GeminiAgent constructor is missing 'tools' property. Initializing.");
             config.tools = { functionDeclarations: toolManager?.getToolDeclarations() || [] };
        }
        this.config = config;

        this.name = name;
        this.url = url;
        this.client = null; // Initialize client as null

        // Keep alive intervals for Deepgram
        this.modelsKeepAliveInterval = null;
        this.userKeepAliveInterval = null;
    }

    // --- WebSocket Client Event Setup ---
    setupEventListeners() {
        if (!this.client) return;

        // Handle incoming audio data from the model
        this.client.on('audio', async (data) => {
            // Ensure streamer exists and is initialized
            if (!this.audioStreamer) {
                 console.warn("Audio received but audioStreamer is not initialized.");
                 return;
            }
            try {
                if (!this.audioStreamer.isInitialized && this.audioStreamer.context.state === 'running') {
                    // Attempt initialization only if context is running
                    await this.audioStreamer.initialize();
                    console.info("AudioStreamer late-initialized.");
                }
                 // Stream only if initialized
                if (this.audioStreamer.isInitialized) {
                    this.audioStreamer.streamAudio(new Uint8Array(data));

                    // Send to Deepgram if configured and connected
                    if (this.modelTranscriber && this.modelTranscriber.isConnected) {
                        // Deepgram expects raw PCM data (ArrayBuffer or Uint8Array)
                        this.modelTranscriber.sendAudio(data);
                    }
                } else {
                     console.warn("Audio received but streamer still not initialized/ready.");
                }

            } catch (error) {
                 // Using console.error avoids stopping execution like throw
                console.error('Audio processing/streaming error:', error);
                 // Optionally emit an error event
                 this.emit('error', new Error('Audio processing error:' + error.message));
            }
        });

        // Handle model interruptions by stopping audio playback
        this.client.on('interrupted', () => {
             console.info(`${this.name}: Model interrupted.`);
             if (this.audioStreamer) {
                this.audioStreamer.stop(); // Should handle internal state reset
            }
            this.emit('interrupted');
        });

        // Handle model turn completion
        this.client.on('turn_complete', () => {
            console.info(`${this.name}: Model finished speaking turn.`);
            this.emit('turn_complete');
        });

        // Handle tool calls from the model
        this.client.on('tool_call', async (toolCall) => {
            await this.handleToolCall(toolCall);
        });

        // Handle other potential client events if needed (e.g., 'disconnect', 'error')
        this.client.on('error', (error) => {
            console.error(`${this.name} WebSocket Client Error:`, error);
            this.emit('error', new Error('WebSocket client error: ' + (error.message || error)));
            // Consider triggering a disconnect or cleanup here if the error is fatal
        });

        this.client.on('disconnect', () => {
             console.info(`${this.name} WebSocket Client disconnected event received.`);
             // This event is emitted BY the client class. Agent listens and can react.
             // We might want to trigger the agent's disconnect cleanup here too.
             // this.disconnect(); // Be careful of potential loops if disconnect() emits 'disconnect'
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
        if (!toolCall || !Array.isArray(toolCall.functionCalls) || toolCall.functionCalls.length === 0) {
            console.warn("Received empty or invalid tool call:", toolCall);
            return;
        }

        // Handle multiple calls sequentially for now
        const responses = [];
        for (const functionCall of toolCall.functionCalls) {
            console.info(`${this.name}: Handling tool call: ${functionCall.name}`, { args: functionCall.args });
            const response = await this.toolManager.handleToolCall(functionCall); // Assuming { output, id, error }
            responses.push(response);
        }


        if (this.client && this.connected) {
             // Assuming client.sendToolResponse can handle an array or needs individual calls
             // Let's assume it needs the specific format expected by the API (array of functionResponses)
             const apiResponseFormat = {
                 toolResponse: { functionResponses: responses.map(r => ({ id: r.id, response: r.error ? { error: r.error } : { output: r.output } })) }
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
             // return this.client?.connectionPromise || Promise.reject("Connection in progress, but promise missing");
             return;
         }

        this.connecting = true;
        try {
            console.info(`${this.name}: Connecting to WebSocket...`);
            this.client = new GeminiWebsocketClient(this.name, this.url, this.config);
            this.setupEventListeners(); // Setup listeners *before* calling connect on client
            await this.client.connect(); // Wait for WS connection and setup message send
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
             throw error; // Re-throw for the hook to catch
        } finally {
             this.connecting = false; // Ensure flag is reset regardless of outcome
        }
    }

    async disconnect() {
        if (!this.connected && !this.connecting && !this.client) {
            console.warn(`${this.name}: Already disconnected or never connected.`);
            return;
        }
        console.info(`${this.name}: Disconnecting...`);
        this.connecting = false; // Stop any potential connection attempts

        try {
            // Stop intervals first
            if (this.cameraInterval) clearInterval(this.cameraInterval);
            if (this.screenInterval) clearInterval(this.screenInterval);
            if (this.modelsKeepAliveInterval) clearInterval(this.modelsKeepAliveInterval);
            if (this.userKeepAliveInterval) clearInterval(this.userKeepAliveInterval);
            this.cameraInterval = null;
            this.screenInterval = null;
            this.modelsKeepAliveInterval = null;
            this.userKeepAliveInterval = null;
            console.debug(`${this.name}: Intervals cleared.`);

            // Stop capture managers gracefully
            // Use try-catch for each potentially failing async operation
            try {
                await this.stopCameraCapture(); // Calls dispose internally
            } catch (e) { console.warn("Error stopping camera capture during disconnect:", e); }
            try {
                await this.stopScreenShare(); // Calls dispose internally
            } catch (e) { console.warn("Error stopping screen share during disconnect:", e); }
             console.debug(`${this.name}: Capture managers stopped.`);

            // Cleanup audio resources
            if (this.audioRecorder) {
                this.audioRecorder.stop(); // Stops tracks and closes context if owned
                 console.debug(`${this.name}: Audio recorder stopped.`);
            }
            if (this.audioStreamer) {
                this.audioStreamer.stop(); // Stops playback and fades out
                 console.debug(`${this.name}: Audio streamer stopped.`);
            }

            // Cleanup transcribers
            if (this.modelTranscriber) {
                 this.modelTranscriber.disconnect();
                 console.debug(`${this.name}: Model transcriber disconnected.`);
            }
            if (this.userTranscriber) {
                 this.userTranscriber.disconnect();
                 console.debug(`${this.name}: User transcriber disconnected.`);
            }

             // Close the main audio context IF it exists and isn't already closed
            if (this.audioContext && this.audioContext.state !== 'closed') {
                try {
                    await this.audioContext.close();
                    console.info(`${this.name}: AudioContext closed.`);
                } catch (acError) {
                    console.warn(`${this.name}: Error closing AudioContext:`, acError);
                }
            }

            // Disconnect WebSocket client
            if (this.client) {
                 this.client.disconnect(); // Assumes client class has disconnect logic
                 console.debug(`${this.name}: WebSocket client disconnect called.`);
            }

        } catch (error) {
            console.error(`${this.name}: Error during disconnect cleanup:`, error);
            // Still ensure state is reset even if cleanup had errors
        } finally {
            // Reset state flags and resources definitively
            this.initialized = false;
            this.connected = false;
            this.connecting = false;
            this.client = null;
            this.audioContext = null;
            this.audioStreamer = null;
            this.audioRecorder = null;
            this.modelTranscriber = null;
            this.userTranscriber = null;
            // Don't nullify managers completely, they might be needed if re-connecting?
            // Or ensure they are recreated on connect. Let's nullify for now.
            // this.cameraManager = null; // Reconsider if re-connection should reuse managers
            // this.screenManager = null;
            this.removeAllListeners(); // Clear agent's own listeners
            console.info(`${this.name}: Disconnect process finished. State reset.`);
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
            // Initialize audio components
            // Reuse existing context if available and not closed, otherwise create new
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new AudioContext();
                console.info(`${this.name}: New AudioContext created.`);
            } else if (this.audioContext.state === 'suspended') {
                 await this.audioContext.resume();
                 console.info(`${this.name}: Resumed existing AudioContext.`);
            }

            this.audioStreamer = new AudioStreamer(this.audioContext);
            await this.audioStreamer.initialize(); // Ensure streamer is ready
            console.info(`${this.name}: AudioStreamer initialized.`);

            this.audioRecorder = new AudioRecorder(); // Recorder is ready to start
             console.info(`${this.name}: AudioRecorder created.`);

            // Initialize transcriber(s) if API key is provided
            if (this.deepgramApiKey) {
                console.info(`${this.name}: Deepgram API key found, initializing transcribers...`);
                if (this.transcribeModelsSpeech) {
                    this.modelTranscriber = new DeepgramTranscriber(this.deepgramApiKey, this.modelSampleRate);
                    await this.initializeModelSpeechTranscriber(); // Connects and sets up keep-alive
                }
                if (this.transcribeUsersSpeech) {
                    this.userTranscriber = new DeepgramTranscriber(this.deepgramApiKey, this.userSampleRate);
                    await this.initializeUserSpeechTranscriber(); // Connects and sets up keep-alive
                }
            } else {
                console.warn(`${this.name}: No Deepgram API key provided, transcription disabled.`);
            }

            this.initialized = true;
            console.info(`${this.name}: Initialized successfully.`);

            // Send initial message to prompt model response after setup
            if (this.client && this.connected) {
                 console.info(`${this.name}: Sending initial '.' prompt to model.`);
                 await this.client.sendText('.'); // Trigger the model to start speaking first
            }

        } catch (error) {
            console.error(`${this.name}: Initialization error:`, error);
            // Attempt cleanup of partially initialized resources
            try {
                 if (this.audioStreamer) this.audioStreamer.stop();
                 if (this.modelTranscriber) this.modelTranscriber.disconnect();
                 if (this.userTranscriber) this.userTranscriber.disconnect();
                 if (this.audioContext && this.audioContext.state !== 'closed') await this.audioContext.close();
            } catch (cleanupError) {
                 console.warn("Error during initialization failure cleanup:", cleanupError);
            }
            // Nullify resources
            this.audioContext = null;
            this.audioStreamer = null;
            this.audioRecorder = null;
            this.modelTranscriber = null;
            this.userTranscriber = null;
            this.initialized = false; // Mark as not initialized
            // Rethrow the specific error for the hook/caller
            throw new Error(`Agent initialization failed: ${error.message}`);
        }
    }

    // --- Deepgram Initializers ---
    async initializeModelSpeechTranscriber() {
        if (!this.modelTranscriber) {
            console.warn(`${this.name}: Model transcriber instance not available.`);
            return;
        }
        console.info(`${this.name}: Initializing Deepgram model speech transcriber...`);
        const connectionPromise = new Promise((resolve, reject) => {
            const onError = (err) => {
                 console.error("Model transcriber connection error:", err);
                 this.modelTranscriber.off('error', onError); // Clean up listener
                 if (this.modelsKeepAliveInterval) clearInterval(this.modelsKeepAliveInterval); // Clear interval on error too
                 this.modelsKeepAliveInterval = null;
                 reject(new Error("Failed to connect model transcriber"));
            };
            // Use once for setup error tracking
            this.modelTranscriber.once('error', onError);

            this.modelTranscriber.once('connected', () => {
                console.info(`${this.name}: Model speech transcriber connected.`);
                this.modelTranscriber.off('error', onError); // Clean up error listener on success

                 // Clear previous interval just in case
                 if (this.modelsKeepAliveInterval) clearInterval(this.modelsKeepAliveInterval);

                this.modelsKeepAliveInterval = setInterval(() => {
                    if (this.modelTranscriber && this.modelTranscriber.isConnected) {
                         try {
                            // console.debug('Sending keep-alive to model speech transcriber');
                            this.modelTranscriber.ws.send(JSON.stringify({ type: 'KeepAlive' }));
                         } catch (e) {
                             console.error("Error sending keep-alive to model transcriber:", e);
                             // Consider stopping interval or attempting reconnect if keep-alive fails
                         }
                    } else {
                        console.warn("Model transcriber disconnected, stopping keep-alive.");
                        if (this.modelsKeepAliveInterval) clearInterval(this.modelsKeepAliveInterval);
                        this.modelsKeepAliveInterval = null;
                    }
                }, 10000); // 10 seconds
                resolve();
            });
        });

        // Handle transcriptions (persistent listener)
        // Remove previous listener if re-initializing
         this.modelTranscriber.removeAllListeners('transcription');
         this.modelTranscriber.on('transcription', (transcript) => {
            if (transcript && transcript.trim().length > 0) {
                this.emit('transcription', transcript);
                 // console.debug('Model speech transcription:', transcript);
            }
        });

         // Handle disconnection (persistent listener)
         // Remove previous listener if re-initializing
         this.modelTranscriber.removeAllListeners('disconnected');
         this.modelTranscriber.on('disconnected', () => {
            console.warn(`${this.name}: Model speech transcriber disconnected.`);
            if (this.modelsKeepAliveInterval) clearInterval(this.modelsKeepAliveInterval);
            this.modelsKeepAliveInterval = null;
            // TODO: Implement reconnection logic?
        });

        // Connect and wait for setup
        try {
             await this.modelTranscriber.connect();
             await connectionPromise;
        } catch (connectError) {
             console.error("Failed during model transcriber connect/setup:", connectError);
             // Ensure interval is clear even if connect() or promise rejects
             if (this.modelsKeepAliveInterval) clearInterval(this.modelsKeepAliveInterval);
             this.modelsKeepAliveInterval = null;
             throw connectError; // Re-throw
        }
    }

     async initializeUserSpeechTranscriber() {
         if (!this.userTranscriber) {
             console.warn(`${this.name}: User transcriber instance not available.`);
             return;
         }
         console.info(`${this.name}: Initializing Deepgram user speech transcriber...`);
         const connectionPromise = new Promise((resolve, reject) => {
             const onError = (err) => {
                 console.error("User transcriber connection error:", err);
                 this.userTranscriber.off('error', onError);
                  if (this.userKeepAliveInterval) clearInterval(this.userKeepAliveInterval);
                  this.userKeepAliveInterval = null;
                 reject(new Error("Failed to connect user transcriber"));
             };
             this.userTranscriber.once('error', onError);

             this.userTranscriber.once('connected', () => {
                 console.info(`${this.name}: User speech transcriber connected.`);
                 this.userTranscriber.off('error', onError);

                 if (this.userKeepAliveInterval) clearInterval(this.userKeepAliveInterval);

                 this.userKeepAliveInterval = setInterval(() => {
                     if (this.userTranscriber && this.userTranscriber.isConnected) {
                          try {
                              // console.debug('Sending keep-alive to user transcriber');
                              this.userTranscriber.ws.send(JSON.stringify({ type: 'KeepAlive' }));
                          } catch (e) {
                              console.error("Error sending keep-alive to user transcriber:", e);
                          }
                     } else {
                          console.warn("User transcriber disconnected, stopping keep-alive.");
                          if (this.userKeepAliveInterval) clearInterval(this.userKeepAliveInterval);
                          this.userKeepAliveInterval = null;
                     }
                 }, 10000);
                 resolve();
             });
         });

         // Remove previous listener if re-initializing
         this.userTranscriber.removeAllListeners('transcription');
         this.userTranscriber.on('transcription', (transcript) => {
             if (transcript && transcript.trim().length > 0) {
                 this.emit('user_transcription', transcript);
                 // console.debug('User speech transcription:', transcript);
             }
         });

          // Remove previous listener if re-initializing
         this.userTranscriber.removeAllListeners('disconnected');
         this.userTranscriber.on('disconnected', () => {
             console.warn(`${this.name}: User speech transcriber disconnected.`);
             if (this.userKeepAliveInterval) clearInterval(this.userKeepAliveInterval);
             this.userKeepAliveInterval = null;
             // TODO: Implement reconnection logic?
         });

         try {
             await this.userTranscriber.connect();
             await connectionPromise;
        } catch (connectError) {
             console.error("Failed during user transcriber connect/setup:", connectError);
             if (this.userKeepAliveInterval) clearInterval(this.userKeepAliveInterval);
             this.userKeepAliveInterval = null;
             throw connectError; // Re-throw
        }
     }


    // --- Agent Actions ---
    async sendText(text) {
        if (!this.client || !this.connected) {
            console.error(`${this.name}: Cannot send text, not connected.`);
            this.emit('error', new Error('Cannot send text, not connected.'));
            return;
        }
        try {
             await this.client.sendText(text);
             this.emit('text_sent', text); // Emit event *after* successful sending attempt
        } catch (error) {
             console.error(`${this.name}: Error sending text:`, error);
             this.emit('error', new Error('Error sending text: ' + error.message));
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
            console.warn(`${this.name}: Cannot send image, not connected.`);
            return;
        }

        // Skip empty images explicitly
        if (!base64Image || base64Image.length === 0) {
            // console.debug(`${this.name}: Attempted to send empty image data, skipping.`);
            return;
        }

        // Debug image size (helpful to identify issues) - Log less frequently
        const imageSize = base64Image.length;
        if (Math.random() < 0.05) { // Log size ~5% of the time
            const sizeKB = Math.round(imageSize * 3 / 4 / 1024); // Estimate KB size
            console.debug(`${this.name}: Preparing to send image, estimated size: ~${sizeKB} KB`);
        }


        try {
            const startTime = performance.now();
            await this.client.sendImage(base64Image);
            const sendTime = performance.now() - startTime;

            // Log performance occasionally
            if (Math.random() < 0.02) { // ~2% of frames
                console.debug(`${this.name}: Image sent in ${sendTime.toFixed(1)}ms`);
            }
        } catch (error) {
            console.error(`${this.name}: Error sending image:`, error);
            this.emit('error', new Error('Error sending image: ' + error.message));
             // Consider stopping capture interval if sending consistently fails
        }
    }

    // --- Media Controls ---
    async startRecording() {
         if (!this.initialized || !this.audioRecorder) {
             const msg = `${this.name}: Cannot start recording, not initialized.`;
             console.error(msg);
             this.emit('error', new Error(msg));
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

                 // Send audio to Deepgram user transcriber if active
                if (this.userTranscriber && this.userTranscriber.isConnected) {
                     try {
                         // Deepgram expects raw PCM data (ArrayBuffer or Uint8Array)
                         // We need to decode base64 first.
                         const buffer = base64ToArrayBuffer(base64Data);
                         if (buffer && buffer.byteLength > 0) {
                            this.userTranscriber.sendAudio(buffer);
                         } else {
                             console.warn("Failed to convert base64 audio to buffer for Deepgram.");
                         }
                     } catch (error) {
                         console.error(`${this.name}: Error sending audio to user transcriber:`, error);
                     }
                 }
            });
             console.info(`${this.name}: Audio recording started. State: recording=${this.audioRecorder.isRecording}, suspended=${this.audioRecorder.isSuspended}`);
              // Emit state? e.g., this.emit('mic_state_changed', { active: true, suspended: false });
         } catch (error) {
             const msg = `${this.name}: Failed to start audio recording: ${error.message}`;
             console.error(msg, error);
             this.emit('error', new Error(msg));
             // Ensure recorder state is reset if start failed
             if (this.audioRecorder) this.audioRecorder.stop();
         }
    }

    async toggleMic() {
        if (!this.audioRecorder) {
            const msg = `${this.name}: Cannot toggle mic, audio recorder not available.`;
            console.error(msg);
            this.emit('error', new Error(msg));
            return;
        }

        try {
             // If stream doesn't exist (never started), start recording first
             // Check isRecording AND stream existence
            if (!this.audioRecorder.isRecording || !this.audioRecorder.stream) {
                console.info(`${this.name}: Mic not active, starting recording first.`);
                await this.startRecording();
                // startRecording now handles the initial state, assuming it starts un-suspended
                 if (this.audioRecorder.isRecording) {
                     this.emit('mic_state_changed', { active: true, suspended: this.audioRecorder.isSuspended });
                 }
                return; // Exit after starting
            }

            // If stream exists, toggle suspension state
            console.info(`${this.name}: Toggling mic suspension...`);
            await this.audioRecorder.toggleMic(); // Handles suspend/resume internally
            console.info(`${this.name}: Mic suspension toggled. Suspended: ${this.audioRecorder.isSuspended}`);
            this.emit('mic_state_changed', { active: true, suspended: this.audioRecorder.isSuspended });

        } catch (error) {
             const msg = `${this.name}: Failed to toggle mic: ${error.message}`;
             console.error(msg, error);
             this.emit('error', new Error(msg));
              // Optionally try to reset state on error
              // await this.audioRecorder.stop(); // Or just update emitted state
              this.emit('mic_state_changed', { active: false, suspended: true });
        }
    }

    async startCameraCapture() {
        if (!this.initialized || !this.connected) {
             const msg = `${this.name}: Must be initialized and connected to start camera capture`;
             console.error(msg);
             this.emit('error', new Error(msg));
             throw new Error(msg); // Throw to prevent hook state change
        }
         if (this.cameraInterval) {
             console.warn(`${this.name}: Camera capture already running.`);
             return;
         }

        try {
            console.info(`${this.name}: Initializing camera...`);
            await this.cameraManager.initialize(); // Ensure camera is ready

            console.info(`${this.name}: Starting camera capture interval (FPS: ${this.fps})...`);
            // Clear any zombie interval first
            if (this.cameraInterval) clearInterval(this.cameraInterval);

            this.cameraInterval = setInterval(async () => {
                // Check conditions within interval callback too
                if (!this.cameraManager?.isInitialized || !this.connected || !this.client) {
                     console.warn(`${this.name}: Stopping camera capture interval - conditions not met (manager init: ${this.cameraManager?.isInitialized}, connected: ${this.connected}).`);
                     if(this.cameraInterval) clearInterval(this.cameraInterval);
                     this.cameraInterval = null;
                     // Optionally call stopCameraCapture here if needed, but might be handled elsewhere
                     // await this.stopCameraCapture();
                     return;
                }
                 try {
                    const imageBase64 = await this.cameraManager.capture();
                    // sendImage handles the null check internally now
                    this.sendImage(imageBase64);
                 } catch (captureError) {
                     // Log error but allow interval to continue unless it's fatal
                     console.error(`${this.name}: Error capturing/sending camera image:`, captureError);
                     // TODO: Add logic to stop interval after N consecutive errors?
                 }
            }, this.captureInterval);

            console.info(`${this.name}: Camera capture started.`);
            this.emit('camera_started'); // Emit event for UI update

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
             this.emit('error', new Error(msg));
             throw new Error(msg); // Throw to prevent hook state change
        }
    }

    async stopCameraCapture() {
        console.info(`${this.name}: Stopping camera capture...`);
        if (this.cameraInterval) {
            clearInterval(this.cameraInterval);
            this.cameraInterval = null;
             console.debug(`${this.name}: Camera interval cleared.`);
        } else {
            // console.debug(`${this.name}: No active camera interval to clear.`);
        }
        if (this.cameraManager) {
            this.cameraManager.dispose(); // Handles stopping stream and cleanup
             console.debug(`${this.name}: Camera manager dispose called.`);
        } else {
             console.debug(`${this.name}: No camera manager instance to dispose.`);
        }
        console.info(`${this.name}: Camera capture stopped.`);
        this.emit('camera_stopped'); // Emit event for UI update
    }

async startScreenShare() {
    if (!this.initialized || !this.connected) {
        const msg = `${this.name}: Must be initialized and connected to start screen sharing`;
        console.error(msg);
        this.emit('error', new Error(msg));
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

        console.info(`${this.name}: Starting screen share interval (FPS: ${this.fps})...`);
        // Clear any potential zombie interval
        if (this.screenInterval) clearInterval(this.screenInterval);

        let frameCount = 0;
        let successFrames = 0;
        let consecutiveErrors = 0;
        const maxConsecutiveErrors = 10; // Stop after 10 failed captures in a row

        this.screenInterval = setInterval(async () => {
            // Check conditions rigorously inside interval
            if (!this.screenManager?.isInitialized || !this.connected || !this.client) {
                console.warn(`${this.name}: Stopping screen share interval - conditions not met (manager init: ${this.screenManager?.isInitialized}, connected: ${this.connected}).`);
                if(this.screenInterval) clearInterval(this.screenInterval);
                this.screenInterval = null;
                 // Trigger the stop process if conditions fail
                 // Check if screenManager exists before calling dispose
                 if (this.screenManager) {
                    this.screenManager.dispose(); // This should trigger the onStop callback which emits screenshare_stopped
                 } else {
                      this.emit('screenshare_stopped'); // Manually emit if manager is gone
                 }
                return;
            }

            frameCount++;
            try {
                const imageBase64 = await this.screenManager.capture();

                if (imageBase64) {
                    this.sendImage(imageBase64); // sendImage handles null check, but we know it's not null here
                    successFrames++;
                    consecutiveErrors = 0; // Reset error count on success

                    // Log frame stats periodically
                    if (frameCount % (this.fps * 5) === 0) { // Log every 5 seconds approx
                        console.debug(`Screen capture stats: ${successFrames}/${frameCount} frames successfully captured & sent.`);
                    }
                } else {
                    // Capture returned null/empty - could be transient or stream ended
                     consecutiveErrors++;
                     if (frameCount % this.fps === 0) { // Log once per second approx if capturing null
                        console.warn(`${this.name}: Screen capture returned empty data (Frame ${frameCount}, Consecutive Errors: ${consecutiveErrors}).`);
                     }
                }

                 // Stop if too many consecutive errors
                 if (consecutiveErrors >= maxConsecutiveErrors) {
                     console.error(`${this.name}: Stopping screen share due to ${maxConsecutiveErrors} consecutive capture errors.`);
                     if (this.screenInterval) clearInterval(this.screenInterval);
                     this.screenInterval = null;
                     if (this.screenManager) this.screenManager.dispose(); // Trigger stop
                     else this.emit('screenshare_stopped');
                     this.emit('error', new Error(`Screen share stopped after ${maxConsecutiveErrors} capture errors.`));
                     return;
                 }

            } catch (intervalError) {
                 // Catch errors from capture() or sendImage() within the interval
                console.error(`${this.name}: Error within screen share interval (Frame ${frameCount}):`, intervalError);
                consecutiveErrors++;
                 if (consecutiveErrors >= maxConsecutiveErrors) {
                    console.error(`${this.name}: Stopping screen share due to ${maxConsecutiveErrors} consecutive interval errors.`);
                    if (this.screenInterval) clearInterval(this.screenInterval);
                    this.screenInterval = null;
                    if (this.screenManager) this.screenManager.dispose(); // Trigger stop
                    else this.emit('screenshare_stopped');
                    this.emit('error', new Error(`Screen share stopped after ${maxConsecutiveErrors} interval errors.`));
                    return;
                 }
            }
        }, this.captureInterval);

        console.info(`${this.name}: Screen sharing started successfully.`);
        this.emit('screenshare_started'); // For UI update

    } catch (error) {
        console.error(`${this.name}: Failed to start screen sharing process:`, error);
        // Cleanup interval if it somehow got created before error
        if (this.screenInterval) clearInterval(this.screenInterval);
        this.screenInterval = null;
        // Ensure manager is disposed if initialize failed
        if (this.screenManager) {
             this.screenManager.dispose();
        }
        // Emit error and throw to prevent UI state change
        const msg = `Failed to start screen sharing: ${error.message}`;
        this.emit('error', new Error(msg));
        throw new Error(msg);
    }
}

    async stopScreenShare() {
        console.info(`${this.name}: Attempting to stop screen sharing...`);
        if (this.screenInterval) {
            clearInterval(this.screenInterval);
            this.screenInterval = null;
             console.debug(`${this.name}: Screen interval cleared.`);
        } else {
            // console.debug(`${this.name}: No active screen interval to clear.`);
        }

        // ScreenManager's dispose should be called automatically when the user stops sharing
        // via the browser UI, triggering the 'onStop' callback configured in the constructor.
        // Manually calling dispose here ensures cleanup if stopped programmatically.
        if (this.screenManager && this.screenManager.isInitialized) {
             console.debug(`${this.name}: Manually calling screen manager dispose...`);
             this.screenManager.dispose(); // This will trigger the onStop callback if not already called
        } else {
            console.debug(`${this.name}: No initialized screen manager instance to dispose manually.`);
             // If dispose wasn't called (e.g., manager failed init), ensure event is emitted
             this.emit('screenshare_stopped');
        }
        // Note: 'screenshare_stopped' event is primarily emitted by the onStop callback
        // in the ScreenManager constructor to accurately reflect when the *stream* ends.
        console.info(`${this.name}: Screen sharing stop requested.`);
    }
}