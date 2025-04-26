/**
 * Manages camera access, capture, and image processing
 */
export class CameraManager {
    /**
     * @param {Object} config
     * @param {number} config.width - Target width for resizing captured images
     * @param {number} config.quality - JPEG quality (0-1)
     * @param {string} [config.facingMode] - Camera facing mode (optional, mobile-only)
     */
    constructor(config) {
        this.config = {
            width: config.width || 640,
            quality: config.quality || 0.8,
            facingMode: config.facingMode // undefined by default for desktop compatibility
        };

        this.stream = null;
        this.videoElement = null;
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
        this.aspectRatio = null;
        this.previewContainer = null;
        this.switchButton = null;
    }

    /**
     * Show the camera preview
     */
    showPreview() {
        if (this.previewContainer) {
            this.previewContainer.style.display = 'block'; // Or 'flex', 'grid', etc. depending on layout
        }
    }

    /**
     * Hide the camera preview
     */
    hidePreview() {
        if (this.previewContainer) {
            this.previewContainer.style.display = 'none';
        }
    }

    /**
     * Create and append the camera switch button
     * @private
     */
    _createSwitchButton() {
        // Only create button on mobile devices
        if (!/Mobi|Android/i.test(navigator.userAgent)) return;
        // Avoid creating multiple buttons if re-initializing somehow
        if (this.switchButton && this.previewContainer.contains(this.switchButton)) return;

        this.switchButton = document.createElement('button');
        this.switchButton.className = 'camera-switch-btn';
        this.switchButton.innerHTML = '&#x21F2;'; // Unicode for switch symbol
        this.switchButton.style.position = 'absolute'; // Style for positioning within preview
        this.switchButton.style.top = '5px';
        this.switchButton.style.right = '5px';
        this.switchButton.style.zIndex = '1001'; // Ensure it's above the video
        this.switchButton.style.padding = '5px 8px';
        this.switchButton.style.cursor = 'pointer';
        this.switchButton.addEventListener('click', () => this.switchCamera());

        // Ensure the container can position the button
        if (getComputedStyle(this.previewContainer).position === 'static') {
             this.previewContainer.style.position = 'relative';
        }
        this.previewContainer.appendChild(this.switchButton);
    }

    /**
     * Switch between front and back cameras
     */
    async switchCamera() {
        if (!this.isInitialized) return;
        if (!/Mobi|Android/i.test(navigator.userAgent)) {
            console.warn("Camera switching is only available on mobile devices.");
            return;
        }

        // Remember current facingMode in case of failure
        const previousFacingMode = this.config.facingMode;

        // Toggle facingMode
        this.config.facingMode = this.config.facingMode === 'user' ? 'environment' : 'user';
        localStorage.setItem('facingMode', this.config.facingMode); // Save preference

        // Stop current stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null; // Clear the stream reference
        }
        // Detach from video element *before* getting new stream
        if (this.videoElement) {
           this.videoElement.srcObject = null;
        }


        // Reinitialize with new facingMode - reusing parts of initialize logic
        try {
            console.log(`Attempting to switch to ${this.config.facingMode} camera.`);
            // Try getting the stream with the new facing mode using progressive enhancement
            const constraintOptions = this._getConstraintOptions(this.config.facingMode);
            let streamAcquired = false;
            let lastError = null;

            for (const constraints of constraintOptions) {
                 try {
                     console.log("Trying camera constraints:", JSON.stringify(constraints));
                     this.stream = await navigator.mediaDevices.getUserMedia(constraints);
                     console.log("Camera access granted with constraints:", JSON.stringify(constraints));
                     streamAcquired = true;
                     break;
                 } catch (error) {
                     console.warn(`Failed with constraints ${JSON.stringify(constraints)}:`, error);
                     lastError = error;
                 }
            }

            if (!streamAcquired) {
                throw lastError || new Error('Failed to acquire camera stream with any constraints during switch');
            }

            // Reattach stream to the existing video element
            this.videoElement.srcObject = this.stream;
            await this.videoElement.play(); // Important: Play the new stream
            console.log(`Successfully switched to ${this.config.facingMode} camera.`);

            // Update aspect ratio and canvas (resolution might change)
            await this._updateVideoDimensionsAndCanvas();

        } catch (error) {
            console.error('Failed to switch camera:', error);
            // Revert to previous facing mode on error
            this.config.facingMode = previousFacingMode;
            localStorage.setItem('facingMode', this.config.facingMode); // Revert saved preference
             // Try to restart the previous stream if possible (or re-initialize fully)
            alert(`Failed to switch camera. Staying on ${this.config.facingMode}. Error: ${error.message}`);
            // Optionally, try to re-initialize with the old stream or show error state
            // For simplicity here, we just log and revert the config. A full re-init might be needed.
            // await this.initialize(); // Could cause infinite loop if initial fails too
        }
    }

    /**
     * Helper to generate constraint options
     * @private
     */
    _getConstraintOptions(facingMode) {
         const options = [];
         // Option 1: High quality with desired facingMode
         options.push({
             video: {
                 width: { ideal: 1920 },
                 height: { ideal: 1080 },
                 ...(facingMode ? { facingMode: { exact: facingMode } } : {}) // Use exact for switching if possible
             }
         });
         options.push({
             video: {
                 width: { ideal: 1920 },
                 height: { ideal: 1080 },
                 ...(facingMode ? { facingMode: facingMode } : {})
             }
         });
         // Option 2: Medium quality with desired facingMode
         options.push({
             video: {
                 width: { ideal: 1280 },
                 height: { ideal: 720 },
                 ...(facingMode ? { facingMode: { exact: facingMode } } : {})
             }
         });
         options.push({
             video: {
                 width: { ideal: 1280 },
                 height: { ideal: 720 },
                 ...(facingMode ? { facingMode: facingMode } : {})
             }
         });
          // Option 3: Low quality with desired facingMode
         options.push({
             video: {
                 width: { ideal: 640 },
                 height: { ideal: 480 },
                 ...(facingMode ? { facingMode: { exact: facingMode } } : {})
             }
         });
         options.push({
             video: {
                 width: { ideal: 640 },
                 height: { ideal: 480 },
                 ...(facingMode ? { facingMode: facingMode } : {})
             }
         });
         // Option 4: Just facing mode
         if (facingMode) {
            options.push({ video: { facingMode: { exact: facingMode } } });
            options.push({ video: { facingMode: facingMode } });
         }
         // Option 5: Any camera
         options.push({ video: true });
         return options;
    }

    /**
     * Helper to update video dimensions and canvas after stream starts/changes
     * @private
     */
    async _updateVideoDimensionsAndCanvas() {
        // Wait for video metadata to load to get dimensions
        await new Promise(resolve => {
            if (this.videoElement.readyState >= this.videoElement.HAVE_METADATA) {
                resolve();
            } else {
                this.videoElement.onloadedmetadata = () => resolve();
            }
            // Add a timeout fallback
            setTimeout(() => {
                console.warn("Timeout waiting for video metadata");
                resolve();
            }, 2000); // 2 seconds timeout
        });

         // Get the actual video dimensions
         // Use default values if metadata fails or reports 0
        const videoWidth = this.videoElement.videoWidth || 640;
        const videoHeight = this.videoElement.videoHeight || 480;

        if (videoWidth === 0 || videoHeight === 0) {
            console.warn(`Warning: Video dimensions are zero (${this.videoElement.videoWidth}x${this.videoElement.videoHeight}). Using defaults 640x480.`);
            this.aspectRatio = 480 / 640; // Default aspect ratio
        } else {
            console.log(`Actual video dimensions: ${videoWidth}x${videoHeight}`);
            this.aspectRatio = videoHeight / videoWidth;
        }


        // Calculate canvas size maintaining aspect ratio based on configured *capture* width
        const canvasWidth = this.config.width;
        const canvasHeight = Math.round(this.config.width * this.aspectRatio);

        // Create or update canvas for image processing
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d');
        }
        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
         console.log(`Canvas size set to: ${canvasWidth}x${canvasHeight}`);
    }


    /**
     * Initialize camera stream and canvas with progressive enhancement
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            console.log("Camera already initialized.");
            return;
        }

        try {
            // First check if the MediaDevices API is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('MediaDevices API not supported in this browser');
            }

            // Determine initial facingMode
            const isMobile = /Mobi|Android/i.test(navigator.userAgent);
             // Restore preferred facing mode from localStorage if available, otherwise default
            const savedFacingMode = localStorage.getItem('facingMode');
            if (isMobile && !this.config.facingMode) {
                 this.config.facingMode = savedFacingMode || 'environment'; // Default to back camera on mobile if no preference
            } else if (!isMobile) {
                 this.config.facingMode = null; // Ensure desktop doesn't try facingMode
            }
            console.log(`Initial facingMode determined as: ${this.config.facingMode}`);

            // Try a series of constraints
            const constraintOptions = this._getConstraintOptions(this.config.facingMode);

            // Try each constraint option until one works
            let streamAcquired = false;
            let lastError = null;

            for (const constraints of constraintOptions) {
                try {
                    console.log("Trying camera constraints:", JSON.stringify(constraints));
                    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
                    console.log("Camera access granted with constraints:", JSON.stringify(constraints));
                    streamAcquired = true;
                    break; // Success! Exit the loop.
                } catch (error) {
                    console.warn(`Failed with constraints ${JSON.stringify(constraints)}:`, error.name, error.message);
                    lastError = error;
                    // Don't break, try the next constraint set
                }
            }

            if (!streamAcquired) {
                throw lastError || new Error('Failed to acquire camera stream with any constraints');
            }

             // --- Video Element Setup ---
            this.videoElement = document.createElement('video');
            this.videoElement.srcObject = this.stream;
            this.videoElement.playsInline = true; // Essential for iOS and inline playback
            this.videoElement.muted = true; // Often required for autoplay

            // *** KEY CHANGE: Style the video element for proper display ***
            this.videoElement.style.width = '100%'; // Fill container width
            this.videoElement.style.height = 'auto'; // Adjust height automatically for aspect ratio
            this.videoElement.style.display = 'block'; // Avoid potential inline spacing issues
            this.videoElement.style.maxWidth = '100%'; // Ensure it doesn't overflow container

            // --- Preview Container Setup ---
            const previewContainer = document.getElementById('cameraPreview');
            if (!previewContainer) {
                console.warn('Camera preview container (#cameraPreview) not found in HTML. Creating a basic fallback container.');
                const newContainer = document.createElement('div');
                newContainer.id = 'cameraPreview';
                // *** MODIFIED STYLES for fallback container ***
                newContainer.style.position = 'fixed'; // Or 'absolute', 'relative' depending on need
                newContainer.style.bottom = '10px';
                newContainer.style.right = '10px';
                newContainer.style.maxWidth = '320px'; // Set a max-width instead of fixed width
                newContainer.style.maxHeight = '240px'; // Set a max-height instead of fixed height
                // newContainer.style.width = 'auto'; // Let content (video) determine size up to max
                // newContainer.style.height = 'auto'; // Let content (video) determine size up to max
                newContainer.style.zIndex = '1000';
                newContainer.style.border = '1px solid #666';
                newContainer.style.backgroundColor = '#000'; // Add background for visibility
                // REMOVED: newContainer.style.overflow = 'hidden'; // Allow video to be fully visible
                 newContainer.style.overflow = 'auto'; // Or visible, if border isn't crucial

                document.body.appendChild(newContainer);
                this.previewContainer = newContainer;
                console.log("NOTE: For best results, create and style your own div with id='cameraPreview' in your HTML.");
            } else {
                this.previewContainer = previewContainer;
            }

            // Ensure container is clean before adding video
            this.previewContainer.innerHTML = '';
            this.previewContainer.appendChild(this.videoElement);
             // Ensure preview container is relatively positioned for the button
            if (getComputedStyle(this.previewContainer).position === 'static') {
                this.previewContainer.style.position = 'relative';
            }
            this._createSwitchButton(); // Add switch button (if mobile)
            this.showPreview(); // Show preview container

            // --- Start Playback and Finalize Setup ---
            try {
                await this.videoElement.play();
                console.log("Video playback started successfully");
            } catch (playError) {
                console.error("Error starting video playback:", playError);
                // Attempt to play might fail due to browser policies (e.g., requires user interaction)
                // You might need a button or user gesture to trigger initialize() or play()
                 this.previewContainer.innerHTML = '<p style="color: red; padding: 10px;">Could not autoplay video. User interaction might be required.</p>' + this.previewContainer.innerHTML;
                throw playError; // Re-throw to indicate initialization failure phase
            }

            // Update dimensions and canvas setup using the helper
            await this._updateVideoDimensionsAndCanvas();

            this.isInitialized = true;
            console.log("Camera fully initialized and preview is running.");

        } catch (error) {
            console.error("Camera initialization failed:", error);
            // Clean up any partial initialization
            this.dispose(); // Call dispose to clean up resources
            // Provide feedback to the user
             if (this.previewContainer) {
                this.previewContainer.innerHTML = `<p style="color: orange; padding: 10px;">Camera initialization failed: ${error.message}</p>`;
                this.showPreview(); // Show the error in the preview area
            } else {
                alert(`Camera initialization failed: ${error.message}`); // Fallback alert
            }
             // Re-throw the error so the calling code knows initialization failed
            throw new Error(`Failed to initialize camera: ${error.message}`);
        }
    }

    /**
     * Get current canvas dimensions (for capture)
     * @returns {{width: number, height: number}}
     */
    getDimensions() {
        if (!this.isInitialized || !this.canvas) {
             console.error('Cannot get dimensions, camera not fully initialized.');
            return { width: 0, height: 0 }; // Return default/zero values
            // throw new Error('Camera not initialized. Call initialize() first.');
        }
        return {
            width: this.canvas.width,
            height: this.canvas.height
        };
    }

    /**
     * Capture and process an image from the camera
     * @returns {Promise<string>} Base64 encoded JPEG image data (without the `data:image/jpeg;base64,` prefix)
     */
    async capture() {
        if (!this.isInitialized || !this.videoElement || !this.ctx) {
            throw new Error('Camera not initialized or context lost. Call initialize() first.');
        }

        // Check if video is ready and has valid dimensions
        if (this.videoElement.readyState < this.videoElement.HAVE_CURRENT_DATA || this.videoElement.videoWidth === 0) {
             console.warn('Video not ready for capture, waiting briefly...');
            await new Promise(resolve => setTimeout(resolve, 200)); // Short wait for frame data
             if (this.videoElement.readyState < this.videoElement.HAVE_CURRENT_DATA || this.videoElement.videoWidth === 0) {
                 throw new Error('Video stream not ready or dimensions unavailable for capture.');
             }
        }

        // Draw current video frame to canvas
        // The canvas size is already calculated to match the desired output width and aspect ratio
        this.ctx.drawImage(
            this.videoElement,
            0, 0,                             // Source rectangle top-left corner
            this.videoElement.videoWidth,    // Source rectangle width
            this.videoElement.videoHeight,   // Source rectangle height
            0, 0,                             // Destination canvas top-left corner
            this.canvas.width,                // Destination canvas width
            this.canvas.height                // Destination canvas height
        );

        // Convert to base64 JPEG with specified quality
        const dataUrl = this.canvas.toDataURL('image/jpeg', this.config.quality);

        // Check if the data URL is valid (sometimes returns 'data:,')
        if (!dataUrl || dataUrl === 'data:,') {
            throw new Error('Failed to capture image, canvas returned invalid data URL.');
        }

        // Return only the Base64 part
        return dataUrl.split(',')[1];
    }

    /**
     * Stop camera stream and cleanup resources
     */
    dispose() {
        console.log("Disposing CameraManager resources...");
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            console.log("Camera stream stopped.");
        }
        this.stream = null;

        if (this.videoElement) {
            this.videoElement.pause(); // Pause video
            this.videoElement.srcObject = null; // Detach stream
            if (this.videoElement.parentNode) { // Remove from DOM if still attached
                this.videoElement.parentNode.removeChild(this.videoElement);
            }
            console.log("Video element cleaned up.");
        }
        this.videoElement = null;

         // Remove switch button if it exists
        if (this.switchButton && this.switchButton.parentNode) {
             this.switchButton.parentNode.removeChild(this.switchButton);
        }
        this.switchButton = null;


        // Clear and hide the preview container if it was managed by this class
        if (this.previewContainer) {
            // Check if it was the dynamically created one before removing/clearing fully
            // If user provided the container, maybe just hide it?
            // For simplicity here, we clear and hide.
            this.hidePreview();
            this.previewContainer.innerHTML = ''; // Clear content
             console.log("Preview container cleared and hidden.");
            // Don't nullify previewContainer if it was found in the DOM initially,
            // as the user might want to reuse it. But if created dynamically, okay to nullify.
            // Let's clear it regardless for now.
             // this.previewContainer = null; // Decide if you want to keep the reference
        }


        this.canvas = null; // Allow garbage collection
        this.ctx = null;
        this.isInitialized = false;
        this.aspectRatio = null;
        console.log("CameraManager disposed.");
    }
}
