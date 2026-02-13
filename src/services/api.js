import { config } from '../config.js';

const API_BASE = config.API_BASE;

const getAuthToken = async () => {
    return new Promise((resolve, reject) => {
        // Add timeout to prevent hanging
        const timeoutId = setTimeout(() => {
            reject(new Error('Cookie read timeout'));
        }, 5000); // 5 second timeout

        try {
            // Try getting cookie from frontend URL where it was set
            // This is more reliable than credentials: 'include' for third-party contexts
            chrome.cookies.getAll({ url: config.COOKIE_URL }, (cookies) => {
                clearTimeout(timeoutId);

                // Check for Chrome API errors
                if (chrome.runtime.lastError) {
                    console.error('Cookie read error:', chrome.runtime.lastError.message);
                    resolve(null); // Resolve to null instead of rejecting to maintain backward compatibility
                    return;
                }

                const sessionCookie = cookies.find(c => c.name === 'session_token');
                if (sessionCookie) {
                    resolve(sessionCookie.value);
                } else {
                    resolve(null);
                }
            });
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('Unexpected error in getAuthToken:', error);
            resolve(null); // Resolve to null on unexpected errors
        }
    });
};

const api = {
    // Fetch user's active subscriptions
    getSubscriptions: async () => {
        try {
            const token = await getAuthToken();
            if (!token) throw new Error('No token found');

            const response = await fetch(`${API_BASE}/subscriptions`, {
                method: 'GET',
                // credentials: 'include', // Removed in favor of explicit Bearer
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) throw new Error('Unauthorized');
                throw new Error('Failed to fetch subscriptions');
            }

            const json = await response.json();
            return json.data || [];
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    // Create new subscription
    createSubscription: async (data) => {
        try {
            const token = await getAuthToken();
            if (!token) throw new Error('Please log in');

            const response = await fetch(`${API_BASE}/subscriptions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                let errorMessage = 'Failed to create subscription';
                try {
                    const err = await response.json();
                    errorMessage = err.message || errorMessage;
                } catch {
                    // Fallback if response is not JSON (e.g. 500 HTML)
                    const text = await response.text();
                    console.warn('Non-JSON error response:', text);
                }

                if (response.status === 401) {
                    throw new Error('Please log in.');
                }
                throw new Error(errorMessage);
            }

            const json = await response.json();
            return json.data;
        } catch (error) {
            console.error('Create Subscription Error:', error);
            throw error;
        }
    },

    // Verify if user is logged in
    checkAuth: async () => {
        try {
            const token = await getAuthToken();
            if (!token) return null;

            const response = await fetch(`${API_BASE}/auth/me`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const json = await response.json();
                return json.data; // Return user object if auth
            }
            return null;
        } catch {
            return null;
        }
    },

    // Fetch full user profile (including BCC alias)
    getUserProfile: async () => {
        try {
            const token = await getAuthToken();
            if (!token) return null;

            const response = await fetch(`${API_BASE}/auth/me`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Failed to fetch profile');
            const json = await response.json();
            return json.data;
        } catch (error) {
            console.error('Profile Sync Error:', error);
            return null;
        }
    }
};

export { api };
