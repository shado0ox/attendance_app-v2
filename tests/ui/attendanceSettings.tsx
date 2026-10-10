import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AttendanceLocationsEditor from '../../src/components/AttendanceLocationsEditor';
import { useAutoPunch } from '../../src/hooks/useAutoPunch';
import '../../src/index.css';
const reminderSettings = {};
function MapHarness() {
  const [settings, setSettings] = useState<any>({ attendanceLocations: [{ id: 'branch-test', name: 'فرع الدمام', lat: '', lng: '', radius: 150 }] });
  return <><AttendanceLocationsEditor settings={settings} onSave={async next => { setSettings(next); return true; }} /><output data-testid="saved">{JSON.stringify(settings)}</output></>;
}
function ReminderHarness() {
  const [status, setStatus] = useState('not-checked-in'), [count, setCount] = useState(0);
  const currentStatus = useRef(status);
  useAutoPunch({ scope: 'test:employee', autoIn: false, autoOut: false, missedAlert: true, mode: 'shift', interval: 1, scheduled: '', settings: reminderSettings, status, record: null, blocked: false,
    window: () => ({ start: Date.parse('2026-10-10T08:00:00+03:00'), end: Date.parse('2026-10-10T16:00:00+03:00') }),
    currentStatus: () => currentStatus.current,
    refresh: async () => { currentStatus.current = 'checking'; setStatus('checking'); const response = await fetch('/test-attendance-status'); currentStatus.current = (await response.json()).status; setStatus(currentStatus.current); return true; }, punch: async () => false, message: () => {}, fix: () => {}, departure: () => {}, late: () => setCount(n => n + 1),
  });
  return <output data-testid="reminder-count">{count}</output>;
}
createRoot(document.getElementById('root')!).render(location.search.includes('reminders') ? <ReminderHarness /> : <MapHarness />);
