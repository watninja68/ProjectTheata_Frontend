// src/hooks/useSettings.js
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

const defaults = {
    deepgramApiKey: '',
<<<<<<< Updated upstream
<<<<<<< Updated upstream
=======
    goBackendBaseUrl: 'http://localhost:8080', // Ensure this is correct
    backendBaseUrl: 'http://localhost:8000',
>>>>>>> Stashed changes
=======
    goBackendBaseUrl: 'http://localhost:8080', // Ensure this is correct
    backendBaseUrl: 'http://localhost:8000',
>>>>>>> Stashed changes
    voiceName: 'Aoede',
    sampleRate: 27000,
    systemInstructions: 'You are a helpful assistant named Theata.',
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
    transcribeModelsSpeech: true,
    transcribeUsersSpeech: false,
};

const thresholds = {
    0: "BLOCK_NONE",
    1: "BLOCK_ONLY_HIGH",
    2: "BLOCK_MEDIUM_AND_ABOVE",
    3: "BLOCK_LOW_AND_ABOVE"
};

const HARDCODED_API_KEY = "AIzaSyCDvSi6OVlgdODnPmHmIBcc5UylRH0CvB8";


export const useSettings = () => {
    const { user } = useAuth();
    const [settings, setSettings] = useState(defaults);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        return savedTheme === 'light' ? 'light' : 'dark';
    });

    useEffect(() => {
        const loadedSettings = {};
        Object.keys(defaults).forEach(key => {
            const storedValue = localStorage.getItem(key);
            if (storedValue !== null) {
                if (key === 'transcribeModelsSpeech' || key === 'transcribeUsersSpeech') {
                     loadedSettings[key] = storedValue === 'true';
                } else if (['deepgramApiKey', 'goBackendBaseUrl', 'backendBaseUrl', 'voiceName', 'systemInstructions'].includes(key)) {
                    loadedSettings[key] = storedValue;
                } else if (key === 'temperature' || key === 'top_p' || key === 'quality') {
                    loadedSettings[key] = parseFloat(storedValue);
                } else {
                    const parsedInt = parseInt(storedValue, 10);
                    loadedSettings[key] = isNaN(parsedInt) ? defaults[key] : parsedInt;
                }
            } else {
                 loadedSettings[key] = defaults[key];
            }
        });
         setSettings(loadedSettings);

        if (theme === 'light') {
            document.body.classList.add('theme-light');
        } else {
            document.body.classList.remove('theme-light');
        }

    }, [theme]);

    useEffect(() => {
        if (theme === 'light') {
            document.body.classList.add('theme-light');
            localStorage.setItem('theme', 'light');
        } else {
            document.body.classList.remove('theme-light');
            localStorage.setItem('theme', 'dark');
        }
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
    }, []);

    const saveSettings = useCallback((newSettings) => {
        Object.entries(newSettings).forEach(([key, value]) => {
            localStorage.setItem(key, value);
        });
        setSettings(newSettings);
        setIsSettingsOpen(false);
        window.location.reload();
    }, []);

    const openSettings = useCallback(() => setIsSettingsOpen(true), []);
    const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

    const getGeminiConfig = useCallback((toolDeclarations = []) => {
        const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email;
        const baseInstructions = settings.systemInstructions || "You are a helpful assistant named Theata.";
        const userPrefix = userName
            ? `The user you are speaking with is logged in as ${userName}. `
            : 'The user is not logged in. ';
        const finalInstructions = userPrefix + baseInstructions;

        return {
            model: 'models/gemini-2.0-flash-exp',
            generationConfig: {
                temperature: settings.temperature,
                top_p: settings.top_p,
                top_k: settings.top_k,
                responseModalities: "audio",
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: settings.voiceName
                        }
                    }
                }
            },
            systemInstruction: {
                parts: [{ text: finalInstructions }]
            },
            tools: { functionDeclarations: toolDeclarations },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: thresholds[settings.harassmentThreshold] ?? "HARM_BLOCK_THRESHOLD_UNSPECIFIED" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: thresholds[settings.dangerousContentThreshold] ?? "HARM_BLOCK_THRESHOLD_UNSPECIFIED" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: thresholds[settings.sexuallyExplicitThreshold] ?? "HARM_BLOCK_THRESHOLD_UNSPECIFIED" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: thresholds[settings.harassmentThreshold] ?? "HARM_BLOCK_THRESHOLD_UNSPECIFIED" },
                { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: thresholds[settings.civicIntegrityThreshold] ?? "HARM_BLOCK_THRESHOLD_UNSPECIFIED" }
            ]
        };
    }, [settings, user]);

    const getWebsocketUrl = useCallback(() => {
        if (!HARDCODED_API_KEY || HARDCODED_API_KEY === "YOUR_API_KEY_HERE") {
            console.error("API Key is not hardcoded correctly in useSettings.js for direct WebSocket!");
            return null;
        }
        return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${HARDCODED_API_KEY}`;
    }, []);


    return {
        settings,
        isSettingsOpen,
        saveSettings,
        openSettings,
        closeSettings,
        getGeminiConfig,
        getWebsocketUrl,
        thresholds,
        theme,
        toggleTheme,
    };
};