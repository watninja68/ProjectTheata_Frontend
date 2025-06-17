// src/hooks/useSettings.js
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth"; // Import the useAuth hook

// Define default settings values (apiKey default is now less relevant)
const defaults = {
  // apiKey: '', // No longer strictly needed for URL generation
  deepgramApiKey: "",
  backendBaseUrl: process.env.REACT_APP_BACKEND_URL,
  voiceName: "Aoede",
  sampleRate: 27000,
  systemInstructions: "You are a helpful assistant named Theata.", // Example base instructions
  temperature: 1.8,
  top_p: 0.95,
  top_k: 65,
  fps: 1,
  resizeWidth: 640,
  quality: 0.3,
  harassmentThreshold: 3,
  dangerousContentThreshold: 3,
  sexuallyExplicitThreshold: 3,
  civicIntegrityThreshold: 3,
  // Add other settings keys as needed
  transcribeModelsSpeech: true, // Default for transcribe toggle
  transcribeUsersSpeech: false, // Default for transcribe toggle
};

// Threshold mapping for safety settings
const thresholds = {
  0: "BLOCK_NONE",
  1: "BLOCK_ONLY_HIGH",
  2: "BLOCK_MEDIUM_AND_ABOVE",
  3: "BLOCK_LOW_AND_ABOVE",
};

// !!! --- IMPORTANT: Hardcode your API Key Here --- !!!
// Replace "YOUR_API_KEY_HERE" with your actual Gemini API key.
// Remember: This is NOT secure for production or shared code.
const HARDCODED_API_KEY = process.env.REACT_APP_GOOGLE_API_KEY; // USE YOUR KEY
// !!! ---------------------------------------------- !!!

export const useSettings = () => {
  // Use the Auth hook to get user information
  const { user } = useAuth();

  // Keep settings state, even if apiKey isn't used for URL anymore,
  // it might be useful for display or other purposes.
  const [settings, setSettings] = useState(defaults);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // --- Theme State ---
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem("theme");
    return savedTheme === "light" ? "light" : "dark"; // Default to dark
  });

  // Load settings and apply theme from localStorage on initial mount
  useEffect(() => {
    const loadedSettings = {};
    Object.keys(defaults).forEach((key) => {
      const storedValue = localStorage.getItem(key);
      if (storedValue !== null) {
        // Handle booleans from localStorage (stored as strings)
        if (
          key === "transcribeModelsSpeech" ||
          key === "transcribeUsersSpeech"
        ) {
          loadedSettings[key] = storedValue === "true";
        } else if (
          key === "deepgramApiKey" ||
          key === "voiceName" ||
          key === "systemInstructions"
        ) {
          loadedSettings[key] = storedValue;
        } else if (
          key === "temperature" ||
          key === "top_p" ||
          key === "quality"
        ) {
          loadedSettings[key] = parseFloat(storedValue);
        } else {
          // Ensure keys like 'harassmentThreshold' are parsed correctly
          const parsedInt = parseInt(storedValue, 10);
          loadedSettings[key] = isNaN(parsedInt) ? defaults[key] : parsedInt;
        }
      } else {
        loadedSettings[key] = defaults[key]; // Fallback to default if not in localStorage
      }
    });
    setSettings(loadedSettings);

    // Add a console warning if the key isn't set
    if (!HARDCODED_API_KEY) {
      console.warn(
        "WARNING: Gemini API Key is not hardcoded in src/hooks/useSettings.js. Connection will fail.",
      );
    }

    // Apply initial theme class
    if (theme === "light") {
      document.body.classList.add("theme-light");
    } else {
      document.body.classList.remove("theme-light");
    }
  }, []); // Empty dependency array runs only on mount

  // --- Theme Management ---
  useEffect(() => {
    // Apply theme class whenever theme state changes
    if (theme === "light") {
      document.body.classList.add("theme-light");
      localStorage.setItem("theme", "light");
      console.log("Applied light theme");
    } else {
      document.body.classList.remove("theme-light");
      localStorage.setItem("theme", "dark");
      console.log("Applied dark theme");
    }
  }, [theme]); // Runs when theme state changes

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"));
  }, []);
  // --- End Theme Management ---

  // Function to save settings to localStorage and state
  const saveSettings = useCallback((newSettings) => {
    Object.entries(newSettings).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
    setSettings(newSettings);
    setIsSettingsOpen(false);
    // Reload might still be needed for other settings to take effect in agent config
    window.location.reload();
  }, []);

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  // Function to generate the Gemini config object based on current settings AND auth state
  const getGeminiConfig = useCallback(
    (toolDeclarations = [], conversationContextSummary = '') => {
      // --- System Instruction Update ---
      // Get user name from Supabase metadata if available, otherwise fallback to email
      const userName =
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email;
      const baseInstructions =
        "You are a helpful assistant named Theta. ";
      
      const userPrefix = userName
        ? `The user you are speaking with is logged in as ${userName}. `
        : "The user is not logged in. ";

      const contextPrefix = conversationContextSummary
        ? `This is a continuing conversation. Here is the summary of the previous messages:\n---\n${conversationContextSummary}\n---\n\nPlease consider this context in your responses. The current date is ${new Date().toDateString()}.\n\n`
        : "";
      
      const finalInstructions = contextPrefix + userPrefix + baseInstructions;

      console.log("Using final system instructions:", finalInstructions);
      // --- End System Instruction Update ---

      return {
        model: "models/gemini-2.0-flash-exp",
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        //output_audio_transcription: {
        //enable_automatic_punctuation: true,
        //},
        //input_audio_transcription: {
        //enable_automatic_punctuation: true,
        //},
        generationConfig: {
          temperature: settings.temperature,
          top_p: settings.top_p,
          top_k: settings.top_k,
          //session_resumption: {},
          //output_audio_transcription: {},
          responseModalities: "audio",
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: settings.voiceName,
              },
            },
          },
        },
        // Use the potentially modified system instructions
        systemInstruction: {
          parts: [{ text: finalInstructions }],
        },
        tools: { functionDeclarations: toolDeclarations },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold:
              thresholds[settings.harassmentThreshold] ??
              "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold:
              thresholds[settings.dangerousContentThreshold] ??
              "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold:
              thresholds[settings.sexuallyExplicitThreshold] ??
              "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
          },
          // Map hate speech setting if needed, otherwise use harassment or add a separate setting
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold:
              thresholds[settings.harassmentThreshold] ??
              "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
          },
          {
            category: "HARM_CATEGORY_CIVIC_INTEGRITY",
            threshold:
              thresholds[settings.civicIntegrityThreshold] ??
              "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
          },
        ],
      };
      // Depend on the user object now, so config updates when user logs in/out
    },
    [settings, user],
  );

  // Function to get WebSocket URL - NOW USES HARDCODED KEY
  const getWebsocketUrl = useCallback(() => {
    // Use the hardcoded key defined at the top of the file
    if (!HARDCODED_API_KEY) {
      console.error("API Key is not hardcoded correctly in useSettings.js!");
      alert(
        "ERROR: API Key is not set in the code. Please edit src/hooks/useSettings.js",
      );
      return null; // Prevent connection attempt
    }
    // Construct URL directly with the hardcoded key
    return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${HARDCODED_API_KEY}`;
  }, []); // No dependencies needed for this version

  return {
    settings, // Provide settings state for other uses (like the config)
    isSettingsOpen,
    saveSettings,
    openSettings,
    closeSettings,
    getGeminiConfig, // Now incorporates user info
    getWebsocketUrl, // Now returns the hardcoded URL
    thresholds,
    // Theme exports
    theme,
    toggleTheme,
  };
};
