const CONFIG = {
    development: {
        API_BASE: 'http://localhost:5000/api',
        FRONTEND_URL: 'http://localhost:5173',
        COOKIE_URL: 'http://localhost:5173'
    },
    production: {
        API_BASE: 'https://backend.subdupes.com/api',
        FRONTEND_URL: 'https://app.subdupes.com',
        COOKIE_URL: 'https://app.subdupes.com'
    }
};

const ENV = import.meta.env.MODE === 'production' ? 'production' : 'development';

export const config = CONFIG[ENV];
