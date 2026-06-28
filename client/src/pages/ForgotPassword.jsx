import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../utils/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const data = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      setSuccess(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      {/* Navbar / Header */}
      <header className="header" style={{ width: '100%' }}>
        <Link to="/" className="logo-section" style={{ textDecoration: 'none' }}>
          <div className="logo-icon">S</div>
          <span>Splitlet</span>
        </Link>
        <Link to="/" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '14px' }}>
          ← Back to Home
        </Link>
      </header>

      {/* Main Authentication Card */}
      <main className="auth-page" style={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px 0' }}>
        <div className="auth-card glass-panel">
          <div className="logo-section" style={{ justifyContent: 'center', marginBottom: '20px' }}>
            <div className="logo-icon">S</div>
            <span>Splitlet</span>
          </div>

          <h2 className="auth-title">Forgot Password</h2>
          <p className="auth-subtitle">
            Enter your email address and we'll send you a link to reset your password.
          </p>

          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          {!success ? (
            <form onSubmit={handleSubmit}>
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

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '10px' }}
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          ) : (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px' }}>
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>
                Check your inbox for the reset link.
              </p>
            </div>
          )}

          <p className="auth-toggle" style={{ marginTop: '24px' }}>
            Remember your password?{' '}
            <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
              Back to Login
            </Link>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--panel-border)', padding: '20px 0', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', flexWrap: 'wrap', gap: '10px' }}>
        <span>© 2026 Splitlet Corp. All rights reserved.</span>
        <div style={{ display: 'flex', gap: '16px' }}>
          <Link to="/about" style={{ color: 'inherit', textDecoration: 'none' }}>About Page</Link>
          <a href="https://github.com" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Source Code</a>
        </div>
      </footer>
    </div>
  );
}
