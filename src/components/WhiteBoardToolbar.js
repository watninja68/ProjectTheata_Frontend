// FILE: watninja68-projecttheata_frontend/src/components/WhiteboardToolbar.js
import React from 'react';
import './WhiteBoardToolbar.css';
import { FaPen, FaEraser, FaTrashAlt, FaPalette, FaExpandArrowsAlt } from 'react-icons/fa'; // Added palette and size icons

const WhiteboardToolbar = ({
    brushColor, setBrushColor,
    brushSize, setBrushSize,
    tool, setTool,
    clearCanvas,
    // onToggleFullscreen, // Future feature
}) => {
    const colors = ['#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#000000'];
    const sizes = [2, 5, 10, 15, 20];

    return (
        <div className="whiteboard-toolbar">
            <div className="toolbar-section">
                <button
                    title="Pen"
                    className={`tool-button ${tool === 'pen' ? 'active' : ''}`}
                    onClick={() => setTool('pen')}
                >
                    <FaPen />
                </button>
                <button
                    title="Eraser"
                    className={`tool-button ${tool === 'eraser' ? 'active' : ''}`}
                    onClick={() => setTool('eraser')}
                >
                    <FaEraser />
                </button>
            </div>

            <div className="toolbar-section">
                <label htmlFor="brushColor" className="toolbar-label"><FaPalette title="Brush Color"/></label>
                <input
                    type="color"
                    id="brushColor"
                    title="Brush Color"
                    value={brushColor}
                    onChange={(e) => setBrushColor(e.target.value)}
                    className="color-input"
                />
                <div className="color-palette">
                    {colors.map(color => (
                        <button
                            key={color}
                            title={`Color ${color}`}
                            className="palette-color-button"
                            style={{ backgroundColor: color }}
                            onClick={() => setBrushColor(color)}
                        />
                    ))}
                </div>
            </div>

            <div className="toolbar-section">
                <label htmlFor="brushSize" className="toolbar-label"><FaExpandArrowsAlt title="Brush Size" style={{transform: 'rotate(45deg)'}} /></label>
                <input
                    type="range"
                    id="brushSize"
                    title="Brush Size"
                    min="1"
                    max="50"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="size-slider"
                />
                <span className="size-indicator">{brushSize}px</span>
            </div>

            <div className="toolbar-section">
                <button title="Clear Canvas" className="tool-button clear-button" onClick={clearCanvas}>
                    <FaTrashAlt /> Clear
                </button>
            </div>
            {/* <button title="Toggle Fullscreen" className="tool-button" onClick={onToggleFullscreen}><FaExpand /></button> */}
        </div>
    );
};

export default WhiteboardToolbar;