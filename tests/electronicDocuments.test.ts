import { signatureFixture } from './electronicDocumentFixtures';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForm, validateDate, validateTime, validateSignature } from '../src/server/electronicDocumentValidation';

const base = {
  date: '2026-10-09',
  requestType: 'temporary_exit',
  absenceType: 'annual',
  exitTime: '10:30',
  expectedReturnTime: '12:00',
  actualAttendanceTime: '',
  absenceFrom: '',
  absenceTo: '',
  reason: 'موعد رسمي',
  employeeCommitment: true,
};

test('validates dates and times strictly', () => {
  assert.equal(validateDate('2026-10-09'), true);
  assert.equal(validateDate('2026-02-30'), false);
  assert.equal(validateDate('09-10-2026'), false);
  assert.equal(validateTime('23:59'), true);
  assert.equal(validateTime('24:00'), false);
  assert.equal(validateTime('9:00'), false);
});

test('accepts only PNG data URLs within the size limit', () => {
  assert.equal(validateSignature(signatureFixture()), true);
  assert.equal(validateSignature('data:image/jpeg;base64,AAAA'), false);
  assert.equal(validateSignature('data:image/png;base64,not valid'), false);
  assert.equal(validateSignature('x'.repeat(500001)), false);
});

test('whitelists fields and normalizes a temporary exit request', () => {
  const result = normalizeForm({...base, extra: 'must not survive'}) as any;
  assert.ok(result.value);
  assert.deepEqual(Object.keys(result.value).sort(), [
    'absenceFrom','absenceTo','absenceType','actualAttendanceTime','date',
    'employeeCommitment','exitTime','expectedReturnTime','reason','requestType',
  ].sort());
  assert.equal(result.value.extra, undefined);
});

test('requires return time only for temporary exit', () => {
  const early = normalizeForm({...base, requestType: 'early_exit', expectedReturnTime: ''});
  assert.ok('value' in early);
  const temporary = normalizeForm({...base, expectedReturnTime: ''});
  assert.ok('error' in temporary);
});

test('validates late arrival requirements', () => {
  const result = normalizeForm({...base, requestType: 'late_arrival', exitTime: '', expectedReturnTime: '', actualAttendanceTime: '08:45'});
  assert.ok('value' in result);
  const invalid = normalizeForm({...base, requestType: 'late_arrival', exitTime: '', expectedReturnTime: '', actualAttendanceTime: ''});
  assert.ok('error' in invalid);
});

test('validates absence type and date range', () => {
  const valid = normalizeForm({...base, requestType: 'absence', absenceType: 'annual', exitTime: '', expectedReturnTime: '', absenceFrom: '2026-10-10', absenceTo: '2026-10-12'});
  assert.ok('value' in valid);
  const reversed = normalizeForm({...base, requestType: 'absence', absenceType: 'annual', exitTime: '', expectedReturnTime: '', absenceFrom: '2026-10-12', absenceTo: '2026-10-10'});
  assert.ok('error' in reversed);
  const badType = normalizeForm({...base, requestType: 'absence', absenceType: 'other-bad', exitTime: '', expectedReturnTime: '', absenceFrom: '2026-10-10', absenceTo: '2026-10-12'});
  assert.ok('error' in badType);
});

test('rejects missing or oversized reasons and missing commitment', () => {
  assert.ok('error' in normalizeForm({...base, reason: ''}));
  assert.ok('error' in normalizeForm({...base, reason: 'x'.repeat(2001)}));
  assert.ok('error' in normalizeForm({...base, employeeCommitment: false}));
});

test('rejects blank and corrupt PNG signatures', () => {
  assert.equal(validateSignature(signatureFixture(true)), false);
  assert.equal(validateSignature('data:image/png;base64,AAAA'), false);
  const bytes=Buffer.from(signatureFixture().split(',')[1], 'base64');
  bytes[bytes.length-8] ^= 1;
  assert.equal(validateSignature('data:image/png;base64,'+bytes.toString('base64')), false);
});
