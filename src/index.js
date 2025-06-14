import React from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import App from "./App";
import LandingPage from "./components/LandingPage";
import LoginPage from "./components/LoginPage"; // Import LoginPage
import { AuthProvider, useAuth } from "./hooks/useAuth";
import AnalyticsTracker from "./components/AnalyticsTracker"; // <<<--- IMPORT THE TRACKER
import "./index.css"; // Ensure global styles (including theme vars) are imported

// A component to protect routes that require authentication
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Show a loading indicator while auth state is being determined
    // This prevents a flash of the login page if the user is already authenticated
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "var(--bg-primary, #120824)", // Fallback color
          color: "var(--text-primary, #EAE4F8)", // Fallback color
        }}
      >
        <div>Loading authentication...</div>{" "}
        {/* Or a proper spinner component */}
      </div>
    );
  }

  if (!user) {
    // User not authenticated, redirect to login page
    // Pass the current location in state so LoginPage can redirect back after login
    console.log(
      "ProtectedRoute: User not authenticated, redirecting to /login. From:",
      location.pathname,
    );
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children; // User authenticated, render the protected component
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AuthProvider>
      {" "}
      {/* AuthProvider wraps BrowserRouter to provide context to all routes */}
      <BrowserRouter>
        <AnalyticsTracker /> {/* <<<--- ADD THE TRACKER HERE */}
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />{" "}
          {/* Add LoginPage route */}
          <Route path="/app" element={<ProtectedRoute><App /></ProtectedRoute>} />
          <Route path="/app/chat/:chatId" element={<ProtectedRoute><App /></ProtectedRoute>} />
          {/* Catch-all for undefined routes, redirect to landing page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
