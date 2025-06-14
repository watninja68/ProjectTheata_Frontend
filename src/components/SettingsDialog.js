// src/components/SettingsDialog.js
import React, { useState, useEffect } from 'react';

// Helper Collapsible Component (Defined within SettingsDialog file)
const Collapsible = ({ title, children, startOpen = false }) => {
    const [isOpen, setIsOpen] = useState(startOpen);
    return (
        <div className="settings-group collapsible-container"> {/* Add container class */}
            <div className="collapsible" onClick={() => setIsOpen(!isOpen)} role="button" tabIndex="0" aria-expanded={isOpen}>
                {title} <span className="collapse-icon">{isOpen ? '▲' : '▼'}</span> {/* Icon in span */}
             </div>
            {/* Apply active class directly for CSS transitions */}
            <div className={`collapsible-content ${isOpen ? 'active' : ''}`}>
                {children}
            </div>
        </div>
    );
};


const SettingsDialog = ({ isOpen, onClose, initialSettings, onSave, thresholds }) => {
    const [settings, setSettings] = useState(initialSettings);

    // Update local state if initialSettings change (e.g., after loading)
    useEffect(() => {
        setSettings(initialSettings);
    }, [initialSettings]);

    if (!isOpen) {
        return null;
    }

    const handleChange = (event) => {
        const { id, value, type, checked } = event.target; // Add checked for checkboxes

        // Special handling for checkboxes
        if (type === 'checkbox') {
            setSettings(prev => ({ ...prev, [id]: checked }));
            return;
        }

        // Existing handling for other types
        setSettings(prev => ({
            ...prev,
            [id]: type === 'range' || !isNaN(parseFloat(value)) && !['apiKey', 'deepgramApiKey', 'voiceName', 'systemInstructions'].includes(id)
                ? (['temperature', 'top_p', 'quality'].includes(id) ? parseFloat(value) : parseInt(value, 10))
                : value
        }));
    };

     const handleSave = () => {
        onSave(settings);
        // onClose(); // Close dialog after save is handled by useSettings hook via reload
    };

    const getThresholdLabel = (value) => {
        const labels = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High' };
        return labels[value] || value;
     };

    // Uses styles from styles.css which now includes light theme adaptations
    return (
        <>
            {/* Overlay handles closing */}
            <div className="settings-overlay active" onClick={onClose}></div>
            {/* Dialog prevents click propagation */}
            <div className="settings-dialog active" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="settings-title">
                <h2 id="settings-title" style={{ textAlign: 'center', marginBottom: '2rem', color: 'var(--text-primary)' }}>Settings</h2>

                {/* API Keys Section */}
{/*
<Collapsible title="API Keys & Connection" startOpen={true}>
                     {/* Display Hardcoded Key Status }
                     <div className="settings-group">
                         <label>Gemini API Key Status</label>
                         <input type="text" value="Using hardcoded key from code" readOnly disabled style={{ fontStyle: 'italic', color: 'var(--text-secondary)'}} />
                     </div>
                     <div className="settings-group">
                        <label htmlFor="deepgramApiKey">Deepgram API Key (Optional)</label>
                        <input type="password" id="deepgramApiKey" placeholder="Enter your Deepgram API key" value={settings.deepgramApiKey || ''} onChange={handleChange} />
                     </div>
                     {/* Add checkboxes for transcription toggles }
                      <div className="settings-group checkbox-group">
                         <input type="checkbox" id="transcribeModelsSpeech" checked={settings.transcribeModelsSpeech || true} onChange={handleChange} />
                         <label htmlFor="transcribeModelsSpeech">Transcribe Model's Speech (via Deepgram)</label>
                     </div>
                     <div className="settings-group checkbox-group">
                         <input type="checkbox" id="transcribeUsersSpeech" checked={settings.transcribeUsersSpeech || false} onChange={handleChange} />
                         <label htmlFor="transcribeUsersSpeech">Transcribe User's Speech (via Deepgram)</label>
                     </div>
                </Collapsible>
*/}
                 {/* Voice & Audio */}
                 <Collapsible title="Voice & Audio">
                     <div className="settings-group">
                          <label htmlFor="voiceName">Voice</label>
                          <select id="voiceName" value={settings.voiceName} onChange={handleChange}>
                             {/* Add more voices if available */}
                             <option value="Puck">Puck</option>
                             <option value="Charon">Charon</option>
                             <option value="Kore">Kore</option>
                             <option value="Fenrir">Fenrir</option>
                             <option value="Aoede">Aoede</option>
                         </select>
                     </div>
                      <div className="settings-group">
                         <label htmlFor="sampleRate">Model Sample Rate ({settings.sampleRate} Hz)</label>
                         <input type="range" id="sampleRate" min="16000" max="48000" step="1000" value={settings.sampleRate} onChange={handleChange} />
                         <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Affects model audio output quality. Higher may increase latency.</span>
                     </div>
                 </Collapsible>

                {/* System Instructions */}
                <Collapsible title="System Instructions">
                     <textarea id="systemInstructions" rows="5" placeholder="Enter system instructions for the agent..." value={settings.systemInstructions} onChange={handleChange}></textarea>
                </Collapsible>

                 {/* Screen/Camera Settings */}
                <Collapsible title="Screen & Camera Capture">
                     <div className="settings-group">
                        <label htmlFor="fps">Capture FPS ({settings.fps})</label>
                        <input type="range" id="fps" min="1" max="10" step="1" value={settings.fps} onChange={handleChange}/>
                        <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Frames per second for camera/screen capture. Higher uses more resources.</span>
                    </div>
                    <div className="settings-group">
                         <label htmlFor="resizeWidth">Capture Resize Width ({settings.resizeWidth}px)</label>
                         <input type="range" id="resizeWidth" min="320" max="1920" step="80" value={settings.resizeWidth} onChange={handleChange}/>
                          <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Width images are resized to before sending. Smaller is faster.</span>
                     </div>
                    <div className="settings-group">
                        <label htmlFor="quality">Capture Quality ({settings.quality})</label>
                        <input type="range" id="quality" min="0.1" max="1" step="0.1" value={settings.quality} onChange={handleChange}/>
                         <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>JPEG quality for captured images (0.1=low, 1=high).</span>
                    </div>
                 </Collapsible>

                {/* Advanced Generation Settings */}
                 <Collapsible title="Advanced Generation Settings">
                    <div className="settings-group">
                        <label htmlFor="temperature">Temperature ({settings.temperature})</label>
                        <input type="range" id="temperature" min="0" max="2" step="0.1" value={settings.temperature} onChange={handleChange}/>
                        <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Controls randomness. Higher = more creative/varied, Lower = more focused.</span>
                    </div>
                     <div className="settings-group">
                        <label htmlFor="topP">Top P ({settings.top_p})</label>
                        <input type="range" id="top_p" min="0" max="1" step="0.05" value={settings.top_p} onChange={handleChange}/>
                         <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Nucleus sampling. Considers tokens comprising the top P probability mass.</span>
                     </div>
                     <div className="settings-group">
                         <label htmlFor="topK">Top K ({settings.top_k})</label>
                         <input type="range" id="top_k" min="1" max="100" step="1" value={settings.top_k} onChange={handleChange}/>
                          <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Considers the top K most likely tokens at each step.</span>
                     </div>
                 </Collapsible>

                 {/* Safety Settings */}
                 <Collapsible title="Safety Settings (Blocking Strength)">
                    <div className="settings-group">
                        <label htmlFor="harassmentThreshold">Harassment ({getThresholdLabel(settings.harassmentThreshold)})</label>
                         <input type="range" id="harassmentThreshold" min="0" max="3" step="1" value={settings.harassmentThreshold} onChange={handleChange}/>
                     </div>
                     <div className="settings-group">
                         <label htmlFor="dangerousContentThreshold">Dangerous Content ({getThresholdLabel(settings.dangerousContentThreshold)})</label>
                        <input type="range" id="dangerousContentThreshold" min="0" max="3" step="1" value={settings.dangerousContentThreshold} onChange={handleChange}/>
                    </div>
                    <div className="settings-group">
                         <label htmlFor="sexuallyExplicitThreshold">Sexually Explicit ({getThresholdLabel(settings.sexuallyExplicitThreshold)})</label>
                         <input type="range" id="sexuallyExplicitThreshold" min="0" max="3" step="1" value={settings.sexuallyExplicitThreshold} onChange={handleChange}/>
                     </div>
                      {/* Currently maps to harassment in agent config
                      <div className="settings-group">
                         <label htmlFor="hateSpeechThreshold">Hate Speech ({getThresholdLabel(settings.hateSpeechThreshold)})</label>
                         <input type="range" id="hateSpeechThreshold" min="0" max="3" step="1" value={settings.hateSpeechThreshold} onChange={handleChange}/>
                     </div> */}
                     <div className="settings-group">
                         <label htmlFor="civicIntegrityThreshold">Civic Integrity ({getThresholdLabel(settings.civicIntegrityThreshold)})</label>
                         <input type="range" id="civicIntegrityThreshold" min="0" max="3" step="1" value={settings.civicIntegrityThreshold} onChange={handleChange}/>
                     </div>
                     <span style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Adjust the blocking sensitivity for different harm categories (Higher number = blocks more).</span>
                 </Collapsible>

                {/* Save Button */}
                <button id="settingsSaveBtn" className="settings-save-btn" onClick={handleSave}>Save & Reload</button>
            </div>
        </>
    );
};

export default SettingsDialog;
