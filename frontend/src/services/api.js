import axios from 'axios';

const configuredBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim().replace(/\/+$/, '');

const api = axios.create({
  // Keep the Vite proxy for local development; point directly at the deployed
  // backend when the frontend is hosted separately.
  baseURL: configuredBackendUrl ? `${configuredBackendUrl}/api` : '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // A signed-in session that the server no longer accepts: sign out.
    const isLoginCall = String(error.config?.url || '').includes('/auth/login');
    if (error.response?.status === 401 && !isLoginCall && localStorage.getItem('token')) {
      window.dispatchEvent(new Event('auth:expired'));
    }
    const message = error.response?.data?.error || error.message || 'An error occurred';
    return Promise.reject(new Error(message));
  }
);

export default api;
