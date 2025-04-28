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
        this.audioQueue = [];
        this.isPlaying = false;
        this._sampleRate = MODEL_SAMPLE_RATE;
        this.bufferSize = Math.floor(this._sampleRate * 0.32); // 320ms buffer
        this.processingBuffer = new Float32Array(0);
        this.scheduledTime = 0;
        this.gainNode = this.context.createGain();
        this.isStreamComplete = false;
        this.checkInterval = null;
        this.initialBufferTime = 0.1; // Slightly increased initial buffer (100ms)
        this.isInitialized = false;
        this.endOfQueueAudioSource = null;
        this.scheduledSources = new Set();
        this.lastScheduleTimeLog = 0;
        this.lastContextCheckTime = 0; // Throttle context state checks

        // Connect gain node to audio output
        this.gainNode.connect(this.context.destination);
        console.info('AudioStreamer initialized', { sampleRate: this._sampleRate });

        // Bind methods
        this.streamAudio = this.streamAudio.bind(this);
        this.scheduleNextBuffer = this.scheduleNextBuffer.bind(this);

        // Context state change listener (remains useful for debugging)
        this.context.onstatechange = () => {
            console.log(`AudioStreamer: Context state changed to: ${this.context.state}`);
            if (this.context.state === 'suspended' && this.isPlaying) {
                console.warn("AudioStreamer: Context suspended unexpectedly. Scheduling check.");
                this._clearCheckInterval(); // Clear existing checks
                setTimeout(this.scheduleNextBuffer, 50); // Schedule a check soon
            } else if (this.context.state === 'running' && !this.isPlaying && this.audioQueue.length > 0) {
                 console.log("AudioStreamer: Context became running with queued audio. Triggering scheduling.");
                 this._startPlaybackScheduling(); // Try to start playing if context resumed and queue has items
            }
        };
    }

    /**
     * Ensures the AudioContext is running. Attempts to resume if suspended.
     * @returns {Promise<boolean>} True if the context is running, false otherwise.
     * @private
     */
    async _ensureContextRunning() {
        const now = performance.now();
        // Throttle checks to avoid spamming resume attempts
        if (now - this.lastContextCheckTime < 200) {
            return this.context.state === 'running';
        }
        this.lastContextCheckTime = now;

        if (this.context.state === 'running') {
            return true;
        }

        if (this.context.state === 'suspended') {
            console.warn("AudioStreamer: Context is suspended. Attempting resume...");
            try {
                await this.context.resume();
                console.info("AudioStreamer: Context resumed successfully.");
                return true; // Resumed successfully
            } catch (resumeError) {
                console.error("AudioStreamer: Failed to resume context:", resumeError);
                return false; // Resume failed
            }
        }

        console.error(`AudioStreamer: Context is in an unexpected state: ${this.context.state}`);
        return false; // Context is closed or in an error state
    }

     /**
     * Clears the check interval if it exists.
     * @private
     */
    _clearCheckInterval() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

     /**
     * Starts the playback scheduling loop.
     * @private
     */
     _startPlaybackScheduling() {
        if (!this.isPlaying && this.audioQueue.length > 0) {
            console.info("AudioStreamer: Starting playback scheduling.");
            this.isPlaying = true;
            // Reset scheduled time relative to current time + buffer ONLY if context is running
            if (this.context.state === 'running') {
                this.scheduledTime = this.context.currentTime + this.initialBufferTime;
            } else {
                // If context not running, set based on performance time as placeholder
                this.scheduledTime = performance.now() / 1000 + this.initialBufferTime;
                 console.warn("AudioStreamer: Context not running, setting initial scheduledTime based on performance.now()");
            }
            this._clearCheckInterval();
            this.scheduleNextBuffer(); // Start the scheduling loop
        }
    }


    get sampleRate() { return this._sampleRate; }
    set sampleRate(value) {
        if (!Number.isFinite(value) || value <= 1 || value > 48000) {
            console.warn('Attempt to set invalid sample rate:' + value); return;
        }
        this._sampleRate = value;
        this.bufferSize = Math.floor(value * 0.32);
        console.info('Sample rate updated', { newRate: value });
    }

    async streamAudio(chunk) {
        // 1. Check if initialized (basic sanity check)
        if (!this.isInitialized) {
            console.warn('AudioStreamer: streamAudio called but not initialized. Attempting lazy init.');
            // Attempt a lazy initialization if context seems okay
             if (this.context && this.context.state !== 'closed') {
                 try {
                     await this.initialize();
                 } catch (initError) {
                     console.error("AudioStreamer: Lazy initialization failed:", initError);
                     return; // Don't process if init fails
                 }
             } else {
                 console.error("AudioStreamer: Cannot lazy-initialize, context missing or closed.");
                 return;
             }
        }

        // 2. Validate chunk
        if (!chunk || !(chunk instanceof Int16Array || chunk instanceof Uint8Array)) {
            console.warn('AudioStreamer: Invalid audio chunk provided', { chunkType: chunk ? chunk.constructor.name : 'null' });
            return;
        }

        // 3. Ensure context is running before processing further
        if (!(await this._ensureContextRunning())) {
            console.warn(`AudioStreamer: Context not running in streamAudio, skipping chunk processing.`);
            // Keep chunk in processingBuffer maybe? Or discard? Discarding for now.
            return;
        }

        // 4. Process the chunk
        try {
            const float32Array = new Float32Array(chunk.length / 2);
            const dataView = new DataView(chunk.buffer);
            for (let i = 0; i < chunk.length / 2; i++) {
                float32Array[i] = dataView.getInt16(i * 2, true) / 32768;
            }

            if (this.processingBuffer.length > this.bufferSize * 10) { // Increased max buffer slightly more
                console.warn('AudioStreamer: Processing buffer overflow, resetting');
                this.processingBuffer = new Float32Array(0);
            }

            const newBuffer = new Float32Array(this.processingBuffer.length + float32Array.length);
            newBuffer.set(this.processingBuffer);
            newBuffer.set(float32Array, this.processingBuffer.length);
            this.processingBuffer = newBuffer;

            // Split into playable chunks
            while (this.processingBuffer.length >= this.bufferSize) {
                this.audioQueue.push(this.processingBuffer.slice(0, this.bufferSize));
                this.processingBuffer = this.processingBuffer.slice(this.bufferSize);
            }

            // Start scheduling if not already running and queue has items
            if (!this.isPlaying && this.audioQueue.length > 0) {
                this._startPlaybackScheduling();
            } else if (this.isPlaying && this.checkInterval) {
                 // New audio arrived while waiting in interval, clear interval and schedule immediately
                 this._clearCheckInterval();
                 this.scheduleNextBuffer();
            }

        } catch (error) {
            console.error('AudioStreamer: Error processing audio chunk:', error);
        }
    }

    createAudioBuffer(audioData) {
        // Don't check context state here, assume it's checked before calling
        try {
            // Ensure context is available and not closed
            if (!this.context || this.context.state === 'closed') {
                 console.error("AudioStreamer: Cannot create buffer, context missing or closed.");
                 return null;
            }
            const audioBuffer = this.context.createBuffer(1, audioData.length, this.sampleRate);
            audioBuffer.getChannelData(0).set(audioData);
            return audioBuffer;
        } catch (error) {
            console.error("AudioStreamer: Error creating audio buffer:", error);
             // Check state again on error, might have closed during creation
             if (this.context && this.context.state !== 'running') {
                 console.warn(`AudioStreamer: Context state is ${this.context.state} during buffer creation.`);
             }
            return null;
        }
    }

    async scheduleNextBuffer() {
        this._clearCheckInterval(); // Clear interval as we are actively scheduling

        if (!this.isPlaying) {
            console.debug("AudioStreamer: scheduleNextBuffer called but isPlaying is false. Stopping.");
            return;
        }

        // Ensure context is running before scheduling anything
        if (!(await this._ensureContextRunning())) {
            console.warn(`AudioStreamer: Context not running at start of scheduleNextBuffer. Waiting...`);
            // If context couldn't be resumed, start the check interval to try again later
            if (!this.checkInterval) {
                this.checkInterval = setInterval(this.scheduleNextBuffer, 200); // Check every 200ms
            }
            return;
        }

        // Ensure streamer is initialized (might have been reset if context restarted)
        if (!this.isInitialized) {
             console.warn("AudioStreamer: Not initialized in scheduleNextBuffer. Attempting re-init.");
             try {
                 await this.initialize();
             } catch (initError) {
                 console.error("AudioStreamer: Failed to re-initialize:", initError);
                 this.isPlaying = false; // Stop if init fails
                 return;
             }
        }


        const SCHEDULE_AHEAD_TIME = 0.2;
        const MIN_AHEAD_TIME = 0.05; // Increased minimum lookahead

        try {
            // Schedule buffers within look-ahead window
            while (this.audioQueue.length > 0 && this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD_TIME) {
                const audioData = this.audioQueue.shift();
                const audioBuffer = this.createAudioBuffer(audioData);

                if (!audioBuffer) {
                    console.error("AudioStreamer: Failed to create audio buffer, skipping chunk.");
                    continue;
                }

                const source = this.context.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.gainNode); // Ensure connection is made

                // Track scheduled source
                this.scheduledSources.add(source);
                source.onended = () => {
                    this.scheduledSources.delete(source);
                    // Safe disconnect on ended
                     try { source.disconnect(); } catch (e) {}
                    if (this.endOfQueueAudioSource === source && this.audioQueue.length === 0) {
                        this.endOfQueueAudioSource = null;
                    }
                };

                // Handle completion tracking for last buffer
                if (this.audioQueue.length === 0) {
                    if (this.endOfQueueAudioSource && this.scheduledSources.has(this.endOfQueueAudioSource)) {
                         // Basic cleanup for previous last source
                         this.endOfQueueAudioSource.onended = () => {
                             this.scheduledSources.delete(this.endOfQueueAudioSource);
                              try { this.endOfQueueAudioSource.disconnect(); } catch(e) {}
                         };
                    }
                    this.endOfQueueAudioSource = source;
                }


                // --- Timing Calculation ---
                // Ensure scheduledTime is not in the past relative to the AudioContext's clock
                 if (this.scheduledTime < this.context.currentTime) {
                     console.warn(`AudioStreamer: Scheduled time (${this.scheduledTime.toFixed(3)}) was behind current time (${this.context.currentTime.toFixed(3)}). Adjusting.`);
                     // Reset based on current time plus a minimum buffer
                     this.scheduledTime = this.context.currentTime + MIN_AHEAD_TIME;
                 }

                 // Calculate start time, ensuring it's slightly ahead of the current time
                 const startTime = Math.max(this.scheduledTime, this.context.currentTime + MIN_AHEAD_TIME);

                try {
                     source.start(startTime);
                     // Update the next scheduled time based on when this one *actually* starts + duration
                     this.scheduledTime = startTime + audioBuffer.duration;
                 } catch (startError) {
                     console.error(`AudioStreamer: Error starting source node at ${startTime.toFixed(3)} (current: ${this.context.currentTime.toFixed(3)}):`, startError);
                     // If start fails, don't advance scheduledTime based on this buffer
                     this.scheduledSources.delete(source); // Remove from tracking
                     continue; // Try the next buffer if available
                 }

                // Log scheduling details occasionally
                const nowPerf = performance.now();
                if (nowPerf - this.lastScheduleTimeLog > 1000) {
                     console.debug(`AudioStreamer: Scheduled chunk. Start: ${startTime.toFixed(3)}, Next: ${this.scheduledTime.toFixed(3)}, Current: ${this.context.currentTime.toFixed(3)}, Queue: ${this.audioQueue.length}`);
                    this.lastScheduleTimeLog = nowPerf;
                }
            } // End while loop

            // Handle buffer underrun or stream completion
            if (this.audioQueue.length === 0) {
                if (this.processingBuffer.length < this.bufferSize) {
                    if (this.isStreamComplete) {
                        console.info("AudioStreamer: Stream complete and queue empty. Stopping playback.");
                        this.isPlaying = false;
                    } else if (!this.checkInterval) {
                         console.debug("AudioStreamer: Queue empty, processing buffer small. Starting check interval (150ms).");
                         this.checkInterval = setInterval(this.scheduleNextBuffer, 150); // Check slightly less often
                    }
                } else {
                    // Processing buffer has enough data, continue processing/scheduling
                    setTimeout(this.scheduleNextBuffer, 10); // Yield thread briefly
                }
            } else {
                // Still items in queue, schedule next check based on when the current lookahead window ends
                 const timeUntilNextScheduleNeeded = Math.max(0, this.scheduledTime - this.context.currentTime - SCHEDULE_AHEAD_TIME);
                 const timeoutDelay = Math.max(50, timeUntilNextScheduleNeeded * 1000); // Minimum 50ms delay
                 // console.debug(`AudioStreamer: Rescheduling next buffer check in ${timeoutDelay.toFixed(0)} ms`);
                 setTimeout(this.scheduleNextBuffer, timeoutDelay);
            }
        } catch (error) {
            console.error('AudioStreamer: Error scheduling next buffer:', error);
            this.isPlaying = false;
            console.error("AudioStreamer: Setting isPlaying to false due to scheduling error.");
        }
    }


    /**
     * Stops audio playback and cleans up resources
     * Implements smooth fade-out and resets audio pipeline
     */
    stop() {
        console.info('AudioStreamer: Stopping audio playback...');
        this.isPlaying = false;
        this.isStreamComplete = true; // Assume stream is complete when stop is called explicitly
        this._clearCheckInterval();

        // Use try-catch for stopping sources
        try {
            for (const source of this.scheduledSources) {
                try {
                    // Check if stop method exists and node hasn't already finished
                    if (source && typeof source.stop === 'function') {
                         // Check buffer before accessing duration
                         const duration = source.buffer ? source.buffer.duration : 0;
                         // Check context state before accessing currentTime
                         const currentTime = this.context.state === 'running' ? this.context.currentTime : performance.now() / 1000;

                         // Calculate a safe stop time slightly in the future
                         const stopTime = currentTime + 0.05;

                         source.stop(stopTime);
                    }
                     // Always disconnect
                     if (source) source.disconnect();
                } catch (e) {
                     // Ignore errors often caused by stopping already stopped/finished nodes or closed context
                     // console.warn("AudioStreamer: Error stopping/disconnecting source (ignorable):", e.message);
                     // Still try to disconnect if stop failed
                     try { if (source) source.disconnect(); } catch (e2) {}
                }
            }
             console.debug(`AudioStreamer: Processed stop/disconnect for ${this.scheduledSources.size} scheduled sources.`);
        } catch(e) {
            console.error("AudioStreamer: Error iterating scheduled sources during stop:", e);
        } finally {
             this.scheduledSources.clear();
        }


        // Clear queues and reset time
        this.audioQueue = [];
        this.processingBuffer = new Float32Array(0);
        this.scheduledTime = 0;
        this.endOfQueueAudioSource = null;

        // Fade out gain node (use try-catch)
        try {
            if (this.gainNode && this.context.state === 'running') {
                const now = this.context.currentTime;
                this.gainNode.gain.cancelScheduledValues(now);
                // Ramp down quickly, then restore for next use
                this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now); // Start from current value
                this.gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
                this.gainNode.gain.linearRampToValueAtTime(1, now + 0.1); // Restore gain slightly later
                 console.debug("AudioStreamer: Gain node faded out and scheduled restore.");
            } else {
                 console.debug("AudioStreamer: Skipping gain node fade (not running or node missing).");
            }
        } catch (error) {
            console.warn('AudioStreamer: Error during gain node fade-out:', error.message);
        }
        console.info("AudioStreamer: Playback stopped.");
    }

    /**
     * Initializes the audio streamer
     * Ensures audio context is active before starting playback
     * @returns {Promise<AudioStreamer>} This instance for method chaining
     */
    async initialize() {
        console.log("AudioStreamer: Initializing...");
        // 1. Ensure context is running
        if (!(await this._ensureContextRunning())) {
             // If context couldn't start/resume, initialization fails.
             this.isInitialized = false;
             throw new Error(`AudioContext could not be started or resumed. Current state: ${this.context.state}`);
        }

        // 2. Reset state variables
        this.isStreamComplete = false;
        this.audioQueue = [];
        this.processingBuffer = new Float32Array(0);
        // Reset scheduled time relative to current time ONLY if context is running
        this.scheduledTime = this.context.state === 'running'
            ? this.context.currentTime + this.initialBufferTime
            : performance.now() / 1000 + this.initialBufferTime;
        this.isPlaying = false; // Not playing until first chunk scheduled
        this._clearCheckInterval();

        // 3. Reset Gain Node
        try {
             if (this.gainNode && this.context.state === 'running') {
                 const now = this.context.currentTime;
                 this.gainNode.gain.cancelScheduledValues(now);
                 this.gainNode.gain.setValueAtTime(1, now); // Set gain to 1 immediately
             }
        } catch (e) {
             console.warn("AudioStreamer: Error resetting gain node:", e.message);
        }

        // 4. Clear any lingering scheduled sources
         try {
            this.scheduledSources.forEach(source => {
                 try { source.disconnect(); } catch(e){}
            });
         } finally {
             this.scheduledSources.clear();
         }
         this.endOfQueueAudioSource = null;


        // 5. Mark as initialized
        this.isInitialized = true;
        console.info('AudioStreamer: Initialization complete.');
        return this; // Return instance for chaining
    }

     // Cleanup method to remove context listener
    dispose() {
        console.log("AudioStreamer: Disposing...");
        this.stop(); // Ensure playback is stopped
        if(this.context) {
             this.context.onstatechange = null; // Remove listener
             // Context closure is handled by Agent
        }
        this.removeAllListeners(); // Clear EventEmitter listeners
        this._clearCheckInterval();

         // Nullify references
         this.context = null;
         this.gainNode = null;
         this.audioQueue = null;
         this.processingBuffer = null;
         this.scheduledSources = null;
         this.isInitialized = false;
    }
}