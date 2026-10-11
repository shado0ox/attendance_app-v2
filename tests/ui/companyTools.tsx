import React from 'react';
import { createRoot } from 'react-dom/client';
import SettingsView from '../../src/pages/admin/SettingsView';
import CompanyBackupPanel from '../../src/components/CompanyBackupPanel';
import '../../src/index.css';
const noop = () => {};
function SettingsFixture() {
  const [name, setName] = React.useState('شركة التجربة');
  return <SettingsView admin={{ role: 'admin' }} companyId="test-company" appSettings={{ companyName: name }} onUpdateSettings={async () => true} employees={[]} departments={[]} appData={{}} requestConfirm={noop} companySettingsName={name} setCompanySettingsName={setName} handleLogoUpload={noop} handleDetectGPS={noop} geoSettingStatus="" settingsNewPwd="" setSettingsNewPwd={noop} settingsConfirmPwd="" setSettingsConfirmPwd={noop} settingsPwdMsg="" handleUpdatePassword={noop} subAdmins={[]} subAdminsLoading={false} onAddSubAdmin={noop} onEditSubAdmin={noop} onDeleteSubAdmin={async () => {}} registrationRequests={[]} onApproveRegistration={async () => {}} onRejectRegistration={async () => {}} />;
}
createRoot(document.getElementById('root')!).render(location.search.includes('backup') ? <CompanyBackupPanel companyId="test-company" /> : <SettingsFixture />);
