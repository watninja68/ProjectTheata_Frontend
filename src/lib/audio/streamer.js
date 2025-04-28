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
        this.isStreamComplete = false;
        this.checkInterval = null;
        this.initialBufferTime = 0.1; // Slightly increased initial buffer (100ms)
        this.isInitialized = false;
        this.endOfQueueAudioSource = null;
        this.scheduledSources = new Set();
        this.lastScheduleTimeLog = 0;
        this.lastContextCheckTime = 0; // Throttle context state checks

        // --- Nodes ---
        this.gainNode = this.context.createGain(); // Main volume control node
        this.analyserTapNode = this.context.createGain(); // New node for visualizer tap
        this.analyserTapNode.gain.value = 1.0; // Ensure it doesn't alter volume

        // --- Connections ---
        try {
            if (this.context.state !== 'closed') {
                 // Main output path
                 this.gainNode.connect(this.context.destination);
                 console.info('AudioStreamer: GainNode connected to destination.');

                 // Path for visualizer tap
                 this.gainNode.connect(this.analyserTapNode);
                 // The analyserTapNode itself doesn't need to connect anywhere further
                 console.info('AudioStreamer: GainNode connected to analyserTapNode.');

            } else {
                 console.warn('AudioStreamer: Context closed during constructor, cannot connect nodes yet.');
            }
        } catch (e) {
             console.error("AudioStreamer: Error connecting nodes in constructor:", e);
        }
        // --- End Connections ---


        console.info('AudioStreamer initialized', { sampleRate: this._sampleRate });

        // Bind methods
        this.streamAudio = this.streamAudio.bind(this);
        this.scheduleNextBuffer = this.scheduleNextBuffer.bind(this);

        // Context state change listener
        this.context.onstatechange = () => {
            const newState = this.context.state;
            console.log(`AudioStreamer: Context state changed to: ${newState}`);

            if (newState === 'running') {
                 // Ensure nodes are connected if context just recovered
                 this._ensureConnections();
                 if (!this.isPlaying && this.audioQueue.length > 0) {
                      console.log("AudioStreamer: Context became running with queued audio. Triggering scheduling.");
                      this._startPlaybackScheduling();
                 }
            } else if (newState === 'suspended' && this.isPlaying) {
                console.warn("AudioStreamer: Context suspended unexpectedly. Scheduling check.");
                this._clearCheckInterval();
                setTimeout(this.scheduleNextBuffer, 50);
            }
        };
    }

     /**
     * Ensures essential node connections are established, useful after context resume.
     * @private
     */
     _ensureConnections() {
        try {
            if (this.context.state === 'running') {
                // Simple check: try connecting gainNode to destination
                // Web Audio API handles duplicate connections gracefully (no error)
                this.gainNode.connect(this.context.destination);
                this.gainNode.connect(this.analyserTapNode);
            }
        } catch (e) {
            console.error("AudioStreamer: Error trying to ensure connections:", e);
        }
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
                 this._ensureConnections(); // Re-verify connections after resume
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
             if (this.context && this.context.state !== 'closed') {
                 try { await this.initialize(); }
                 catch (initError) { console.error("AudioStreamer: Lazy initialization failed:", initError); return; }
             } else { console.error("AudioStreamer: Cannot lazy-initialize, context missing or closed."); return; }
        }

        // 2. Validate chunk
        if (!chunk || !(chunk instanceof Int16Array || chunk instanceof Uint8Array)) {
            console.warn('AudioStreamer: Invalid audio chunk provided', { chunkType: chunk ? chunk.constructor.name : 'null' });
            return;
        }

        // 3. Ensure context is running before processing further
        if (!(await this._ensureContextRunning())) {
            console.warn(`AudioStreamer: Context not running in streamAudio, skipping chunk processing.`);
            return;
        }

        // 4. Process the chunk
        try {
            const float32Array = new Float32Array(chunk.length / 2);
            const dataView = new DataView(chunk.buffer);
            for (let i = 0; i < chunk.length / 2; i++) {
                float32Array[i] = dataView.getInt16(i * 2, true) / 32768;
            }

            if (this.processingBuffer.length > this.bufferSize * 10) {
                console.warn('AudioStreamer: Processing buffer overflow, resetting');
                this.processingBuffer = new Float32Array(0);
            }

            const newBuffer = new Float32Array(this.processingBuffer.length + float32Array.length);
            newBuffer.set(this.processingBuffer);
            newBuffer.set(float32Array, this.processingBuffer.length);
            this.processingBuffer = newBuffer;

            while (this.processingBuffer.length >= this.bufferSize) {
                this.audioQueue.push(this.processingBuffer.slice(0, this.bufferSize));
                this.processingBuffer = this.processingBuffer.slice(this.bufferSize);
            }

            if (!this.isPlaying && this.audioQueue.length > 0) {
                this._startPlaybackScheduling();
            } else if (this.isPlaying && this.checkInterval) {
                 this._clearCheckInterval();
                 this.scheduleNextBuffer();
            }

        } catch (error) {
            console.error('AudioStreamer: Error processing audio chunk:', error);
        }
    }

    createAudioBuffer(audioData) {
        try {
            if (!this.context || this.context.state === 'closed') {
                 console.error("AudioStreamer: Cannot create buffer, context missing or closed."); return null;
            }
            const audioBuffer = this.context.createBuffer(1, audioData.length, this.sampleRate);
            audioBuffer.getChannelData(0).set(audioData);
            return audioBuffer;
        } catch (error) {
            console.error("AudioStreamer: Error creating audio buffer:", error);
             if (this.context && this.context.state !== 'running') { console.warn(`AudioStreamer: Context state is ${this.context.state} during buffer creation.`); }
            return null;
        }
    }

    async scheduleNextBuffer() {
        this._clearCheckInterval();

        if (!this.isPlaying) { return; }

        if (!(await this._ensureContextRunning())) {
            console.warn(`AudioStreamer: Context not running at start of scheduleNextBuffer. Waiting...`);
            if (!this.checkInterval) { this.checkInterval = setInterval(this.scheduleNextBuffer, 200); }
            return;
        }

        if (!this.isInitialized) {
             console.warn("AudioStreamer: Not initialized in scheduleNextBuffer. Attempting re-init.");
             try { await this.initialize(); }
             catch (initError) { console.error("AudioStreamer: Failed to re-initialize:", initError); this.isPlaying = false; return; }
        }


        const SCHEDULE_AHEAD_TIME = 0.2;
        const MIN_AHEAD_TIME = 0.05;

        try {
            while (this.audioQueue.length > 0 && this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD_TIME) {
                const audioData = this.audioQueue.shift();
                const audioBuffer = this.createAudioBuffer(audioData);
                if (!audioBuffer) { console.error("AudioStreamer: Failed to create audio buffer, skipping chunk."); continue; }

                const source = this.context.createBufferSource();
                source.buffer = audioBuffer;

                // Connect to the main gain node (which then goes to destination and analyser tap)
                try {
                    if (this.gainNode) {
                        source.connect(this.gainNode);
                    } else {
                        console.error("AudioStreamer: Main gainNode missing, cannot connect source."); continue;
                    }
                } catch (connectError) {
                     console.error("AudioStreamer: Error connecting source to main GainNode:", connectError); continue;
                }

                this.scheduledSources.add(source);
                source.onended = () => {
                    this.scheduledSources.delete(source);
                     try { source.disconnect(); } catch (e) {}
                    if (this.endOfQueueAudioSource === source && this.audioQueue.length === 0) { this.endOfQueueAudioSource = null; }
                };

                if (this.audioQueue.length === 0) { /* ... (end of queue tracking logic remains same) ... */
                    if (this.endOfQueueAudioSource && this.scheduledSources.has(this.endOfQueueAudioSource)) {
                         this.endOfQueueAudioSource.onended = () => {
                             this.scheduledSources.delete(this.endOfQueueAudioSource);
                              try { this.endOfQueueAudioSource.disconnect(); } catch(e) {}
                         };
                    }
                    this.endOfQueueAudioSource = source;
                }


                // --- Timing Calculation ---
                 if (this.scheduledTime < this.context.currentTime) {
                     console.warn(`AudioStreamer: Scheduled time (${this.scheduledTime.toFixed(4)}) was behind current time (${this.context.currentTime.toFixed(4)}). Adjusting.`);
                     this.scheduledTime = this.context.currentTime + MIN_AHEAD_TIME;
                 }
                 const startTime = Math.max(this.scheduledTime, this.context.currentTime + MIN_AHEAD_TIME);

                 // console.debug(`[AudioStreamer Playback] Scheduling source: StartTime=${startTime.toFixed(4)}, CurrentTime=${this.context.currentTime.toFixed(4)}, BufferDuration=${audioBuffer.duration.toFixed(4)}`);

                try {
                     source.start(startTime);
                     this.scheduledTime = startTime + audioBuffer.duration;
                 } catch (startError) {
                     console.error(`AudioStreamer: Error starting source node at ${startTime.toFixed(3)} (current: ${this.context.currentTime.toFixed(3)}):`, startError);
                     this.scheduledSources.delete(source);
                     try { source.disconnect(); } catch(e){}
                     continue;
                 }

                 const nowPerf = performance.now();
                 if (nowPerf - this.lastScheduleTimeLog > 1000) {
                      console.debug(`AudioStreamer: Scheduled chunk. NextSchedTime=${this.scheduledTime.toFixed(3)}, Queue=${this.audioQueue.length}, ProcessingBuf=${this.processingBuffer.length}`);
                     this.lastScheduleTimeLog = nowPerf;
                 }
            } // End while loop

            // Handle buffer underrun or stream completion
            if (this.audioQueue.length === 0) {
                if (this.processingBuffer.length < this.bufferSize) {
                    if (this.isStreamComplete) { console.info("AudioStreamer: Stream complete and queue empty. Stopping playback."); this.isPlaying = false; }
                    else if (!this.checkInterval) { this.checkInterval = setInterval(this.scheduleNextBuffer, 150); }
                } else { setTimeout(this.scheduleNextBuffer, 10); }
            } else {
                 const timeUntilNextScheduleNeeded = Math.max(0, this.scheduledTime - this.context.currentTime - SCHEDULE_AHEAD_TIME);
                 const timeoutDelay = Math.max(50, timeUntilNextScheduleNeeded * 1000);
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
     */
    stop() {
        console.info('AudioStreamer: Stopping audio playback...');
        this.isPlaying = false;
        this.isStreamComplete = true;
        this._clearCheckInterval();

        try {
            for (const source of this.scheduledSources) {
                try {
                    if (source && typeof source.stop === 'function') {
                         const currentTime = this.context?.state === 'running' ? this.context.currentTime : performance.now() / 1000;
                         const stopTime = currentTime + 0.05;
                         source.stop(stopTime);
                    }
                     if (source) source.disconnect();
                } catch (e) { try { if (source) source.disconnect(); } catch (e2) {} }
            }
        } catch(e) { console.error("AudioStreamer: Error iterating scheduled sources during stop:", e); }
        finally { this.scheduledSources.clear(); }

        this.audioQueue = [];
        this.processingBuffer = new Float32Array(0);
        this.scheduledTime = 0;
        this.endOfQueueAudioSource = null;

        try { // Fade out main gain node
            if (this.gainNode && this.context?.state === 'running') {
                const now = this.context.currentTime;
                this.gainNode.gain.cancelScheduledValues(now);
                this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
                this.gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
                this.gainNode.gain.linearRampToValueAtTime(1, now + 0.1);
            }
        } catch (error) { console.warn('AudioStreamer: Error during gain node fade-out:', error.message); }

        console.info("AudioStreamer: Playback stopped.");
    }

    /**
     * Initializes the audio streamer
     */
    async initialize() {
        console.log("AudioStreamer: Initializing...");
        if (!(await this._ensureContextRunning())) {
             this.isInitialized = false;
             throw new Error(`AudioContext could not be started or resumed. Current state: ${this.context.state}`);
        }

        this._ensureConnections(); // Make sure nodes are connected

        this.isStreamComplete = false;
        this.audioQueue = [];
        this.processingBuffer = new Float32Array(0);
        this.scheduledTime = this.context.state === 'running'
            ? this.context.currentTime + this.initialBufferTime
            : performance.now() / 1000 + this.initialBufferTime;
        this.isPlaying = false;
        this._clearCheckInterval();

        try { // Reset Gain Node
             if (this.gainNode && this.context.state === 'running') {
                 const now = this.context.currentTime;
                 this.gainNode.gain.cancelScheduledValues(now);
                 this.gainNode.gain.setValueAtTime(1, now);
             }
        } catch (e) { console.warn("AudioStreamer: Error resetting gain node:", e.message); }

        try { // Clear lingering scheduled sources
            this.scheduledSources.forEach(source => { try { source.disconnect(); } catch(e){} });
        } finally { this.scheduledSources.clear(); }
        this.endOfQueueAudioSource = null;

        this.isInitialized = true;
        console.info('AudioStreamer: Initialization complete.');
        return this;
    }

     /** Cleanup method */
    dispose() {
        console.log("AudioStreamer: Disposing...");
        this.stop();
        if(this.context) { this.context.onstatechange = null; }
        this._clearCheckInterval();

        // Disconnect and nullify nodes
         try { if (this.gainNode) this.gainNode.disconnect(); } catch(e){}
         try { if (this.analyserTapNode) this.analyserTapNode.disconnect(); } catch(e){}
         this.gainNode = null;
         this.analyserTapNode = null;

         this.audioQueue = null;
         this.processingBuffer = null;
         this.scheduledSources = null;
         this.isInitialized = false;
         console.log("AudioStreamer disposed.");
    }
}