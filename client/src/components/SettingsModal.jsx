import React, { useState, useEffect } from 'react';
import { useCurrency } from '../utils/currency';

const currencyDetails = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
  JPY: { symbol: '¥', locale: 'ja-JP' },
  CAD: { symbol: '$', locale: 'en-CA' },
  AUD: { symbol: '$', locale: 'en-AU' }
};

const countriesList = [
  'India',
  'United States',
  'Canada',
  'Germany',
  'Japan',
  'United Kingdom',
  'Australia',
  'France',
  'Italy',
  'Spain'
];

export default function SettingsModal({ isOpen, onClose, onUpdateSuccess }) {
  const { prefUser, updateSettings } = useCurrency();
  const [country, setCountry] = useState(prefUser?.country || 'India');
  const [currency, setCurrency] = useState(prefUser?.currency || 'INR');
  const [emailNotifications, setEmailNotifications] = useState(prefUser?.emailNotificationsEnabled !== false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Sync state with active user settings on open
  useEffect(() => {
    if (isOpen && prefUser) {
      setCountry(prefUser.country || 'India');
      setCurrency(prefUser.currency || 'INR');
      setEmailNotifications(prefUser.emailNotificationsEnabled !== false);
      setError('');
      setSuccess('');
    }
  }, [isOpen, prefUser]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const details = currencyDetails[currency] || { symbol: '₹', locale: 'en-IN' };

    try {
      const updatedUser = await updateSettings({
        country,
        currency,
        currencySymbol: details.symbol,
        locale: details.locale,
        emailNotificationsEnabled: emailNotifications
      });
      setSuccess('Settings updated successfully.');
      if (onUpdateSuccess) {
        onUpdateSuccess(updatedUser);
      }
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal-content glass-panel" style={{ maxWidth: '440px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600 }}>Region & Currency Settings</h3>
          <button 
            onClick={onClose} 
            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Country</label>
            <select
              className="form-input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
            >
              {countriesList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Preferred Currency</label>
            <select
              className="form-input"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              required
            >
              {Object.keys(currencyDetails).map((cur) => (
                <option key={cur} value={cur}>{cur} ({currencyDetails[cur].symbol})</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', marginBottom: '8px' }}>
            <input
              type="checkbox"
              id="settingsEmailNotifications"
              checked={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="settingsEmailNotifications" style={{ fontSize: '13px', color: 'white', cursor: 'pointer', userSelect: 'none' }}>
              Receive email updates (invites, bills, payments)
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '28px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
