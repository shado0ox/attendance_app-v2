import React from 'react';
import { createRoot } from 'react-dom/client';
import AttendanceBreakSettings from '../../src/components/AttendanceBreakSettings';
import EmployeeBreakPanel from '../../src/components/EmployeeBreakPanel';
import AttendanceView from '../../src/pages/admin/AttendanceView';
import '../../src/index.css';
const noop = () => {};
function Report() { return <AttendanceView companyId="test-company" employees={[]} departments={[]} attFilterFrom="2026-10-15" attFilterTo="2026-10-15" attFilterEmp="" attFilterDept="" attFilterStatus="" setAttFilterFrom={noop} setAttFilterTo={noop} setAttFilterEmp={noop} setAttFilterDept={noop} setAttFilterStatus={noop} loadAttendance={noop} getTodayAttendanceStats={() => ({ presentCount: 3, absentCount: 0, totalActive: 3 })} requestConfirm={noop} onDeleteRecord={async () => {}} />; }
createRoot(document.getElementById('root')!).render(location.search.includes('settings') ? <AttendanceBreakSettings companyId="test-company" /> : location.search.includes('report') ? <Report /> : <EmployeeBreakPanel companyId="test-company" />);
