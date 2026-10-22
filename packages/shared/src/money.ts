/**
 * Money helpers. All monetary values are integer paise (1 INR = 100 paise).
 * Percentages are integer basis points (100% = 10_000 bp).
 * Areas are integer hundredths of a square foot (1 sq ft = 100).
 *
 * Never use floating point for money. Multiplications that can exceed
 * Number.MAX_SAFE_INTEGER go through BigInt.
 */

export type Paise = number;

export function assertPaise(value: number, label = 'amount'): asserts value is Paise {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer number of paise`);
  }
}

/** Round half away from zero for a BigInt division. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return negative ? -rounded : rounded;
}

function toSafe(v: bigint, label: string): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new RangeError(`${label} overflow`);
  return n;
}

/** amount * bp / 10_000, rounded half away from zero. */
export function applyBasisPoints(amount: Paise, bp: number): Paise {
  assertPaise(amount);
  if (!Number.isInteger(bp)) throw new RangeError('basis points must be an integer');
  return toSafe(divRound(BigInt(amount) * BigInt(bp), 10_000n), 'applyBasisPoints');
}

/** Price for an area (hundredths of sq ft) at a rate (paise per sq ft). */
export function priceForArea(areaX100: number, ratePaisePerSqft: Paise): Paise {
  if (!Number.isSafeInteger(areaX100) || areaX100 < 0) throw new RangeError('area must be a non-negative integer');
  assertPaise(ratePaisePerSqft, 'rate');
  return toSafe(divRound(BigInt(areaX100) * BigInt(ratePaisePerSqft), 100n), 'priceForArea');
}

export function sumPaise(values: readonly Paise[]): Paise {
  let total = 0n;
  for (const v of values) {
    assertPaise(v);
    total += BigInt(v);
  }
  return toSafe(total, 'sum');
}

/**
 * Split `total` into parts proportional to `weights` so the parts sum exactly
 * to `total`. Uses the largest-remainder method; ties go to earlier parts.
 */
export function allocateProportionally(total: Paise, weights: readonly number[]): Paise[] {
  assertPaise(total);
  if (weights.length === 0) return [];
  const w = weights.map((x) => {
    if (!Number.isSafeInteger(x) || x < 0) throw new RangeError('weights must be non-negative integers');
    return BigInt(x);
  });
  const wSum = w.reduce((a, b) => a + b, 0n);
  if (wSum === 0n) throw new RangeError('weights must not all be zero');
  const t = BigInt(total);
  const base = w.map((x) => (t * x) / wSum);
  const rem = w.map((x, i) => ({ i, r: t * x - base[i]! * wSum }));
  let leftover = t - base.reduce((a, b) => a + b, 0n);
  rem.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i));
  for (let k = 0; leftover > 0n; k++, leftover--) base[rem[k % rem.length]!.i]! += 1n;
  return base.map((x) => toSafe(x, 'allocate'));
}

/** Parse a user-entered rupee string ("1,25,000.50") into paise without floats. */
export function rupeesToPaise(input: string | number): Paise {
  const s = String(input)
    .replace(/[,\s₹]/g, '')
    .trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new RangeError(`Invalid rupee amount: ${input}`);
  const negative = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const paise = BigInt(whole!) * 100n + BigInt((frac + '00').slice(0, 2));
  return toSafe(negative ? -paise : paise, 'rupeesToPaise');
}

/** Format paise as Indian-grouped rupees, e.g. 12345678 -> "₹1,23,456.78". */
export function formatINR(paise: Paise, opts: { symbol?: boolean; decimals?: boolean } = {}): string {
  const { symbol = true, decimals = true } = opts;
  const negative = paise < 0;
  const abs = BigInt(Math.abs(paise));
  const whole = (abs / 100n).toString();
  const frac = (abs % 100n).toString().padStart(2, '0');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${grouped}${decimals ? '.' + frac : ''}`;
}

/** Compact Indian notation for KPI cards: ₹1.25 Cr, ₹45.2 L, ₹9,500. */
export function formatINRCompact(paise: Paise): string {
  const rupees = Math.round(paise / 100);
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2).replace(/\.?0+$/, '')} L`;
  return formatINR(paise, { decimals: false });
}

export function areaToSqft(areaX100: number): string {
  const whole = Math.trunc(areaX100 / 100);
  const frac = Math.abs(areaX100 % 100);
  return frac ? `${whole}.${String(frac).padStart(2, '0')}` : String(whole);
}

export function sqftToAreaX100(input: string | number): number {
  const s = String(input).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new RangeError(`Invalid area: ${input}`);
  const [w, f = ''] = s.split('.');
  return Number(w) * 100 + Number((f + '00').slice(0, 2));
}
