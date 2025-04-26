/**
 * AudioVisualizer creates a waveform visualization
 * using Web Audio API's AnalyserNode to process audio data in real-time.
 */
export class AudioVisualizer {
    constructor(audioContext, canvasId) {
        this.audioContext = audioContext;
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Set up audio nodes
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 1024; // Reduced for smoother animation
        this.analyser.smoothingTimeConstant = 0.85; // Increased smoothing
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        this.prevDataArray = new Uint8Array(this.bufferLength);
        
        // Visualization settings
        this.gradientColors = ['#4CAF50', '#81C784', '#A5D6A7']; // Multiple green shades
        this.lineWidth = 4; // Thicker lines
        this.padding = 40; // Increased padding
        this.smoothingFactor = 0.4; // Value between 0 and 1 for interpolation
        
        // Animation
        this.isAnimating = false;
        this.animationId = null;
        
        // Bind methods
        this.draw = this.draw.bind(this);
        this.resize = this.resize.bind(this);
        
        // Initial setup
        this.resize();
        window.addEventListener('resize', this.resize);
        this.createGradient();
    }
    
    /**
     * Connects an audio node to the visualizer
     * @param {AudioNode} sourceNode - The audio node to visualize
     */
    connectSource(sourceNode) {
        sourceNode.connect(this.analyser);
    }
    
    /**
     * Starts the visualization animation
     */
    start() {
        if (!this.isAnimating) {
            this.isAnimating = true;
            this.draw();
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
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    /**
     * Creates gradient for visualization
     */
    createGradient() {
        this.gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);
        this.gradientColors.forEach((color, index) => {
            this.gradient.addColorStop(index / (this.gradientColors.length - 1), color);
        });
    }
    
    /**
     * Handles canvas resize
     */
    resize() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.offsetWidth;
        this.canvas.height = container.offsetHeight;
        this.createGradient();
    }
    
    /**
     * Interpolates between two values for smoother animation
     */
    lerp(start, end, amt) {
        return (1 - amt) * start + amt * end;
    }
    
    /**
     * Draws the visualization frame
     */
    draw() {
        if (!this.isAnimating) return;
        
        // Store previous data and get new data
        this.prevDataArray.set(this.dataArray);
        this.analyser.getByteTimeDomainData(this.dataArray);
        
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Set up drawing style
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.strokeStyle = this.gradient;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Calculate dimensions
        const width = this.canvas.width - (this.padding * 2);
        const height = this.canvas.height - (this.padding * 2);
        const centerY = this.canvas.height / 2;
        
        // Draw the waveform
        const sliceWidth = width / (this.bufferLength - 1);
        let x = this.padding;
        
        // Start the path
        this.ctx.beginPath();
        this.ctx.moveTo(x, centerY);
        
        // Draw smooth curve
        for (let i = 0; i < this.bufferLength; i++) {
            // Interpolate between previous and current values
            const currentValue = this.dataArray[i] / 128.0;
            const prevValue = this.prevDataArray[i] / 128.0;
            const v = this.lerp(prevValue, currentValue, this.smoothingFactor);
            
            const y = (v * height / 2) + centerY;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                // Use quadratic curves for smoother lines
                const prevX = x - sliceWidth;
                const prevY = (this.lerp(this.prevDataArray[i-1]/128.0, this.dataArray[i-1]/128.0, this.smoothingFactor) * height / 2) + centerY;
                const cpX = (prevX + x) / 2;
                this.ctx.quadraticCurveTo(cpX, prevY, x, y);
            }
            
            x += sliceWidth;
        }
        
        // Add glow effect
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = this.gradientColors[0];
        
        // Stroke the path
        this.ctx.stroke();
        
        // Reset shadow for next frame
        this.ctx.shadowBlur = 0;
        
        // Request next frame
        this.animationId = requestAnimationFrame(this.draw);
    }
    
    /**
     * Clean up resources
     */
    cleanup() {
        this.stop();
        window.removeEventListener('resize', this.resize);
        if (this.analyser) {
            this.analyser.disconnect();
        }
    }
}
