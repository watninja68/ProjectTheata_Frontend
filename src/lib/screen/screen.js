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

        // Annotation overlay support
        this.annotationOverlayCallback = null;

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

        // Bound handlers to maintain 'this' context
        this._boundHandleStreamEnd = this._handleStreamEnd.bind(this);
        this._boundLogVideoEvent = this._logVideoEvent.bind(this);
        this._boundResolveMetadataLogic = null; // Will be set during init
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
    _handleStreamEnd(event) {
        console.info(`ScreenManager: Stream track event indicating end: ${event?.type || 'unknown'}.`);
        // Use the flag to ensure dispose and onStop logic runs only once
        if (!this.onStopCalled) {
             console.info("ScreenManager: Calling dispose() due to stream track end/inactive event.");
            this.dispose(); // Clean up resources
        } else {
            console.debug("ScreenManager: Stream track ended/inactive, but dispose already handled.");
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
             if (this._boundResolveMetadataLogic) { // Check if bound function exists
                this.videoElement.removeEventListener('loadedmetadata', this._boundResolveMetadataLogic);
             }
             this.videoElement.removeEventListener('playing', this._boundLogVideoEvent);
             this.videoElement.removeEventListener('stalled', this._boundLogVideoEvent);
             this.videoElement.removeEventListener('error', this._boundLogVideoEvent);
         }
    }

    _logVideoEvent(event) {
        console.debug(`ScreenManager: Video event during metadata wait: ${event.type}`, event);
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
                     this.stream?.getTracks().forEach(t => t.stop()); // Stop stream if no video track
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
                    let metadataResolved = false; // Flag to prevent double resolution

                    // Store reference to reject for use in interval/timeout
                    const promiseReject = reject;

                    // *** Define the core logic for handling metadata resolution ***
                    const resolveMetadataLogic = async () => {
                        if (metadataResolved) return; // Already handled
                        metadataResolved = true;
                        console.info("ScreenManager: Proceeding with metadata resolution logic.");
                        this._clearMetadataWaiters(); // Clear interval, timeout, listeners

                        if (!this.videoElement) { // Re-check element existence
                            console.error("ScreenManager: Video element missing when trying to resolve metadata.");
                            promiseReject(new Error("Video element lost before metadata resolution logic."));
                            return;
                        }

                        const videoWidth = this.videoElement.videoWidth;
                        const videoHeight = this.videoElement.videoHeight;

                        if (videoWidth === 0 || videoHeight === 0) {
                            console.error("ScreenManager: Video dimensions are zero during metadata resolution.");
                            promiseReject(new Error("Video dimensions reported as zero."));
                            return;
                        }

                        this.aspectRatio = videoHeight / videoWidth;
                        const canvasWidth = this.config.width;
                        const canvasHeight = Math.round(this.config.width * this.aspectRatio);

                        this.canvas = document.createElement('canvas');
                        this.canvas.width = canvasWidth;
                        this.canvas.height = canvasHeight;
                        this.ctx = this.canvas.getContext('2d', { alpha: false }); // Performance: disable alpha if not needed

                        console.info(`ScreenManager: Canvas initialized - Capture: ${videoWidth}x${videoHeight}, Resized: ${canvasWidth}x${canvasHeight}`);

                        // Optional short delay might still be useful, but less critical now
                        // console.debug("ScreenManager: Adding short delay after metadata resolution...");
                        // await new Promise(res => setTimeout(res, 100));
                        // console.debug("ScreenManager: Delay complete.");

                        resolve(); // Resolve the main promise passed to the outer scope
                    };

                    // Store bound function for listener management
                    this._boundResolveMetadataLogic = resolveMetadataLogic;

                    // Add the primary listener
                    this.videoElement.addEventListener('loadedmetadata', this._boundResolveMetadataLogic);

                    // Add extra listeners for debugging
                    this.videoElement.addEventListener('playing', this._boundLogVideoEvent);
                    this.videoElement.addEventListener('stalled', this._boundLogVideoEvent);
                    this.videoElement.addEventListener('error', this._boundLogVideoEvent);


                    // Start interval to check readyState as a fallback
                    this.readyStateIntervalId = setInterval(() => {
                        if (metadataResolved) { // Stop interval if already resolved by event or previous check
                             clearInterval(this.readyStateIntervalId);
                             this.readyStateIntervalId = null;
                             return;
                        }
                        if (this.videoElement) { // Check if element still exists
                             // Log less frequently to reduce noise once things are likely working
                            // if (frameCount++ % 5 === 0) { // Example: Log every ~2.5 seconds
                                 console.debug(`ScreenManager: Waiting for metadata... Current readyState: ${this.videoElement.readyState}, paused: ${this.videoElement.paused}, ended: ${this.videoElement.ended}`);
                            // }

                             // *** ADDED FALLBACK CHECK ***
                             // Check if readyState indicates metadata should be available (HAVE_METADATA = 1)
                             if (this.videoElement.readyState >= this.videoElement.HAVE_METADATA) {
                                 console.info(`ScreenManager: readyState (${this.videoElement.readyState}) >= HAVE_METADATA, attempting to resolve metadata via interval check.`);
                                 resolveMetadataLogic(); // Try to resolve using the same core logic
                             }
                        } else {
                             console.warn("ScreenManager: Video element disappeared while waiting for metadata.");
                             this._clearMetadataWaiters();
                             if (!metadataResolved) { // Ensure reject is called only once
                                  metadataResolved = true;
                                  promiseReject(new Error("Video element removed during metadata wait."));
                             }
                        }
                    }, 500); // Check every 500ms

                    // Set timeout
                    const waitTimeout = 10000; // 10 seconds timeout
                    this.metadataTimeoutId = setTimeout(() => {
                        if (metadataResolved) return; // Already handled
                        metadataResolved = true;
                        console.error(`ScreenManager: Timeout (${waitTimeout}ms) waiting for screen video metadata.`);
                        this._clearMetadataWaiters(); // Clean up listeners/interval
                        promiseReject(new Error(`Timeout waiting for screen video metadata.`));
                    }, waitTimeout);
                }); // End of Promise executor

                 // --- Stop Detection ---
                console.info("ScreenManager: Setting up track end listeners.");
                const track = videoTracks[0];
                // Assign bound handlers to ensure 'this' context and allow removal
                track.onended = this._boundHandleStreamEnd;
                track.oninactive = this._boundHandleStreamEnd; // Some browsers might use inactive

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
     * Set a callback function to get annotation overlay data
     * @param {Function} callback - Function that returns annotation overlay image data URL or null
     */
    setAnnotationOverlayCallback(callback) {
        this.annotationOverlayCallback = callback;
    }

    /**
     * Capture and process an image from the screen share.
     * @returns {Promise<string | null>} Base64 encoded JPEG image (without prefix), or null on failure.
     */
    async capture() {
        // Check essential components first
        if (!this.isInitialized || !this.videoElement || !this.canvas || !this.ctx) {
            // Log less frequently to avoid spam if consistently failing
            if (Math.random() < 0.1) {
                 console.warn(`ScreenManager: Capture prerequisites not met (Init: ${this.isInitialized}, Vid: ${!!this.videoElement}, Cnv: ${!!this.canvas}, Ctx: ${!!this.ctx}).`);
            }
            return null;
        }

        // Check video readiness state more thoroughly
        if (this.videoElement.readyState < this.videoElement.HAVE_CURRENT_DATA || this.videoElement.paused || this.videoElement.ended) {
            // Log less frequently
             if (Math.random() < 0.1) {
                 console.debug(`ScreenManager: Video not ready for capture. State: ${this.videoElement.readyState}, Paused: ${this.videoElement.paused}, Ended: ${this.videoElement.ended}`);
             }
            return null; // Not ready yet
        }

        try {
            const videoWidth = this.videoElement.videoWidth;
            const videoHeight = this.videoElement.videoHeight;

            if (videoWidth === 0 || videoHeight === 0) {
                 // Log less frequently
                 if (Math.random() < 0.1) {
                     console.warn("ScreenManager: Video dimensions are zero during capture.");
                 }
                return null;
            }

            // Draw current video frame to canvas, resizing
            this.ctx.drawImage(
                this.videoElement,
                0, 0, videoWidth, videoHeight,
                0, 0, this.canvas.width, this.canvas.height
            );

            // Composite annotation overlay if available
            if (this.annotationOverlayCallback) {
                try {
                    const annotationDataUrl = this.annotationOverlayCallback();
                    if (annotationDataUrl) {
                        // Create an image from the annotation data
                        const annotationImage = new Image();
                        await new Promise((resolve, reject) => {
                            annotationImage.onload = resolve;
                            annotationImage.onerror = reject;
                            annotationImage.src = annotationDataUrl;
                        });

                        // Draw the annotation overlay on top of the video frame
                        this.ctx.drawImage(
                            annotationImage,
                            0, 0, annotationImage.width, annotationImage.height,
                            0, 0, this.canvas.width, this.canvas.height
                        );
                    }
                } catch (annotationError) {
                    // Don't fail the entire capture if annotation overlay fails
                    console.warn('ScreenManager: Error compositing annotation overlay:', annotationError);
                }
            }

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
            // Log specific drawing or encoding errors
            console.error("ScreenManager: Error during image drawing/encoding:", error);
            return null; // Return null on error to allow interval to continue (up to error threshold)
        }
    }


    /**
     * Stop screen capture stream and cleanup resources.
     */
    dispose() {
        console.info('ScreenManager: Disposing resources...');
        // Prevent multiple dispose calls triggered by both manual stop and track end events
        if (this.onStopCalled) {
            console.warn("ScreenManager: Dispose called but already handled.");
            return;
        }
        this.onStopCalled = true; // Mark as called early

        this._clearMetadataWaiters(); // Clean up any pending waits/listeners

        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                 // Remove listeners *before* stopping to prevent them firing during cleanup
                 track.onended = null;
                 track.oninactive = null;
                 if (track.readyState === 'live') {
                    track.stop();
                    console.info(`ScreenManager: Screen track stopped: ${track.label || track.kind}`);
                 } else {
                      console.debug(`ScreenManager: Screen track already stopped/ended: ${track.label || track.kind}`);
                 }
            });
            this.stream = null;
        } else {
             console.debug("ScreenManager: No stream to stop.");
        }

        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.srcObject = null;
            // Remove listeners explicitly
             if (this._boundResolveMetadataLogic) { // Use the correct bound function name
                this.videoElement.removeEventListener('loadedmetadata', this._boundResolveMetadataLogic);
             }
             this.videoElement.removeEventListener('playing', this._boundLogVideoEvent);
             this.videoElement.removeEventListener('stalled', this._boundLogVideoEvent);
             this.videoElement.removeEventListener('error', this._boundLogVideoEvent);

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
             // Check if it's still in the DOM before manipulating
             if (document.body.contains(this.previewContainer)) {
                 this.hidePreview();
                 this.previewContainer.innerHTML = ''; // Clear content
                  console.info("ScreenManager: Preview container cleared and hidden.");
             } else {
                  console.debug("ScreenManager: Preview container already removed from DOM.");
             }
             this.previewContainer = null; // Release reference
        }

        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false; // Crucial: Mark as uninitialized
        this.aspectRatio = null;

         // Call the onStop callback provided in the configuration AFTER cleanup
         if (typeof this.config.onStop === 'function') {
             console.info("ScreenManager: Executing onStop callback.");
             try {
                this.config.onStop();
             } catch (callbackError) {
                 console.error("ScreenManager: Error executing onStop callback:", callbackError);
             }
         } else {
              console.debug("ScreenManager: No onStop callback configured.");
         }
         console.info("ScreenManager: Dispose finished.");
    }
}