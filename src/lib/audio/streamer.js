// src/lib/audio/streamer.js
/**
 * AudioStreamer manages real-time audio playback from a stream of PCM audio chunks.
 * It implements a sophisticated buffering system to ensure smooth playback while
 * handling network jitter and maintaining low latency. The streamer uses Web Audio API
 * for precise timing and efficient audio scheduling.
 */
import { MODEL_SAMPLE_RATE } from '../config/config.js';

export class AudioStreamer {
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
        this.scheduledTime = 0; // Time when the next buffer *should* start playing
        this.isStreamComplete = false; // Flag if the source stream has ended
        this.checkInterval = null; // Interval timer for checking buffer status
        this.initialBufferTime = 0.15; // Slightly increased initial buffer (150ms)
        this.minBufferAheadTime = 0.08; // Minimum time ahead to schedule (80ms)
        this.maxBufferAheadTime = 0.3; // Maximum time ahead to schedule (300ms)
        this.isInitialized = false;
        this.endOfQueueAudioSource = null; // Tracks the last scheduled source
        this.scheduledSources = new Set(); // Keep track of active sources
        this.lastScheduleTimeLog = 0;
        this.lastContextCheckTime = 0;
        this.isScheduling = false; // Flag to prevent re-entrant scheduling calls
        this.isDisposed = false; // **FIX:** Flag to track disposal state

        // --- Nodes ---
        this.gainNode = this.context.createGain();
        this.analyserTapNode = this.context.createGain();
        this.analyserTapNode.gain.value = 1.0;

        // --- Connections ---
        this._ensureConnections(); // Attempt initial connections

        console.info('AudioStreamer initialized', { sampleRate: this._sampleRate });

        // Bind methods
        this.streamAudio = this.streamAudio.bind(this);
        this.scheduleNextBuffer = this.scheduleNextBuffer.bind(this);
        this._handleContextStateChange = this._handleContextStateChange.bind(this);

        // Context state change listener
        this.context.addEventListener('statechange', this._handleContextStateChange);
    }

    _handleContextStateChange() {
        if (this.isDisposed) return; // Don't handle if disposed

        const newState = this.context.state;
        console.log(`AudioStreamer: Context state changed to: ${newState}`);

        if (newState === 'running') {
            this._ensureConnections(); // Re-verify connections
            // If playback was intended but context was suspended, try scheduling again
            if (this.isPlaying && !this.isScheduling) {
                console.log("AudioStreamer: Context became running. Triggering scheduling check.");
                // Reset scheduledTime relative to NOW to avoid playing catch-up too aggressively
                this.scheduledTime = this.context.currentTime + this.minBufferAheadTime;
                this.scheduleNextBuffer();
            }
        } else if (newState === 'suspended' || newState === 'interrupted') {
            console.warn(`AudioStreamer: Context state is ${newState}. Playback scheduling paused.`);
             // Clear any check interval, as scheduleNextBuffer won't proceed anyway
             this._clearCheckInterval();
        } else if (newState === 'closed') {
            console.warn("AudioStreamer: Context closed. Stopping playback and cleaning up.");
            this.stop(); // Stop fully if context closes
        }
    }

    _ensureConnections() {
        if (this.isDisposed) return;
        try {
            // Only connect if context is not closed
            if (this.context && this.context.state !== 'closed') {
                // Disconnect first to be safe (doesn't harm if not connected)
                try { this.gainNode.disconnect(); } catch(e) {}
                try { this.analyserTapNode.disconnect(); } catch(e) {}

                // Reconnect
                this.gainNode.connect(this.context.destination);
                this.gainNode.connect(this.analyserTapNode);
                console.debug('AudioStreamer: Nodes reconnected.');
            } else {
                console.warn('AudioStreamer: Cannot ensure connections, context closed or missing.');
            }
        } catch (e) {
            console.error("AudioStreamer: Error trying to ensure connections:", e);
        }
    }

    async _ensureContextRunning() {
        if (this.isDisposed || !this.context) return false;

        const now = performance.now();
        if (now - this.lastContextCheckTime < 100) { // Throttle slightly less aggressively
            return this.context.state === 'running';
        }
        this.lastContextCheckTime = now;

        if (this.context.state === 'running') { return true; }

        if (this.context.state === 'suspended' || this.context.state === 'interrupted') {
            console.warn(`AudioStreamer: Context is ${this.context.state}. Attempting resume...`);
            try {
                await this.context.resume();
                // Check state AGAIN after resume attempt
                if (this.context.state === 'running') {
                    console.info("AudioStreamer: Context resumed successfully.");
                    // ** CRITICAL: Reset scheduledTime after successful resume **
                    // This prevents scheduling based on potentially old timing.
                    this.scheduledTime = this.context.currentTime + this.initialBufferTime;
                    console.log(`AudioStreamer: Reset scheduledTime after resume to ${this.scheduledTime.toFixed(3)}`);
                    return true;
                } else {
                     console.warn(`AudioStreamer: Context state still ${this.context.state} after resume attempt.`);
                     return false;
                }
            } catch (resumeError) {
                console.error("AudioStreamer: Failed to resume context:", resumeError);
                return false;
            }
        }
        // Handle closed state
        if (this.context.state === 'closed') {
             console.error("AudioStreamer: Context is closed. Cannot run.");
             this.stop(); // Ensure cleanup if context closes unexpectedly
             return false;
        }

        console.error(`AudioStreamer: Context in unexpected state: ${this.context.state}`);
        return false;
    }

    _clearCheckInterval() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
             // console.debug("AudioStreamer: Cleared check interval.");
        }
    }

    _startPlaybackScheduling() {
        if (this.isDisposed) return;
        if (!this.isPlaying && this.audioQueue.length > 0) {
            console.info("AudioStreamer: Starting playback scheduling.");
            this.isPlaying = true;

             // Reset scheduledTime only if context is running, otherwise it gets set on resume
             if (this.context.state === 'running') {
                 this.scheduledTime = this.context.currentTime + this.initialBufferTime;
                 console.log(`AudioStreamer: Initial scheduledTime set to ${this.scheduledTime.toFixed(3)}`);
             } else {
                 this.scheduledTime = 0; // Reset, will be set properly on resume
                 console.warn("AudioStreamer: Context not running, initial scheduledTime will be set on resume.");
             }

            this._clearCheckInterval();
            this.scheduleNextBuffer(); // Start the scheduling loop
        }
    }

    get sampleRate() { return this._sampleRate; }
    set sampleRate(value) {
        if (this.isDisposed) return;
        if (!Number.isFinite(value) || value <= 1 || value > 48000) {
            console.warn('Attempt to set invalid sample rate:' + value); return;
        }
        this._sampleRate = value;
        this.bufferSize = Math.floor(value * 0.32);
        console.info('Sample rate updated', { newRate: value });
    }

    async streamAudio(chunk) {
        if (this.isDisposed) return;
        if (!this.isInitialized) {
            console.warn('AudioStreamer: streamAudio called but not initialized. Attempting lazy init.');
            if (this.context && this.context.state !== 'closed') {
                try { await this.initialize(); }
                catch (initError) { console.error("AudioStreamer: Lazy initialization failed:", initError); return; }
            } else { console.error("AudioStreamer: Cannot lazy-initialize, context missing or closed."); return; }
        }

        if (!chunk || !(chunk instanceof Int16Array || chunk instanceof Uint8Array)) {
            console.warn('AudioStreamer: Invalid audio chunk provided', { chunkType: chunk ? chunk.constructor.name : 'null' });
            return;
        }

        // We don't need to explicitly ensure context is running here,
        // as scheduleNextBuffer will handle it. Add chunk to processing buffer directly.

        try {
            // --- Convert Int16 (assuming Uint8Array is view on Int16 buffer) to Float32 ---
            // Ensure correct handling based on input type if necessary
            const numSamples = chunk.byteLength / 2; // Assuming Int16
            const float32Array = new Float32Array(numSamples);
            const dataView = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
            for (let i = 0; i < numSamples; i++) {
                 // Divide by 32768.0 for Float32 range [-1.0, 1.0)
                float32Array[i] = dataView.getInt16(i * 2, true) / 32768.0;
            }
            // --- End Conversion ---


            // Simple overflow check for processing buffer
            if (this.processingBuffer.length > this.sampleRate * 5) { // Limit to 5 seconds
                console.warn(`AudioStreamer: Processing buffer exceeded limit (${this.processingBuffer.length} samples), resetting.`);
                this.processingBuffer = float32Array; // Replace with new chunk
            } else {
                 // Append new chunk to existing buffer
                const newBuffer = new Float32Array(this.processingBuffer.length + float32Array.length);
                newBuffer.set(this.processingBuffer, 0);
                newBuffer.set(float32Array, this.processingBuffer.length);
                this.processingBuffer = newBuffer;
            }

            // Process into fixed-size queue items
            while (this.processingBuffer.length >= this.bufferSize) {
                this.audioQueue.push(this.processingBuffer.slice(0, this.bufferSize));
                this.processingBuffer = this.processingBuffer.slice(this.bufferSize);
            }

            // Trigger scheduling if needed
            if (!this.isPlaying && this.audioQueue.length > 0) {
                this._startPlaybackScheduling();
            } else if (this.isPlaying && !this.isScheduling) {
                 // If already playing but not actively scheduling, give it a nudge
                 // This helps if it paused waiting for data or context resume
                 this.scheduleNextBuffer();
            }

        } catch (error) {
            console.error('AudioStreamer: Error processing/queueing audio chunk:', error);
        }
    }

    createAudioBuffer(audioData) {
        if (this.isDisposed) return null;
        // Check context state *before* creating buffer
        if (!this.context || this.context.state !== 'running') {
             console.warn(`AudioStreamer: Cannot create buffer, context state is ${this.context?.state || 'missing'}.`);
             return null;
        }
        try {
            const audioBuffer = this.context.createBuffer(1, audioData.length, this.sampleRate);
            // Use copyToChannel for potentially better performance/clarity
            audioBuffer.copyToChannel(audioData, 0);
            // Fallback: audioBuffer.getChannelData(0).set(audioData);
            return audioBuffer;
        } catch (error) {
            console.error(`AudioStreamer: Error creating audio buffer (State: ${this.context.state}):`, error);
            return null;
        }
    }

    // --- Core Scheduling Logic ---
    async scheduleNextBuffer() {
        // **FIX:** Check dispose flag first
        if (this.isDisposed) {
            console.debug("AudioStreamer: scheduleNextBuffer called on disposed instance.");
            this.isScheduling = false; // Ensure lock is released if somehow set
            return;
        }

        // Prevent multiple concurrent scheduling attempts
        if (this.isScheduling) {
             // console.debug("AudioStreamer: scheduleNextBuffer already running, skipping.");
            return;
        }
        this.isScheduling = true;
        this._clearCheckInterval(); // Clear any pending interval checks

        try {
            // ** CRITICAL: Check context state at the beginning **
            if (!(await this._ensureContextRunning())) {
                console.warn(`AudioStreamer: Context not running in scheduleNextBuffer. Scheduling check and exiting.`);
                // If context isn't running, schedule a check and stop this execution
                if (!this.checkInterval) { this.checkInterval = setInterval(this.scheduleNextBuffer, 250); }
                this.isScheduling = false; // Release lock
                return;
            }

            // Ensure initialization is complete
             if (!this.isInitialized) {
                 console.warn("AudioStreamer: scheduleNextBuffer called but not initialized. Attempting init.");
                 try {
                     await this.initialize();
                     if (!this.isInitialized) { // Check again after attempt
                          throw new Error("Re-initialization failed within scheduleNextBuffer.");
                     }
                 } catch (initError) {
                     console.error("AudioStreamer: Failed to re-initialize in scheduleNextBuffer:", initError);
                     this.isPlaying = false;
                     this.isScheduling = false; // Release lock
                     return;
                 }
             }

            // --- Scheduling Loop ---
            while (this.audioQueue.length > 0) {
                // Re-check dispose flag and context state inside the loop
                if (this.isDisposed) {
                    console.debug("AudioStreamer: Disposed during scheduling loop. Breaking.");
                    break;
                }
                if (this.context.state !== 'running') {
                     console.warn("AudioStreamer: Context stopped running during scheduling loop. Breaking.");
                     if (!this.checkInterval) { this.checkInterval = setInterval(this.scheduleNextBuffer, 250); }
                     break; // Exit the while loop
                }

                // Check if we need to schedule more based on timing
                const currentTime = this.context.currentTime;
                if (this.scheduledTime >= currentTime + this.maxBufferAheadTime) {
                    // console.debug(`AudioStreamer: Scheduled far enough ahead (${(this.scheduledTime - currentTime).toFixed(3)}s). Pausing scheduling.`);
                    break; // Exit the while loop, schedule is full enough
                }

                // --- Prepare and Schedule One Buffer ---
                const audioData = this.audioQueue.shift();
                const audioBuffer = this.createAudioBuffer(audioData);

                if (!audioBuffer) {
                    console.error("AudioStreamer: Failed to create audio buffer, skipping chunk.");
                    continue; // Skip this chunk and try the next
                }

                const source = this.context.createBufferSource();
                source.buffer = audioBuffer;

                //source.playbackRate.value = 1.1;
                try {
                    source.connect(this.gainNode); // Connect to main gain node
                } catch (connectError) {
                    console.error("AudioStreamer: Error connecting source node:", connectError);
                    continue; // Skip this chunk
                }

                this.scheduledSources.add(source);
                source.onended = () => {
                    if (this.isDisposed || !this.scheduledSources) return;
                    this.scheduledSources.delete(source);
                    try { source.disconnect(); } catch (e) {/* ignore disconnect errors */}
                    // If this was the very last source, clear the tracker
                    if (this.endOfQueueAudioSource === source) {
                         this.endOfQueueAudioSource = null;
                         // console.debug("AudioStreamer: EndOfQueueAudioSource finished.");
                    }
                };

                // Track the last source added to the schedule
                this.endOfQueueAudioSource = source;

                // --- Precise Start Time Calculation ---
                // Ensure scheduledTime is not in the past relative to current time
                // Always schedule at least minBufferAheadTime in the future
                let startTime = Math.max(currentTime + this.minBufferAheadTime, this.scheduledTime);

                 // Sanity check: If calculated startTime is still somehow behind current time (e.g., due to loop delay), force it ahead.
                 if (startTime <= currentTime) {
                      console.warn(`AudioStreamer: Calculated startTime ${startTime.toFixed(3)} was <= currentTime ${currentTime.toFixed(3)}. Adjusting.`);
                      startTime = currentTime + this.minBufferAheadTime;
                 }

                try {
                    source.start(startTime);
                    // Update scheduledTime for the *next* buffer
                    this.scheduledTime = startTime + audioBuffer.duration;

                    // Log scheduling info periodically
                     const nowPerf = performance.now();
                     if (nowPerf - this.lastScheduleTimeLog > 1500) { // Log every 1.5 seconds
                         console.debug(`AudioStreamer: Scheduled chunk. Start: ${startTime.toFixed(3)}, NextSched: ${this.scheduledTime.toFixed(3)}, CT: ${currentTime.toFixed(3)}, Queue: ${this.audioQueue.length}`);
                         this.lastScheduleTimeLog = nowPerf;
                     }
                } catch (startError) {
                    console.error(`AudioStreamer: Error starting source node at ${startTime.toFixed(3)} (CurrentTime: ${currentTime.toFixed(3)}):`, startError);
                    // Clean up the failed source node
                    if (this.scheduledSources) this.scheduledSources.delete(source); // Check if set exists
                    try { source.disconnect(); } catch(e) {}
                    if (this.endOfQueueAudioSource === source) { this.endOfQueueAudioSource = null; }
                    continue; // Try next buffer
                }
            } // --- End while loop ---

            // --- Determine Next Action After Loop ---
            // Add dispose check before determining next action
            if (this.isDisposed) {
                 console.debug("AudioStreamer: Disposed after scheduling loop.");
                 this.isScheduling = false;
                 return;
            }

            if (this.audioQueue.length === 0) {
                // Queue is empty, check processing buffer
                if (this.processingBuffer.length > 0) {
                     // Still data in processing buffer, try scheduling again shortly
                     // console.debug("AudioStreamer: Queue empty but processing buffer has data. Rescheduling soon.");
                     setTimeout(this.scheduleNextBuffer, 50); // Check again soon
                } else if (this.isStreamComplete) {
                     // Queue and buffer empty, and stream is marked complete
                     console.info("AudioStreamer: Stream complete and queue empty. Stopping playback check.");
                     // Check if the last scheduled source is still playing
                     if (!this.endOfQueueAudioSource && this.scheduledSources?.size === 0) { // Added check for scheduledSources existence
                          console.info("AudioStreamer: All scheduled sources finished. Setting isPlaying=false.");
                          this.isPlaying = false;
                     } else {
                          // Wait for the last source(s) to finish, onended will handle final state.
                          // console.debug("AudioStreamer: Stream complete, waiting for last scheduled sources to finish.");
                     }
                } else {
                    // Queue empty, buffer empty, but stream not complete - wait for more data
                     // console.debug("AudioStreamer: Buffer empty, waiting for more audio data...");
                     // Schedule a periodic check in case data arrives without triggering scheduleNextBuffer
                     if (!this.checkInterval) { this.checkInterval = setInterval(this.scheduleNextBuffer, 200); }
                }
            } else {
                // Queue still has items, but we stopped scheduling because we're far enough ahead.
                // Schedule the next check based on when the current buffer runs out.
                const timeUntilNextScheduleNeeded = Math.max(0, this.scheduledTime - this.context.currentTime - this.maxBufferAheadTime + this.minBufferAheadTime);
                const timeoutDelay = Math.max(50, timeUntilNextScheduleNeeded * 1000); // Wait at least 50ms
                // console.debug(`AudioStreamer: Scheduling next check in ${timeoutDelay.toFixed(0)}ms.`);
                setTimeout(this.scheduleNextBuffer, timeoutDelay);
            }

        } catch (error) {
            console.error('AudioStreamer: Uncaught error in scheduleNextBuffer:', error);
            this.isPlaying = false; // Stop playback on major error
            // **FIX:** Check isDisposed before calling stop again
            if (!this.isDisposed) {
                 this.stop(); // Attempt full cleanup only if not already disposed
            }
        } finally {
            this.isScheduling = false; // Release the scheduling lock
        }
    }

    stop() {
        // **FIX:** Check dispose flag first
        if (this.isDisposed) {
            console.debug("AudioStreamer: stop called on disposed instance.");
            return;
        }
        console.info('AudioStreamer: Stopping audio playback...');
        this.isPlaying = false;
        this.isStreamComplete = true; // Mark stream as complete on explicit stop
        this._clearCheckInterval();
        this.isScheduling = false; // Ensure scheduling lock is released

        try {
            // **FIX:** Check if scheduledSources exists before operating on it
            if (this.scheduledSources) {
                // Stop all currently scheduled sources gracefully
                const currentTime = this.context?.state === 'running' ? this.context.currentTime : performance.now() / 1000;
                const stopTime = currentTime + 0.05; // Stop slightly in the future

                this.scheduledSources.forEach(source => {
                    try {
                        if (source && typeof source.stop === 'function') {
                            // Check if start() has been called before calling stop()
                            // This property check is a bit of a guess, might need adjustment
                            // A safer approach might be to track sources that have been started.
                            // For now, try/catch is the main defense.
                            source.stop(stopTime);
                        }
                        // Disconnect might throw if already disconnected by onended
                         try { source.disconnect(); } catch (e) {}
                    } catch (e) {
                        console.warn("AudioStreamer: Error stopping/disconnecting source during stop:", e.message);
                         try { source.disconnect(); } catch (e2) {}
                    }
                });
                 this.scheduledSources.clear(); // Clear the set after iterating
            } else {
                 console.warn("AudioStreamer: scheduledSources is null during stop, cannot clear.");
            }
        } catch(e) {
            console.error("AudioStreamer: Error iterating/clearing scheduled sources during stop:", e);
        }

        // Clear internal buffers and state
        this.audioQueue = [];
        this.processingBuffer = new Float32Array(0);
        this.scheduledTime = 0;
        this.endOfQueueAudioSource = null;

        // Fade out main gain node if context is running
        try {
            // **FIX:** Add guard checks for gainNode and context
            if (this.gainNode && this.context?.state === 'running') {
                const now = this.context.currentTime;
                this.gainNode.gain.cancelScheduledValues(now);
                // Set current value explicitly before ramping
                this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
                this.gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
                // Optionally reset gain to 1 after a delay for next use
                 this.gainNode.gain.setValueAtTime(1, now + 0.1);
            } else if (this.gainNode) {
                 // If context not running or missing, just reset gain value directly
                 this.gainNode.gain.value = 1;
            }
        } catch (error) {
            console.warn('AudioStreamer: Error during gain node fade-out/reset:', error.message);
        }

        console.info("AudioStreamer: Playback stopped and resources cleared.");
    }

    async initialize() {
        if (this.isDisposed) throw new Error("Cannot initialize a disposed AudioStreamer.");
        console.log("AudioStreamer: Initializing...");
        this.isInitialized = false; // Mark as not initialized until success

        // Attempt to ensure context is running *before* proceeding
        if (!(await this._ensureContextRunning())) {
             // If context cannot be started/resumed, initialization fails
             throw new Error(`AudioContext could not be started or resumed. Current state: ${this.context?.state || 'missing'}`);
        }

        // Context is running, proceed with setup
        this._ensureConnections();

        // Reset state variables
        this.isStreamComplete = false;
        this.audioQueue = [];
        this.processingBuffer = new Float32Array(0);
        // Reset scheduledTime based on current time now that context is running
        this.scheduledTime = this.context.currentTime + this.initialBufferTime;
        this.isPlaying = false;
        this._clearCheckInterval();
        this.isScheduling = false;

        // Reset Gain Node
        try {
             if (this.gainNode) { // Check if gainNode exists
                 const now = this.context.currentTime;
                 this.gainNode.gain.cancelScheduledValues(now);
                 this.gainNode.gain.setValueAtTime(1, now); // Reset gain to 1
             }
        } catch (e) { console.warn("AudioStreamer: Error resetting gain node during init:", e.message); }

        // Clear any lingering scheduled sources from previous runs
        try {
            // **FIX:** Check if scheduledSources exists
            if (this.scheduledSources) {
                 this.scheduledSources.forEach(source => { try { source.disconnect(); } catch(e){} });
                 this.scheduledSources.clear();
            }
        } catch(e) { console.error("AudioStreamer: Error clearing scheduled sources during init:", e); }
        finally {
            // Ensure it's cleared even if forEach fails (unlikely)
            if (this.scheduledSources) this.scheduledSources.clear();
        }
        this.endOfQueueAudioSource = null;

        this.isInitialized = true; // Mark as initialized *after* successful setup
        console.info(`AudioStreamer: Initialization complete. Initial scheduledTime: ${this.scheduledTime.toFixed(3)}`);
        return this;
    }

    dispose() {
        // **FIX:** Set dispose flag immediately
        if (this.isDisposed) return; // Prevent multiple disposals
        this.isDisposed = true;

        console.log("AudioStreamer: Disposing...");
        // Remove event listener first
        if (this.context) {
            this.context.removeEventListener('statechange', this._handleContextStateChange);
        }
        this.stop(); // Ensure playback is stopped and resources are cleared (stop now checks isDisposed)
        this._clearCheckInterval(); // Clear any lingering timers

        // Explicitly disconnect nodes if they exist
         try { if (this.gainNode) this.gainNode.disconnect(); } catch(e){}
         try { if (this.analyserTapNode) this.analyserTapNode.disconnect(); } catch(e){}

        // Nullify references
        this.gainNode = null;
        this.analyserTapNode = null;
        this.audioQueue = null;
        this.processingBuffer = null;
        if (this.scheduledSources) { // Check before clearing
             this.scheduledSources.clear();
        }
        this.scheduledSources = null; // Allow GC
        this.context = null; // Release context reference
        this.isInitialized = false;
        console.log("AudioStreamer disposed.");
    }
}
