// src/hooks/useAuth.js
import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { supabase } from '../lib/supabase/client'; // Import your Supabase client

// Create the Auth Context
const AuthContext = createContext(null);

// Create a Provider Component
export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true); // Start loading until initial check is done

    // Function to handle Google Sign In
    const signInWithGoogle = useCallback(async () => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                // Optional: Specify redirect URL if needed, defaults work for most cases
                // options: {
                //   redirectTo: window.location.origin, // Redirect back to your app
                // },
            });
            if (error) {
                console.error('Error signing in with Google:', error.message);
                alert(`Google Sign-In Error: ${error.message}`);
            }
            // setLoading(false) will be handled by onAuthStateChange
        } catch (error) {
            console.error('Unexpected error during Google sign-in:', error);
            alert('An unexpected error occurred during sign-in.');
            setLoading(false);
        }
    }, []);

    // Function to handle Sign Out
    const signOut = useCallback(async () => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error('Error signing out:', error.message);
                alert(`Sign Out Error: ${error.message}`);
            }
            // State updates (session, user) will be handled by onAuthStateChange
        } catch (error) {
            console.error('Unexpected error during sign-out:', error);
            alert('An unexpected error occurred during sign-out.');
        } finally {
            setLoading(false); // Ensure loading is false after sign out attempt
        }
    }, []);

    // Effect to get the initial session and listen for auth changes
    useEffect(() => {
        setLoading(true);
        let isMounted = true; // Track component mount status

        // 1. Get initial session data
        supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
            // Only update state if the component is still mounted
            if (isMounted) {
                setSession(initialSession);
                setUser(initialSession?.user ?? null);
                console.log("Initial session check:", initialSession);
                // We don't set loading to false here yet, let the listener handle it
                // or set it after listener setup if needed
            }
        }).catch(error => {
            console.error("Error getting initial session:", error);
            if (isMounted) {
                setLoading(false); // Set loading false on error too
            }
        });

        // 2. Listen for future auth state changes
        // *** FIX: Correctly destructure 'subscription' from 'data' ***
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, currentSession) => {
                // Only update state if the component is still mounted
                 if (isMounted) {
                    console.log("Auth State Change Detected:", _event, currentSession);
                    setSession(currentSession);
                    setUser(currentSession?.user ?? null);
                    setLoading(false); // Auth state confirmed/updated, stop loading
                 }
            }
        );

        // Cleanup listener on component unmount
        return () => {
            isMounted = false; // Mark as unmounted
            // *** FIX: Call unsubscribe on the 'subscription' object ***
            subscription?.unsubscribe();
            console.log("Auth listener unsubscribed.");
        };
    }, []); // Empty dependency array ensures this runs only once on mount

    const value = {
        session,
        user,
        loading,
        signInWithGoogle,
        signOut,
    };

    // Render children within the provider, passing the auth state/functions
    // Render null or a loading indicator while loading to prevent downstream issues
    // or render children conditionally: { !loading && children }
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Create a custom hook to use the Auth Context
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};