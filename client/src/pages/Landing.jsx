import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getUser } from '../utils/api';

export default function Landing() {
  const navigate = useNavigate();
  const currentUser = getUser();

  return (
    <div className="app-container" style={{ minHeight: '90vh', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      {/* Header */}
      <header className="header" style={{ width: '100%' }}>
        <Link to="/" className="logo-section" style={{ textDecoration: 'none' }}>
          <div className="logo-icon">S</div>
          <span>Splitlet</span>
        </Link>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Link to="/about" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '14px' }}>
            About Project
          </Link>
          {currentUser ? (
            <Link to="/dashboard" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '14px' }}>
              Dashboard
            </Link>
          ) : (
            <Link to="/login" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '14px' }}>
              Log In
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '60px 20px' }}>
        <h1 style={{ 
          fontSize: 'clamp(32px, 5vw, 64px)', 
          fontWeight: 800, 
          lineHeight: 1.15, 
          marginBottom: '18px',
          background: 'linear-gradient(to right, #ffffff, #a7f3d0, #34d399)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Splitting Bills,<br />Simplified.
        </h1>
        <p style={{ 
          fontSize: 'clamp(15px, 2.5vw, 18px)', 
          color: 'var(--text-secondary)', 
          maxWidth: '620px', 
          lineHeight: 1.6, 
          marginBottom: '36px' 
        }}>
          Keep track of shared expenses, roommate bills, and group trips. Replicate the core ledger calculations of Splitwise, backed by real-time comments, secure invites, and instant Google authentication.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {currentUser ? (
            <button className="btn btn-primary" onClick={() => navigate('/dashboard')} style={{ padding: '14px 32px', fontSize: '16px' }}>
              Go to Dashboard →
            </button>
          ) : (
            <>
              <button className="btn btn-primary" onClick={() => navigate('/login')} style={{ padding: '14px 32px', fontSize: '16px' }}>
                Get Started
              </button>
              <button className="btn btn-secondary" onClick={() => navigate('/about')} style={{ padding: '14px 32px', fontSize: '16px' }}>
                Learn More
              </button>
            </>
          )}
        </div>
      </main>

      {/* Feature Overview Grid */}
      <section style={{ margin: '40px 0' }}>
        <h2 style={{ textAlign: 'center', fontSize: '24px', fontWeight: 700, marginBottom: '32px' }}>Core Application Modules</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              🔑
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Login & OAuth</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
              Register securely with credentials or log in instantly using Google OAuth. Authenticated sessions are fully stateless.
            </p>
          </div>

          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              👥
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Group Management</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
              Create custom groups and invite peers. Non-registered invitees get placeholder accounts with secure JWT activation links.
            </p>
          </div>

          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              📊
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Splitting Engine</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
              Split costs equally, unequally, by percentages, or shares. Automated rounding adjusts the remainder to keep the ledger exact.
            </p>
          </div>

          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--primary)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              💬
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Real-Time Chat</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
              Discuss specific transaction breakdowns in real-time inside expense rooms, synced instantly via Socket.io.
            </p>
          </div>

        </div>
      </section>

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
