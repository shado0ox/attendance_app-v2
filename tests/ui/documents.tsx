import React from 'react';
import {createRoot} from 'react-dom/client';
import ElectronicRequestPanel from '../../src/components/ElectronicRequestPanel';
import ElectronicDocumentsView from '../../src/pages/admin/ElectronicDocumentsView';
import '../../src/index.css';
createRoot(document.getElementById('root')!).render(location.search.includes('admin')?<ElectronicDocumentsView companyId="default"/>:<ElectronicRequestPanel employee={{id:'employee'}} companyId="default" appSettings={{companyName:'اختبار'}} departmentName="القسم" active/>);
