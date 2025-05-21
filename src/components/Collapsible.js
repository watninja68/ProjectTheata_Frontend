// FILE: src/components/Collapsible.js
import React, { useState, useEffect, useRef } from 'react';

// Note: Styles for .collapsible-container, .collapsible, .collapse-icon, 
// .collapsible-content, and .collapsible-content.active 
// are expected to be in a global CSS file like App.css

const Collapsible = ({ title, children, startOpen = false, className = '' }) => {
    const [isOpen, setIsOpen] = useState(startOpen);
    const contentRef = useRef(null); // Ref to get content height for smooth animation

    const toggleOpen = () => {
        setIsOpen(!isOpen);
    };

    // Optional: Smooth height transition (can be tricky with dynamic content)
    // For simplicity, max-height transition in CSS is often sufficient.
    // If you want dynamic height, you'd do something like:
    // useEffect(() => {
    //     if (contentRef.current) {
    //         contentRef.current.style.maxHeight = isOpen ? `${contentRef.current.scrollHeight}px` : '0px';
    //     }
    // }, [isOpen]);

    return (
        <div className={`collapsible-container ${className}`}>
            <div
                className="collapsible"
                onClick={toggleOpen}
                role="button"
                tabIndex="0"
                aria-expanded={isOpen}
                onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleOpen(); }}
            >
                {title}
                <span className="collapse-icon">{isOpen ? '▲' : '▼'}</span>
            </div>
            <div
                ref={contentRef}
                className={`collapsible-content ${isOpen ? 'active' : ''}`}
            >
                {children}
            </div>
        </div>
    );
};

export default Collapsible;