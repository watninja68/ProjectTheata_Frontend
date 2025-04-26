import React, { useRef, useEffect } from 'react';

const Preview = ({ stream, type, onSwitchCamera }) => { // type is 'camera' or 'screen'
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.error(`Error playing ${type} preview:`, e));
        } else if (videoRef.current) {
            videoRef.current.srcObject = null; // Clear stream if prop becomes null
        }
    }, [stream, type]);

     // Use CSS classes based on type for styling (aspect ratio, etc.)
    const containerClass = type === 'camera' ? 'camera-preview' : 'screen-preview';
    const previewId = type === 'camera' ? 'cameraPreview' : 'screenPreview';

     // Only show camera switch on mobile (could use CSS or JS check)
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);

     return (
         // The parent (Sidebar) controls the display: block/none
        <div id={previewId} className={`preview ${containerClass}`} style={{ display: stream ? 'block' : 'none' }}>
             <video ref={videoRef} playsInline autoPlay muted></video>
            {type === 'camera' && isMobile && onSwitchCamera && (
                <button className="camera-switch-btn" onClick={onSwitchCamera}>⟲</button>
             )}
         </div>
    );
};

export default Preview;
