import React, { useRef, useEffect } from 'react';
import { AudioVisualizer } from '../lib/audio/visualizer'; // Adjust path

const AudioVisualizerComponent = ({ agent }) => {
    const canvasRef = useRef(null);
    const visualizerRef = useRef(null);

    useEffect(() => {
         // Initialize only when agent and its audio components are ready
        if (agent?.audioContext && agent?.audioStreamer?.gainNode && canvasRef.current) {
            const visualizer = new AudioVisualizer(agent.audioContext, canvasRef.current.id); // Pass ID
            visualizerRef.current = visualizer;

             // Connect the streamer's gain node (or another node if preferred)
            agent.audioStreamer.gainNode.connect(visualizer.analyser);

            visualizer.start();

             // Cleanup
            return () => {
                visualizer.cleanup();
                visualizerRef.current = null;
                 // Disconnect node? Check AudioVisualizer cleanup
                 // agent.audioStreamer?.gainNode.disconnect(visualizer.analyser); // Be careful disconnecting shared nodes
            };
         } else {
             // If agent/components aren't ready, ensure visualizer is stopped
            if (visualizerRef.current) {
                visualizerRef.current.stop();
            }
         }
    }, [agent]); // Rerun effect if agent instance changes

     // Give the canvas the ID the visualizer expects
    return <canvas id="visualizer" ref={canvasRef} className="visualizer"></canvas>;
};

export default AudioVisualizerComponent;
