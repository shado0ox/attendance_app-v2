import React from 'react';
import { createRoot } from 'react-dom/client';
import AttendancePasskeyGate from '../../src/components/AttendancePasskeyGate';
import AttendancePasskeySettings from '../../src/components/AttendancePasskeySettings';
import '../../src/index.css';
function GateFixture() {
  const [pending, setPending] = React.useState(false), [approved, setApproved] = React.useState(false);
  return approved ? <p>بوابة الموظف متاحة</p> : <AttendancePasskeyGate name="موظف التجربة" status={{ required: true, approvedCount: 0, pendingCount: pending ? 1 : 0 }} error="" message="" busy={false} supported={true} onEnroll={() => setPending(true)} onRefresh={() => { if (pending) setApproved(true); }} onLogout={() => {}} />;
}
createRoot(document.getElementById('root')!).render(location.search.includes('gate') ? <GateFixture /> : <AttendancePasskeySettings companyId="pilot" />);
