import React from 'react';
import { createRoot } from 'react-dom/client';
import AppInstallPrompt from '../../src/components/AppInstallPrompt';
import { useAppInstallation } from '../../src/hooks/useAppInstallation';
import '../../src/index.css';
function Fixture() { const installation = useAppInstallation(); return <div className="app-layout"><AppInstallPrompt installation={installation} employee /><main data-testid="page-content" className="p-4"><h1>محتوى بوابة الموظف</h1><button>زر من الصفحة</button></main><nav data-testid="employee-nav" className="fixed bottom-0 left-0 right-0 h-24 bg-slate-100">تنقل الموظف</nav></div>; }
createRoot(document.getElementById('root')!).render(<Fixture />);
