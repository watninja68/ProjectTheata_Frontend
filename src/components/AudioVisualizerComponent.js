import React, { useRef, useEffect } from 'react';
import { AudioVisualizer } from '../lib/audio/visualizer'; // Adjust path

const AudioVisualizerComponent = ({ agent }) => {
    const canvasRef = useRef(null);
    const visualizerRef = useRef(null);

    useEffect(() => {
        // --- Check for the NEW analyserTapNode ---
        if (agent?.audioContext && agent?.audioStreamer?.analyserTapNode && canvasRef.current) {
            const targetNode = agent.audioStreamer.analyserTapNode; // Use the tap node
            console.log("AudioVisualizerComponent: Setting up visualizer on analyserTapNode.");

            const visualizer = new AudioVisualizer(
                agent.audioContext,
                canvasRef.current.id,
                {
                    gradientColors: ['#a450e0', '#8a2be2', '#ff00ff'],
                    lineWidth: 3,
                    padding: 10,
                    smoothingFactor: 0.5
                }
            );
            visualizerRef.current = visualizer;

            try {
                // --- Connect to the NEW analyserTapNode ---
                targetNode.connect(visualizer.analyser);
                visualizer.start();
                console.log("AudioVisualizerComponent: Connected analyser to analyserTapNode and started.");
            } catch (error) {
                console.warn("Error connecting/starting visualizer:", error);
                if (!visualizer.isAnimating) { visualizer.start(); } // Try starting anyway
            }

            return () => {
                console.log("AudioVisualizerComponent: Cleaning up visualizer...");
                const currentVisualizer = visualizerRef.current; // Capture ref value
                const currentTargetNode = agent?.audioStreamer?.analyserTapNode; // Capture node ref

                if (currentVisualizer) {
                    currentVisualizer.cleanup(); // Stops animation and disconnects analyser internally
                    visualizerRef.current = null;
                }

                // --- Attempt to disconnect the analyser from the tap node ---
                // The visualizer's cleanup should already do this, but being explicit doesn't hurt.
                try {
                     if (currentTargetNode && currentVisualizer?.analyser && agent?.audioContext?.state !== 'closed') {
                        currentTargetNode.disconnect(currentVisualizer.analyser);
                        console.log("AudioVisualizerComponent: Disconnected analyser from analyserTapNode (explicit).");
                     }
                } catch (disconnectError) {
                     console.warn("Ignoring visualizer disconnect error (cleanup):", disconnectError);
                }
                // --- End explicit disconnect ---
            };
        } else {
            // Cleanup if dependencies change and target node is no longer available
            if (visualizerRef.current) {
                console.log("AudioVisualizerComponent: Dependencies changed, stopping visualizer.");
                visualizerRef.current.stop();
            }
            // Log why it didn't initialize
            // console.debug("AudioVisualizerComponent: Skipping setup (Agent, Context, or TapNode missing)",
            //    { hasAgent: !!agent, hasContext: !!agent?.audioContext, hasTapNode: !!agent?.audioStreamer?.analyserTapNode });
        }
    }, [agent]); // Rerun effect if agent instance changes

    return <canvas id="visualizer" ref={canvasRef} className="visualizer"></canvas>;
};

export default AudioVisualizerComponent;