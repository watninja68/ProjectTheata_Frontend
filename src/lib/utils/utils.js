/**
 * Converts a Blob object to a JSON object using FileReader.
 * Useful for processing blob data received from APIs
 * @param {Blob} blob - The Blob object to convert
 * @returns {Promise<Object>} Promise resolving to parsed JSON object
 */
export function blobToJSON(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = () => {
            if (reader.result) {
                // Parse the FileReader result into JSON
                resolve(JSON.parse(reader.result));
            } else {
                reject('Failed to parse blob to JSON');
            }
        };
        
        // Initiate blob reading as text
        reader.readAsText(blob);
    });
}

/**
 * Converts a base64 encoded string to an ArrayBuffer.
 * @param {string} base64 - Base64 encoded string
 * @returns {ArrayBuffer} ArrayBuffer containing the decoded data
 */
export function base64ToArrayBuffer(base64) {
    // Decode base64 to binary string
    const binaryString = atob(base64);
    
    // Create buffer to hold binary data
    const bytes = new Uint8Array(binaryString.length);
    
    // Convert binary string to byte array
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
}

/**
 * Converts an ArrayBuffer to a base64 encoded string.
 * @param {ArrayBuffer} buffer - The ArrayBuffer to convert
 * @returns {string} Base64 encoded string representation of the buffer
 */
export function arrayBufferToBase64(buffer) {
    try {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        // Convert each byte to binary string
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    } catch (error) {
        console.error('Failed to convert array buffer to base64: ' + error.message);
    }
}
