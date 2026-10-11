import React from 'react';
import { createRoot } from 'react-dom/client';
import AttendancePasskeySettings from '../../src/components/AttendancePasskeySettings';
import '../../src/index.css';
createRoot(document.getElementById('root')!).render(<AttendancePasskeySettings companyId="pilot" />);
