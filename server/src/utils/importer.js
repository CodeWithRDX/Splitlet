const db = require('../db');

/**
 * Character-by-character CSV line parser that handles quotes and commas correctly.
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Standardizes date strings into YYYY-MM-DD.
 * Returns { date: string, isAmbiguous: boolean, error: string }
 */
function parseAndStandardizeDate(dateStr) {
  if (!dateStr) return { date: null, isAmbiguous: false, error: 'Empty date' };
  
  const clean = dateStr.trim();
  
  // 1. Check YYYY-MM-DD
  const yyyymmdd = /^\d{4}-\d{2}-\d{2}$/;
  if (yyyymmdd.test(clean)) {
    return { date: clean, isAmbiguous: false, error: null };
  }
  
  // 2. Check DD/MM/YYYY or MM/DD/YYYY
  const slashDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = clean.match(slashDate);
  if (match) {
    const p1 = parseInt(match[1], 10);
    const p2 = parseInt(match[2], 10);
    const year = match[3];
    
    // In our CSV, March rent is "01/03/2026", which implies DD/MM/YYYY format.
    // If both day and month are <= 12 (e.g. 04/05/2026), it is ambiguous.
    const isAmbiguous = (p1 <= 12 && p2 <= 12);
    
    // Assuming DD/MM/YYYY: p1 is day, p2 is month
    const month = p2.toString().padStart(2, '0');
    const day = p1.toString().padStart(2, '0');
    return { date: `${year}-${month}-${day}`, isAmbiguous, error: null };
  }
  
  // 3. Check Text Dates e.g., "Mar 14"
  const textDate = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})$/i;
  const matchText = clean.match(textDate);
  if (matchText) {
    const monthStr = matchText[1].toLowerCase();
    const day = matchText[2].padStart(2, '0');
    const months = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const month = months[monthStr];
    // Default to year 2026 based on CSV context
    return { date: `2026-${month}-${day}`, isAmbiguous: false, error: null };
  }
  
  return { date: null, isAmbiguous: false, error: 'Unrecognized date format' };
}

/**
 * Standard user names in the system and their matching emails.
 */
const SYSTEM_USERS = {
  aisha: { name: 'Aisha', email: 'aisha@splitlet.com' },
  rohan: { name: 'Rohan', email: 'rohan@splitlet.com' },
  priya: { name: 'Priya', email: 'priya@splitlet.com' },
  meera: { name: 'Meera', email: 'meera@splitlet.com' },
  sam: { name: 'Sam', email: 'sam@splitlet.com' },
  dev: { name: 'Dev', email: 'dev@splitlet.com' }
};

/**
 * Maps input name to standard system user email.
 * Handles casing, trailing spaces, and common aliases.
 */
function resolveSystemUser(name) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();
  
  if (SYSTEM_USERS[clean]) {
    return SYSTEM_USERS[clean];
  }
  
  // Spelling variants
  if (clean === 'priya s') return SYSTEM_USERS.priya;
  
  return null; // Requires user mapping input
}

/**
 * Parse and detect anomalies in the parsed CSV rows.
 *
 * @param {Array} rows - Array of arrays (each representing a parsed row of strings).
 * @param {number} exchangeRate - Rate to convert USD to INR (e.g. 83.00).
 * @returns {Promise<Object>} Ingestion analysis with logs and anomalies.
 */
async function analyzeCSVInbound(rows, exchangeRate) {
  const anomalies = [];
  const validRowsParsed = [];
  
  // Hardcoded active membership windows based on Sam/Meera requirements:
  // - Meera left group on 2026-03-29.
  // - Sam joined group on 2026-04-08.
  const memberships = {
    meera: { joined: '2026-02-01', left: '2026-03-29' },
    sam: { joined: '2026-04-08', left: null }
  };

  // Skip header if first column is "date"
  let startIndex = 0;
  if (rows[0] && rows[0][0].trim().toLowerCase() === 'date') {
    startIndex = 1;
  }

  // Tracking past rows to check for duplicates
  // Hash format: date_amount_payer_descriptionShort
  const loggedHashes = {};

  for (let idx = startIndex; idx < rows.length; idx++) {
    const rawCols = rows[idx];
    if (rawCols.length < 5 || (rawCols.length === 1 && rawCols[0] === '')) {
      continue; // Skip empty rows
    }

    const rowNum = idx + 1;
    const rawDate = rawCols[0] || '';
    const rawDesc = rawCols[1] || '';
    const rawPayer = rawCols[2] || '';
    let rawAmount = rawCols[3] || '';
    let rawCurrency = rawCols[4] || '';
    let rawSplitType = rawCols[5] || '';
    const rawSplitWith = rawCols[6] || '';
    const rawSplitDetails = rawCols[7] || '';
    const rawNotes = rawCols[8] || '';

    let isAnomaly = false;

    // 1. Validate Date
    const dateParse = parseAndStandardizeDate(rawDate);
    let date = dateParse.date;
    if (dateParse.error) {
      anomalies.push({
        rowNumber: rowNum,
        fieldName: 'date',
        rawValue: rawDate,
        anomalyType: 'MALFORMED_DATE',
        proposedFix: 'Set standard date (YYYY-MM-DD)'
      });
      isAnomaly = true;
    } else if (dateParse.isAmbiguous) {
      anomalies.push({
        rowNumber: rowNum,
        fieldName: 'date',
        rawValue: rawDate,
        anomalyType: 'AMBIGUOUS_DATE',
        proposedFix: `Standardize DD/MM/YYYY to: ${date}`
      });
      isAnomaly = true;
    } else if (dateParse.date !== rawDate.trim()) {
      anomalies.push({
        rowNumber: rowNum,
        fieldName: 'date',
        rawValue: rawDate,
        anomalyType: 'DATE_FORMAT_INCONSISTENCY',
        proposedFix: `Format date to: ${date}`
      });
      isAnomaly = true;
    }

    // 2. Validate Payer Name
    let payerUser = resolveSystemUser(rawPayer);
    if (!rawPayer.trim()) {
      anomalies.push({
        rowNumber: rowNum,
        fieldName: 'paid_by',
        rawValue: '',
        anomalyType: 'MISSING_PAYER',
        proposedFix: 'Manually select the payer'
      });
      isAnomaly = true;
    } else if (!payerUser) {
      anomalies.push({
        rowNumber: rowNum,
        fieldName: 'paid_by',
        rawValue: rawPayer,
        anomalyType: 'NAME_VARIANCE',
        proposedFix: `Map alias "${rawPayer}" to system user`
      });
      isAnomaly = true;
    } else if (payerUser.name !== rawPayer) {
      anomalies.push({
        rowNumber: rowNum,
        fieldName: 'paid_by',
        rawValue: rawPayer,
        anomalyType: 'CASE_WHITESPACE_VARIANCE',
        proposedFix: `Clean and map to standard user: ${payerUser.name}`
      });
      isAnomaly = true;
    }

    // 3. Validate Amount Cents
    let amountCents = null;
    let cleanAmountStr = rawAmount.replace(/"/g, '').replace(/,/g, '').trim();
    let isNegative = false;

    if (!cleanAmountStr) {
      anomalies.push({
        rowNumber: rowNum,
        fieldName: 'amount',
        rawValue: rawAmount,
        anomalyType: 'MISSING_AMOUNT',
        proposedFix: 'Manually input the cost'
      });
      isAnomaly = true;
    } else {
      const amtFloat = parseFloat(cleanAmountStr);
      if (isNaN(amtFloat)) {
        anomalies.push({
          rowNumber: rowNum,
          fieldName: 'amount',
          rawValue: rawAmount,
          anomalyType: 'MALFORMED_AMOUNT',
          proposedFix: 'Enter numeric value'
        });
        isAnomaly = true;
      } else if (amtFloat === 0) {
        anomalies.push({
          rowNumber: rowNum,
          fieldName: 'amount',
          rawValue: rawAmount,
          anomalyType: 'ZERO_AMOUNT',
          proposedFix: 'Enter a positive value or delete row'
        });
        isAnomaly = true;
      } else {
        isNegative = amtFloat < 0;
        const decimals = cleanAmountStr.split('.')[1];
        if (decimals && decimals.length > 2) {
          // Fractional Cents
          amountCents = Math.round(amtFloat * 100);
          anomalies.push({
            rowNumber: rowNum,
            fieldName: 'amount',
            rawValue: rawAmount,
            anomalyType: 'FRACTIONAL_CENTS',
            proposedFix: `Round amount to: $${(amountCents / 100).toFixed(2)}`
          });
          isAnomaly = true;
        } else {
          amountCents = Math.round(amtFloat * 100);
        }
      }
    }

    // Check for negative refund inversion
    if (isNegative) {
      amountCents = Math.abs(amountCents);
      anomalies.push({
        rowNumber: rowNum,
        fieldName: 'amount',
        rawValue: rawAmount,
        anomalyType: 'NEGATIVE_REFUND',
        proposedFix: 'Invert payer and splits: log refund as positive debt paid to receiver'
      });
      isAnomaly = true;
    }

    // 4. Validate Currency
    if (!rawCurrency.trim()) {
      rawCurrency = 'INR';
      anomalies.push({
        rowNumber: rowNum,
        fieldName: 'currency',
        rawValue: '',
        anomalyType: 'MISSING_CURRENCY',
        proposedFix: 'Default currency to INR'
      });
      isAnomaly = true;
    } else if (rawCurrency.toUpperCase() === 'USD') {
      anomalies.push({
        rowNumber: rowNum,
        fieldName: 'currency',
        rawValue: 'USD',
        anomalyType: 'USD_CONVERSION',
        proposedFix: `Convert USD using input exchange rate (1 USD = ${exchangeRate} INR)`
      });
      isAnomaly = true;
    }

    // 5. Settlement check (logged as expense)
    let isSettlement = false;
    if (!rawSplitType.trim() && rawSplitWith.trim() && rawDesc.toLowerCase().includes('paid')) {
      isSettlement = true;
      rawSplitType = 'equal';
      anomalies.push({
        rowNumber: rowNum,
        fieldName: 'split_type',
        rawValue: '',
        anomalyType: 'SETTLEMENT_LOGGED_AS_EXPENSE',
        proposedFix: 'Import row as a debt payment (Settlement) instead of an Expense'
      });
      isAnomaly = true;
    }

    // 6. Split Math and Configuration
    const splitUsers = rawSplitWith.split(';').map(u => u.trim()).filter(Boolean);
    
    // Check for time-sensitive membership windows
    if (date) {
      splitUsers.forEach(username => {
        const u = username.toLowerCase();
        if (memberships[u]) {
          const userJoined = new Date(memberships[u].joined);
          const userLeft = memberships[u].left ? new Date(memberships[u].left) : null;
          const expDate = new Date(date);
          
          if (expDate < userJoined || (userLeft && expDate > userLeft)) {
            anomalies.push({
              rowNumber: rowNum,
              fieldName: 'split_with',
              rawValue: username,
              anomalyType: 'MEMBERSHIP_TIME_VIOLATION',
              proposedFix: `Reject split: ${username} was not an active member on ${date}`
            });
            isAnomaly = true;
          }
        }
      });
    }

    // Check percentage split mathematical sum
    if (rawSplitType.trim().toLowerCase() === 'percentage' && rawSplitDetails.trim()) {
      const details = rawSplitDetails.split(';').map(d => d.trim());
      let sumPct = 0;
      details.forEach(d => {
        const matchPct = d.match(/(\d+(?:\.\d+)?)\s*%/);
        if (matchPct) {
          sumPct += parseFloat(matchPct[1]);
        }
      });
      if (Math.abs(sumPct - 100) > 0.05) {
        anomalies.push({
          rowNumber: rowNum,
          fieldName: 'split_details',
          rawValue: rawSplitDetails,
          anomalyType: 'PERCENTAGE_SUM_ERROR',
          proposedFix: `Split percentages sum to ${sumPct}%. Re-scale percentages to sum to 100%`
        });
        isAnomaly = true;
      }
    }

    // Check logic mismatch: split type equal but detail configuration provided
    if (rawSplitType.trim().toLowerCase() === 'equal' && rawSplitDetails.trim()) {
      anomalies.push({
        rowNumber: rowNum,
        fieldName: 'split_details',
        rawValue: rawSplitDetails,
        anomalyType: 'SPLIT_LOGIC_MISMATCH',
        proposedFix: 'Ignores details block and split equally, or convert to unequal/shares'
      });
      isAnomaly = true;
    }

    // 7. Duplicate Checks
    if (date && amountCents && payerUser) {
      const descClean = rawDesc.trim().toLowerCase().substring(0, 8); // match first 8 chars e.g. "dinner"
      const hash = `${date}_${amountCents}_${payerUser.email}_${descClean}`;
      
      if (loggedHashes[hash]) {
        anomalies.push({
          rowNumber: rowNum,
          fieldName: 'row',
          rawValue: rawDesc,
          anomalyType: 'DUPLICATE_ROW',
          proposedFix: `Duplicate: Same payer, cost, date, and item. proposed: Skip duplicate.`
        });
        isAnomaly = true;
      } else {
        loggedHashes[hash] = rowNum;
      }
    }

    // Store parsed row representation
    validRowsParsed.push({
      rowNumber: rowNum,
      date,
      description: rawDesc,
      paidBy: payerUser ? payerUser.name : rawPayer,
      paidByEmail: payerUser ? payerUser.email : null,
      amountCentsOriginal: amountCents,
      currency: rawCurrency.toUpperCase(),
      splitType: rawSplitType.toLowerCase(),
      splitWith: splitUsers,
      splitDetails: rawSplitDetails,
      notes: rawNotes,
      isSettlement,
      isNegative,
      isAnomaly
    });
  }

  return {
    anomalies,
    parsedRows: validRowsParsed
  };
}

module.exports = {
  parseCSVLine,
  analyzeCSVInbound
};
