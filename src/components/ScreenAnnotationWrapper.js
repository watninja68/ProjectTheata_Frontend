import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import AnnotationOverlay from './AnnotationOverlay';
import AnnotationToolbar from './AnnotationToolbar';
import './ScreenAnnotationWrapper.css';

const ScreenAnnotationWrapper = ({
    isScreenShareActive = false,
    agent = null
}) => {
    const [isAnnotationActive, setIsAnnotationActive] = useState(false);
    const [brushColor, setBrushColor] = useState('#e74c3c'); // Muted red as default
    const [brushSize, setBrushSize] = useState(3);
    const [tool, setTool] = useState('pen');
    const annotationOverlayRef = useRef(null);
    const screenPreviewRef = useRef(null);
    const [screenPreviewElement, setScreenPreviewElement] = useState(null);

    // Set up annotation overlay callback with the screen manager
    useEffect(() => {
        if (agent?.screenManager && isScreenShareActive) {
            const getAnnotationOverlay = () => {
                try {
                    if (annotationOverlayRef.current && isAnnotationActive) {
                        return annotationOverlayRef.current.captureAnnotations();
                    }
                } catch (error) {
                    console.warn('ScreenAnnotationWrapper: Error capturing annotations:', error);
                }
                return null;
            };

            try {
                agent.screenManager.setAnnotationOverlayCallback(getAnnotationOverlay);
                console.log('ScreenAnnotationWrapper: Annotation overlay callback set');
            } catch (error) {
                console.warn('ScreenAnnotationWrapper: Error setting annotation callback:', error);
            }

            return () => {
                // Clean up callback when component unmounts or screen share stops
                try {
                    if (agent?.screenManager && typeof agent.screenManager.setAnnotationOverlayCallback === 'function') {
                        agent.screenManager.setAnnotationOverlayCallback(null);
                        console.log('ScreenAnnotationWrapper: Annotation overlay callback cleared');
                    }
                } catch (error) {
                    console.warn('ScreenAnnotationWrapper: Error clearing annotation callback:', error);
                }
            };
        }
    }, [agent, isScreenShareActive, isAnnotationActive]);

    // Handle agent disconnect cleanup
    useEffect(() => {
        if (!agent && isAnnotationActive) {
            // Agent was disconnected while annotations were active
            console.log('ScreenAnnotationWrapper: Agent disconnected, cleaning up annotations');
            setIsAnnotationActive(false);
        }
    }, [agent, isAnnotationActive]);

    // Find and monitor screen preview container
    useEffect(() => {
        const findScreenPreview = () => {
            const screenPreview = document.getElementById('screenPreview');
            if (screenPreview && screenPreview !== screenPreviewElement) {
                setScreenPreviewElement(screenPreview);
                screenPreviewRef.current = screenPreview;
                console.log('ScreenAnnotationWrapper: Found screen preview element');
            }
        };

        // Try to find immediately
        findScreenPreview();

        // Set up a mutation observer to watch for the element being added
        const observer = new MutationObserver(findScreenPreview);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            observer.disconnect();
        };
    }, [screenPreviewElement]);

    // Monitor screen preview element for size changes
    useEffect(() => {
        if (!screenPreviewElement) return;

        let resizeObserver;
        let resizeTimeout;

        if (window.ResizeObserver) {
            resizeObserver = new ResizeObserver((entries) => {
                // Debounce resize events to prevent loops
                if (resizeTimeout) {
                    clearTimeout(resizeTimeout);
                }

                resizeTimeout = setTimeout(() => {
                    // Use requestAnimationFrame to avoid ResizeObserver loop
                    requestAnimationFrame(() => {
                        // Trigger a custom event instead of window resize
                        const customEvent = new CustomEvent('screenPreviewResize', {
                            detail: { entries }
                        });
                        screenPreviewElement.dispatchEvent(customEvent);
                    });
                }, 16); // ~60fps debounce
            });
            resizeObserver.observe(screenPreviewElement);
        }

        return () => {
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
        };
    }, [screenPreviewElement]);

    // Handle annotation container class styling
    useEffect(() => {
        if (screenPreviewElement) {
            if (isScreenShareActive && isAnnotationActive) {
                screenPreviewElement.classList.add('annotation-container');
                console.log('ScreenAnnotationWrapper: Added annotation-container class');
            } else {
                screenPreviewElement.classList.remove('annotation-container');
            }
        }

        return () => {
            // Clean up classes when component unmounts or state changes
            if (screenPreviewElement) {
                screenPreviewElement.classList.remove('annotation-container');
            }
        };
    }, [screenPreviewElement, isScreenShareActive, isAnnotationActive]);

    const handleClearAnnotations = useCallback(() => {
        if (annotationOverlayRef.current) {
            annotationOverlayRef.current.clearAnnotations();
        }
    }, []);

    const handleAnnotationChange = useCallback((annotations) => {
        // Optional: Handle annotation changes for additional functionality
        console.log('Annotations updated:', annotations.length);
    }, []);

    // Only show annotation controls when screen sharing is active
    if (!isScreenShareActive) {
        return null;
    }

    return (
        <div className="screen-annotation-wrapper">
            <AnnotationToolbar
                brushColor={brushColor}
                setBrushColor={setBrushColor}
                brushSize={brushSize}
                setBrushSize={setBrushSize}
                tool={tool}
                setTool={setTool}
                clearAnnotations={handleClearAnnotations}
                isActive={isAnnotationActive}
                setIsActive={setIsAnnotationActive}
            />

            {/* Use portal to render annotation overlay directly in the screen preview */}
            {isAnnotationActive && screenPreviewElement && createPortal(
                <AnnotationOverlay
                    ref={annotationOverlayRef}
                    isActive={isAnnotationActive}
                    brushColor={brushColor}
                    brushSize={brushSize}
                    tool={tool}
                    onAnnotationChange={handleAnnotationChange}
                />,
                screenPreviewElement
            )}
        </div>
    );
};

export default ScreenAnnotationWrapper;
