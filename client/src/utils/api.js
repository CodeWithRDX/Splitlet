const API_URL = (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL !== 'http://localhost:5001')
  ? import.meta.env.VITE_API_URL
  : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5001' : '');

export const setToken = (token) => {
  if (token) {
    localStorage.setItem('splitlet_token', token);
  } else {
    localStorage.removeItem('splitlet_token');
  }
};

export const getToken = () => {
  return localStorage.getItem('splitlet_token');
};

export const logout = () => {
  localStorage.removeItem('splitlet_token');
  localStorage.removeItem('splitlet_user');
};

export const setUser = (user) => {
  if (user) {
    localStorage.setItem('splitlet_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('splitlet_user');
  }
};

export const getUser = () => {
  const user = localStorage.getItem('splitlet_user');
  return user ? JSON.parse(user) : null;
};

export const apiFetch = async (endpoint, options = {}) => {
  const token = getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers
  };

  const config = {
    ...options,
    headers
  };

  let response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, config);
  } catch (netErr) {
    const err = new Error('Network connection error');
    err.status = 503;
    throw err;
  }
  
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    const err = new Error(data.error || 'Something went wrong');
    err.status = response.status;
    throw err;
  }

  return data;
};
