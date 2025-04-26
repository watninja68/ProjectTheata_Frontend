/**
 * Core application class that orchestrates the interaction between various components
 * of the Gemini 2 Live API. Manages audio streaming, WebSocket communication, audio transcription,
 * and coordinates the overall application functionality.
 */
import { GeminiWebsocketClient } from '../ws/client.js';
import { AudioRecorder } from '../audio/recorder.js';
import { AudioStreamer } from '../audio/streamer.js';
// Removed: import { AudioVisualizer } from '../audio/visualizer.js'; // Agent no longer directly manages this

import { DeepgramTranscriber } from '../transcribe/deepgram.js'; // Keep if using Deepgram
import { CameraManager } from '../camera/camera.js';
import { ScreenManager } from '../screen/screen.js';

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
    emit(eventName, data) {
        if (this._listeners.has(eventName)) {
            this._listeners.get(eventName).forEach(callback => callback(data));
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
        toolManager = null
    } = {}) {
        super(); // Call EventEmitter constructor

        if (!url) throw new Error('WebSocket URL is required');
        if (!config) throw new Error('Config is required');

        this.initialized = false;
        this.connected = false;

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

        // Screen & camera settings (Consider passing these from settings hook)
        this.fps = parseInt(localStorage.getItem('fps') || '5', 10);
        this.captureInterval = 1000 / this.fps;
        this.resizeWidth = parseInt(localStorage.getItem('resizeWidth') || '640', 10);
        this.quality = parseFloat(localStorage.getItem('quality') || '0.4');

        // Initialize camera
        this.cameraManager = new CameraManager({
            width: this.resizeWidth,
            quality: this.quality,
            facingMode: localStorage.getItem('facingMode') || 'environment'
        });
        this.cameraInterval = null;

        // Initialize screen sharing
        this.screenManager = new ScreenManager({
            width: this.resizeWidth,
            quality: this.quality,
            onStop: () => {
                // Clean up interval and emit event when screen sharing stops
                if (this.screenInterval) {
                    clearInterval(this.screenInterval);
                    this.screenInterval = null;
                }
                // Emit screen share stopped event
                this.emit('screenshare_stopped'); // Ensure this event name matches hook/App
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
             console.warn("Config object provided to GeminiAgent constructor is missing 'tools' property.");
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
                if (!this.audioStreamer.isInitialized) {
                    // Attempt initialization - this might depend on AudioContext state
                    await this.audioStreamer.initialize();
                }
                this.audioStreamer.streamAudio(new Uint8Array(data));

                // Send to Deepgram if configured and connected
                if (this.modelTranscriber && this.modelTranscriber.isConnected) {
                    this.modelTranscriber.sendAudio(data);
                }

            } catch (error) {
                 // Using console.error avoids stopping execution like throw
                console.error('Audio processing error:', error);
                 // Optionally emit an error event
                 this.emit('error', new Error('Audio processing error:' + error.message));
            }
        });

        // Handle model interruptions by stopping audio playback
        this.client.on('interrupted', () => {
             if (this.audioStreamer) {
                this.audioStreamer.stop();
                // Setting isInitialized might be handled internally by stop() or might need explicit set
                 this.audioStreamer.isInitialized = false;
            }
            this.emit('interrupted');
        });

        // Handle model turn completion
        this.client.on('turn_complete', () => {
            console.info(`${this.name}: Model finished speaking`);
            this.emit('turn_complete');
        });

        // Handle tool calls from the model
        this.client.on('tool_call', async (toolCall) => {
            await this.handleToolCall(toolCall);
        });

        // Handle other potential client events if needed (e.g., 'disconnect', 'error')
        this.client.on('error', (error) => {
            console.error(`${this.name} WebSocket Client Error:`, error);
            this.emit('error', new Error('WebSocket client error: ' + error.message));
            // Consider triggering a disconnect or cleanup here
        });

        this.client.on('disconnect', () => {
             console.info(`${this.name} WebSocket Client disconnected.`);
             // This event listener might need to be added in GeminiWebsocketClient itself
             // And then re-emitted here if needed by the agent's consumers
        });
    }

    // --- Tool Call Handling ---
    async handleToolCall(toolCall) {
        if (!this.toolManager) {
             console.error("Received tool call but no tool manager is configured.");
            // Send back an error response if possible? Depends on API spec.
             return;
        }
        if (!toolCall || !Array.isArray(toolCall.functionCalls) || toolCall.functionCalls.length === 0) {
            console.warn("Received empty or invalid tool call:", toolCall);
            return;
        }

        // Basic handling for the first call, needs expansion for multiple calls
        const functionCall = toolCall.functionCalls[0];
        console.info(`${this.name}: Handling tool call: ${functionCall.name}`, { args: functionCall.args });
        const response = await this.toolManager.handleToolCall(functionCall); // Assuming handleToolCall returns { output, id, error }

        if (this.client) {
             await this.client.sendToolResponse(response);
        } else {
             console.error("Cannot send tool response, client is not connected.");
        }
    }

    // --- Connection Management ---
    async connect() {
        // Prevent multiple connection attempts
        if (this.connected || this.connecting) return;

        this.connecting = true;
        try {
            console.info(`${this.name}: Connecting to WebSocket...`);
            this.client = new GeminiWebsocketClient(this.name, this.url, this.config);
            await this.client.connect(); // Wait for WS connection
            this.setupEventListeners(); // Setup listeners *after* client is created
            this.connected = true;
            this.connecting = false;
            console.info(`${this.name}: WebSocket connected successfully.`);
            // Don't call initialize() here automatically, let the hook manage it
        } catch (error) {
             console.error(`${this.name}: Failed to connect.`, error);
             this.client = null;
             this.connected = false;
             this.connecting = false;
             throw error; // Re-throw for the hook to catch
        }
    }

    async disconnect() {
        console.info(`${this.name}: Disconnecting...`);
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

            // Stop capture managers
            await this.stopCameraCapture(); // Calls dispose internally
            await this.stopScreenShare(); // Calls dispose internally

            // Cleanup audio resources
            if (this.audioRecorder) {
                this.audioRecorder.stop(); // Stops tracks and closes context if owned
                this.audioRecorder = null;
            }
            // REMOVED VISUALIZER CLEANUP
            // if (this.visualizer) { // Agent no longer manages visualizer
            //     this.visualizer.cleanup();
            // }
            if (this.audioStreamer) {
                this.audioStreamer.stop(); // Stops playback and fades out
                this.audioStreamer = null;
            }

            // Cleanup transcribers
            if (this.modelTranscriber) {
                this.modelTranscriber.disconnect();
                this.modelTranscriber = null;
            }
            if (this.userTranscriber) {
                this.userTranscriber.disconnect();
                this.userTranscriber = null;
            }

            // Finally close the main audio context IF it exists
            if (this.audioContext && this.audioContext.state !== 'closed') {
                await this.audioContext.close();
                 console.info(`${this.name}: AudioContext closed.`);
            }
            this.audioContext = null;

            // Disconnect WebSocket client
            if (this.client) {
                 this.client.disconnect(); // Assumes client class has disconnect logic
            }
            this.client = null; // Release reference

            // Reset state flags
            this.initialized = false;
            this.connected = false;
            console.info(`${this.name}: Disconnected and cleaned up resources.`);

        } catch (error) {
            console.error(`${this.name}: Error during disconnect:`, error);
            // Reset state flags even on error to reflect disconnected state
            this.initialized = false;
            this.connected = false;
            this.client = null;
            this.audioContext = null;
            this.audioStreamer = null;
            this.audioRecorder = null;
            // Rethrow or handle as needed
            throw new Error('Disconnect error: ' + error.message);
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
            this.audioContext = new AudioContext();
            this.audioStreamer = new AudioStreamer(this.audioContext);
            await this.audioStreamer.initialize(); // Ensure streamer is ready

            // --- VISUALIZER IS INITIALIZED BY THE COMPONENT ---
            // REMOVED: this.visualizer = new AudioVisualizer(this.audioContext, 'visualizer');
            // REMOVED: this.audioStreamer.gainNode.connect(this.visualizer.analyser);
            // REMOVED: this.visualizer.start();
            // ---

            this.audioRecorder = new AudioRecorder(); // Recorder is ready to start

            // Initialize transcriber(s) if API key is provided
            if (this.deepgramApiKey) {
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
            // Ensure client is still valid before sending
            if (this.client && this.connected) {
                 this.client.sendText('.'); // Trigger the model to start speaking first
            }

        } catch (error) {
            console.error(`${this.name}: Initialization error:`, error);
            // Attempt cleanup of partially initialized resources
            if (this.audioStreamer) this.audioStreamer.stop();
            if (this.audioContext && this.audioContext.state !== 'closed') await this.audioContext.close();
            // Nullify resources
            this.audioContext = null;
            this.audioStreamer = null;
            this.audioRecorder = null;
            this.modelTranscriber = null; // Ensure transcribers are also nullified
            this.userTranscriber = null;
            this.initialized = false; // Mark as not initialized
            // Rethrow the specific error for the hook/caller
            throw new Error('Error during the initialization of the client: ' + error.message);
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
             // Handle connection errors during setup
            const onError = (err) => {
                 console.error("Model transcriber connection error:", err);
                 this.modelTranscriber.off('error', onError); // Clean up listener
                 reject(new Error("Failed to connect model transcriber"));
            };
            this.modelTranscriber.once('error', onError); // Use once for setup error

            this.modelTranscriber.once('connected', () => { // Use once for setup success
                console.info(`${this.name}: Model speech transcriber connected.`);
                 this.modelTranscriber.off('error', onError); // Clean up error listener on success

                 // Clear previous interval just in case
                 if (this.modelsKeepAliveInterval) clearInterval(this.modelsKeepAliveInterval);

                this.modelsKeepAliveInterval = setInterval(() => {
                    if (this.modelTranscriber && this.modelTranscriber.isConnected) {
                         try {
                            this.modelTranscriber.ws.send(JSON.stringify({ type: 'KeepAlive' }));
                            // console.debug('Sent keep-alive to model speech transcriber');
                         } catch (e) {
                             console.error("Error sending keep-alive to model transcriber:", e);
                         }
                    } else {
                        // Stop interval if no longer connected
                         if (this.modelsKeepAliveInterval) clearInterval(this.modelsKeepAliveInterval);
                         this.modelsKeepAliveInterval = null;
                    }
                }, 10000); // 10 seconds
                resolve();
            });
        });

        // Handle transcriptions (persistent listener)
         this.modelTranscriber.on('transcription', (transcript) => {
            this.emit('transcription', transcript);
            // console.debug('Model speech transcription:', transcript);
        });

         // Handle disconnection (persistent listener)
        this.modelTranscriber.on('disconnected', () => {
            console.warn(`${this.name}: Model speech transcriber disconnected.`);
            if (this.modelsKeepAliveInterval) clearInterval(this.modelsKeepAliveInterval);
            this.modelsKeepAliveInterval = null;
        });

        // Connect and wait for setup
        await this.modelTranscriber.connect();
        await connectionPromise;
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
                              this.userTranscriber.ws.send(JSON.stringify({ type: 'KeepAlive' }));
                             // console.debug('Sent keep-alive to user transcriber');
                          } catch (e) {
                              console.error("Error sending keep-alive to user transcriber:", e);
                          }
                     } else {
                          if (this.userKeepAliveInterval) clearInterval(this.userKeepAliveInterval);
                          this.userKeepAliveInterval = null;
                     }
                 }, 10000);
                 resolve();
             });
         });

         this.userTranscriber.on('transcription', (transcript) => {
             this.emit('user_transcription', transcript);
             // console.debug('User speech transcription:', transcript);
         });

         this.userTranscriber.on('disconnected', () => {
             console.warn(`${this.name}: User speech transcriber disconnected.`);
             if (this.userKeepAliveInterval) clearInterval(this.userKeepAliveInterval);
             this.userKeepAliveInterval = null;
         });

         await this.userTranscriber.connect();
         await connectionPromise;
     }


    // --- Agent Actions ---
    async sendText(text) {
        if (!this.client || !this.connected) {
            console.error(`${this.name}: Cannot send text, not connected.`);
            return;
        }
        try {
             await this.client.sendText(text);
             this.emit('text_sent', text); // Emit event *after* sending
        } catch (error) {
             console.error(`${this.name}: Error sending text:`, error);
             this.emit('error', new Error('Error sending text: ' + error.message));
        }
    }

    async sendAudio(base64Audio) {
         if (!this.client || !this.connected) {
             console.error(`${this.name}: Cannot send audio, not connected.`);
             return;
         }
         try {
             await this.client.sendAudio(base64Audio);
             // Don't emit text_sent here
         } catch (error) {
             console.error(`${this.name}: Error sending audio:`, error);
             this.emit('error', new Error('Error sending audio: ' + error.message));
         }
     }

    async sendImage(base64Image) {
        if (!this.client || !this.connected) {
            console.error(`${this.name}: Cannot send image, not connected.`);
            return;
        }
         try {
            await this.client.sendImage(base64Image);
            // console.debug(`${this.name}: Image sent.`);
             // Maybe emit an 'image_sent' event if needed
         } catch (error) {
            console.error(`${this.name}: Error sending image:`, error);
            this.emit('error', new Error('Error sending image: ' + error.message));
         }
    }

    // --- Media Controls ---
    async startRecording() {
         if (!this.initialized || !this.audioRecorder) {
             console.error(`${this.name}: Cannot start recording, not initialized.`);
             return;
         }
         if (this.audioRecorder.isRecording) {
             console.warn(`${this.name}: Already recording.`);
             return;
         }

        console.info(`${this.name}: Starting audio recording...`);
        // Start recording with callback to send audio data
        await this.audioRecorder.start(async (base64Data) => {
             // Send audio to Gemini
             this.sendAudio(base64Data);

             // Send audio to Deepgram user transcriber if active
            if (this.userTranscriber && this.userTranscriber.isConnected) {
                 try {
                     // Deepgram usually expects raw buffer, not base64
                     // We need to decode base64 first if DeepgramTranscriber doesn't handle it
                     // Assuming AudioRecorder provides ArrayBuffer or similar usable by DeepgramTranscriber.sendAudio
                     // For now, assuming sendAudio handles base64 -> buffer conversion if needed,
                     // or that AudioRecorder callback provides the right format for sendAudio
                     // *** Check DeepgramTranscriber.sendAudio implementation ***
                     // If Deepgram expects ArrayBuffer/Blob/Uint8Array:
                     // const buffer = base64ToArrayBuffer(base64Data); // Need this util
                     // this.userTranscriber.sendAudio(buffer);

                     // If AudioRecorder callback provides Int16Array Buffer directly:
                     // this.userTranscriber.sendAudio(audioData); // Assuming audioData IS the buffer

                     // ** SAFEST ASSUMPTION FOR NOW - Agent sends base64, Deepgram handles it **
                     // (This might be wrong, check DeepgramTranscriber)
                     // -- OR -- modify AudioRecorder callback to provide raw buffer
                      console.warn("Deepgram user transcription sending needs verification of expected audio format (raw vs base64)");
                      // Example: assuming sendAudio expects base64
                      // this.userTranscriber.sendAudio(base64Data);

                 } catch (error) {
                     console.error(`${this.name}: Error sending audio to user transcriber:`, error);
                 }
             }
         });
         console.info(`${this.name}: Audio recording started.`);
    }

    async toggleMic() {
        if (!this.audioRecorder) {
            console.error(`${this.name}: Cannot toggle mic, audio recorder not available.`);
             return;
        }

        // If stream doesn't exist, start recording first
        if (!this.audioRecorder.stream) {
            console.info(`${this.name}: Mic stream not active, starting recording first.`);
            await this.startRecording();
            // startRecording now handles the initial state, no return needed here
            return; // Exit after starting
        }

        // If stream exists, toggle suspension state
        console.info(`${this.name}: Toggling mic suspension...`);
        await this.audioRecorder.toggleMic(); // Handles suspend/resume internally
        console.info(`${this.name}: Mic suspension toggled. Suspended: ${this.audioRecorder.isSuspended}`);
    }

    async startCameraCapture() {
        if (!this.connected) {
            throw new Error(`${this.name}: Must be connected to start camera capture`);
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
                if (!this.cameraManager || !this.cameraManager.isInitialized || !this.connected) {
                     console.warn(`${this.name}: Stopping camera capture interval - conditions not met.`);
                     if(this.cameraInterval) clearInterval(this.cameraInterval);
                     this.cameraInterval = null;
                     return;
                }
                 try {
                    const imageBase64 = await this.cameraManager.capture();
                    this.sendImage(imageBase64);
                 } catch (captureError) {
                     console.error(`${this.name}: Error capturing/sending camera image:`, captureError);
                     // Consider stopping interval on repeated errors
                 }
            }, this.captureInterval);

            console.info(`${this.name}: Camera capture started.`);
            this.emit('camera_started'); // Emit event if needed

        } catch (error) {
             console.error(`${this.name}: Failed to start camera capture:`, error);
             // Attempt cleanup
             if (this.cameraInterval) clearInterval(this.cameraInterval);
             this.cameraInterval = null;
             await this.stopCameraCapture(); // Ensure dispose is called
             // Rethrow or emit error
             this.emit('error', new Error('Failed to start camera capture: ' + error.message));
             throw new Error('Failed to start camera capture: ' + error.message);
        }
    }

    async stopCameraCapture() {
        console.info(`${this.name}: Stopping camera capture...`);
        if (this.cameraInterval) {
            clearInterval(this.cameraInterval);
            this.cameraInterval = null;
        }
        if (this.cameraManager) {
            this.cameraManager.dispose(); // Handles stopping stream and cleanup
        }
        console.info(`${this.name}: Camera capture stopped.`);
        this.emit('camera_stopped'); // Emit event if needed
    }

    async startScreenShare() {
        if (!this.connected) {
            throw new Error(`${this.name}: Must be connected to start screen sharing`);
        }
         if (this.screenInterval) {
             console.warn(`${this.name}: Screen share already running.`);
             return;
         }

        try {
             console.info(`${this.name}: Initializing screen share...`);
            await this.screenManager.initialize(); // Prompts user, sets up stream/video

            console.info(`${this.name}: Starting screen share interval (FPS: ${this.fps})...`);
            if (this.screenInterval) clearInterval(this.screenInterval); // Clear zombie interval

            this.screenInterval = setInterval(async () => {
                 if (!this.screenManager || !this.screenManager.isInitialized || !this.connected) {
                     console.warn(`${this.name}: Stopping screen share interval - conditions not met.`);
                     if(this.screenInterval) clearInterval(this.screenInterval);
                     this.screenInterval = null;
                     // ScreenManager's onStop should have already emitted 'screenshare_stopped' if stream ended
                     return;
                 }
                 try {
                     const imageBase64 = await this.screenManager.capture();
                     this.sendImage(imageBase64);
                 } catch (captureError) {
                     console.error(`${this.name}: Error capturing/sending screen image:`, captureError);
                 }
            }, this.captureInterval);

            console.info(`${this.name}: Screen sharing started.`);
             this.emit('screenshare_started');

        } catch (error) {
             console.error(`${this.name}: Failed to start screen sharing:`, error);
             if (this.screenInterval) clearInterval(this.screenInterval);
             this.screenInterval = null;
             await this.stopScreenShare(); // Ensure dispose is called
             this.emit('error', new Error('Failed to start screen sharing: ' + error.message));
             throw new Error('Failed to start screen sharing: ' + error.message); // Often "Permission denied" if user cancels
        }
    }

    async stopScreenShare() {
        console.info(`${this.name}: Stopping screen sharing...`);
        if (this.screenInterval) {
            clearInterval(this.screenInterval);
            this.screenInterval = null;
        }
        // ScreenManager's dispose is usually called automatically when the user stops sharing
        // via the browser UI, triggering the 'onStop' callback.
        // Calling it manually might be needed if stopping programmatically.
        if (this.screenManager && this.screenManager.isInitialized) {
             this.screenManager.dispose(); // Manually stop stream if needed
        }
        console.info(`${this.name}: Screen sharing stopped.`);
        // Note: 'screenshare_stopped' event is emitted by the onStop callback in constructor
    }

} // End of GeminiAgent class
