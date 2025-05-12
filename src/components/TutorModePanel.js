// FILE: watninja68-projecttheata_frontend/src/components/TutorModePanel.js
import React, { useState, useRef, useEffect } from 'react';
import WhiteboardCanvas from './WhiteboardCanvas';
import WhiteboardToolbar from './WhiteBoardToolbar';
import './TutorModePanel.css';
import { useSettings } from '../hooks/useSettings'; // To get theme for background

const TutorModePanel = ({
    isVisible,
    onClose,
    getWhiteboardFrame, // Callback to pass the capture function to App.js
    initialWidth = 800,
    initialHeight = 600,
}) => {
    const [brushColor, setBrushColor] = useState('#FFFFFF'); // Start with white for dark mode
    const [brushSize, setBrushSize] = useState(5);
    const [tool, setTool] = useState('pen');
    const whiteboardCanvasRef = useRef(null); // Ref to access WhiteboardCanvas methods
    const { theme } = useSettings();

    // Determine whiteboard background based on theme
    const whiteboardBackgroundColor = theme === 'light' ? 'rgba(244, 247, 250, 0.9)' : 'rgba(20, 10, 35, 0.85)';
     // Determine initial brush color based on theme for better visibility
    useEffect(() => {
        setBrushColor(theme === 'light' ? '#000000' : '#FFFFFF');
    }, [theme]);


    const handleClearCanvas = () => {
        if (whiteboardCanvasRef.current && whiteboardCanvasRef.current.clear) {
            whiteboardCanvasRef.current.clear();
        }
    };

    // Pass the captureFrame function up to App.js when the component mounts or updates
    useEffect(() => {
        if (getWhiteboardFrame && whiteboardCanvasRef.current && whiteboardCanvasRef.current.captureFrame) {
            getWhiteboardFrame(() => whiteboardCanvasRef.current.captureFrame(0.6)); // Pass quality here
        }
    }, [getWhiteboardFrame, whiteboardCanvasRef.current]);


    if (!isVisible) {
        return null;
    }

    return (
        <div className="tutor-mode-panel-overlay" onClick={onClose}>
            <div className="tutor-mode-panel-content" onClick={(e) => e.stopPropagation()}>
                <button className="close-panel-button" onClick={onClose} title="Close Tutor Mode">
                    ×
                </button>
                <WhiteboardToolbar
                    brushColor={brushColor} setBrushColor={setBrushColor}
                    brushSize={brushSize} setBrushSize={setBrushSize}
                    tool={tool} setTool={setTool}
                    clearCanvas={handleClearCanvas}
                />
                <div className="whiteboard-canvas-container">
                    <WhiteboardCanvas
                        ref={whiteboardCanvasRef} // Attach ref here
                        width={initialWidth} // Or make responsive
                        height={initialHeight} // Or make responsive
                        brushColor={brushColor}
                        brushSize={brushSize}
                        tool={tool}
                        isActive={true} // Always active when panel is visible
                        backgroundColor={whiteboardBackgroundColor}
                    />
                </div>
            </div>
        </div>
    );
};

export default TutorModePanel;