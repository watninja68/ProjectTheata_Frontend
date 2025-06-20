import React from 'react';
import { 
    FaPen, 
    FaEraser, 
    FaTrashAlt, 
    FaCircle, 
    FaSquare,
    FaVectorSquare,
    FaExpandArrowsAlt 
} from 'react-icons/fa';
import { MdRectangle } from 'react-icons/md';
import './AnnotationToolbar.css';

const AnnotationToolbar = ({
    brushColor = '#e74c3c', // Muted red as default
    setBrushColor,
    brushSize = 3,
    setBrushSize,
    tool = 'pen',
    setTool,
    clearAnnotations,
    isActive = false,
    setIsActive,
}) => {
    // 5 different colors - mellow tones that complement the UI
    const colors = [
        '#e74c3c', // Muted red
        '#27ae60', // Muted green
        '#3498db', // Muted blue
        '#f39c12', // Muted orange/amber
        '#9b59b6'  // Muted purple
    ];

    const tools = [
        { id: 'pen', icon: FaPen, title: 'Free Draw' },
        { id: 'circle', icon: FaCircle, title: 'Circle' },
        { id: 'square', icon: FaSquare, title: 'Square' },
        { id: 'rectangle', icon: MdRectangle, title: 'Rectangle' },
        { id: 'eraser', icon: FaEraser, title: 'Eraser' }
    ];

    const handleToolChange = (newTool) => {
        setTool(newTool);
        if (!isActive) {
            setIsActive(true);
        }
    };

    const handleColorChange = (color) => {
        setBrushColor(color);
        if (!isActive) {
            setIsActive(true);
        }
    };

    const handleSizeChange = (size) => {
        setBrushSize(size);
        if (!isActive) {
            setIsActive(true);
        }
    };

    const toggleAnnotation = () => {
        setIsActive(!isActive);
    };

    return (
        <div className="annotation-toolbar">
            <div className="toolbar-section">
                <button
                    className={`annotation-toggle ${isActive ? 'active' : ''}`}
                    onClick={toggleAnnotation}
                    title={isActive ? 'Disable Annotations' : 'Enable Annotations'}
                >
                    <FaVectorSquare />
                    {isActive ? 'ON' : 'OFF'}
                </button>
            </div>

            {isActive && (
                <>
                    <div className="toolbar-section tools-section">
                        <span className="section-label">Tools:</span>
                        {tools.map(({ id, icon: Icon, title }) => (
                            <button
                                key={id}
                                title={title}
                                className={`tool-button ${tool === id ? 'active' : ''}`}
                                onClick={() => handleToolChange(id)}
                            >
                                <Icon />
                            </button>
                        ))}
                    </div>

                    <div className="toolbar-section colors-section">
                        <span className="section-label">Colors:</span>
                        <div className="color-palette">
                            {colors.map(color => (
                                <button
                                    key={color}
                                    title={`Color ${color}`}
                                    className={`color-button ${brushColor === color ? 'active' : ''}`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => handleColorChange(color)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="toolbar-section size-section">
                        <span className="section-label">Size:</span>
                        <div className="size-controls">
                            <FaExpandArrowsAlt className="size-icon" />
                            <input
                                type="range"
                                min="1"
                                max="20"
                                value={brushSize}
                                onChange={(e) => handleSizeChange(Number(e.target.value))}
                                className="size-slider"
                                title="Brush Size"
                            />
                            <span className="size-indicator">{brushSize}px</span>
                        </div>
                    </div>

                    <div className="toolbar-section actions-section">
                        <button 
                            title="Clear All Annotations" 
                            className="tool-button clear-button" 
                            onClick={clearAnnotations}
                        >
                            <FaTrashAlt />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default AnnotationToolbar;
