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

/**
 * Converts a File object to a base64 string
 * @param {File} file - The file to convert
 * @param {number} maxWidth - Maximum width for image resizing (default: 1280)
 * @param {number} quality - JPEG quality (0-1, default: 0.8)
 * @returns {Promise<string>} Promise resolving to base64 string (without data URL prefix)
 */
export function fileToBase64(file, maxWidth = 1280, quality = 0.8) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            reject(new Error('File must be an image'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Create canvas for resizing
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Calculate new dimensions maintaining aspect ratio
                let { width, height } = img;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                // Draw and compress image
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);

                // Return only the base64 part (without data:image/jpeg;base64,)
                const base64 = dataUrl.split(',')[1];
                resolve(base64);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}
