import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCell, workingDays, leaveBalance, schemas } from '../server/domain.js';
test('spreadsheet evaluates precedence, references and aggregations without executing code', () => {
  const cells = {
    A1: '5',
    A2: '7',
    A3: '=A1+A2*2',
    B1: '=SUM(A1:A3)',
    B2: '=AVERAGE(A1:A2)',
    B3: '=1/0',
    B4: '=process.exit()',
    C1: '=C2',
    C2: '=C1',
  };
  assert.equal(evaluateCell(cells, 'A3'), 19);
  assert.equal(evaluateCell(cells, 'B1'), 31);
  assert.equal(evaluateCell(cells, 'B2'), 6);
  assert.equal(evaluateCell(cells, 'B3'), '#DIV/0!');
  assert.equal(evaluateCell(cells, 'B4'), '#ERROR!');
  assert.equal(evaluateCell(cells, 'C1'), '#CYCLE!');
});
test('working days respect leap days, project-specific holidays and year boundaries', () => {
  const calendars = [
    { calendarId: 'ro', year: 2026, weekend: [0, 6], holidays: ['2026-12-25'] },
    { calendarId: 'ro', year: 2027, weekend: [0, 6], holidays: ['2027-01-01'] },
  ];
  assert.equal(workingDays('2026-12-24', '2027-01-04', calendars, 'ro'), 6);
  assert.equal(workingDays('2024-02-28', '2024-03-01'), 3);
  assert.equal(workingDays('2026-12-24', '2027-01-04', calendars, 'other'), 8);
});
test('leave rollover is capped and prior carried days never accumulate indefinitely', () => {
  const entitlements = [
    { userId: 'a', year: 2025, days: 21, carryLimit: 5, calendarId: 'default' },
    { userId: 'a', year: 2026, days: 21, carryLimit: 5, calendarId: 'default' },
  ];
  const leaves = [
    {
      userId: 'a',
      start: '2025-12-29',
      end: '2026-01-02',
      type: 'Annual',
      status: 'Approved',
      calendarId: 'default',
    },
  ];
  assert.deepEqual(leaveBalance('a', 2026, entitlements, leaves, []), {
    year: 2026,
    days: 21,
    carry: 5,
    used: 2,
    remaining: 24,
    configured: true,
  });
  assert.equal(leaveBalance('a', 2027, entitlements, leaves, []).configured, false);
});
test('invalid dates, reversed leave and holidays in the wrong year are rejected', () => {
  assert.equal(
    schemas.leave.safeParse({ start: '2026-02-30', end: '2026-03-01', type: 'Annual' }).success,
    false,
  );
  assert.equal(
    schemas.leave.safeParse({ start: '2026-05-05', end: '2026-05-01', type: 'Annual' }).success,
    false,
  );
  assert.equal(
    schemas.calendars.safeParse({
      title: 'Calendar',
      calendarId: 'ro',
      year: 2026,
      holidays: ['2027-01-01'],
    }).success,
    false,
  );
});
