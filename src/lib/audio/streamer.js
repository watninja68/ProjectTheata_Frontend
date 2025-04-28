// src/lib/audio/streamer.js
/**
 * AudioStreamer manages real-time audio playback from a stream of PCM audio chunks.
 * It implements a sophisticated buffering system to ensure smooth playback while
 * handling network jitter and maintaining low latency. The streamer uses Web Audio API
 * for precise timing and efficient audio scheduling.
 */
import { MODEL_SAMPLE_RATE } from '../config/config.js';

export class AudioStreamer {
    /**
     * Creates an AudioStreamer instance with the specified audio context
     * @param {AudioContext} context - Web Audio API context for audio playback
     */
    constructor(context) {
        if (!context || !(context instanceof AudioContext)) {
            throw new Error('Invalid AudioContext provided', { context });
        }
        this.context = context;
        this.audioQueue = [];                           // Queue of audio chunks waiting to be played
        this.isPlaying = false;                         // Playback state
        this._sampleRate = MODEL_SAMPLE_RATE;           // Use configured sample rate
        this.bufferSize = Math.floor(this._sampleRate * 0.32);  // Buffer size (320ms based on sample rate)
        this.processingBuffer = new Float32Array(0);    // Accumulator for incomplete chunks
        this.scheduledTime = 0;                         // Next scheduled audio playback time
        this.gainNode = this.context.createGain();      // Volume control node
        this.isStreamComplete = false;                  // Stream completion flag
        this.checkInterval = null;                      // Interval for checking buffer state
        this.initialBufferTime = 0.05;                  // Initial buffering delay (50ms)
        this.isInitialized = false;                     // Initialization state
        this.endOfQueueAudioSource = null;              // Last audio source in queue
        this.scheduledSources = new Set();              // Track active audio sources
        this.lastScheduleTimeLog = 0;                   // Timestamp for throttling logs

        // Connect gain node to audio output
        this.gainNode.connect(this.context.destination);
        console.info('AudioStreamer initialized', { sampleRate: this._sampleRate });

        // Bind methods
        this.streamAudio = this.streamAudio.bind(this);
        this.scheduleNextBuffer = this.scheduleNextBuffer.bind(this); // Ensure binding for setTimeout/Interval

        // Add context state change listener for debugging
        this.context.onstatechange = () => {
            console.log(`AudioStreamer: Context state changed to: ${this.context.state}`);
            // If suspended while we think we are playing, try to reschedule immediately
            if (this.context.state === 'suspended' && this.isPlaying) {
                console.warn("AudioStreamer: Context suspended unexpectedly. Attempting immediate reschedule check.");
                // Clear existing timeout/interval before trying to reschedule
                if (this.checkInterval) {
                    clearInterval(this.checkInterval);
                    this.checkInterval = null;
                }
                // Use setTimeout to avoid immediate recursion if resume fails instantly
                setTimeout(this.scheduleNextBuffer, 50);
            }
        };
    }

    /**
     * Gets the current sample rate used for audio playback
     * @returns {number} Current sample rate in Hz
     */
    get sampleRate() {
        return this._sampleRate;
    }

    /**
     * Sets a new sample rate and adjusts buffer size accordingly
     * @param {number} value - New sample rate in Hz
     */
    set sampleRate(value) {
        if (!Number.isFinite(value) || value <= 1 || value > 48000) {
            console.warn('Attempt to set invalid sample rate:' + value + '. Must be between 1 and 48000Hz. Using saved sample rate instead:' + this._sampleRate);
            return;
        }
        this._sampleRate = value;
        this.bufferSize = Math.floor(value * 0.32);  // 320ms buffer
        console.info('Sample rate updated', { newRate: value, newBufferSize: this.bufferSize });
    }

    /**
     * Processes incoming PCM16 audio chunks for playback
     * @param {Int16Array|Uint8Array} chunk - Raw PCM16 audio data
     */
    streamAudio(chunk) {
        if (!this.isInitialized) {
            console.warn('AudioStreamer: Not initialized. Call initialize() first.');
            return;
        }
        // Check context state before processing
        if (this.context.state !== 'running') {
             console.warn(`AudioStreamer: Context not running (${this.context.state}) in streamAudio. Attempting resume.`);
             this.context.resume().catch(e => console.error("AudioStreamer: Error resuming context in streamAudio:", e));
             // We might still process and queue, hoping resume succeeds before scheduling
        }

        if (!chunk || !(chunk instanceof Int16Array || chunk instanceof Uint8Array)) {
            console.warn('AudioStreamer: Invalid audio chunk provided', { chunkType: chunk ? chunk.constructor.name : 'null' });
            return;
        }

        try {
            // Convert Int16 samples to Float32 format
            const float32Array = new Float32Array(chunk.length / 2);
            const dataView = new DataView(chunk.buffer);

            for (let i = 0; i < chunk.length / 2; i++) {
                const int16 = dataView.getInt16(i * 2, true);
                float32Array[i] = int16 / 32768;  // Scale to [-1.0, 1.0] range
            }

            // Limit processing buffer size to prevent memory issues
            if (this.processingBuffer.length > this.bufferSize * 8) { // Increased max buffer slightly
                console.warn('AudioStreamer: Processing buffer overflow, resetting', {
                    bufferSize: this.processingBuffer.length,
                    maxSize: this.bufferSize * 8
                });
                this.processingBuffer = new Float32Array(0);
            }

            // Accumulate samples in processing buffer
            const newBuffer = new Float32Array(this.processingBuffer.length + float32Array.length);
            newBuffer.set(this.processingBuffer);
            newBuffer.set(float32Array, this.processingBuffer.length);
            this.processingBuffer = newBuffer;

            // Debugging logs (throttled)
            const now = performance.now();
            if (now - this.lastScheduleTimeLog > 500) { // Log roughly every 500ms
                // console.debug(`AudioStreamer: Received chunk ${chunk.length/2} samples. Processing buffer: ${this.processingBuffer.length}, Queue: ${this.audioQueue.length}`);
                this.lastScheduleTimeLog = now;
            }


            // Split processing buffer into playable chunks
            while (this.processingBuffer.length >= this.bufferSize) {
                const buffer = this.processingBuffer.slice(0, this.bufferSize);
                this.audioQueue.push(buffer);
                this.processingBuffer = this.processingBuffer.slice(this.bufferSize);
            }

            // Start playback scheduling if not already running
            if (!this.isPlaying && this.audioQueue.length > 0) {
                console.info("AudioStreamer: Starting playback scheduling.");
                this.isPlaying = true;
                // Reset scheduled time relative to current time + buffer
                this.scheduledTime = this.context.currentTime + this.initialBufferTime;
                // Clear any previous interval just in case
                if (this.checkInterval) {
                    clearInterval(this.checkInterval);
                    this.checkInterval = null;
                }
                this.scheduleNextBuffer(); // Start the scheduling loop
            } else if (this.isPlaying && this.checkInterval) {
                 // If already playing but was potentially waiting in interval, clear interval and schedule immediately
                 // console.debug("AudioStreamer: New audio arrived while waiting, scheduling immediately.");
                 clearInterval(this.checkInterval);
                 this.checkInterval = null;
                 this.scheduleNextBuffer();
            }

        } catch (error) {
            console.error('AudioStreamer: Error processing audio chunk:', error);
             // Rethrow or emit? Let's log and continue for now to avoid stopping agent
             // throw new Error('Error processing audio chunk:' + error);
        }
    }

    /**
     * Creates an AudioBuffer from Float32 audio data
     * @param {Float32Array} audioData - Audio samples to convert
     * @returns {AudioBuffer} Web Audio API buffer for playback
     */
    createAudioBuffer(audioData) {
        try {
            const audioBuffer = this.context.createBuffer(1, audioData.length, this.sampleRate);
            audioBuffer.getChannelData(0).set(audioData);
            return audioBuffer;
        } catch (error) {
            console.error("AudioStreamer: Error creating audio buffer:", error);
            // Attempt to handle potential context issues
            if (this.context.state !== 'running') {
                 console.warn(`AudioStreamer: Context state is ${this.context.state} during buffer creation. Attempting resume.`);
                 this.context.resume().catch(e => console.error("AudioStreamer: Error resuming context during buffer creation:", e));
            }
            return null; // Indicate failure
        }
    }

    /**
     * Schedules audio buffers for playback with precise timing
     * Implements a look-ahead scheduler to ensure smooth playback
     * Uses setTimeout for efficient CPU usage while maintaining timing accuracy
     */
    async scheduleNextBuffer() {
        // Clear any pending timeout/interval as we are now actively scheduling
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        if (!this.isPlaying) {
            console.debug("AudioStreamer: scheduleNextBuffer called but isPlaying is false. Stopping.");
            return;
        }

        // --- Added: Check context state at the start of scheduling ---
        if (this.context.state !== 'running') {
            console.warn(`AudioStreamer: Context not running (${this.context.state}) at start of scheduleNextBuffer. Attempting resume...`);
            try {
                await this.context.resume();
                console.info("AudioStreamer: Context resumed successfully in scheduleNextBuffer.");
            } catch (resumeError) {
                console.error("AudioStreamer: Failed to resume context in scheduleNextBuffer:", resumeError);
                // Don't reschedule immediately if resume fails, wait for state change or next chunk
                this.isPlaying = false; // Stop playback attempts if context unusable
                 console.error("AudioStreamer: Setting isPlaying to false due to context resume failure.");
                return;
            }
        }
        // --- End of Added Check ---

        const SCHEDULE_AHEAD_TIME = 0.2;  // Look-ahead window in seconds (keep relatively short)
        const MIN_AHEAD_TIME = 0.02;      // Minimum time ahead to schedule (20ms) to prevent scheduling in the past

        try {
            // Schedule buffers within look-ahead window
            while (this.audioQueue.length > 0 && this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD_TIME) {
                const audioData = this.audioQueue.shift();
                const audioBuffer = this.createAudioBuffer(audioData);

                if (!audioBuffer) {
                    console.error("AudioStreamer: Failed to create audio buffer, skipping chunk.");
                    continue; // Skip this chunk if buffer creation failed
                }

                const source = this.context.createBufferSource();

                // Track this source
                this.scheduledSources.add(source);
                source.onended = () => {
                    this.scheduledSources.delete(source);
                     // Additional check: If this was the last source AND the queue is still empty, update endOfQueueAudioSource
                     if (this.endOfQueueAudioSource === source && this.audioQueue.length === 0) {
                         this.endOfQueueAudioSource = null;
                     }
                };

                // Handle completion tracking for last buffer
                if (this.audioQueue.length === 0) {
                    // Remove previous onended listener if a new "last" source is scheduled quickly
                    if (this.endOfQueueAudioSource && this.scheduledSources.has(this.endOfQueueAudioSource)) {
                        this.endOfQueueAudioSource.onended = () => { this.scheduledSources.delete(this.endOfQueueAudioSource); }; // Basic cleanup
                    }
                    this.endOfQueueAudioSource = source;
                    // The onended attached above already handles deletion from scheduledSources
                }

                source.buffer = audioBuffer;
                source.connect(this.gainNode);

                // Ensure accurate playback timing, always scheduling slightly ahead
                // If scheduledTime is too far in the past, reset it closer to currentTime
                if (this.scheduledTime < this.context.currentTime) {
                    console.warn(`AudioStreamer: Scheduled time (${this.scheduledTime.toFixed(3)}) is behind current time (${this.context.currentTime.toFixed(3)}). Resetting.`);
                    this.scheduledTime = this.context.currentTime;
                }

                // Calculate start time, ensuring it's not in the past and has a small buffer
                const startTime = Math.max(this.scheduledTime, this.context.currentTime + MIN_AHEAD_TIME);
                source.start(startTime);

                // Update the next scheduled time
                this.scheduledTime = startTime + audioBuffer.duration;

                // Debugging logs (throttled)
                const now = performance.now();
                 if (now - this.lastScheduleTimeLog > 500) { // Log roughly every 500ms
                    // console.debug(`AudioStreamer: Scheduled chunk. Start: ${startTime.toFixed(3)}, Duration: ${audioBuffer.duration.toFixed(3)}, Next Sched: ${this.scheduledTime.toFixed(3)}, Current: ${this.context.currentTime.toFixed(3)}, Queue: ${this.audioQueue.length}`);
                    this.lastScheduleTimeLog = now;
                 }
            }

            // Handle buffer underrun or stream completion
            if (this.audioQueue.length === 0) {
                 // Check if processing buffer *also* has insufficient data
                 if (this.processingBuffer.length < this.bufferSize) {
                    // console.debug(`AudioStreamer: Audio queue empty and processing buffer small (${this.processingBuffer.length}). Waiting for more data...`);
                    if (this.isStreamComplete) {
                        console.info("AudioStreamer: Stream complete and queue empty. Stopping playback.");
                        this.isPlaying = false;
                        // No need for interval if stream is complete
                    } else if (!this.checkInterval) {
                         // Start checking periodically for new audio data if stream not complete
                         // Use a shorter interval to react faster
                         console.debug("AudioStreamer: Starting check interval (100ms) for new data.");
                         this.checkInterval = setInterval(() => {
                             // Check if new data has arrived or context state changed
                             if (this.audioQueue.length > 0 || this.processingBuffer.length >= this.bufferSize || this.context.state !== 'running') {
                                 // console.debug("AudioStreamer: Check interval detected new data or state change. Rescheduling.");
                                 clearInterval(this.checkInterval);
                                 this.checkInterval = null;
                                 this.scheduleNextBuffer(); // Try scheduling again
                             } else {
                                  // console.debug("AudioStreamer: Check interval - still waiting...");
                             }
                         }, 100); // Check every 100ms
                    }
                 } else {
                      // Processing buffer has enough data, continue processing/scheduling immediately
                      // console.debug("AudioStreamer: Queue empty, but processing buffer has data. Scheduling next.");
                      setTimeout(this.scheduleNextBuffer, 0); // Yield thread briefly
                 }
            } else {
                // Still items in queue, schedule next check based on audio timing
                const timeUntilNextSchedule = (this.scheduledTime - this.context.currentTime - SCHEDULE_AHEAD_TIME) * 1000;
                const timeoutDelay = Math.max(10, timeUntilNextSchedule); // Ensure minimum delay (10ms)
                // console.debug(`AudioStreamer: Rescheduling next buffer check in ${timeoutDelay.toFixed(0)} ms`);
                setTimeout(this.scheduleNextBuffer, timeoutDelay);
            }
        } catch (error) {
            console.error('AudioStreamer: Error scheduling next buffer:', error);
            this.isPlaying = false; // Stop playback on scheduling error
             console.error("AudioStreamer: Setting isPlaying to false due to scheduling error.");
             // Optionally re-throw or emit
             // throw new Error('Error scheduling next buffer:' + error);
        }
    }


    /**
     * Stops audio playback and cleans up resources
     * Implements smooth fade-out and resets audio pipeline
     */
    stop() {
        console.info('AudioStreamer: Stopping audio playback...');
        this.isPlaying = false; // Set flag immediately to prevent rescheduling
        this.isStreamComplete = true; // Assume stream is complete when stop is called explicitly

        // Clear buffer check interval if active
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.debug("AudioStreamer: Check interval cleared during stop.");
        }

        // Use try-catch for stopping sources as context might be closing
        try {
            // Stop all active/scheduled audio sources gracefully
            for (const source of this.scheduledSources) {
                // Check if source and buffer exist before trying to access properties
                if (source && source.buffer) {
                     // Calculate remaining time and stop with a very short fade out
                     const remainingDuration = Math.max(0, source.buffer.duration - (this.context.currentTime - this.scheduledTime + source.buffer.duration));
                     const stopTime = this.context.currentTime + 0.05; // Stop 50ms from now

                     // Check if stopTime is valid (source might not have started)
                     // Note: Accessing playbackState might throw if context is closed
                    try {
                        if (source.playbackState === source.PLAYING_STATE || source.playbackState === source.SCHEDULED_STATE) {
                            source.stop(stopTime);
                        }
                    } catch (e) {
                         console.warn("AudioStreamer: Error checking playbackState/stopping source (context might be closed):", e.message);
                    }
                }
                // Disconnect source regardless of playback state errors
                 try {
                    if (source) source.disconnect();
                 } catch (e) {
                     console.warn("AudioStreamer: Error disconnecting source:", e.message);
                 }
            }
             console.debug(`AudioStreamer: Stopped ${this.scheduledSources.size} scheduled sources.`);
        } catch(e) {
            console.error("AudioStreamer: Error stopping scheduled sources:", e);
        } finally {
             this.scheduledSources.clear(); // Clear the set
        }


        // Clear queues and reset time
        this.audioQueue = [];
        this.processingBuffer = new Float32Array(0);
        this.scheduledTime = 0; // Reset scheduled time
        this.endOfQueueAudioSource = null;


        // Fade out gain node to avoid clicks (use try-catch)
        try {
            if (this.gainNode && this.context.state === 'running') {
                this.gainNode.gain.cancelScheduledValues(this.context.currentTime);
                this.gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.05); // Faster fade
                // Restore gain after fade for next playback
                this.gainNode.gain.linearRampToValueAtTime(1, this.context.currentTime + 0.1);
                 console.debug("AudioStreamer: Gain node faded out.");
            }
        } catch (error) {
            console.warn('AudioStreamer: Error during fade-out (context might be closed):' + error.message);
        }
        console.info("AudioStreamer: Playback stopped.");
    }

    /**
     * Initializes the audio streamer
     * Ensures audio context is active before starting playback
     * @returns {AudioStreamer} This instance for method chaining
     */
    async initialize() {
        try {
            // Attempt to resume context if suspended
            if (this.context.state !== 'running') {
                console.info(`AudioStreamer: Context state is ${this.context.state}. Attempting resume during initialization...`);
                await this.context.resume();
                console.info(`AudioStreamer: Context resumed. New state: ${this.context.state}`);
            }
            // Check state again after potential resume attempt
            if (this.context.state !== 'running') {
                 throw new Error(`AudioContext could not be resumed. Current state: ${this.context.state}`);
            }

            // Reset state variables for initialization/re-initialization
            this.isStreamComplete = false;
            this.audioQueue = [];
            this.processingBuffer = new Float32Array(0);
            this.scheduledTime = this.context.currentTime + this.initialBufferTime; // Start scheduling slightly ahead
            this.gainNode.gain.cancelScheduledValues(this.context.currentTime); // Cancel any ramps
            this.gainNode.gain.setValueAtTime(1, this.context.currentTime); // Set gain immediately
            this.isPlaying = false; // Not playing until first chunk scheduled
            this.isInitialized = true;

            // Clear any lingering interval/sources
             if (this.checkInterval) clearInterval(this.checkInterval);
             this.checkInterval = null;
             this.scheduledSources.forEach(source => { try { source.disconnect(); } catch(e){} });
             this.scheduledSources.clear();


            console.info('AudioStreamer: Initialization complete.');
            return this; // Return instance for chaining

        } catch (error) {
            console.error('AudioStreamer: Failed to initialize:', error);
            this.isInitialized = false; // Ensure state reflects failure
            throw new Error('Failed to initialize AudioStreamer: ' + error.message); // Re-throw
        }
    }

     // Cleanup method to remove context listener
    dispose() {
        console.log("AudioStreamer: Disposing...");
        this.stop(); // Ensure playback is stopped
        if(this.context) {
             this.context.onstatechange = null; // Remove listener
             // We don't close the context here, as it might be shared or managed externally
        }
         // Nullify references
         this.context = null;
         this.gainNode = null;
         this.audioQueue = null;
         this.processingBuffer = null;
         this.scheduledSources = null;
    }
}