import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaStroopwafel, FaSignInAlt, FaRocket, FaPalette, FaShieldAlt, FaCog } from 'react-icons/fa';
import './LandingPage.css'; // Ensure this path is correct
import { useAuth } from '../hooks/useAuth'; // Ensure this path is correct

const THEME_DARK = 'dark';
const THEME_LIGHT = 'light';

const LandingPage = () => {
    const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', isDarkMode ? THEME_DARK : THEME_LIGHT);
    }, [isDarkMode]);

    const toggleTheme = () => {
        setIsDarkMode(!isDarkMode);
    };

    // If user is already logged in, you might redirect them.
    // This useEffect is an example of how you could do that.
    // For this component, we only change the Call To Action (CTA) button text.
    // useEffect(() => {
    //   if (user) {
    //     navigate('/app'); // Or your main application route
    //   }
    // }, [user, navigate]);

    return (
        <div className={`landing-page ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
            <header className="landing-header">
                <div className="logo-title">
                    <FaStroopwafel size={40} style={{ color: 'var(--accent-primary)', marginRight: '10px' }} aria-hidden="true" />
                    <h1>Project Theta</h1>
                </div>
                <nav className="landing-nav">
                    {/* <a href="#features">Features</a>
                    <a href="#about">About</a> */}
                    <button
                        onClick={toggleTheme}
                        className="theme-toggle-btn"
                        aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
                    </button>
                    {user ? (
                        <Link to="/app" className="cta-button">
                            Go to App <FaRocket style={{ marginLeft: '8px' }} aria-hidden="true" />
                        </Link>
                    ) : (
                        <Link to="/app" className="cta-button">
                            Login / Get Started <FaSignInAlt style={{ marginLeft: '8px' }} aria-hidden="true" />
                        </Link>
                    )}
                </nav>
            </header>

            <main className="landing-main">
                <section className="hero-section">
                    <div className="hero-content">
                        <h2>Unlock the Future of AI Interaction</h2>
                        <p>
                            Project Theta introduces Craftify: a modern, sleek, and tech-focused theme
                            for your AI agent interface. Focused, intuitive, and powerful.
                        </p>
                        <Link to="/app" className="cta-button hero-cta">
                            {user ? 'Open Project Theta' : 'Connect Your Agent'} <FaRocket style={{ marginLeft: '8px' }} aria-hidden="true" />
                        </Link>
                    </div>
                    <div className="hero-image-placeholder">
                        <FaCog size={150} className="hero-icon-bg" style={{ color: 'var(--accent-secondary)', opacity: 0.2 }} aria-hidden="true" />
                        <p>App Preview / Dynamic Visual</p>
                    </div>
                </section>

                <section id="features" className="features-section">
                    <h3>Why Project Theta?</h3>
                    <div className="features-grid">
                        <div className="feature-card">
                            <FaPalette size={30} style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                            <h4>Craftify Theme</h4>
                            <p>Stunning dark and light modes with vibrant purple accents for a futuristic feel.</p>
                        </div>
                        <div className="feature-card">
                            <FaShieldAlt size={30} style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                            <h4>Intuitive Interface</h4>
                            <p>Clear layout, real-time feedback, and professional design for AI agent control.</p>
                        </div>
                        <div className="feature-card">
                            <FaCog size={30} style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
                            <h4>Advanced Controls</h4>
                            <p>Manage media, settings, and interactions seamlessly in one high-tech panel.</p>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="landing-footer">
                <p>© {new Date().getFullYear()} Project Theta. Your AI Companion.</p>
                {/* Consider adding links to privacy policy, terms, or social media */}
            </footer>
        </div>
    );
};

export default LandingPage;
