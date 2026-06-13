const API_URL = import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5001' : '');

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

  const response = await fetch(`${API_URL}${endpoint}`, config);
  
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }

  return data;
};
