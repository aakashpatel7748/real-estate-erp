import { describe, expect, it } from 'vitest';
import { allocateProportionally, applyBasisPoints, formatINR, formatINRCompact, priceForArea, rupeesToPaise, sqftToAreaX100 } from './money';

describe('money', () => {
  it('applies basis points with half-away-from-zero rounding', () => {
    expect(applyBasisPoints(10_000, 1_000)).toBe(1_000);
    expect(applyBasisPoints(1, 5_000)).toBe(1); // 0.5 -> 1
    expect(applyBasisPoints(-1, 5_000)).toBe(-1);
    expect(applyBasisPoints(333, 3_333)).toBe(111);
  });

  it('prices area exactly', () => {
    // 1200.50 sq ft at ₹2,500.00 per sq ft = ₹30,01,250.00
    expect(priceForArea(120_050, 250_000)).toBe(300_125_000);
  });

  it('allocates proportionally and sums exactly', () => {
    const parts = allocateProportionally(100, [1, 1, 1]);
    expect(parts).toEqual([34, 33, 33]);
    const big = allocateProportionally(987_654_321, [2_500, 2_500, 5_000]);
    expect(big.reduce((a, b) => a + b, 0)).toBe(987_654_321);
  });

  it('parses rupees without floating point errors', () => {
    expect(rupeesToPaise('1,25,000.5')).toBe(12_500_050);
    expect(rupeesToPaise('0.1')).toBe(10);
    expect(rupeesToPaise(19.99)).toBe(1_999);
    expect(() => rupeesToPaise('1.234')).toThrow();
  });

  it('formats in Indian grouping', () => {
    expect(formatINR(12_345_678)).toBe('₹1,23,456.78');
    expect(formatINR(-5_00)).toBe('-₹5.00');
    expect(formatINRCompact(2_50_00_000_00)).toBe('₹2.5 Cr');
    expect(formatINRCompact(45_20_000_00)).toBe('₹45.2 L');
  });

  it('parses areas', () => {
    expect(sqftToAreaX100('1200.5')).toBe(120_050);
    expect(sqftToAreaX100(900)).toBe(90_000);
  });
});
