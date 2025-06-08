import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import ReactGA4 from "react-ga4";

const GA_MEASUREMENT_ID = process.env.REACT_APP_GA_MEASUREMENT_ID;

const AnalyticsTracker = () => {
  const location = useLocation();

  // Effect for initialization (runs once on mount)
  useEffect(() => {
    if (GA_MEASUREMENT_ID) {
      // Check if already initialized (e.g., due to strict mode double invoke in dev)
      if (!ReactGA4.isInitialized) {
        ReactGA4.initialize(GA_MEASUREMENT_ID);
      }
    } else {
      console.warn(
        "Google Analytics Measurement ID (REACT_APP_GA_MEASUREMENT_ID) is not set. Tracking will be disabled.",
      );
    }
  }, []); // Empty dependency array: runs only once on mount.

  // Effect for tracking page views (runs on location change after initialization)
  useEffect(() => {
    if (GA_MEASUREMENT_ID && ReactGA4.isInitialized) {
      ReactGA4.send({
        hitType: "pageview",
        page: location.pathname + location.search + location.hash, // include hash for better SPA tracking
        title: document.title, // Uses the current document title
      });
      console.log(
        `GA Pageview Sent: ${location.pathname + location.search + location.hash}`,
      );
    }
  }, [location]); // Runs on initial mount (after init effect) and whenever location changes.

  return null; // This component does not render anything visible
};

export default AnalyticsTracker;
