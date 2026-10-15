// Test bootstrap only: production code never reads this test clock file.
import fs from 'node:fs';
const NativeDate = globalThis.Date;
const now = () => Number(fs.readFileSync(process.env.ATTENDANCE_TEST_BREAK_CLOCK, 'utf8'));
globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now()])); } static now() { return now(); } };
