import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import './AnnotationOverlay.css';

const AnnotationOverlay = forwardRef(({
    isActive = false,
    brushColor = '#FF0000',
    brushSize = 3,
    tool = 'pen', // 'pen', 'circle', 'square', 'rectangle', 'eraser'
    onAnnotationChange = null, // Callback when annotations change
}, ref) => {
    const canvasRef = useRef(null);
    const contextRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastPosition, setLastPosition] = useState(null);
    const [startPosition, setStartPosition] = useState(null);
    const [currentShape, setCurrentShape] = useState(null);
    const [annotations, setAnnotations] = useState([]);

    // Initialize canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.globalCompositeOperation = 'source-over';
        contextRef.current = context;

        // Set canvas size to match container
        const resizeCanvas = () => {
            const container = canvas.parentElement;
            if (container) {
                const rect = container.getBoundingClientRect();
                canvas.width = rect.width;
                canvas.height = rect.height;
                redrawAnnotations();
            }
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
        };
    }, []);

    // Redraw all annotations
    const redrawAnnotations = useCallback(() => {
        const context = contextRef.current;
        const canvas = canvasRef.current;
        if (!context || !canvas) return;

        // Clear canvas and reset context state
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'source-over';

        annotations.forEach(annotation => {
            // Set context properties for this annotation
            if (annotation.tool === 'eraser') {
                context.globalCompositeOperation = 'destination-out';
                context.strokeStyle = 'rgba(0,0,0,1)'; // Use opaque color for eraser
            } else {
                context.globalCompositeOperation = 'source-over';
                context.strokeStyle = annotation.color;
            }
            context.fillStyle = annotation.color;
            context.lineWidth = annotation.size;

            switch (annotation.type) {
                case 'path':
                    context.beginPath();
                    annotation.points.forEach((point, index) => {
                        if (index === 0) {
                            context.moveTo(point.x, point.y);
                        } else {
                            context.lineTo(point.x, point.y);
                        }
                    });
                    context.stroke();
                    break;
                case 'circle':
                    context.beginPath();
                    const radius = Math.sqrt(
                        Math.pow(annotation.end.x - annotation.start.x, 2) +
                        Math.pow(annotation.end.y - annotation.start.y, 2)
                    );
                    context.arc(annotation.start.x, annotation.start.y, radius, 0, 2 * Math.PI);
                    context.stroke();
                    break;
                case 'square':
                    const size = Math.max(
                        Math.abs(annotation.end.x - annotation.start.x),
                        Math.abs(annotation.end.y - annotation.start.y)
                    );
                    context.strokeRect(annotation.start.x, annotation.start.y, size, size);
                    break;
                case 'rectangle':
                    const width = annotation.end.x - annotation.start.x;
                    const height = annotation.end.y - annotation.start.y;
                    context.strokeRect(annotation.start.x, annotation.start.y, width, height);
                    break;
            }
        });

        // Reset context state after drawing
        context.globalCompositeOperation = 'source-over';
    }, [annotations]);

    // Get mouse/touch position relative to canvas
    const getPosition = useCallback((canvas, event) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = event.clientX || (event.touches && event.touches[0]?.clientX);
        const clientY = event.clientY || (event.touches && event.touches[0]?.clientY);
        
        if (clientX === undefined || clientY === undefined) return null;
        
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }, []);

    // Start drawing/shape creation
    const startDrawing = useCallback((event) => {
        if (!isActive || !contextRef.current) return;
        
        event.preventDefault();
        const pos = getPosition(canvasRef.current, event.nativeEvent || event);
        if (!pos) return;

        setIsDrawing(true);
        setLastPosition(pos);
        setStartPosition(pos);

        if (tool === 'pen' || tool === 'eraser') {
            // Start a new path
            setCurrentShape({
                type: 'path',
                points: [pos],
                color: brushColor, // Always use the brush color, eraser logic handled in rendering
                size: tool === 'eraser' ? brushSize * 2 : brushSize,
                tool: tool
            });
        } else {
            // Start a new shape
            setCurrentShape({
                type: tool,
                start: pos,
                end: pos,
                color: brushColor,
                size: brushSize,
                tool: tool
            });
        }
    }, [isActive, tool, brushColor, brushSize, getPosition]);

    // Continue drawing/shape creation
    const draw = useCallback((event) => {
        if (!isDrawing || !isActive || !contextRef.current || !currentShape) return;
        
        event.preventDefault();
        const pos = getPosition(canvasRef.current, event.nativeEvent || event);
        if (!pos) return;

        if (tool === 'pen' || tool === 'eraser') {
            // Add point to current path
            setCurrentShape(prev => ({
                ...prev,
                points: [...prev.points, pos]
            }));
        } else {
            // Update shape end position
            setCurrentShape(prev => ({
                ...prev,
                end: pos
            }));
        }

        setLastPosition(pos);
    }, [isDrawing, isActive, tool, getPosition, currentShape]);

    // Stop drawing/shape creation
    const stopDrawing = useCallback(() => {
        if (!isDrawing || !currentShape) return;

        setIsDrawing(false);
        
        // Add completed annotation to the list
        setAnnotations(prev => {
            const newAnnotations = [...prev, currentShape];
            // Notify parent of annotation change
            if (onAnnotationChange) {
                onAnnotationChange(newAnnotations);
            }
            return newAnnotations;
        });

        setCurrentShape(null);
        setLastPosition(null);
        setStartPosition(null);
    }, [isDrawing, currentShape, onAnnotationChange]);

    // Draw current shape preview
    useEffect(() => {
        if (!currentShape || !contextRef.current) return;

        redrawAnnotations();

        const context = contextRef.current;

        // Set context properties for preview
        if (currentShape.tool === 'eraser') {
            context.globalCompositeOperation = 'destination-out';
            context.strokeStyle = 'rgba(0,0,0,1)'; // Use opaque color for eraser
        } else {
            context.globalCompositeOperation = 'source-over';
            context.strokeStyle = currentShape.color;
        }
        context.fillStyle = currentShape.color;
        context.lineWidth = currentShape.size;

        switch (currentShape.type) {
            case 'path':
                context.beginPath();
                currentShape.points.forEach((point, index) => {
                    if (index === 0) {
                        context.moveTo(point.x, point.y);
                    } else {
                        context.lineTo(point.x, point.y);
                    }
                });
                context.stroke();
                break;
            case 'circle':
                context.beginPath();
                const radius = Math.sqrt(
                    Math.pow(currentShape.end.x - currentShape.start.x, 2) +
                    Math.pow(currentShape.end.y - currentShape.start.y, 2)
                );
                context.arc(currentShape.start.x, currentShape.start.y, radius, 0, 2 * Math.PI);
                context.stroke();
                break;
            case 'square':
                const size = Math.max(
                    Math.abs(currentShape.end.x - currentShape.start.x),
                    Math.abs(currentShape.end.y - currentShape.start.y)
                );
                context.strokeRect(currentShape.start.x, currentShape.start.y, size, size);
                break;
            case 'rectangle':
                const width = currentShape.end.x - currentShape.start.x;
                const height = currentShape.end.y - currentShape.start.y;
                context.strokeRect(currentShape.start.x, currentShape.start.y, width, height);
                break;
        }

        // Reset context state after preview
        context.globalCompositeOperation = 'source-over';
    }, [currentShape, redrawAnnotations]);

    // Redraw annotations when they change
    useEffect(() => {
        redrawAnnotations();
    }, [annotations, redrawAnnotations]);

    // Clear all annotations
    const clearAnnotations = useCallback(() => {
        setAnnotations([]);
        setCurrentShape(null);
        const context = contextRef.current;
        const canvas = canvasRef.current;
        if (context && canvas) {
            context.clearRect(0, 0, canvas.width, canvas.height);
            // Reset canvas context to default state
            context.globalCompositeOperation = 'source-over';
            context.lineCap = 'round';
            context.lineJoin = 'round';
        }
        if (onAnnotationChange) {
            onAnnotationChange([]);
        }
    }, [onAnnotationChange]);

    // Capture annotation canvas as image data
    const captureAnnotations = useCallback((quality = 0.9) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        
        try {
            const dataUrl = canvas.toDataURL('image/png', quality);
            return dataUrl;
        } catch (error) {
            console.error('Error capturing annotations:', error);
            return null;
        }
    }, []);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
        clearAnnotations,
        captureAnnotations,
        getAnnotations: () => annotations
    }), [clearAnnotations, captureAnnotations, annotations]);

    return (
        <canvas
            ref={canvasRef}
            className={`annotation-overlay ${isActive ? 'active' : ''}`}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            style={{
                pointerEvents: isActive ? 'auto' : 'none',
                cursor: isActive ? (tool === 'eraser' ? 'crosshair' : 'crosshair') : 'default'
            }}
        />
    );
});

AnnotationOverlay.displayName = 'AnnotationOverlay';

export default AnnotationOverlay;
