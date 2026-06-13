import React, { useState } from 'react';
import { apiFetch, setToken, setUser } from '../utils/api';

const API_URL = import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5001' : '');

export default function Login({ onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const payload = isRegister ? { name, email, password } : { email, password };

    try {
      const data = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      setToken(data.token);
      setUser(data.user);
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // Redirect browser to backend Google OAuth login route
    window.location.href = `${API_URL}/api/auth/oauth/google`;
  };

  return (
    <div className="auth-page">
      <div className="auth-card glass-panel">
        <div className="logo-section" style={{ justifyContent: 'center', marginBottom: '20px' }}>
          <div className="logo-icon">S</div>
          <span>Splitlet</span>
        </div>
        
        <h2 className="auth-title">{isRegister ? 'Create Account' : 'Welcome Back'}</h2>
        <p className="auth-subtitle">
          {isRegister ? 'Sign up to start splitting expenses' : 'Sign in to access your ledger'}
        </p>

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
            {loading ? 'Processing...' : isRegister ? 'Register' : 'Log In'}
          </button>
        </form>

        {/* Separator */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', gap: '10px', color: 'var(--text-muted)', fontSize: '13px' }}>
          <div style={{ flexGrow: 1, height: '1px', background: 'var(--panel-border)' }}></div>
          <span>OR</span>
          <div style={{ flexGrow: 1, height: '1px', background: 'var(--panel-border)' }}></div>
        </div>

        {/* Google OAuth Login Button */}
        <button 
          type="button" 
          className="btn btn-secondary" 
          onClick={handleGoogleLogin} 
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#ffffff', color: '#1f2937' }}
        >
          {/* Simple Google SVG Icon */}
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.79 2.7v2.24h2.9c1.69-1.55 2.69-3.85 2.69-6.57z" fill="#4285F4" />
            <path d="M9 18c2.43 0 4.47-.8 5.96-2.23l-2.91-2.24c-.8.54-1.84.87-3.05.87-2.34 0-4.33-1.58-5.03-3.71H.95v2.3C2.43 15.89 5.5 18 9 18z" fill="#34A853" />
            <path d="M3.97 10.69c-.18-.54-.28-1.12-.28-1.69s.1-1.15.28-1.69V5.01H.95C.35 6.2.01 7.56.01 9s.34 2.8.94 3.99l3.02-2.3z" fill="#FBBC05" />
            <path d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.09C13.46.66 11.43 0 9 0 5.5 0 2.43 2.11.95 5.01l3.02 2.3c.7-2.13 2.69-3.71 5.03-3.71z" fill="#EA4335" />
          </svg>
          Sign in with Google
        </button>

        <p className="auth-toggle" style={{ marginTop: '24px' }}>
          {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          <span onClick={() => { setIsRegister(!isRegister); setError(''); }}>
            {isRegister ? 'Log In' : 'Sign Up'}
          </span>
        </p>
      </div>
    </div>
  );
}
