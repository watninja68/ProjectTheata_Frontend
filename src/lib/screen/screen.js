// src/lib/screen/screen.js

export class ScreenManager {
    /**
     * @param {Object} config
     * @param {number} config.width - Target width for resizing captured images
     * @param {number} config.quality - JPEG quality (0-1)
     * @param {Function} [config.onStop] - Callback function when sharing stops
     */
    constructor(config) {
        this.config = {
            width: config.width || 1280, // Default to a slightly higher res for screen
            quality: config.quality || 0.7, // Adjust quality as needed
            onStop: config.onStop // Callback when user stops sharing
        };

        this.stream = null;
        this.videoElement = null;
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
        this.aspectRatio = null;
        this.previewContainer = null; // To hold the preview video
        this.onStopCalled = false; // Flag to prevent multiple calls to onStop
        this.metadataTimeoutId = null; // Store timeout ID for cleanup
        this.readyStateIntervalId = null; // Store interval ID for cleanup
    }

    /**
     * Show the screen preview element.
     */
    showPreview() {
        if (this.previewContainer) {
            this.previewContainer.style.display = 'block';
        }
    }

    /**
     * Hide the screen preview element.
     */
    hidePreview() {
        if (this.previewContainer) {
            this.previewContainer.style.display = 'none';
        }
    }

     /**
     * Handles cleanup and notifications when the stream ends (user clicks "Stop sharing").
     * @private
     */
    _handleStreamEnd() {
        console.info('Screen sharing stream track ended/inactive.');
        // Use the flag to ensure dispose and onStop logic runs only once
        if (!this.onStopCalled) {
            this.dispose(); // Clean up resources
        } else {
            console.debug("Stream track ended, but dispose already called.");
        }
    }

    // Helper to clear metadata waiting resources
    _clearMetadataWaiters() {
        if (this.metadataTimeoutId) {
            clearTimeout(this.metadataTimeoutId);
            this.metadataTimeoutId = null;
        }
        if (this.readyStateIntervalId) {
            clearInterval(this.readyStateIntervalId);
            this.readyStateIntervalId = null;
        }
        // Remove specific listeners added during waiting
         if (this.videoElement) {
             this.videoElement.removeEventListener('loadedmetadata', this._resolveMetadataPromise);
             this.videoElement.removeEventListener('playing', this._logVideoEvent);
             this.videoElement.removeEventListener('stalled', this._logVideoEvent);
             this.videoElement.removeEventListener('error', this._logVideoEvent);
         }
    }
    // Bound handlers to maintain 'this' context if needed later, though simple logs might not need it
    _logVideoEvent = (event) => {
        console.debug(`ScreenManager: Video event during metadata wait: ${event.type}`, event);
    }
    _resolveMetadataPromise = () => {
        // This function will be assigned to the promise's resolve callback
        // It needs access to 'this' or passed arguments if used directly as listener
    }


    /**
     * Initialize screen capture stream and canvas.
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            console.warn('ScreenManager already initialized.');
            return;
        }
        if (this.stream) {
             console.warn('ScreenManager cleaning up previous stream before initializing.');
             this.dispose(); // Clean up previous stream if any
        }

        this.onStopCalled = false; // Reset flag on new initialization

        let initAttempts = 0;
        const maxAttempts = 2;

        while (initAttempts < maxAttempts) {
            try {
                initAttempts++;
                console.info(`ScreenManager: Requesting screen capture permission (Attempt ${initAttempts}/${maxAttempts})...`);
                // Request screen access
                this.stream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        // cursor: "always", // Optional: include cursor
                        width: { ideal: 1920 }, // Request preferred resolution
                        height: { ideal: 1080 }
                    },
                    audio: false // Typically don't capture audio with screen share for this use case
                });
                console.info("ScreenManager: getDisplayMedia successful.", this.stream);

                const videoTracks = this.stream.getVideoTracks();
                if (videoTracks.length === 0) {
                     throw new Error("Acquired stream contains no video tracks.");
                }
                console.info(`ScreenManager: Found ${videoTracks.length} video track(s). Label: "${videoTracks[0].label}", State: ${videoTracks[0].readyState}`);


                // --- Video Element Setup ---
                this.videoElement = document.createElement('video');
                this.videoElement.srcObject = this.stream;
                this.videoElement.playsInline = true;
                this.videoElement.muted = true; // Mute preview locally
                this.videoElement.style.width = '100%';
                this.videoElement.style.height = 'auto';
                this.videoElement.style.display = 'block';
                this.videoElement.style.maxWidth = '100%';
                 console.info("ScreenManager: Video element created and stream assigned.");


                // --- Preview Container Setup ---
                this.previewContainer = document.getElementById('screenPreview');
                if (this.previewContainer) {
                    this.previewContainer.innerHTML = ''; // Clear previous content
                    this.previewContainer.appendChild(this.videoElement);
                    this.showPreview();
                    console.info("ScreenManager: Video element appended to #screenPreview.");
                } else {
                    console.warn('ScreenManager: Preview container (#screenPreview) not found. Hiding video element.');
                    this.videoElement.style.position = 'absolute';
                    this.videoElement.style.top = '-9999px';
                    this.videoElement.style.left = '-9999px';
                    document.body.appendChild(this.videoElement); // Must be in DOM to potentially load
                }

                // Play the video to start receiving frames
                console.info("ScreenManager: Attempting to play video element...");
                try {
                    await this.videoElement.play();
                    console.info("ScreenManager: videoElement.play() promise resolved.");
                    // Note: Resolving doesn't guarantee playback has truly started or will continue.
                } catch (playError) {
                    console.error("ScreenManager: videoElement.play() failed:", playError);
                    throw playError; // Propagate the error
                }

                // --- Canvas Setup (after video metadata is loaded) ---
                console.info("ScreenManager: Waiting for video metadata...");
                await new Promise((resolve, reject) => {
                    // Assign resolve/reject to instance for cleanup access if needed, but can be local too
                    const metadataResolve = resolve;
                    const metadataReject = reject;

                    // Function to handle successful metadata load
                    const onMetadataLoaded = () => {
                        console.info("ScreenManager: 'loadedmetadata' event fired.");
                        this._clearMetadataWaiters(); // Clear interval, timeout, listeners

                        const videoWidth = this.videoElement.videoWidth;
                        const videoHeight = this.videoElement.videoHeight;

                        if (videoWidth === 0 || videoHeight === 0) {
                            console.error("ScreenManager: Metadata loaded but dimensions are zero.");
                            metadataReject(new Error("Video dimensions reported as zero after metadata load."));
                            return;
                        }

                        this.aspectRatio = videoHeight / videoWidth;
                        const canvasWidth = this.config.width;
                        const canvasHeight = Math.round(this.config.width * this.aspectRatio);

                        this.canvas = document.createElement('canvas');
                        this.canvas.width = canvasWidth;
                        this.canvas.height = canvasHeight;
                        this.ctx = this.canvas.getContext('2d', { alpha: false });

                        console.info(`ScreenManager: Canvas initialized - Capture: ${videoWidth}x${videoHeight}, Resized: ${canvasWidth}x${canvasHeight}`);
                        metadataResolve();
                    };

                    // Store resolver for removal
                    this._resolveMetadataPromise = onMetadataLoaded;

                    // Add the primary listener
                    this.videoElement.addEventListener('loadedmetadata', this._resolveMetadataPromise);

                    // Add extra listeners for debugging
                    this.videoElement.addEventListener('playing', this._logVideoEvent);
                    this.videoElement.addEventListener('stalled', this._logVideoEvent);
                    this.videoElement.addEventListener('error', this._logVideoEvent);


                    // Start interval to check readyState
                    this.readyStateIntervalId = setInterval(() => {
                        if (this.videoElement) { // Check if element still exists
                             console.debug(`ScreenManager: Waiting for metadata... Current readyState: ${this.videoElement.readyState}`);
                        } else {
                             console.warn("ScreenManager: Video element disappeared while waiting for metadata.");
                             this._clearMetadataWaiters();
                             metadataReject(new Error("Video element removed during metadata wait."));
                        }
                    }, 1000); // Log readyState every second

                    // Set timeout
                    const waitTimeout = 10000; // Increased timeout to 10 seconds
                    this.metadataTimeoutId = setTimeout(() => {
                        console.error(`ScreenManager: Timeout (${waitTimeout}ms) waiting for screen video metadata.`);
                        this._clearMetadataWaiters(); // Clean up listeners/interval
                        metadataReject(new Error(`Timeout waiting for screen video metadata.`));
                    }, waitTimeout);
                });

                 // --- Stop Detection ---
                console.info("ScreenManager: Setting up track end listeners.");
                const track = videoTracks[0];
                 // Ensure listeners are removed if dispose is called before track ends
                track.onended = () => this._handleStreamEnd();
                track.oninactive = () => this._handleStreamEnd(); // Some browsers might use inactive

                this.isInitialized = true;
                console.info(`ScreenManager: Initialized successfully on attempt ${initAttempts}.`);
                break; // Exit loop on success

            } catch (error) {
                console.error(`ScreenManager: Initialization attempt ${initAttempts} failed:`, error);
                this._clearMetadataWaiters(); // Ensure waiters are cleared on error
                this.dispose(); // Clean up any partial setup from this attempt
                if (initAttempts >= maxAttempts) {
                    // Re-throw the error if we've exhausted attempts
                    throw new Error(`Failed to initialize screen capture after ${maxAttempts} attempts: ${error.message}`);
                }
                // Wait a bit before the next try
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } // End while loop
    }

    /**
     * Get current canvas dimensions used for capturing frames.
     * @returns {{width: number, height: number} | null}
     */
    getDimensions() {
        if (!this.isInitialized || !this.canvas) {
             console.warn('ScreenManager: Cannot get dimensions, not initialized.');
            return null;
        }
        return {
            width: this.canvas.width,
            height: this.canvas.height
        };
    }

    /**
     * Capture and process an image from the screen share.
     * @returns {Promise<string | null>} Base64 encoded JPEG image (without prefix), or null on failure.
     */
    async capture() {
        if (!this.isInitialized || !this.videoElement || !this.canvas || !this.ctx) {
            // console.warn('ScreenManager: Capture prerequisites not met (initialized, video, canvas, ctx).');
            return null;
        }

        // Check video readiness state
        if (this.videoElement.readyState < this.videoElement.HAVE_CURRENT_DATA) {
             // console.debug(`ScreenManager: Video not ready for capture. State: ${this.videoElement.readyState}`);
            return null; // Not ready yet
        }

        try {
            const videoWidth = this.videoElement.videoWidth;
            const videoHeight = this.videoElement.videoHeight;

            if (videoWidth === 0 || videoHeight === 0) {
                // console.warn("ScreenManager: Video dimensions are zero during capture.");
                return null;
            }

            // Draw current video frame to canvas, resizing
             this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); // Clear first
            this.ctx.drawImage(
                this.videoElement,
                0, 0, videoWidth, videoHeight,
                0, 0, this.canvas.width, this.canvas.height
            );

            // Convert to base64 JPEG
            const dataUrl = this.canvas.toDataURL('image/jpeg', this.config.quality);

            if (!dataUrl || dataUrl === 'data:,') {
                console.warn('ScreenManager: Canvas generated invalid data URL.');
                return null;
            }
            const base64Data = dataUrl.split(',')[1];
            if (!base64Data) {
                 console.warn("ScreenManager: Generated empty base64 data from canvas.");
                 return null;
            }
            return base64Data;

        } catch (error) {
            console.error("ScreenManager: Error during capture processing:", error);
            return null;
        }
    }


    /**
     * Stop screen capture stream and cleanup resources.
     */
    dispose() {
        console.info('ScreenManager: Disposing resources...');
        if (this.onStopCalled) {
            console.warn("ScreenManager: Dispose called multiple times.");
            return;
        }
        this.onStopCalled = true; // Mark as called early

        this._clearMetadataWaiters(); // Clean up any pending waits/listeners

        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                 track.onended = null; // Remove listeners first
                 track.oninactive = null;
                 track.stop();
                 console.info(`ScreenManager: Screen track stopped: ${track.label || track.kind}`);
            });
            this.stream = null;
        } else {
             console.debug("ScreenManager: No stream to stop.");
        }

        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.srcObject = null;
            this.videoElement.onloadedmetadata = null; // Remove primary listener just in case
            // Remove other debug listeners if they were added outside the promise scope
             this.videoElement.removeEventListener('playing', this._logVideoEvent);
             this.videoElement.removeEventListener('stalled', this._logVideoEvent);
             this.videoElement.removeEventListener('error', this._logVideoEvent);

            // Remove from DOM
            if (this.videoElement.parentElement) {
                this.videoElement.parentElement.removeChild(this.videoElement);
                 console.info("ScreenManager: Video element removed from DOM.");
            }
            this.videoElement = null;
        } else {
            console.debug("ScreenManager: No video element to remove.");
        }

        if (this.previewContainer) {
             if (document.body.contains(this.previewContainer)) {
                 this.hidePreview();
                 this.previewContainer.innerHTML = '';
             }
             this.previewContainer = null; // Release reference
             console.info("ScreenManager: Preview container cleared and hidden.");
        }

        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
        this.aspectRatio = null;

         // Call the onStop callback provided in the configuration AFTER cleanup
         if (typeof this.config.onStop === 'function') {
             console.info("ScreenManager: Executing onStop callback.");
             try {
                this.config.onStop();
             } catch (callbackError) {
                 console.error("ScreenManager: Error executing onStop callback:", callbackError);
             }
         }
         console.info("ScreenManager: Dispose finished.");
    }
}