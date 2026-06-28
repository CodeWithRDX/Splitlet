import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from './api';

// Currency context
const CurrencyContext = createContext();

export function formatCurrency(amount, currency = 'INR', locale = 'en-IN') {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(amount);
  } catch (e) {
    console.error('formatCurrency error:', e);
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function CurrencyProvider({ children, user }) {
  const [prefUser, setPrefUser] = useState(user);
  const [rates, setRates] = useState({
    INR: 1.0,
    USD: 0.012,
    EUR: 0.011,
    GBP: 0.0094,
    JPY: 1.91,
    CAD: 0.016,
    AUD: 0.018
  });

  // Sync with prop when auth updates
  useEffect(() => {
    setPrefUser(user);
  }, [user]);

  useEffect(() => {
    if (prefUser) {
      apiFetch('/api/balances/rates')
        .then(data => {
          if (data) {
            setRates(data);
          }
        })
        .catch(err => console.error('Failed to fetch exchange rates:', err));
    }
  }, [prefUser]);

  // Convert INR cents to target currency amount
  const convertCentsTo = (cents, targetCurrency = prefUser?.currency || 'INR') => {
    const amountInr = cents / 100;
    const rate = rates[targetCurrency] || 1.0;
    return amountInr * rate;
  };

  // Convert and format INR cents
  const formatInrCents = (cents, targetCurrency = prefUser?.currency || 'INR', locale = prefUser?.locale || 'en-IN') => {
    const converted = convertCentsTo(cents, targetCurrency);
    return formatCurrency(converted, targetCurrency, locale);
  };

  // Update Region & Currency settings immediately
  const updateSettings = async (settings) => {
    try {
      const data = await apiFetch('/api/auth/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      if (data && data.user) {
        setPrefUser(data.user);
        localStorage.setItem('splitlet_user', JSON.stringify(data.user));
        return data.user;
      }
    } catch (error) {
      console.error('Failed to save settings to database:', error);
      throw error;
    }
  };

  return (
    <CurrencyContext.Provider value={{ rates, prefUser, convertCentsTo, formatInrCents, formatCurrency, updateSettings }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
