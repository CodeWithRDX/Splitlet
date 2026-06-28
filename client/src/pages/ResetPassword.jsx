import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      return setError('Password must be at least 6 characters.');
    }

    if (password !== confirmPassword) {
      return setError('Passwords do not match.');
    }

    setLoading(true);

    try {
      const data = await apiFetch(`/api/auth/reset-password/${token}`, {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      setSuccess(data.message);
      // Redirect to login after 3 seconds
      setTimeout(() => navigate('/login'), 3000);
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

          <h2 className="auth-title">Reset Password</h2>
          <p className="auth-subtitle">Enter your new password below.</p>

          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          {!success ? (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '10px' }}
                disabled={loading}
              >
                {loading ? 'Resetting...' : 'Set New Password'}
              </button>
            </form>
          ) : (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px' }}>
                <path d="M20 6L9 17L4 12" />
              </svg>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>
                Redirecting to login page...
              </p>
            </div>
          )}

          <p className="auth-toggle" style={{ marginTop: '24px' }}>
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
