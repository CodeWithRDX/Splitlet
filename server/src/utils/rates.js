let cachedRates = {
  INR: 1.0,
  USD: 0.012,
  EUR: 0.011,
  GBP: 0.0094,
  JPY: 1.91,
  CAD: 0.016,
  AUD: 0.018
};
let lastFetchTime = 0;

async function getExchangeRates() {
  const now = Date.now();
  // Cache for 1 hour to avoid hitting limits
  if (now - lastFetchTime < 3600000) {
    return cachedRates;
  }

  try {
    // open.er-api.com is free, requires no key, and returns latest rates
    const res = await fetch('https://open.er-api.com/v6/latest/INR');
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates) {
        cachedRates = {
          ...cachedRates,
          ...data.rates
        };
        lastFetchTime = now;
        console.log('Exchange rates updated from live API:', cachedRates);
      }
    } else {
      console.warn('Exchange rates API returned non-OK status. Using cached rates.');
    }
  } catch (error) {
    console.error('Error fetching live exchange rates, using cached rates:', error.message);
  }

  return cachedRates;
}

module.exports = {
  getExchangeRates
};
