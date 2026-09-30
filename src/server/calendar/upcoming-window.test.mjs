import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const { upcomingCalendarWindow } = await createJiti(import.meta.url).import('./upcoming-window.ts');
test('Toronto day and 14-day horizon exclude stale May bookings', () => {
  assert.deepEqual(upcomingCalendarWindow(new Date('2026-09-29T16:00:00Z')), {fromDateISO:'2026-09-29',toDateISO:'2026-10-13'});
  assert.equal(upcomingCalendarWindow(new Date('2026-09-30T01:00:00Z')).fromDateISO, '2026-09-29');
  assert.deepEqual(upcomingCalendarWindow(new Date('2026-10-31T16:00:00Z')), {fromDateISO:'2026-10-31',toDateISO:'2026-11-14'});
});
