/**
 * Establishes a websocket connection to Deepgram API
 * for real-time audio transcription
 * Utilizes Free Tier of Deepgram API
 */
export class DeepgramTranscriber {
    constructor(apiKey, sampleRate) {
        this.apiKey = apiKey;
        this.ws = null;
        this.isConnected = false;
        this.eventListeners = new Map();
        this.sampleRate = sampleRate;
        console.info('DeepgramTranscriber initialized');
    }

    async connect() {
        try {
            const url = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=${this.sampleRate}`;
            console.info('Attempting to connect to Deepgram WebSocket...');
            
            // Create WebSocket with authorization in protocol
            this.ws = new WebSocket(url, ['token', this.apiKey]);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                this.isConnected = true;
                console.info('WebSocket connection established');
                
                const config = {
                    type: 'Configure',
                    features: {
                        model: 'nova-2',
                        language: 'en-US',
                        encoding: 'linear16',
                        sample_rate: this.sampleRate,
                        channels: 1,
                        interim_results: false,
                        punctuate: true,
                        endpointing: 800
                    },
                };
                
                console.debug('Sending configuration:', config);
                this.ws.send(JSON.stringify(config));
                this.emit('connected');
            };

            this.ws.onmessage = (event) => {
                try {
                    // console.debug('Received WebSocket message:', event.data);
                    const response = JSON.parse(event.data);
                    if (response.type === 'Results') {
                        const transcript = response.channel?.alternatives[0]?.transcript;

                        if (transcript) {
                            // console.debug('Received transcript:', transcript);
                            this.emit('transcription', transcript);
                        } else {
                            // console.warn('Received Results message but no transcript found:', response);
                        }

                    } else {
                        // console.debug('Received non-Results message:', response.type);
                    }

                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                    this.emit('error', error);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.emit('error', error);
            };

            this.ws.onclose = () => {
                console.info('WebSocket connection closed');
                this.isConnected = false;
                this.emit('disconnected');
            };

        } catch (error) {
            console.error('Error in connect():', error);
            throw error;
        }
    }

    sendAudio(audioData) {
        if (!this.isConnected) {
            throw new Error('WebSocket is not connected');
        }
        this.ws.send(audioData);
    }

    disconnect() {
        if (this.ws) {
            this.ws.send(JSON.stringify({ type: 'CloseStream' }));
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
        }
    }

    on(eventName, callback) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName).push(callback);
    }

    emit(eventName, data) {
        const listeners = this.eventListeners.get(eventName);
        if (listeners) {
            listeners.forEach(callback => callback(data));
        }
    }
}
