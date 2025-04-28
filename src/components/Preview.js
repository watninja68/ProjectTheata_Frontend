import React, { useRef, useEffect } from 'react';

// This component is less critical now as App.js directly manages the preview divs,
// but can be kept if you want to encapsulate preview logic later.
// Ensure its styles are handled by the main styles.css file targeting the IDs.

const Preview = ({ stream, type = 'camera', onSwitchCamera }) => {
    const videoRef = useRef(null);
    const containerId = type === 'camera' ? 'cameraPreview' : 'screenPreview';
    const containerRef = useRef(null); // Ref for the container div

    useEffect(() => {
        // Find the container div using the ID
        containerRef.current = document.getElementById(containerId);

        if (containerRef.current && stream) {
             // If video element doesn't exist, create it
             if (!videoRef.current) {
                 videoRef.current = document.createElement('video');
                 videoRef.current.playsInline = true;
                 videoRef.current.autoPlay = true;
                 videoRef.current.muted = true;
                 // Apply styles needed for video within preview container
                 videoRef.current.style.width = '100%';
                 videoRef.current.style.height = '100%';
                 videoRef.current.style.objectFit = 'cover';
                 videoRef.current.style.display = 'block';
                 containerRef.current.appendChild(videoRef.current);
             }

            // Attach the stream
            if (videoRef.current.srcObject !== stream) {
                 videoRef.current.srcObject = stream;
                 videoRef.current.play().catch(e => console.error(`Error playing ${type} preview:`, e));
            }
             containerRef.current.style.display = 'block'; // Ensure container is visible

        } else if (containerRef.current) {
            // If stream is null, hide container and remove video element
             containerRef.current.style.display = 'none';
             if (videoRef.current && videoRef.current.parentNode === containerRef.current) {
                 containerRef.current.removeChild(videoRef.current);
                 videoRef.current = null;
             }
        }

         // Cleanup: Remove video element when component unmounts or stream changes
         return () => {
             if (videoRef.current && videoRef.current.parentNode === containerRef.current) {
                 containerRef.current?.removeChild(videoRef.current);
             }
         };

    }, [stream, type, containerId]);

    // The container div is rendered by App.js, this component manages the video inside it.
    // We return null as the component doesn't render its own top-level div.
    return null;

     /* // Alternative: If Preview *must* render the container
     const isMobile = /Mobi|Android/i.test(navigator.userAgent);
     return (
         <div id={containerId} ref={containerRef} className={`preview ${type}-preview`} style={{ display: stream ? 'block' : 'none' }}>
             <video ref={videoRef} playsInline autoPlay muted></video>
             {type === 'camera' && isMobile && stream && onSwitchCamera && (
                <button className="camera-switch-btn" onClick={onSwitchCamera}>⟲</button>
             )}
         </div>
     );
     */
};

export default Preview;