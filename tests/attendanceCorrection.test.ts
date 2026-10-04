import test from 'node:test';
import assert from 'node:assert/strict';
import { correctionValues } from '../src/lib/attendanceCorrection';
test('partial correction uses Riyadh timestamps and preserves fields not requested', () => {
  const values = correctionValues({ date: '2025-01-10', checkOutTime: '17:00', details: { period: 1 } }, { checkIn: '08:00', checkInTs: String(Date.parse('2025-01-10T08:00:00+03:00')) });
  assert.equal(values.checkIn, undefined);
  assert.equal(values.checkOutTs, String(Date.parse('2025-01-10T17:00:00+03:00')));
  assert.match(values.checkOutLocation, /دون إثبات موقع/);
});
test('overnight and period two require explicit offsets and legal chronological order', () => {
  const original = { checkIn: '22:00', checkInTs: String(Date.parse('2025-01-10T22:00:00+03:00')) };
  assert.throws(() => correctionValues({ date: '2025-01-10', checkOutTime: '06:00', details: {} }, original), /بعد الحضور/);
  const values = correctionValues({ date: '2025-01-10', checkOutTime: '06:00', details: { checkOutNextDay: true } }, original);
  assert.equal(values.checkOutTs, String(Date.parse('2025-01-11T06:00:00+03:00')));
  assert.throws(() => correctionValues({ date: '2025-01-10', checkInTime: '16:00', details: { period: 2 } }), /الفترة الأولى/);
  assert.throws(() => correctionValues({ date: '2025-01-10', checkInTime: '25:00' }), /غير صحيح/);
  assert.throws(() => correctionValues({ date: '2025-02-30', checkOutTime: '17:00' }), /تاريخًا صحيحًا/);
  const second = correctionValues({ date: '2025-01-10', checkOutTime: '23:00', details: { period: 2 } }, { checkIn: '08:00', checkOut: '12:00', checkOutTs: String(Date.parse('2025-01-10T12:00:00+03:00')), checkIn2: '16:00', checkInTs2: String(Date.parse('2025-01-10T16:00:00+03:00')) });
  assert.equal(second.checkOut2, '23:00');
  assert.equal(second.checkOut, undefined);
});
