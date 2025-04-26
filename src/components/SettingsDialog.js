import React, { useState, useEffect } from 'react';

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
        const { id, value, type } = event.target;
        setSettings(prev => ({
            ...prev,
            [id]: type === 'range' || !isNaN(parseFloat(value)) && (id !== 'apiKey' && id !== 'deepgramApiKey' && id !== 'voiceName' && id !== 'systemInstructions')
                ? (id === 'temperature' || id === 'top_p' || id === 'quality' ? parseFloat(value) : parseInt(value, 10))
                : value
        }));
    };

     const handleSave = () => {
        onSave(settings);
    };

    const getThresholdLabel = (value) => {
        const labels = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High' };
        return labels[value] || value;
     };

    // Basic structure, needs collapsible logic added (e.g., using local state)
    // Needs styling from styles.css applied (import css or use styled-components)
    return (
        <>
            <div className="settings-overlay active" onClick={onClose}></div>
            <div className="settings-dialog active" onClick={e => e.stopPropagation()}>
                {/* API Keys */}
                <div className="settings-group">
                    <label htmlFor="apiKey">Gemini API Key</label>
                    <input type="password" id="apiKey" placeholder="Enter your Gemini API key" value={settings.apiKey} onChange={handleChange} />
                </div>
                <div className="settings-group">
                    <label htmlFor="deepgramApiKey">Deepgram API Key (Optional)</label>
                    <input type="password" id="deepgramApiKey" placeholder="Enter your Deepgram API key" value={settings.deepgramApiKey} onChange={handleChange} />
                </div>

                 {/* Voice & Sample Rate */}
                <div className="settings-group">
                     <label htmlFor="voice">Voice</label>
                     <select id="voiceName" value={settings.voiceName} onChange={handleChange}>
                        <option value="Puck">Puck</option>
                        <option value="Charon">Charon</option>
                        <option value="Kore">Kore</option>
                        <option value="Fenrir">Fenrir</option>
                        <option value="Aoede">Aoede</option>
                    </select>
                </div>
                 <div className="settings-group">
                    <label htmlFor="sampleRate">Sample Rate ({settings.sampleRate} Hz)</label>
                    <input type="range" id="sampleRate" min="8000" max="48000" step="1000" value={settings.sampleRate} onChange={handleChange} />
                </div>

                {/* System Instructions (Collapsible Example) */}
                <Collapsible title="System Instructions">
                     <textarea id="systemInstructions" rows="4" placeholder="Enter system instructions" value={settings.systemInstructions} onChange={handleChange}></textarea>
                </Collapsible>

                 {/* Screen/Camera Settings */}
                <Collapsible title="Screen & Camera">
                     <div className="settings-group">
                        <label htmlFor="fps">FPS ({settings.fps} FPS)</label>
                        <input type="range" id="fps" min="1" max="10" step="1" value={settings.fps} onChange={handleChange}/>
                    </div>
                    <div className="settings-group">
                         <label htmlFor="resizeWidth">Resize Width ({settings.resizeWidth}px)</label>
                         <input type="range" id="resizeWidth" min="640" max="1920" step="80" value={settings.resizeWidth} onChange={handleChange}/>
                     </div>
                    <div className="settings-group">
                        <label htmlFor="quality">Quality ({settings.quality})</label>
                        <input type="range" id="quality" min="0.1" max="1" step="0.1" value={settings.quality} onChange={handleChange}/>
                    </div>
                 </Collapsible>

                {/* Advanced Settings */}
                 <Collapsible title="Advanced Settings">
                    <div className="settings-group">
                        <label htmlFor="temperature">Temperature ({settings.temperature})</label>
                        <input type="range" id="temperature" min="0" max="2" step="0.1" value={settings.temperature} onChange={handleChange}/>
                    </div>
                     <div className="settings-group">
                        <label htmlFor="topP">Top P ({settings.top_p})</label>
                        <input type="range" id="top_p" min="0" max="1" step="0.05" value={settings.top_p} onChange={handleChange}/>
                     </div>
                     <div className="settings-group">
                         <label htmlFor="topK">Top K ({settings.top_k})</label>
                         <input type="range" id="top_k" min="1" max="100" step="1" value={settings.top_k} onChange={handleChange}/>
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
                     {/*<div className="settings-group">
                         <label htmlFor="hateSpeechThreshold">Hate Speech ({getThresholdLabel(settings.hateSpeechThreshold)})</label>
                         <input type="range" id="hateSpeechThreshold" min="0" max="3" step="1" value={settings.hateSpeechThreshold} onChange={handleChange}/>
                     </div>*/}
                     <div className="settings-group">
                         <label htmlFor="civicIntegrityThreshold">Civic Integrity ({getThresholdLabel(settings.civicIntegrityThreshold)})</label>
                         <input type="range" id="civicIntegrityThreshold" min="0" max="3" step="1" value={settings.civicIntegrityThreshold} onChange={handleChange}/>
                     </div>
                 </Collapsible>

                <button id="settingsSaveBtn" className="settings-save-btn" onClick={handleSave}>Save Settings</button>
            </div>
        </>
    );
};

 // Helper Collapsible Component
const Collapsible = ({ title, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="settings-group">
            <div className="collapsible" onClick={() => setIsOpen(!isOpen)}>
                {title} {isOpen ? '▲' : '▼'}
             </div>
            {isOpen && <div className="collapsible-content active">{children}</div>}
        </div>
    );
};

export default SettingsDialog;
