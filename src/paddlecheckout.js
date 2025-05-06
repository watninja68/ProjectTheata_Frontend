import React, { useEffect, useState } from 'react';

const PADDLE_CLIENT_TOKEN = "test_e0d51f2e3a92a42239d808f24a8"; // Replace with your actual client-side token
const PADDLE_ENVIRONMENT = "sandbox"; // Or "production"

// Define the items directly or pass them as props
const defaultItems = [
    {
        priceId: 'pri_01jthn1sm2qt6y2fg33sy41ebr', // Example Price ID
        quantity: 1 // Quantity usually starts at 1 unless pre-defined
    },
    // Add other items if needed
];

function PaddleCheckout({ items = defaultItems }) {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Make sure we're in a browser environment
        if (typeof window === 'undefined') {
            setError('Cannot run in non-browser environment');
            setIsLoading(false);
            return;
        }

        // Script loading function
        const loadPaddleScript = () => {
            return new Promise((resolve, reject) => {
                if (window.Paddle) {
                    resolve();
                    return;
                }

                // Make sure we're in a browser environment with document access
                if (typeof document === 'undefined') {
                    reject(new Error('Document is not available'));
                    return;
                }

                const script = document.createElement('script');
                script.src = 'https://cdn.paddle.com/paddle/paddle.js';
                script.async = true;
                script.onload = resolve;
                script.onerror = () => reject(new Error('Failed to load Paddle.js'));

                // Make sure document.head exists before appending
                if (document.head) {
                    document.head.appendChild(script);
                } else if (document.body) {
                    document.body.appendChild(script);
                } else {
                    reject(new Error('Cannot find document.head or document.body to append script'));
                }
            });
        };

        // Initialize and open checkout
        const initializePaddle = async () => {
            try {
                setIsLoading(true);

                await loadPaddleScript();

                // Set the environment (sandbox or production)
                window.Paddle.Environment.set(PADDLE_ENVIRONMENT);

                // Initialize Paddle
                window.Paddle.Setup({
                    token: PADDLE_CLIENT_TOKEN,
                });

                // Make sure the checkout container exists before opening
                const checkoutContainer = document.getElementById('checkout-container');
                if (!checkoutContainer) {
                    throw new Error('Checkout container element not found');
                }

                // Open the checkout
                window.Paddle.Checkout.open({
                    items: items,
                    settings: {
                        displayMode: "inline",
                        frameTarget: "checkout-container",
                        frameStyle: "width: 100%; min-width: 312px; background-color: transparent; border: none;",
                        height: 450,
                    }
                    // Add customer details if needed
                    // customer: { email: 'customer@example.com' }
                });

                setIsLoading(false);
            } catch (error) {
                console.error("Paddle Initialization or Checkout Error:", error);
                setError(error.message || "Failed to initialize Paddle checkout");
                setIsLoading(false);
            }
        };

        initializePaddle();

        // Cleanup function
        return () => {
            // Close the checkout if it's open when component unmounts
            if (window.Paddle && window.Paddle.Checkout) {
                try {
                    window.Paddle.Checkout.close();
                } catch (e) {
                    console.error("Error closing Paddle checkout:", e);
                }
            }
        };
    }, [items]); // Re-run the effect if the 'items' prop changes

    return (
        <div className="paddle-checkout-container">
            {isLoading && <div className="loading">Loading checkout...</div>}
            {error && <div className="error">Error: {error}</div>}
            {/* This div is where Paddle will inject the inline checkout iframe */}
            <div id="checkout-container"></div>
        </div>
    );
}

export default PaddleCheckout;
