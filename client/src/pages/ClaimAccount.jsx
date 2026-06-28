import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, setToken, setUser } from '../utils/api';

export default function ClaimAccount({ onAuthSuccess }) {
  const navigate = useNavigate();
  const [token, setTokenParam] = useState('');
  const [invitedUser, setInvitedUser] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const tokenVal = query.get('token');
    
    if (!tokenVal) {
      setError('Invitation link is invalid or missing.');
      setLoading(false);
      return;
    }

    setTokenParam(tokenVal);

    // Decode invite token
    apiFetch(`/api/auth/invites/decode?token=${tokenVal}`)
      .then(data => {
        setInvitedUser(data.user);
        setName(data.user.name || '');
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const data = await apiFetch('/api/auth/invites/claim', {
        method: 'POST',
        body: JSON.stringify({
          token,
          name,
          password
        })
      });

      // Save credentials and login
      setToken(data.token);
      setUser(data.user);
      onAuthSuccess(data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }}>Loading invitation details...</div>;
  }

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

          <h2 className="auth-title">Claim Your Account</h2>
          <p className="auth-subtitle">
            Activate your profile to access your historical group ledger and settle expenses.
          </p>

          {error ? (
            <div className="alert alert-danger" style={{ marginBottom: 0 }}>
              {error}
              <button className="btn btn-secondary" style={{ marginTop: '16px', width: '100%' }} onClick={() => navigate('/login')}>
                Go to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={invitedUser?.email || ''}
                  disabled
                  style={{ opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Your Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Choose a Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={submitting}>
                {submitting ? 'Activating Profile...' : 'Claim Account'}
              </button>
            </form>
          )}
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
