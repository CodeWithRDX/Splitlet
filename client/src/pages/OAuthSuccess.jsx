import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken, apiFetch, setUser } from '../utils/api';

export default function OAuthSuccess({ onAuthSuccess }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const token = query.get('token');

    if (token) {
      setToken(token);
      
      // Fetch authenticated user details to confirm and sync state
      apiFetch('/api/auth/me')
        .then(data => {
          setUser(data.user);
          onAuthSuccess(data.user);
          navigate('/');
        })
        .catch(err => {
          console.error('OAuth token verification failed:', err);
          setError('Failed to log in. Please try again.');
        });
    } else {
      setError('OAuth login failed: Token not found.');
    }
  }, [navigate, onAuthSuccess]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '22px', marginBottom: '16px' }}>Authenticating...</h2>
        {error ? (
          <div className="alert alert-danger" style={{ marginBottom: 0 }}>
            {error}
            <button className="btn btn-secondary" style={{ marginTop: '16px', width: '100%' }} onClick={() => navigate('/login')}>
              Back to Login
            </button>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>Completing your Google Sign-in, please wait...</p>
        )}
      </div>
    </div>
  );
}
