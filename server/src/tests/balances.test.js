const { calculateSplits } = require('../utils/splits');

describe('Expense Split Engine - Calculations & Rounding', () => {
  test('Equal Split rounding: $10.00 split 3 ways', () => {
    const totalAmount = 1000; // $10.00
    const participants = [{ userId: 1 }, { userId: 2 }, { userId: 3 }];
    
    const splits = calculateSplits(totalAmount, 'equal', participants);
    
    expect(splits).toHaveLength(3);
    // Leftover penny (1000 % 3 = 1) should be allocated to the first participant
    expect(splits[0].amountOwedCents).toBe(334);
    expect(splits[1].amountOwedCents).toBe(333);
    expect(splits[2].amountOwedCents).toBe(333);

    const totalCalculated = splits.reduce((sum, s) => sum + s.amountOwedCents, 0);
    expect(totalCalculated).toBe(totalAmount);
  });

  test('Equal Split even: $12.00 split 3 ways', () => {
    const totalAmount = 1200; // $12.00
    const participants = [{ userId: 1 }, { userId: 2 }, { userId: 3 }];
    
    const splits = calculateSplits(totalAmount, 'equal', participants);
    
    expect(splits).toHaveLength(3);
    expect(splits[0].amountOwedCents).toBe(400);
    expect(splits[1].amountOwedCents).toBe(400);
    expect(splits[2].amountOwedCents).toBe(400);
  });

  test('Unequal Split: exact validation matches total', () => {
    const totalAmount = 1500; // $15.00
    const participants = [
      { userId: 1, amountCents: 500 },
      { userId: 2, amountCents: 1000 }
    ];

    const splits = calculateSplits(totalAmount, 'unequal', participants);
    expect(splits).toHaveLength(2);
    expect(splits[0].amountOwedCents).toBe(500);
    expect(splits[1].amountOwedCents).toBe(1000);
  });

  test('Unequal Split error: sum does not match total', () => {
    const totalAmount = 1500;
    const participants = [
      { userId: 1, amountCents: 500 },
      { userId: 2, amountCents: 900 } // Sum = 1400 != 1500
    ];

    expect(() => {
      calculateSplits(totalAmount, 'unequal', participants);
    }).toThrow();
  });

  test('Percentage Split rounding: $10.00 split 33.33%, 33.33%, 33.34%', () => {
    const totalAmount = 1000;
    const participants = [
      { userId: 1, percentage: 33.33 },
      { userId: 2, percentage: 33.33 },
      { userId: 3, percentage: 33.34 }
    ];

    const splits = calculateSplits(totalAmount, 'percentage', participants);
    expect(splits).toHaveLength(3);
    
    // Initial math:
    // P1: floor(0.3333 * 1000) = 333
    // P2: floor(0.3333 * 1000) = 333
    // P3: floor(0.3334 * 1000) = 333
    // Sum = 999. Remainder = 1.
    // Remainder 1 added to first participant => P1 = 334.
    expect(splits[0].amountOwedCents).toBe(334);
    expect(splits[1].amountOwedCents).toBe(333);
    expect(splits[2].amountOwedCents).toBe(333);

    const totalCalculated = splits.reduce((sum, s) => sum + s.amountOwedCents, 0);
    expect(totalCalculated).toBe(totalAmount);
  });

  test('Percentage Split error: sum not 100%', () => {
    const totalAmount = 1000;
    const participants = [
      { userId: 1, percentage: 50 },
      { userId: 2, percentage: 40 } // Sum = 90% != 100%
    ];

    expect(() => {
      calculateSplits(totalAmount, 'percentage', participants);
    }).toThrow();
  });

  test('Shares Split: $10.00 split 1 share, 2 shares', () => {
    const totalAmount = 1000;
    const participants = [
      { userId: 1, shares: 1 },
      { userId: 2, shares: 2 }
    ];

    const splits = calculateSplits(totalAmount, 'shares', participants);
    expect(splits).toHaveLength(2);
    
    // Total shares = 3
    // P1: floor(1/3 * 1000) = 333
    // P2: floor(2/3 * 1000) = 666
    // Sum = 999. Remainder = 1 added to first participant => P1 = 334
    expect(splits[0].amountOwedCents).toBe(334);
    expect(splits[1].amountOwedCents).toBe(666);

    const totalCalculated = splits.reduce((sum, s) => sum + s.amountOwedCents, 0);
    expect(totalCalculated).toBe(totalAmount);
  });
});
