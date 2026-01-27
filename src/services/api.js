import { config } from '../config';

const API_BASE = config.API_BASE;

const getAuthToken = async () => {
    return new Promise((resolve) => {
        // Try getting cookie from frontend URL where it was set
        chrome.cookies.getAll({ url: config.COOKIE_URL }, (cookies) => {
            console.log(`DEBUG: ALL cookies for ${config.COOKIE_URL}:`, cookies);

            const sessionCookie = cookies.find(c => c.name === 'session_token');
            if (sessionCookie) {
                console.log('DEBUG: Found session_token:', sessionCookie);
                resolve(sessionCookie.value);
            } else {
                console.log('DEBUG: session_token MISSING. Available:', cookies.map(c => c.name));
                resolve(null);
            }
        });
    });
};

export const api = {
    // Fetch user's active subscriptions
    getSubscriptions: async () => {
        try {
            const token = await getAuthToken();
            if (!token) throw new Error('No token found');

            const response = await fetch(`${API_BASE}/subscriptions`, {
                method: 'GET',
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
                const err = await response.json();
                if (response.status === 401) {
                    throw new Error('Please log in to SubDupes (localhost:5173) to sync.');
                }
                throw new Error(err.message || 'Failed to create subscription');
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
