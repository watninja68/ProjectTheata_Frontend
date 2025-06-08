import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    FaAtom,
    FaSignInAlt,
    FaRocket,
    FaPalette,
    FaShieldAlt,
    FaCog,
    FaMicrophoneAlt,
    FaUsers,
    FaCheckCircle,
    FaQuoteLeft,
    FaQuoteRight,
    FaRegSmile,
    FaBrain,
    // --- New icons for the enhanced footer ---
    FaTwitter,
    FaLinkedin,
    FaGithub,
    FaEnvelope,
} from "react-icons/fa";
import "./LandingPage.css";
import { useAuth } from "../hooks/useAuth";

const THEME_DARK = "dark";
const THEME_LIGHT = "light";

const LandingPage = () => {
    const [isDarkMode, setIsDarkMode] = useState(true);
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        document.documentElement.setAttribute(
            "data-theme",
            isDarkMode ? THEME_DARK : THEME_LIGHT,
        );
    }, [isDarkMode]);

    // const toggleTheme = () => { // If you want a theme toggle in the footer too
    //     setIsDarkMode(!isDarkMode);
    // };

    return (
        <div className={`landing-page ${isDarkMode ? "dark-mode" : "light-mode"}`}>
            <header className="landing-header">
                <div className="logo-title">
                    <FaAtom
                        size={40}
                        style={{ color: "var(--accent-primary)", marginRight: "10px" }}
                        aria-hidden="true"
                    />
                    <h1>Project Theta</h1>
                </div>
                <nav className="landing-nav">
                    <a href="#how-it-works">How it Works</a>
                    <a href="#features">Features</a>
                    <a href="#benefits">Benefits</a>
                    <a href="#testimonials">Testimonials</a>

                    {user ? (
                        <Link to="./app" className="cta-button-go-to">
                            Open App
                            <FaRocket style={{ marginLeft: "8px" }} aria-hidden="true" />
                        </Link>
                    ) : (
                        <Link to="/login" className="cta-button">
                            Login / Get Started{" "}
                            <FaSignInAlt style={{ marginLeft: "8px" }} aria-hidden="true" />
                        </Link>
                    )}
                </nav>
            </header>

            <main className="landing-main">
                {/* HERO SECTION */}
                <section className="hero-section">
                    <div className="hero-content">
                        <h2 className="hero-title">
                            <span className="accent-text-gradient">AI Collaboration,</span>{" "}
                            <br />
                            <span className="accent-text-gradient secondary-gradient">
                                Supercharged for Productivity
                            </span>
                        </h2>
                        <p className="hero-subheadline">
                            Share your screen and camera, talk naturally, and let your AI
                            agent orchestrate tools and other agents to get work done—faster,
                            smarter, and with less friction.
                        </p>
                        <Link to="./app" className="cta-button hero-cta">
                            {user ? "Start Collaborating" : "Try Project Theta Now"}{" "}
                            <FaRocket style={{ marginLeft: "8px" }} aria-hidden="true" />
                        </Link>
                        <div className="hero-stats">
                            <div className="hero-stat">
                                <FaUsers className="stat-icon" aria-hidden="true" />{" "}
                                <span>1,200+ Happy Users</span>
                            </div>
                            <div className="hero-stat">
                                <FaCheckCircle className="stat-icon" aria-hidden="true" />{" "}
                                <span>99.9% Uptime</span>
                            </div>
                            <div className="hero-stat">
                                <FaRegSmile className="stat-icon" aria-hidden="true" />{" "}
                                <span>Top Rated by Teams</span>
                            </div>
                        </div>
                    </div>
                    <div className="hero-image-placeholder">
                        <div className="hero-visual-elements">
                            <FaBrain
                                size={70}
                                className="hero-bg-icon icon-brain"
                                style={{ animationDelay: "0s" }}
                                aria-hidden="true"
                            />
                            <FaUsers
                                size={60}
                                className="hero-bg-icon icon-users"
                                style={{ animationDelay: "0.3s" }}
                                aria-hidden="true"
                            />
                            <FaCog
                                size={90}
                                className="hero-bg-icon icon-cog"
                                style={{ animationDelay: "0.6s" }}
                                aria-hidden="true"
                            />
                        </div>
                        <p className="hero-preview-text">AI-Powered Synergy in Action</p>
                    </div>
                </section>

                <div className="content">
                    {/* HOW IT WORKS */}
                    <section
                        id="how-it-works"
                        className="how-it-works-section section-padding"
                    >
                        <h3 className="section-title">How It Works</h3>
                        <div className="how-it-works-steps">
                            <div className="how-step">
                                <div className="how-step-icon-wrapper">
                                    <FaPalette size={30} aria-hidden="true" />
                                </div>
                                <h4>1. Share Context</h4>
                                <p>
                                    Share your screen and camera so your AI agent understands your
                                    workflow in real time.
                                </p>
                            </div>
                            <div className="how-step">
                                <div className="how-step-icon-wrapper">
                                    <FaMicrophoneAlt size={30} aria-hidden="true" />
                                </div>
                                <h4>2. Talk Naturally</h4>
                                <p>
                                    Speak to your agent as you would to a teammate—no commands,
                                    just conversation.
                                </p>
                            </div>
                            <div className="how-step">
                                <div className="how-step-icon-wrapper">
                                    <FaCog size={30} aria-hidden="true" />
                                </div>
                                <h4>3. Get Things Done</h4>
                                <p>
                                    Your agent orchestrates tools and other agents to automate
                                    tasks and boost your productivity.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* FEATURES */}
                    <section id="features" className="features-section section-padding">
                        <h3 className="section-title">Powerful Features</h3>
                        <div className="features-grid">
                            <div className="feature-card">
                                <FaPalette
                                    size={30}
                                    className="feature-icon"
                                    aria-hidden="true"
                                />
                                <h4>Screen & Camera Sharing</h4>
                                <p>
                                    Give your AI agent real-time visual context for smarter, more
                                    relevant assistance.
                                </p>
                            </div>
                            <div className="feature-card">
                                <FaShieldAlt
                                    size={30}
                                    className="feature-icon"
                                    aria-hidden="true"
                                />
                                <h4>Natural Voice Interaction</h4>
                                <p>
                                    Converse with your agent just like a human—no learning curve,
                                    just results.
                                </p>
                            </div>
                            <div className="feature-card">
                                <FaCog size={30} className="feature-icon" aria-hidden="true" />
                                <h4>Orchestration Engine</h4>
                                <p>
                                    Let your agent call tools and other agents to automate and
                                    accelerate your workflow.
                                </p>
                            </div>
                            <div className="feature-card">
                                <FaUsers
                                    size={30}
                                    className="feature-icon"
                                    aria-hidden="true"
                                />
                                <h4>Team Collaboration</h4>
                                <p>
                                    Invite teammates and collaborate with multiple agents in real
                                    time.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* BENEFITS */}
                    <section id="benefits" className="benefits-section section-padding">
                        <h3 className="section-title">Why Choose Project Theta?</h3>
                        <div className="benefits-grid">
                            <div className="benefit-card">
                                <FaCheckCircle
                                    size={28}
                                    className="benefit-icon"
                                    aria-hidden="true"
                                />
                                <h4>Frictionless Productivity</h4>
                                <p>
                                    Remove bottlenecks and let your AI handle repetitive or
                                    complex tasks.
                                </p>
                            </div>
                            <div className="benefit-card">
                                <FaShieldAlt
                                    size={28}
                                    className="benefit-icon"
                                    aria-hidden="true"
                                />
                                <h4>Privacy First</h4>
                                <p>
                                    Your data is protected with enterprise-grade security and
                                    privacy controls.
                                </p>
                            </div>
                            <div className="benefit-card">
                                <FaRocket
                                    size={28}
                                    className="benefit-icon"
                                    aria-hidden="true"
                                />
                                <h4>Instant Setup</h4>
                                <p>
                                    Get started in seconds—no downloads, no hassle, just results.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* TESTIMONIALS */}
                    <section
                        id="testimonials"
                        className="testimonials-section section-padding"
                    >
                        <h3 className="section-title">What Our Users Say</h3>
                        <div className="testimonials-grid">
                            <div className="testimonial-card">
                                <FaQuoteLeft
                                    className="quote-icon top-left"
                                    aria-hidden="true"
                                />
                                <p className="testimonial-text">
                                    Project Theta has completely changed how I work with my team.
                                    The AI agent feels like a real assistant!
                                </p>
                                <div className="testimonial-author">
                                    <span>— Alex P., Product Manager</span>
                                </div>
                                <FaQuoteRight
                                    className="quote-icon bottom-right"
                                    aria-hidden="true"
                                />
                            </div>
                            <div className="testimonial-card">
                                <FaQuoteLeft
                                    className="quote-icon top-left"
                                    aria-hidden="true"
                                />
                                <p className="testimonial-text">
                                    The voice interaction is so natural, and the automation
                                    features save me hours every week.
                                </p>
                                <div className="testimonial-author">
                                    <span>— Jamie L., Software Engineer</span>
                                </div>
                                <FaQuoteRight
                                    className="quote-icon bottom-right"
                                    aria-hidden="true"
                                />
                            </div>
                            <div className="testimonial-card">
                                <FaQuoteLeft
                                    className="quote-icon top-left"
                                    aria-hidden="true"
                                />
                                <p className="testimonial-text">
                                    I love how easy it is to get started. My agent just gets
                                    things done for me!
                                </p>
                                <div className="testimonial-author">
                                    <span>— Morgan S., Designer</span>
                                </div>
                                <FaQuoteRight
                                    className="quote-icon bottom-right"
                                    aria-hidden="true"
                                />
                            </div>
                        </div>
                    </section>

                    {/* FINAL CTA */}
                    <section className="final-cta-section section-padding">
                        <h3 className="section-title">
                            Ready to Supercharge Your Workflow?
                        </h3>
                        <p className="final-cta-subtext">
                            Start collaborating with your AI agent today. Experience the
                            future of productivity.
                        </p>
                        <Link to="./app" className="cta-button final-cta">
                            {user ? "Go to App" : "Get Started Free"}{" "}
                            <FaRocket style={{ marginLeft: "8px" }} aria-hidden="true" />
                        </Link>
                    </section>
                </div>
            </main>

            {/* --- ENHANCED FOOTER --- */}
            <footer className="landing-footer">
                <div className="footer-container">
                    <div className="footer-main">
                        <div className="footer-column footer-about">
                            <div className="footer-logo">
                                <FaAtom
                                    size={30}
                                    style={{
                                        color: "var(--accent-primary)",
                                        marginRight: "10px",
                                    }}
                                    aria-hidden="true"
                                />
                                <h3>Project Theta</h3>
                            </div>
                            <p className="footer-tagline">
                                AI productivity, redefined. Your intelligent collaborator for
                                seamless workflows.
                            </p>
                        </div>

                        <div className="footer-column footer-quick-links">
                            <h4>Quick Links</h4>
                            <ul>
                                <li>
                                    <a href="#how-it-works">How it Works</a>
                                </li>
                                <li>
                                    <a href="#features">Features</a>
                                </li>
                                <li>
                                    <a href="#benefits">Benefits</a>
                                </li>
                                <li>
                                    <a href="#testimonials">Testimonials</a>
                                </li>
                                {/* <li><Link to="/blog">Blog</Link></li> You can add more links like a blog or FAQ */}
                            </ul>
                        </div>

                        <div className="footer-column footer-legal">
                            <h4>Legal</h4>
                            <ul>
                                <li>
                                    <Link to="/privacy-policy">Privacy Policy</Link>
                                </li>
                                <li>
                                    <Link to="/terms-of-service">Terms of Service</Link>
                                </li>
                                {/* <li><Link to="/cookie-policy">Cookie Policy</Link></li> */}
                            </ul>
                        </div>

                        <div className="footer-column footer-connect">
                            <h4>Connect With Us</h4>
                            <a
                                href="mailto:karneeshkar68@gmail.com"
                                className="footer-contact-link"
                            >
                                <FaEnvelope style={{ marginRight: "8px" }} aria-hidden="true" />
                                contact@projecttheta.com
                            </a>
                            <div className="footer-social-icons">
                                <a
                                    href="https://x.com/__K4KAR_"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Follow Project Theta on Twitter"
                                >
                                    <FaTwitter size={22} />
                                </a>
                                <a
                                    href="https://www.linkedin.com/in/karneeshkar-velmurugan/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Follow Project Theta on LinkedIn"
                                >
                                    <FaLinkedin size={22} />
                                </a>
                                <br />
                                <a
                                    href="https://twitter.com/YourProjectTheta"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Follow Project Theta on Twitter"
                                >
                                    <FaTwitter size={22} />
                                </a>
                                <a
                                    href="https://linkedin.com/company/YourProjectTheta"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Follow Project Theta on LinkedIn"
                                >
                                    <FaLinkedin size={22} />
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className="footer-secondary">
                        <div className="footer-credits">
                            A project by Karneeshkar & Ashish.
                            {/* You can make emails clickable if desired, but a general contact is often better for a product.
                                <a href="mailto:karneeshkar68@gmail.com">Karneeshkar</a> &
                                <a href="mailto:ashishfounder@email.com">Ashish</a>
                            */}
                        </div>
                        <p className="footer-copyright">
                            &copy; {new Date().getFullYear()} Project Theta. All Rights
                            Reserved.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;