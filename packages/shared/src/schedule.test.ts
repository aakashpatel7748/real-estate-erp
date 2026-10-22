import { describe, expect, it } from 'vitest';
import { generateSchedule, ScheduleError } from './schedule';
import { addMonths, financialYear } from './dates';

describe('generateSchedule', () => {
  it('splits percentages that total 100% exactly', () => {
    const s = generateSchedule(
      [
        { type: 'percent', name: 'Booking', valueBp: 1_000, due: { kind: 'on_booking' } },
        { type: 'percent', name: 'Agreement', valueBp: 3_000, due: { kind: 'days_after_booking', days: 30 } },
        { type: 'percent', name: 'Registry', valueBp: 6_000, due: { kind: 'months_after_booking', months: 6 } },
      ],
      1_000_001,
      '2026-01-31',
    );
    expect(s.map((x) => x.amountPaise)).toEqual([100_000, 300_000, 600_001]);
    expect(s.reduce((a, b) => a + b.amountPaise, 0)).toBe(1_000_001);
    expect(s.map((x) => x.dueDate)).toEqual(['2026-01-31', '2026-03-02', '2026-07-31']);
  });

  it('uses a balance rule and repeats EMIs', () => {
    const s = generateSchedule(
      [
        { type: 'fixed', name: 'Token', amountPaise: 5_100_000, due: { kind: 'on_booking' } },
        { type: 'balance', name: 'EMI', due: { kind: 'months_after_booking', months: 1 }, repeat: { count: 3, everyMonths: 1 } },
      ],
      35_100_001,
      '2026-04-15',
    );
    expect(s).toHaveLength(4);
    expect(s[0]).toMatchObject({ name: 'Token', amountPaise: 5_100_000 });
    expect(s.slice(1).map((x) => x.amountPaise)).toEqual([10_000_001, 10_000_000, 10_000_000]);
    expect(s.slice(1).map((x) => x.dueDate)).toEqual(['2026-05-15', '2026-06-15', '2026-07-15']);
  });

  it('rejects invalid plans', () => {
    expect(() =>
      generateSchedule([{ type: 'percent', name: 'A', valueBp: 5_000, due: { kind: 'on_booking' } }], 100, '2026-01-01'),
    ).toThrow(ScheduleError);
    expect(() =>
      generateSchedule(
        [
          { type: 'fixed', name: 'A', amountPaise: 500, due: { kind: 'on_booking' } },
          { type: 'balance', name: 'B', due: { kind: 'on_booking' } },
        ],
        100,
        '2026-01-01',
      ),
    ).toThrow(/exceed/);
  });
});

describe('dates', () => {
  it('clamps month ends and computes Indian FY', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(financialYear('2026-03-31')).toBe('2025-26');
    expect(financialYear('2026-04-01')).toBe('2026-27');
  });
});
