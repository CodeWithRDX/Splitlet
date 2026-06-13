import React from 'react';
import { Link } from 'react-router-dom';

export default function About() {
  return (
    <div className="app-container" style={{ maxWidth: '800px', padding: '40px 24px' }}>
      {/* Header */}
      <header className="header" style={{ marginBottom: '40px' }}>
        <Link to="/" className="logo-section" style={{ textDecoration: 'none' }}>
          <div className="logo-icon">S</div>
          <span>Splitlet</span>
        </Link>
        <Link to="/" className="btn btn-secondary">
          ← Back to Home
        </Link>
      </header>

      {/* Main Content */}
      <main style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        
        {/* Intro */}
        <section className="glass-panel">
          <h2 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '16px' }}>Project Context</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '15px' }}>
            Splitlet is a simplified, high-fidelity reverse-engineered clone of <strong>Splitwise</strong> built as a 3-day full-stack internship project. 
            The goal of this assignment is to demonstrate domain mastery over debt ledgers, stateless authentication, real-time message broadcasting, and modern containerized DevOps.
          </p>
        </section>

        {/* Tech Stack Details */}
        <section className="glass-panel">
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '16px' }}>Technology Stack</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px', lineHeight: 1.5 }}>
            <div>
              <h4 style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>Frontend</h4>
              <p style={{ color: 'var(--text-secondary)' }}>
                React.js with Vite builder. Styled natively using a custom HSL-mesh Glassmorphism design system in Vanilla CSS.
              </p>
            </div>
            <div>
              <h4 style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>Backend API</h4>
              <p style={{ color: 'var(--text-secondary)' }}>
                Node.js and Express.js RESTful API, structured using secure JWT authentication middleware.
              </p>
            </div>
            <div>
              <h4 style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>Database</h4>
              <p style={{ color: 'var(--text-secondary)' }}>
                MySQL Relational Database. Enforces strict constraints and handles balance recalculations atomically using database transactions.
              </p>
            </div>
            <div>
              <h4 style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>WebSockets</h4>
              <p style={{ color: 'var(--text-secondary)' }}>
                Socket.io in-memory connection rooms grouped by expense ID to deliver real-time discussions.
              </p>
            </div>
            <div>
              <h4 style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>Email Notifications</h4>
              <p style={{ color: 'var(--text-secondary)' }}>
                Nodemailer SMTP mailer. Saves log records in MySQL to track send statuses and error traces.
              </p>
            </div>
            <div>
              <h4 style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>DevOps Orchestration</h4>
              <p style={{ color: 'var(--text-secondary)' }}>
                Multi-stage production Dockerfiles, orchestrated locally and for AWS EC2 instances via Docker Compose. CI/CD powered by GitHub Actions.
              </p>
            </div>
          </div>
        </section>

        {/* AI Collaboration */}
        <section className="glass-panel">
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '16px' }}>Human-AI Collaboration</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '15px' }}>
            This application was built in partnership with <strong>Antigravity</strong>, an agentic coding AI by Google DeepMind. 
            The collaboration represents a pair-programming workflow: the human engineer directs product scope, defines domain calculations, and selects database adapters, while the AI designs structural blueprints, writes schemas, writes unit tests, and compiles frontend modules inside Docker containers.
          </p>
        </section>

      </main>

      {/* Footer */}
      <footer style={{ marginTop: '48px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
        Splitlet Assignment · Built in June 2026
      </footer>
    </div>
  );
}
