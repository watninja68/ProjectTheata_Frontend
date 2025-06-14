import { EventEmitter } from 'eventemitter3'; // Import EventEmitter

/**
 * Establishes a websocket connection to Deepgram API
 * for real-time audio transcription.
 * Inherits from EventEmitter for standardized event handling.
 */
export class DeepgramTranscriber extends EventEmitter { // Extend EventEmitter
    constructor(apiKey, sampleRate) {
        super(); // Call the EventEmitter constructor

        this.apiKey = process.env.REACT_APP_DEEPGRAM_API_KEY;
        this.ws = null;
        this.isConnected = false;
        // this.eventListeners = new Map(); // Removed: Inherited from EventEmitter
        this.sampleRate = sampleRate;
        console.info(`DeepgramTranscriber initialized with sample rate: ${sampleRate}`);
    }

    async connect() {
        try {
            // Ensure sample rate is valid before connecting
            if (!this.sampleRate || typeof this.sampleRate !== 'number' || this.sampleRate <= 0) {
                throw new Error(`Invalid sample rate provided for Deepgram connection: ${this.sampleRate}`);
            }
            // Include necessary parameters in the URL for configuration on connection
            const url = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=${this.sampleRate}&channels=1&model=nova-2&punctuate=true&interim_results=true&endpointing=300`;
            console.info(`Attempting to connect to Deepgram WebSocket: ${url}`);

            // Create WebSocket with authorization token in protocol header
            this.ws = new WebSocket(url, ['token', this.apiKey]);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                this.isConnected = true;
                console.info('Deepgram WebSocket connection established');
                // No need to send a separate 'Configure' message if parameters are in the URL
                this.emit('connected'); // Emit connected event
            };

            this.ws.onmessage = (event) => {
                try {
                    const response = JSON.parse(event.data);

                    if (response.type === 'Results' || response.type === 'UtteranceEnd') {
                        const transcript = response.channel?.alternatives[0]?.transcript;
                        const isFinal = response.is_final;

                        if (transcript && transcript.trim().length > 0) {
                             // Emit only final transcripts for cleaner output
                             if (isFinal) {
                                 // Use inherited emit method
                                 this.emit('transcription', transcript);
                             }
                        }
                    } else if (response.type === 'Metadata') {
                        if (response.speech_final) {
                            // console.debug('Deepgram detected speech_final=true');
                        }
                    } else if (response.type === 'SpeechStarted') {
                        console.debug('Deepgram detected SpeechStarted');
                        this.emit('speech_started'); // Use inherited emit
                    } else {
                        // console.debug('Received other message type:', response.type, response);
                    }

                } catch (error) {
                    console.error('Error processing Deepgram WebSocket message:', error);
                    this.emit('error', new Error('Failed to process Deepgram message: ' + error.message)); // Use inherited emit
                }
            };

            this.ws.onerror = (errorEvent) => {
                console.error('Deepgram WebSocket error occurred.');
                this.emit('error', new Error('Deepgram WebSocket error. Check console for connection details.')); // Use inherited emit
            };

            this.ws.onclose = (closeEvent) => {
                console.warn(`Deepgram WebSocket connection closed. Code: ${closeEvent.code}, Reason: "${closeEvent.reason}", Clean: ${closeEvent.wasClean}`);
                const wasConnected = this.isConnected; // Store previous state
                this.isConnected = false;
                // Emit disconnected only if it was previously connected, to avoid duplicate events on failed connect
                if (wasConnected) {
                   this.emit('disconnected', { code: closeEvent.code, reason: closeEvent.reason }); // Use inherited emit
                }

                 // Optionally emit an error if the close was unclean or had specific codes
                 if (!closeEvent.wasClean || (closeEvent.code >= 1002 && closeEvent.code <= 1014)) {
                     this.emit('error', new Error(`Deepgram WebSocket closed unexpectedly (Code: ${closeEvent.code}, Reason: ${closeEvent.reason || 'N/A'})`)); // Use inherited emit
                 }
            };

        } catch (error) {
            console.error('Error during Deepgram connect setup:', error);
             this.isConnected = false; // Ensure state is false
             this.emit('error', new Error('Deepgram connection setup failed: ' + error.message)); // Use inherited emit
            throw error; // Re-throw to signal connection failure
        }
    }

    sendAudio(audioData) {
        if (!this.ws || !this.isConnected || this.ws.readyState !== WebSocket.OPEN) {
            return; // Fail silently
        }
        try {
             this.ws.send(audioData);
        } catch (sendError) {
             console.error("Error sending audio data to Deepgram:", sendError);
             if (this.ws.bufferedAmount > 1024 * 1024) {
                 console.warn("Deepgram WebSocket buffer full. Audio data may be lost.");
             }
        }
    }

    disconnect() {
        console.info("Disconnecting Deepgram transcriber...");
        if (this.ws) {
            if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
                 try {
                     console.debug("Sending CloseStream message to Deepgram.");
                     this.ws.send(JSON.stringify({ type: 'CloseStream' }));
                 } catch (e) {
                     console.warn("Error sending CloseStream message:", e);
                 }
            }
            // Remove listeners *before* closing
             this.ws.onopen = null;
             this.ws.onmessage = null;
             this.ws.onerror = null;
             this.ws.onclose = null;

             console.debug(`Closing Deepgram WebSocket (readyState: ${this.ws.readyState})...`);
             this.ws.close(1000, "Client initiated disconnect");
        }

         this.ws = null;
         this.isConnected = false;
         this.removeAllListeners(); // Use inherited method to clear listeners
         console.info("Deepgram transcriber resources released.");
    }

    // --- Event Handling Methods Removed ---
    // on(), once(), off(), emit(), removeAllListeners() are now inherited from EventEmitter
}
