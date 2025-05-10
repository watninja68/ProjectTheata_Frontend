import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom'; // Import Link for navigation
import { FaStroopwafel, FaSignInAlt, FaRocket, FaPalette, FaShieldAlt, FaCog } from 'react-icons/fa'; // Example icons
import './LandingPage.css'; // We'll create this CSS file
import { useAuth } from '../hooks/useAuth'; // If you want to show "Go to App" if logged in

const LandingPage = () => {
    const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode
    const { user } = useAuth(); // Get user from auth context
    const navigate = useNavigate();

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    const toggleTheme = () => {
        setIsDarkMode(!isDarkMode);
    };

    // If user is already logged in, perhaps redirect them or show different CTA
    // For simplicity, we'll just change the button text here.
    // A redirect would be:
    // useEffect(() => {
    //   if (user) {
    //     navigate('/app');
    //   }
    // }, [user, navigate]);


    return (
        <div className={`landing-page ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
            <style>
                {/* Quick way to inject theme variables for the landing page */}
                {`
          :root {
            --bg-primary-dark: #120824;
            --bg-secondary-dark: #1e0f3a;
            --text-primary-dark: #e8e0ff;
            --accent-primary-dark: #8a2be2;
            --accent-secondary-dark: #a450e0;
            --bg-grid-line-dark: rgba(164, 80, 224, 0.1);

            --bg-primary-light: #f4f7fa;
            --bg-secondary-light: #ffffff;
            --text-primary-light: #1f2937;
            --accent-primary-light: #8a2be2; /* Keep accent for branding */
            --accent-secondary-light: #a450e0;
            --bg-grid-line-light: rgba(31, 41, 55, 0.1);
          }
          .dark-mode {
            --bg-primary: var(--bg-primary-dark);
            --bg-secondary: var(--bg-secondary-dark);
            --text-primary: var(--text-primary-dark);
            --accent-primary: var(--accent-primary-dark);
            --accent-secondary: var(--accent-secondary-dark);
            --bg-grid-line: var(--bg-grid-line-dark);
          }
          .light-mode {
            --bg-primary: var(--bg-primary-light);
            --bg-secondary: var(--bg-secondary-light);
            --text-primary: var(--text-primary-light);
            --accent-primary: var(--accent-primary-light);
            --accent-secondary: var(--accent-secondary-light);
            --bg-grid-line: var(--bg-grid-line-light);
          }
        `}
            </style>

            <header className="landing-header">
                <div className="logo-title">
                    <FaStroopwafel size={40} style={{ color: 'var(--accent-primary)', marginRight: '10px' }} />
                    <h1>Project Theta</h1>
                </div>
                <nav className="landing-nav">
                    {/* <a href="#features">Features</a>
          <a href="#about">About</a> */}
                    <button onClick={toggleTheme} className="theme-toggle-btn">
                        {isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
                    </button>
                    {user ? (
                        <Link to="/app" className="cta-button">Go to App <FaRocket /></Link>
                    ) : (
                        // You might link to a specific /login route that App.js handles,
                        // or /app and let App.js redirect to login if not authenticated.
                        <Link to="/app" className="cta-button">Login / Get Started <FaSignInAlt /></Link>
                    )}
                </nav>
            </header>

            <main className="landing-main">
                <section className="hero-section">
                    <div className="hero-content">
                        <h2>Experience the Future of AI Interaction</h2>
                        <p>
                            Craftify Theme brings a modern, sleek, and tech-focused aesthetic to your AI agent interface.
                            Focused, intuitive, and powerful.
                        </p>
                        <Link to="/app" className="cta-button hero-cta">
                            {user ? 'Open Project Theta' : 'Connect Your Agent'} <FaRocket style={{ marginLeft: '8px' }} />
                        </Link>
                    </div>
                    <div className="hero-image-placeholder">
                        {/* You could put a mock-up screenshot or abstract animation here */}
                        <FaCog size={150} className="hero-icon-bg" style={{ color: 'var(--accent-secondary)', opacity: 0.2 }} />
                        <p>App Preview / Animation</p>
                    </div>
                </section>

                <section id="features" className="features-section">
                    <h3>Why Project Theta?</h3>
                    <div className="features-grid">
                        <div className="feature-card">
                            <FaPalette size={30} style={{ color: 'var(--accent-primary)' }} />
                            <h4>Craftify Theme</h4>
                            <p>Stunning dark and light modes with vibrant purple accents for a futuristic feel.</p>
                        </div>
                        <div className="feature-card">
                            <FaShieldAlt size={30} style={{ color: 'var(--accent-primary)' }} />
                            <h4>Intuitive Interface</h4>
                            <p>Clear layout, real-time feedback, and professional design for AI agent control.</p>
                        </div>
                        <div className="feature-card">
                            <FaCog size={30} style={{ color: 'var(--accent-primary)' }} />
                            <h4>Advanced Controls</h4>
                            <p>Manage media, settings, and interactions seamlessly in one high-tech panel.</p>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="landing-footer">
                <p>© {new Date().getFullYear()} Project Theta. Your AI Companion.</p>
                {/* Add social media links or other footer content here */}
            </footer>
        </div>
    );
};

export default LandingPage;
