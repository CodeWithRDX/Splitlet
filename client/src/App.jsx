import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { apiFetch, getUser, setUser, logout } from './utils/api';
import Landing from './pages/Landing';
import About from './pages/About';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GroupView from './pages/GroupView';
import ClaimAccount from './pages/ClaimAccount';
import OAuthSuccess from './pages/OAuthSuccess';
import ImportWizard from './pages/ImportWizard';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if token exists and verify with backend
    const token = localStorage.getItem('splitlet_token');
    const localUser = getUser();

    if (token && localUser) {
      setCurrentUser(localUser);
      // Verify token is still valid
      apiFetch('/api/auth/me')
        .then(data => {
          setCurrentUser(data.user);
          setUser(data.user);
        })
        .catch(err => {
          console.error('Session expired:', err);
          logout();
          setCurrentUser(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }}>Checking session...</div>;
  }

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route 
          path="/" 
          element={<Landing />} 
        />
        <Route 
          path="/about" 
          element={<About />} 
        />
        <Route 
          path="/oauth-success" 
          element={<OAuthSuccess onAuthSuccess={handleAuthSuccess} />} 
        />
        
        {/* Guest Only Routes (Redirects to dashboard if logged in) */}
        <Route 
          path="/login" 
          element={!currentUser ? <Login onAuthSuccess={handleAuthSuccess} /> : <Navigate to="/dashboard" />} 
        />
        <Route 
          path="/claim" 
          element={!currentUser ? <ClaimAccount onAuthSuccess={handleAuthSuccess} /> : <Navigate to="/dashboard" />} 
        />
        
        {/* Private Protected Routes */}
        <Route 
          path="/dashboard" 
          element={currentUser ? <Dashboard user={currentUser} onLogout={handleLogout} /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/group/:id" 
          element={currentUser ? <GroupView /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/group/:id/import" 
          element={currentUser ? <ImportWizard /> : <Navigate to="/login" />} 
        />
        
        {/* Wildcard Fallback */}
        <Route 
          path="*" 
          element={<Navigate to="/" />} 
        />
      </Routes>
    </Router>
  );
}
