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
        console.info('Screen sharing stream ended.');
        // Use the flag to ensure dispose and onStop logic runs only once
        if (!this.onStopCalled) {
            this.dispose(); // Clean up resources
        }
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
             console.warn('ScreenManager already has an active stream. Disposing previous one.');
             this.dispose(); // Clean up previous stream if any
        }

        this.onStopCalled = false; // Reset flag on new initialization

        try {
            console.info('Requesting screen capture permission...');
            // Request screen access
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    // cursor: "always", // Optional: include cursor
                    width: { ideal: 1920 }, // Request preferred resolution
                    height: { ideal: 1080 }
                },
                audio: false // Typically don't capture audio with screen share for this use case
            });

            // --- Video Element Setup ---
            this.videoElement = document.createElement('video');
            this.videoElement.srcObject = this.stream;
            this.videoElement.playsInline = true;
            this.videoElement.muted = true; // Mute preview locally

            // --- Preview Container Setup ---
            this.previewContainer = document.getElementById('screenPreview'); // Assumes an element with id="screenPreview" exists
            if (this.previewContainer) {
                this.previewContainer.innerHTML = ''; // Clear previous content
                this.previewContainer.appendChild(this.videoElement);
                this.showPreview();
            } else {
                console.warn('Screen preview container (#screenPreview) not found. Preview will not be shown.');
                // Optionally append videoElement to body or hide it if no container
                this.videoElement.style.display = 'none';
                document.body.appendChild(this.videoElement);
            }

            // Play the video to start receiving frames
            await this.videoElement.play();
            console.info('Screen capture video playing.');

            // --- Canvas Setup (after video metadata is loaded) ---
            await new Promise(resolve => {
                this.videoElement.onloadedmetadata = () => {
                    const videoWidth = this.videoElement.videoWidth;
                    const videoHeight = this.videoElement.videoHeight;
                    this.aspectRatio = videoHeight / videoWidth;

                    const canvasWidth = this.config.width;
                    const canvasHeight = Math.round(this.config.width * this.aspectRatio);

                    this.canvas = document.createElement('canvas');
                    this.canvas.width = canvasWidth;
                    this.canvas.height = canvasHeight;
                    this.ctx = this.canvas.getContext('2d');

                    console.info(`ScreenManager initialized with capture dimensions: ${videoWidth}x${videoHeight}, resized to: ${canvasWidth}x${canvasHeight}`);
                    resolve();
                };
            });

             // --- Stop Detection ---
            // Listen for the 'inactive' event on the stream track
            if (this.stream.getVideoTracks().length > 0) {
                 this.stream.getVideoTracks()[0].onended = () => this._handleStreamEnd();
            }


            this.isInitialized = true;

        } catch (error) {
            console.error('Failed to initialize screen capture:', error);
            this.dispose(); // Clean up if initialization failed
            // Re-throw the error so the caller (e.g., GeminiAgent) knows it failed
            // Common error: User denies permission ('NotAllowedError')
            throw new Error(`Failed to initialize screen capture: ${error.message}`);
        }
    }

    /**
     * Get current canvas dimensions used for capturing frames.
     * @returns {{width: number, height: number} | null}
     */
    getDimensions() {
        if (!this.isInitialized || !this.canvas) {
             // Return null or throw error if not initialized
             console.warn('Cannot get dimensions, ScreenManager not initialized.');
            return null;
        }
        return {
            width: this.canvas.width,
            height: this.canvas.height
        };
    }

    /**
     * Capture and process an image from the screen share.
     * @returns {Promise<string>} Base64 encoded JPEG image (without prefix)
     */
async capture() {
    // More forgiving check - if we're not fully initialized but have the video element,
    // we can still try to capture
    if (!this.videoElement) {
        console.warn('Screen capture not initialized. No video element available.');
        return null;
    }
    
    // If canvas/context isn't initialized yet but video is ready, initialize canvas now
    if (!this.canvas || !this.ctx) {
        console.info('Late initializing canvas for screen capture');
        // Create canvas if needed
        if (!this.canvas) {
            const videoWidth = this.videoElement.videoWidth || 1280;
            const videoHeight = this.videoElement.videoHeight || 720;
            this.aspectRatio = videoHeight / videoWidth;
            
            const canvasWidth = this.config.width;
            const canvasHeight = Math.round(this.config.width * this.aspectRatio);
            
            this.canvas = document.createElement('canvas');
            this.canvas.width = canvasWidth;
            this.canvas.height = canvasHeight;
        }
        
        // Create context if needed
        if (!this.ctx) {
            this.ctx = this.canvas.getContext('2d', { alpha: false });
        }
    }
    
    // Enhanced check for video readiness - more detailed warnings
    if (this.videoElement.readyState < this.videoElement.HAVE_CURRENT_DATA) {
        console.warn(`Screen video not ready yet. ReadyState: ${this.videoElement.readyState}`);
        return null;
    }

    try {
        // Get current video dimensions
        const videoWidth = this.videoElement.videoWidth;
        const videoHeight = this.videoElement.videoHeight;
        
        if (videoWidth === 0 || videoHeight === 0) {
            console.warn("Video dimensions are zero. Stream may not be active.");
            return null;
        }
        
        // Clear the canvas before drawing (prevents ghosting)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw current video frame to canvas, resizing
        this.ctx.drawImage(
            this.videoElement,
            0, 0,
            this.canvas.width,
            this.canvas.height
        );

        // Convert to base64 JPEG with specified quality
        const dataUrl = this.canvas.toDataURL('image/jpeg', this.config.quality);
        const base64Data = dataUrl.split(',')[1]; // Return only the base64 part
        
        return base64Data;
    } catch (error) {
        console.error("Error during screen capture processing:", error);
        // Return null instead of throwing to keep interval running
        return null;
    }
}

    /**
     * Stop screen capture stream and cleanup resources.
     */
    dispose() {
        console.info('Disposing ScreenManager resources...');
         if (this.onStopCalled) {
             console.warn("Dispose called multiple times.");
             return; // Already disposed or being disposed
         }
         this.onStopCalled = true; // Mark as called

        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                 track.onended = null; // Remove listener
                 track.stop();
                 console.info(`Screen track stopped: ${track.label || track.kind}`);
            });
            this.stream = null;
        }

        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.srcObject = null;
            // Remove from DOM if we added it dynamically without a container
            if (this.videoElement.parentElement === document.body || !this.previewContainer) {
                 this.videoElement.remove();
                 console.info("Dynamically added video element removed.");
            }
            this.videoElement = null;
        }

        if (this.previewContainer) {
            this.hidePreview();
             this.previewContainer.innerHTML = ''; // Clear preview container
            this.previewContainer = null;
        }

        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
        this.aspectRatio = null;

         // Call the onStop callback provided in the configuration
         if (typeof this.config.onStop === 'function') {
             console.info("Executing onStop callback.");
             this.config.onStop();
         } else {
             console.info("No onStop callback provided or not a function.");
         }
         console.info("ScreenManager disposed.");
    }
}
