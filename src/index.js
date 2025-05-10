import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'; // Import router components
import App from './App';
import LandingPage from './components/LandingPage'; // Import your new landing page
import { AuthProvider, useAuth } from './hooks/useAuth';

// A component to protect routes that require authentication
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth(); // Assuming your useAuth provides a loading state

  if (loading) {
    return <div>Loading...</div>; // Or a proper loading spinner
  }

  if (!user) {
    // User not authenticated, redirect to landing or login page
    // The <Navigate> component will change the URL
    return <Navigate to="/" replace />;
  }
  return children; // User authenticated, render the protected component
};


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider> {/* AuthProvider should wrap BrowserRouter to provide context to all routes */}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/app/*" // Use /* if App.js has its own internal routing
            element={
              <ProtectedRoute>
                <App />
              </ProtectedRoute>
            }
          />
          {/* You could add more routes here, e.g., /login, /signup if they are separate pages */}
          <Route path="*" element={<Navigate to="/" replace />} /> {/* Catch-all, redirect to landing */}
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
