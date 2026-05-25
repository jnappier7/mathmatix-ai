/**
 * Tests for utils/timeHelpers — IANA timezone day keys + day-count math.
 * These underpin the streak day-boundary logic.
 */

const { localDayKey, daysBetween, daysBetweenDates } = require('../../utils/timeHelpers');

describe('localDayKey', () => {
    test('returns YYYY-MM-DD format', () => {
        const key = localDayKey(new Date('2026-05-25T12:00:00Z'), 'UTC');
        expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(key).toBe('2026-05-25');
    });

    test('11:30pm PT and 7:30am UTC next day are the same local PT day', () => {
        // 2026-05-25 23:30 PT = 2026-05-26 06:30 UTC
        const pt = new Date('2026-05-26T06:30:00Z');
        expect(localDayKey(pt, 'America/Los_Angeles')).toBe('2026-05-25');
    });

    test('9am PT and 11pm PT same day produce same key', () => {
        const morning = new Date('2026-05-25T16:00:00Z'); // 9am PT
        const night   = new Date('2026-05-26T06:00:00Z'); // 11pm PT (the prior local day)
        expect(localDayKey(morning, 'America/Los_Angeles'))
            .toBe(localDayKey(night, 'America/Los_Angeles'));
    });

    test('falls back to UTC for invalid timezone', () => {
        const d = new Date('2026-05-25T12:00:00Z');
        expect(localDayKey(d, 'Not/A_Zone')).toBe('2026-05-25');
    });

    test('handles invalid date input gracefully', () => {
        expect(localDayKey(new Date('not a date'), 'UTC')).toBe('');
    });
});

describe('daysBetween', () => {
    test('same day → 0', () => {
        expect(daysBetween('2026-05-25', '2026-05-25')).toBe(0);
    });

    test('next day → 1', () => {
        expect(daysBetween('2026-05-25', '2026-05-26')).toBe(1);
    });

    test('two days later → 2', () => {
        expect(daysBetween('2026-05-25', '2026-05-27')).toBe(2);
    });

    test('crosses month boundary', () => {
        expect(daysBetween('2026-05-31', '2026-06-01')).toBe(1);
    });

    test('crosses year boundary', () => {
        expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    });

    test('DST spring-forward day is still 1 (not 0.96)', () => {
        // US DST spring-forward 2026 = March 8
        expect(daysBetween('2026-03-07', '2026-03-08')).toBe(1);
        expect(daysBetween('2026-03-08', '2026-03-09')).toBe(1);
    });

    test('returns NaN on missing input', () => {
        expect(daysBetween(null, '2026-05-25')).toBeNaN();
        expect(daysBetween('2026-05-25', null)).toBeNaN();
    });
});

describe('daysBetweenDates — Date-level helper', () => {
    test('two PT sessions on consecutive local days = 1, even across UTC midnight', () => {
        // 11:30pm PT Mon 5/25 = 06:30 UTC Tue 5/26
        // 11:30pm PT Tue 5/26 = 06:30 UTC Wed 5/27
        const mondayLate = new Date('2026-05-26T06:30:00Z');
        const tuesdayLate = new Date('2026-05-27T06:30:00Z');
        expect(daysBetweenDates(mondayLate, tuesdayLate, 'America/Los_Angeles')).toBe(1);
    });

    test('same PT session sees 0-day diff', () => {
        const morning = new Date('2026-05-25T16:00:00Z');
        const evening = new Date('2026-05-26T03:00:00Z'); // 8pm PT same day
        expect(daysBetweenDates(morning, evening, 'America/Los_Angeles')).toBe(0);
    });
});
