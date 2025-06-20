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
    const [brushColor, setBrushColor] = useState('#FF0000');
    const [brushSize, setBrushSize] = useState(3);
    const [tool, setTool] = useState('pen');
    const annotationOverlayRef = useRef(null);
    const screenPreviewRef = useRef(null);
    const [screenPreviewElement, setScreenPreviewElement] = useState(null);

    // Set up annotation overlay callback with the screen manager
    useEffect(() => {
        if (agent?.screenManager && isScreenShareActive) {
            const getAnnotationOverlay = () => {
                if (annotationOverlayRef.current && isAnnotationActive) {
                    return annotationOverlayRef.current.captureAnnotations();
                }
                return null;
            };

            agent.screenManager.setAnnotationOverlayCallback(getAnnotationOverlay);
            console.log('ScreenAnnotationWrapper: Annotation overlay callback set');

            return () => {
                // Clean up callback when component unmounts or screen share stops
                if (agent?.screenManager) {
                    agent.screenManager.setAnnotationOverlayCallback(null);
                }
            };
        }
    }, [agent, isScreenShareActive, isAnnotationActive]);

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
