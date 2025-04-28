/**
 * AudioVisualizer creates a waveform visualization
 * using Web Audio API's AnalyserNode to process audio data in real-time.
 */
export class AudioVisualizer {
    // Accept optional settings object
    constructor(audioContext, canvasId, settings = {}) {
        this.audioContext = audioContext;
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
             console.error(`AudioVisualizer: Canvas element with ID "${canvasId}" not found.`);
             return; // Prevent errors if canvas doesn't exist
        }
        this.ctx = this.canvas.getContext('2d');

        // Set up audio nodes
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = settings.fftSize || 1024; // Allow override
        this.analyser.smoothingTimeConstant = settings.smoothingTimeConstant || 0.85; // Allow override
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        this.prevDataArray = new Uint8Array(this.bufferLength);

        // Visualization settings with defaults from constructor args
        this.gradientColors = settings.gradientColors || ['#4CAF50', '#81C784', '#A5D6A7'];
        this.lineWidth = settings.lineWidth || 4;
        this.padding = settings.padding || 40;
        this.smoothingFactor = settings.smoothingFactor || 0.4; // Interpolation between frames

        // Animation
        this.isAnimating = false;
        this.animationId = null;

        // Bind methods
        this.draw = this.draw.bind(this);
        this.resize = this.resize.bind(this);

        // Initial setup
        this.resize(); // Initial resize
        window.addEventListener('resize', this.resize);
        this.createGradient(); // Create initial gradient

         console.log("AudioVisualizer initialized with colors:", this.gradientColors);
    }

    /**
     * Connects an audio node to the visualizer
     * @param {AudioNode} sourceNode - The audio node to visualize
     */
    connectSource(sourceNode) {
         if (!this.analyser) return; // Guard against null analyser
        sourceNode.connect(this.analyser);
    }

    /**
     * Starts the visualization animation
     */
    start() {
        if (!this.canvas) return; // Don't start if canvas is missing
        if (!this.isAnimating) {
            this.isAnimating = true;
            this.draw();
             console.log("AudioVisualizer started.");
        }
    }

    /**
     * Stops the visualization animation
     */
    stop() {
        this.isAnimating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        // Clear the canvas when stopped
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
             console.log("AudioVisualizer stopped and canvas cleared.");
        } else {
             console.log("AudioVisualizer stopped.");
        }
    }

    /**
     * Creates gradient for visualization based on current colors and canvas width
     */
    createGradient() {
         if (!this.ctx || !this.canvas || this.canvas.width === 0) return; // Need context and valid canvas size

        this.gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);
        const numColors = this.gradientColors.length;
        if (numColors > 0) {
             this.gradientColors.forEach((color, index) => {
                 // Ensure stops are distributed correctly even for 1 or 2 colors
                 const stopPosition = numColors === 1 ? 0.5 : index / (numColors - 1);
                 this.gradient.addColorStop(Math.max(0, Math.min(1, stopPosition)), color);
            });
        }
    }

    /**
     * Handles canvas resize, adjusting dimensions and recreating the gradient
     */
    resize() {
         if (!this.canvas || !this.canvas.parentElement) return; // Ensure canvas and parent exist

        const container = this.canvas.parentElement;
        // Use clientWidth/Height for accurate dimensions respecting CSS
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;

        // Only update if dimensions actually changed to avoid unnecessary redraws/gradient creation
        if (this.canvas.width !== newWidth || this.canvas.height !== newHeight) {
             this.canvas.width = newWidth;
             this.canvas.height = newHeight;
             this.createGradient(); // Recreate gradient with new dimensions
             console.log(`Visualizer resized to: ${newWidth}x${newHeight}`);
        }
    }

    /**
     * Interpolates between two values for smoother animation
     */
    lerp(start, end, amt) {
        // Clamp amount to prevent overshooting
        const clampedAmt = Math.max(0, Math.min(1, amt));
        return (1 - clampedAmt) * start + clampedAmt * end;
    }

    /**
     * Draws the visualization frame
     */
    draw() {
        if (!this.isAnimating || !this.ctx || !this.analyser) {
             if (this.isAnimating) { // If animation should be running but context/analyser is missing
                 console.warn("Visualizer draw loop stopped: Missing context or analyser.");
                 this.stop(); // Stop the loop properly
             }
            return;
        }

        // Store previous data and get new data
        this.prevDataArray.set(this.dataArray);
        this.analyser.getByteTimeDomainData(this.dataArray); // Use TimeDomain data for waveform

        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Set up drawing style
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.strokeStyle = this.gradient || '#ffffff'; // Fallback to white if gradient fails
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Calculate dimensions for drawing area
        const width = this.canvas.width - (this.padding * 2);
        const height = this.canvas.height - (this.padding * 2);
        const centerY = this.canvas.height / 2;

        if (width <= 0 || height <= 0) {
             // Skip drawing if canvas size is invalid
             this.animationId = requestAnimationFrame(this.draw);
             return;
        }

        // Draw the waveform
        const sliceWidth = width / (this.bufferLength - 1);
        let x = this.padding; // Start drawing after left padding

        this.ctx.beginPath();

        // Move to the first point
        const firstValue = this.dataArray[0] / 128.0; // Normalize byte data (0-255) to 0.0-2.0
        const firstY = (firstValue - 1.0) * height / 2 + centerY; // Center the waveform vertically
        this.ctx.moveTo(x, firstY);

        // Draw smooth curve using interpolated values
        for (let i = 1; i < this.bufferLength; i++) {
            // Interpolate between previous and current byte values
            const currentValue = this.dataArray[i] / 128.0;
            const prevValue = this.prevDataArray[i] / 128.0; // Use previous frame's data
            const v = this.lerp(prevValue, currentValue, this.smoothingFactor); // Interpolate

            const y = (v - 1.0) * height / 2 + centerY; // Center the waveform vertically

            // --- Using lineTo for simpler waveform ---
            this.ctx.lineTo(x, y);

            // --- Alternative: Quadratic curve (can be smoother but more complex) ---
            // const prevDataIdx = Math.max(0, i - 1);
            // const prevV = this.lerp(this.prevDataArray[prevDataIdx] / 128.0, this.dataArray[prevDataIdx] / 128.0, this.smoothingFactor);
            // const prevY = (prevV - 1.0) * height / 2 + centerY;
            // const cpX = (x - sliceWidth + x) / 2; // Control point x halfway between previous and current x
            // this.ctx.quadraticCurveTo(cpX, prevY, x, y); // Curve from previous point to current

            x += sliceWidth;
        }

        // Add glow effect (applied to the stroke)
        this.ctx.shadowBlur = 8; // Adjust glow size
        this.ctx.shadowColor = this.gradientColors[1] || this.gradientColors[0] || '#ffffff'; // Use middle color for glow

        // Stroke the path
        this.ctx.stroke();

        // Reset shadow for next frame to avoid affecting other elements
        this.ctx.shadowBlur = 0;

        // Request next frame
        this.animationId = requestAnimationFrame(this.draw);
    }

    /**
     * Clean up resources: stop animation, remove event listener, disconnect analyser.
     */
    cleanup() {
        this.stop();
        window.removeEventListener('resize', this.resize);
        try {
             if (this.analyser) {
                 this.analyser.disconnect(); // Disconnect the analyser node
                 console.log("AudioVisualizer analyser node disconnected.");
             }
        } catch (e) {
             console.warn("Error disconnecting analyser node during cleanup:", e);
        }
        this.analyser = null; // Release reference
        this.ctx = null;
        this.canvas = null;
         console.log("AudioVisualizer resources cleaned up.");
    }
}