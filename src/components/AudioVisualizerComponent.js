import React, { useRef, useEffect } from 'react';
import { AudioVisualizer } from '../lib/audio/visualizer'; // Adjust path

const AudioVisualizerComponent = ({ agent }) => {
    const canvasRef = useRef(null);
    const visualizerRef = useRef(null);

    useEffect(() => {
        if (agent?.audioContext && agent?.audioStreamer?.gainNode && canvasRef.current) {
            const visualizer = new AudioVisualizer(
                agent.audioContext,
                canvasRef.current.id,
                // Updated colors to match theme
                {
                    gradientColors: ['#a450e0', '#8a2be2', '#ff00ff'], // Example: Lighter purple -> Main Accent -> Magenta
                    lineWidth: 3, // Adjust thickness if desired
                    padding: 10, // Adjust padding
                    smoothingFactor: 0.5 // Adjust smoothing
                }
            );
            visualizerRef.current = visualizer;

            // Check if gainNode is already connected to prevent duplicates if component re-renders
            // Note: This simple check might not be fully robust in complex scenarios.
            // A more robust way might involve tracking connections externally.
             try {
                agent.audioStreamer.gainNode.connect(visualizer.analyser);
                visualizer.start();
             } catch (error) {
                 // Handle potential connection errors (e.g., already connected)
                 console.warn("Error connecting visualizer, may already be connected:", error);
                 // If it might be connected, try starting anyway
                 if (!visualizer.isAnimating) {
                    visualizer.start();
                 }
             }


            return () => {
                 console.log("Cleaning up visualizer...");
                 visualizer.cleanup();
                 visualizerRef.current = null;
                 try {
                     // Only disconnect if the node is still valid and connected
                     if (agent?.audioStreamer?.gainNode && agent?.audioContext?.state !== 'closed') {
                        agent.audioStreamer.gainNode.disconnect(visualizer.analyser);
                        console.log("Disconnected visualizer analyser node.");
                     }
                 } catch (disconnectError) {
                     // Ignore errors often caused by context closing before disconnect
                     console.warn("Ignoring visualizer disconnect error (likely context closed):", disconnectError);
                 }
            };
         } else {
            if (visualizerRef.current) {
                visualizerRef.current.stop();
            }
         }
    }, [agent]); // Rerun effect if agent instance changes

    return <canvas id="visualizer" ref={canvasRef} className="visualizer"></canvas>;
};

export default AudioVisualizerComponent;