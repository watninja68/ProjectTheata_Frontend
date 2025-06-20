import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import './AnnotationOverlay.css';

const AnnotationOverlay = forwardRef(({
    isActive = false,
    brushColor = '#e74c3c', // Muted red as default
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
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 });
    const canvasSizeRef = useRef({ width: 0, height: 0 });
    const originalSizeRef = useRef({ width: 0, height: 0 });

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
                const newWidth = rect.width;
                const newHeight = rect.height;

                // Only update if size actually changed
                if (canvasSizeRef.current.width !== newWidth || canvasSizeRef.current.height !== newHeight) {
                    // Store original size on first resize
                    if (originalSizeRef.current.width === 0 && originalSizeRef.current.height === 0) {
                        const newOriginalSize = { width: newWidth, height: newHeight };
                        setOriginalSize(newOriginalSize);
                        originalSizeRef.current = newOriginalSize;
                    }

                    canvas.width = newWidth;
                    canvas.height = newHeight;
                    const newCanvasSize = { width: newWidth, height: newHeight };
                    setCanvasSize(newCanvasSize);
                    canvasSizeRef.current = newCanvasSize;

                    // Use requestAnimationFrame for smooth redrawing
                    requestAnimationFrame(() => {
                        redrawAnnotations();
                    });
                }
            }
        };

        resizeCanvas();

        // Use ResizeObserver for container resize detection
        let resizeObserver;
        let resizeTimeout;

        if (window.ResizeObserver) {
            resizeObserver = new ResizeObserver((entries) => {
                // Debounce to prevent excessive calls
                if (resizeTimeout) {
                    clearTimeout(resizeTimeout);
                }
                resizeTimeout = setTimeout(() => {
                    requestAnimationFrame(resizeCanvas);
                }, 16);
            });

            const container = canvas.parentElement;
            if (container) {
                resizeObserver.observe(container);
            }
        }

        // Listen for custom screen preview resize events
        const handleCustomResize = () => {
            requestAnimationFrame(resizeCanvas);
        };

        const container = canvas.parentElement;
        if (container) {
            container.addEventListener('screenPreviewResize', handleCustomResize);
        }

        // Fallback to window resize (debounced)
        const handleWindowResize = () => {
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            resizeTimeout = setTimeout(() => {
                requestAnimationFrame(resizeCanvas);
            }, 16);
        };

        window.addEventListener('resize', handleWindowResize);

        return () => {
            window.removeEventListener('resize', handleWindowResize);
            if (container) {
                container.removeEventListener('screenPreviewResize', handleCustomResize);
            }
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
        };
    }, []); // Empty dependency array since we use refs for size tracking

    // Update refs when state changes
    useEffect(() => {
        canvasSizeRef.current = canvasSize;
    }, [canvasSize]);

    useEffect(() => {
        originalSizeRef.current = originalSize;
    }, [originalSize]);

    // Calculate scaling factors
    const getScalingFactors = useCallback(() => {
        if (originalSize.width === 0 || originalSize.height === 0) {
            return { scaleX: 1, scaleY: 1 };
        }
        return {
            scaleX: canvasSize.width / originalSize.width,
            scaleY: canvasSize.height / originalSize.height
        };
    }, [canvasSize, originalSize]);

    // Scale a point based on current canvas size
    const scalePoint = useCallback((point) => {
        const { scaleX, scaleY } = getScalingFactors();
        return {
            x: point.x * scaleX,
            y: point.y * scaleY
        };
    }, [getScalingFactors]);

    // Redraw all annotations
    const redrawAnnotations = useCallback(() => {
        const context = contextRef.current;
        const canvas = canvasRef.current;
        if (!context || !canvas) return;

        // Clear canvas and reset context state
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'source-over';

        const { scaleX, scaleY } = getScalingFactors();

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
            context.lineWidth = annotation.size * Math.min(scaleX, scaleY); // Scale line width

            switch (annotation.type) {
                case 'path':
                    context.beginPath();
                    annotation.points.forEach((point, index) => {
                        const scaledPoint = scalePoint(point);
                        if (index === 0) {
                            context.moveTo(scaledPoint.x, scaledPoint.y);
                        } else {
                            context.lineTo(scaledPoint.x, scaledPoint.y);
                        }
                    });
                    context.stroke();
                    break;
                case 'circle':
                    context.beginPath();
                    const scaledStart = scalePoint(annotation.start);
                    const scaledEnd = scalePoint(annotation.end);
                    const radius = Math.sqrt(
                        Math.pow(scaledEnd.x - scaledStart.x, 2) +
                        Math.pow(scaledEnd.y - scaledStart.y, 2)
                    );
                    context.arc(scaledStart.x, scaledStart.y, radius, 0, 2 * Math.PI);
                    context.stroke();
                    break;
                case 'square':
                    const scaledStartSq = scalePoint(annotation.start);
                    const scaledEndSq = scalePoint(annotation.end);
                    const size = Math.max(
                        Math.abs(scaledEndSq.x - scaledStartSq.x),
                        Math.abs(scaledEndSq.y - scaledStartSq.y)
                    );
                    context.strokeRect(scaledStartSq.x, scaledStartSq.y, size, size);
                    break;
                case 'rectangle':
                    const scaledStartRect = scalePoint(annotation.start);
                    const scaledEndRect = scalePoint(annotation.end);
                    const width = scaledEndRect.x - scaledStartRect.x;
                    const height = scaledEndRect.y - scaledStartRect.y;
                    context.strokeRect(scaledStartRect.x, scaledStartRect.y, width, height);
                    break;
            }
        });

        // Reset context state after drawing
        context.globalCompositeOperation = 'source-over';
    }, [annotations, getScalingFactors, scalePoint]);

    // Get mouse/touch position relative to canvas (in original coordinate system)
    const getPosition = useCallback((canvas, event) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = event.clientX || (event.touches && event.touches[0]?.clientX);
        const clientY = event.clientY || (event.touches && event.touches[0]?.clientY);

        if (clientX === undefined || clientY === undefined) return null;

        // Get position relative to current canvas
        const currentX = clientX - rect.left;
        const currentY = clientY - rect.top;

        // Convert to original coordinate system for storage
        const { scaleX, scaleY } = getScalingFactors();
        return {
            x: currentX / scaleX,
            y: currentY / scaleY
        };
    }, [getScalingFactors]);

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
        const { scaleX, scaleY } = getScalingFactors();

        // Set context properties for preview
        if (currentShape.tool === 'eraser') {
            context.globalCompositeOperation = 'destination-out';
            context.strokeStyle = 'rgba(0,0,0,1)'; // Use opaque color for eraser
        } else {
            context.globalCompositeOperation = 'source-over';
            context.strokeStyle = currentShape.color;
        }
        context.fillStyle = currentShape.color;
        context.lineWidth = currentShape.size * Math.min(scaleX, scaleY);

        switch (currentShape.type) {
            case 'path':
                context.beginPath();
                currentShape.points.forEach((point, index) => {
                    const scaledPoint = scalePoint(point);
                    if (index === 0) {
                        context.moveTo(scaledPoint.x, scaledPoint.y);
                    } else {
                        context.lineTo(scaledPoint.x, scaledPoint.y);
                    }
                });
                context.stroke();
                break;
            case 'circle':
                context.beginPath();
                const scaledStart = scalePoint(currentShape.start);
                const scaledEnd = scalePoint(currentShape.end);
                const radius = Math.sqrt(
                    Math.pow(scaledEnd.x - scaledStart.x, 2) +
                    Math.pow(scaledEnd.y - scaledStart.y, 2)
                );
                context.arc(scaledStart.x, scaledStart.y, radius, 0, 2 * Math.PI);
                context.stroke();
                break;
            case 'square':
                const scaledStartSq = scalePoint(currentShape.start);
                const scaledEndSq = scalePoint(currentShape.end);
                const size = Math.max(
                    Math.abs(scaledEndSq.x - scaledStartSq.x),
                    Math.abs(scaledEndSq.y - scaledStartSq.y)
                );
                context.strokeRect(scaledStartSq.x, scaledStartSq.y, size, size);
                break;
            case 'rectangle':
                const scaledStartRect = scalePoint(currentShape.start);
                const scaledEndRect = scalePoint(currentShape.end);
                const width = scaledEndRect.x - scaledStartRect.x;
                const height = scaledEndRect.y - scaledStartRect.y;
                context.strokeRect(scaledStartRect.x, scaledStartRect.y, width, height);
                break;
        }

        // Reset context state after preview
        context.globalCompositeOperation = 'source-over';
    }, [currentShape, redrawAnnotations, getScalingFactors, scalePoint]);

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
