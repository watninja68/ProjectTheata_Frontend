import React, { useRef, useEffect, useState, useCallback } from 'react';
import './WhiteboardCanvas.css';

const WhiteboardCanvas = ({
    width = 800, // Default width
    height = 600, // Default height
    brushColor = '#FFFFFF', // Default white pen on dark background
    brushSize = 3,
    tool = 'pen', // 'pen' or 'eraser'
    isActive = true, // To enable/disable drawing
    backgroundColor = 'rgba(30, 15, 58, 0.8)', // Default dark background
}) => {
    const canvasRef = useRef(null);
    const contextRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPosition, setLastPosition] = useState(null);

    // Initialize canvas and context
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // For HiDPI screens
        const scale = window.devicePixelRatio || 1;
        canvas.width = width * scale;
        canvas.height = height * scale;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const context = canvas.getContext('2d');
        context.scale(scale, scale);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        contextRef.current = context;

        // Initial clear with background color
        clearCanvas(context, canvas, backgroundColor);

    }, [width, height, backgroundColor]);

    // Update drawing properties when props change
    useEffect(() => {
        if (contextRef.current) {
            contextRef.current.strokeStyle = brushColor;
            contextRef.current.lineWidth = brushSize;
        }
    }, [brushColor, brushSize]);


    const clearCanvas = (ctx, canvas, bgCol) => {
        if (ctx && canvas) {
            ctx.fillStyle = bgCol;
            ctx.fillRect(0, 0, canvas.width / (window.devicePixelRatio || 1) , canvas.height / (window.devicePixelRatio || 1));
        }
    };

    const getMousePos = (canvasDOM, event) => {
        const rect = canvasDOM.getBoundingClientRect();
        // For touch events
        const clientX = event.clientX || event.touches[0]?.clientX;
        const clientY = event.clientY || event.touches[0]?.clientY;
        if (clientX === undefined || clientY === undefined) return null;

        return {
            x: clientX - rect.left,
            y: clientY - rect.top,
        };
    };

    const startDrawing = useCallback((event) => {
        if (!isActive || !contextRef.current) return;
        const pos = getMousePos(canvasRef.current, event.nativeEvent || event);
        if (!pos) return;

        setIsDrawing(true);
        setLastPosition(pos);
        // Draw a single dot if it's a click/tap without drag
        contextRef.current.beginPath();
        contextRef.current.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
        contextRef.current.fillStyle = tool === 'eraser' ? backgroundColor : brushColor;
        contextRef.current.fill();
        contextRef.current.closePath();

    }, [isActive, brushSize, tool, backgroundColor, brushColor]);

    const draw = useCallback((event) => {
        if (!isDrawing || !isActive || !contextRef.current || !lastPosition) return;
         const pos = getMousePos(canvasRef.current, event.nativeEvent || event);
        if (!pos) return;

        contextRef.current.beginPath();
        contextRef.current.moveTo(lastPosition.x, lastPosition.y);

        if (tool === 'eraser') {
            contextRef.current.strokeStyle = backgroundColor; // Erase with background color
            contextRef.current.lineWidth = brushSize * 3; // Eraser might need to be larger
        } else {
            contextRef.current.strokeStyle = brushColor;
            contextRef.current.lineWidth = brushSize;
        }

        contextRef.current.lineTo(pos.x, pos.y);
        contextRef.current.stroke();
        contextRef.current.closePath();
        setLastPosition(pos);
    }, [isDrawing, isActive, lastPosition, brushColor, brushSize, tool, backgroundColor]);

    const stopDrawing = useCallback(() => {
        setIsDrawing(false);
        setLastPosition(null);
    }, []);

    // Expose clear and capture methods via ref
    useEffect(() => {
        if (canvasRef.current) {
            canvasRef.current.clear = () => clearCanvas(contextRef.current, canvasRef.current, backgroundColor);
            canvasRef.current.captureFrame = (quality = 0.5) => {
                if (canvasRef.current) {
                    const dataUrl = canvasRef.current.toDataURL('image/jpeg', quality);
                    return dataUrl.split(',')[1]; // Return only base64 part
                }
                return null;
            };
        }
    }, [backgroundColor]); // Re-attach if background color changes for clear function

    return (
        <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseOut={stopDrawing} // Stop drawing if mouse leaves canvas
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="whiteboard-canvas"
        />
    );
};

export default WhiteboardCanvas;