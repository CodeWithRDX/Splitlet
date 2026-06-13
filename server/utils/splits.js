/**
 * Helper to calculate and validate splits for an expense.
 * All monetary amounts are handled as integers (cents).
 *
 * @param {number} totalAmountCents - The total expense amount in cents.
 * @param {string} splitType - 'equal', 'unequal', 'percentage', or 'shares'.
 * @param {Array} participants - Array of objects with user split configurations.
 *    - For 'equal': [{ userId }]
 *    - For 'unequal': [{ userId, amountCents }]
 *    - For 'percentage': [{ userId, percentage }] (percentages as numbers, e.g., 33.33)
 *    - For 'shares': [{ userId, shares }] (shares as numbers, e.g., 2)
 *
 * @returns {Array} Array of splits with calculated `amountOwedCents`, `percentage`, and `shares`.
 * @throws {Error} If validations fail (e.g., percentages do not sum to 100%, total splits don't match total amount).
 */
function calculateSplits(totalAmountCents, splitType, participants) {
  if (!participants || participants.length === 0) {
    throw new Error('At least one participant is required for the split.');
  }

  if (totalAmountCents <= 0) {
    throw new Error('Expense amount must be greater than zero.');
  }

  const result = [];
  let sumCents = 0;

  switch (splitType) {
    case 'equal': {
      const count = participants.length;
      const baseShare = Math.floor(totalAmountCents / count);
      const remainder = totalAmountCents % count;

      participants.forEach((p, index) => {
        // Allocate the remainder pennies to the first participant in the split list
        const owed = index === 0 ? baseShare + remainder : baseShare;
        result.push({
          userId: p.userId,
          amountOwedCents: owed,
          percentage: (owed / totalAmountCents) * 100,
          shares: 1
        });
        sumCents += owed;
      });
      break;
    }

    case 'unequal': {
      participants.forEach((p) => {
        const owed = parseInt(p.amountCents, 10);
        if (isNaN(owed) || owed < 0) {
          throw new Error('Unequal split amounts must be non-negative integers.');
        }
        result.push({
          userId: p.userId,
          amountOwedCents: owed,
          percentage: (owed / totalAmountCents) * 100,
          shares: null
        });
        sumCents += owed;
      });

      if (sumCents !== totalAmountCents) {
        throw new Error(`The sum of split amounts (${sumCents} cents) does not match the total expense amount (${totalAmountCents} cents).`);
      }
      break;
    }

    case 'percentage': {
      let sumPct = 0;
      participants.forEach((p) => {
        const pct = parseFloat(p.percentage);
        if (isNaN(pct) || pct < 0) {
          throw new Error('Percentage must be a non-negative number.');
        }
        sumPct += pct;
      });

      // Allow slight floating point tolerance for summing to 100% (e.g. 99.99 or 100.01 due to 33.33 x 3)
      if (Math.abs(sumPct - 100) > 0.05) {
        throw new Error(`Percentages must sum to 100%. Provided sum: ${sumPct}%`);
      }

      // Calculate shares based on percentages
      participants.forEach((p) => {
        const owed = Math.floor((p.percentage / 100) * totalAmountCents);
        result.push({
          userId: p.userId,
          amountOwedCents: owed,
          percentage: p.percentage,
          shares: null
        });
        sumCents += owed;
      });

      // Adjust for rounding remainders by giving them to the first participant
      const remainder = totalAmountCents - sumCents;
      if (remainder !== 0 && result.length > 0) {
        result[0].amountOwedCents += remainder;
        result[0].percentage = (result[0].amountOwedCents / totalAmountCents) * 100;
        sumCents += remainder;
      }
      break;
    }

    case 'shares': {
      let totalShares = 0;
      participants.forEach((p) => {
        const shares = parseFloat(p.shares);
        if (isNaN(shares) || shares < 0) {
          throw new Error('Shares must be a non-negative number.');
        }
        totalShares += shares;
      });

      if (totalShares <= 0) {
        throw new Error('Total shares must be greater than zero.');
      }

      participants.forEach((p) => {
        const owed = Math.floor((p.shares / totalShares) * totalAmountCents);
        result.push({
          userId: p.userId,
          amountOwedCents: owed,
          percentage: (p.shares / totalShares) * 100,
          shares: p.shares
        });
        sumCents += owed;
      });

      // Adjust for rounding remainders by giving them to the first participant
      const remainder = totalAmountCents - sumCents;
      if (remainder !== 0 && result.length > 0) {
        result[0].amountOwedCents += remainder;
        result[0].percentage = (result[0].amountOwedCents / totalAmountCents) * 100;
        sumCents += remainder;
      }
      break;
    }

    default:
      throw new Error(`Unsupported split type: ${splitType}`);
  }

  return result;
}

module.exports = { calculateSplits };
