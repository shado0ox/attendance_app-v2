import { signatureFixture } from './electronicDocumentFixtures';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { fullAdminAccess } from '../src/lib/adminAccess';

const directory=await fs.mkdtemp(path.join(tmpdir(),'attendance-docs-'));
const secret='electronic-documents-ci-secret';
const companyA='docs-ci-a';
const companyB='docs-ci-b';
const employeeA='docs-employee-a';
const employeeB='docs-employee-b';
const departmentA='docs-dept-a';
const departmentB='docs-dept-b';
const pool=new pg.Pool({
  host:process.env.SQL_HOST,
  port:Number(process.env.SQL_PORT || 5432),
  user:process.env.SQL_USER,
  password:process.env.SQL_PASSWORD,
  database:process.env.SQL_DB_NAME,
});
const child=spawn(process.execPath,['--import','./tests/mockResend.mjs','dist/server.cjs'],{
  env:{...process.env,NODE_ENV:'production',JWT_SECRET:secret,BACKUP_ENABLED:'false',APP_URL:'https://attendance.example.com',RESEND_API_KEY:'mock-key',RESEND_FROM:'Attendance <attendance@example.com>',BACKUP_DIR:directory,ATTENDANCE_TEST_EMAIL_CAPTURE:path.join(directory,'mail.jsonl')},
  stdio:'inherit',
});
const origin='http://127.0.0.1:3011';
const token=(payload:any)=>jwt.sign(payload,secret,{expiresIn:'1h'});
const headers=(role:string,companyId:string,id?:string|number)=>({
  Authorization:'Bearer '+token({role,companyId,...(id===undefined?{}:{id}),name:role==='employee'?'Employee CI':'Admin CI'}),
  'Content-Type':'application/json',
});
const request=async(endpoint:string,opts:any={})=>{
  const authCompanyId=opts.companyId||companyA;
  const requestedCompanyId=opts.requestCompanyId||authCompanyId;
  const method=opts.method||'GET';
  const separator=endpoint.includes('?')?'&':'?';
  const url=origin+endpoint+separator+'companyId='+encodeURIComponent(requestedCompanyId);
  let body=opts.body;
  if(method!=='GET'){
    const payload=body ? JSON.parse(body) : {};
    payload.companyId=authCompanyId;
    body=JSON.stringify(payload);
  }
  return fetch(url,{...opts,method,body,headers:{...headers(opts.role||'admin',authCompanyId,opts.id),...(opts.headers||{})}});
};
const put=async(key:string,value:any)=>pool.query('INSERT INTO shift_app.system_data (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[key,JSON.stringify(value)]);
const form={date:'2026-10-09',requestType:'temporary_exit',absenceType:'annual',exitTime:'10:30',expectedReturnTime:'12:00',actualAttendanceTime:'',absenceFrom:'',absenceTo:'',reason:'اختبار مستند إلكتروني',employeeCommitment:true};
const signature=signatureFixture();
try {
  let ready=false;
  for(let i=0;i<60;i++){try{if((await fetch(origin+'/api/health/live')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  assert.ok(ready,'server did not become ready');

  const dataA={employees:[
    {id:employeeA,name:'Employee A',email:'a@example.com',dept:departmentA},
    {id:employeeB,name:'Employee B',email:'b@example.com',dept:departmentB},
  ],departments:[
    {id:departmentA,name:'Department A'},
    {id:departmentB,name:'Department B'},
  ],shiftTypes:[],schedule:{},settings:{companyName:'Docs CI A'}};
  const dataB={employees:[{id:'docs-b-only',name:'Other Company Employee',email:'other@example.com',dept:'other-dept'}],departments:[{id:'other-dept',name:'Other'}],shiftTypes:[],schedule:{},settings:{companyName:'Docs CI B'}};
  await pool.query('INSERT INTO shift_app.companies(id,name,admin_username,admin_password) VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[companyA,companyA,companyA+'-master','ci-only-hash']);
  await pool.query('INSERT INTO shift_app.companies(id,name,admin_username,admin_password) VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[companyB,companyB,companyB+'-master','ci-only-hash']);
  await put('mainData_'+companyA,dataA);
  await put('mainData_'+companyB,dataB);

  const createDoc=async(employeeId=employeeA)=>{
    const response=await request('/api/electronic-documents',{role:'employee',id:employeeId,method:'POST',body:JSON.stringify({formData:form,employeeSignature:signature})});
    assert.equal(response.status,201);return response.json() as Promise<any>;
  };
  const normalRequest=await request('/api/requests',{role:'employee',id:employeeA,method:'POST',body:JSON.stringify({empId:employeeA,empName:'Forged',dept:departmentB,date:form.date,type:'leave',notes:'طلب',status:'approved'})});
  assert.equal(normalRequest.status,200);const normal:any=await normalRequest.json();assert.equal(normal.empName,'Employee A');assert.equal(normal.dept,departmentA);assert.equal(normal.status,'pending');
  assert.equal((await request('/api/requests',{role:'employee',id:employeeA,method:'POST',body:JSON.stringify({empId:employeeA,date:'2026-02-30',type:'leave'})})).status,400);
  assert.equal((await request('/api/requests',{role:'employee',id:employeeA,method:'POST',body:JSON.stringify({empId:employeeA,date:form.date,type:'unreviewed'})})).status,400);
  const created=await createDoc();
  assert.equal(created.status,'pending_manager');
  assert.ok(created.url.includes('/document-approval/'));
  const tokenValue=created.url.split('/document-approval/')[1];
  const delegated=await pool.query('INSERT INTO shift_app.admins(name,username,password,company_id) VALUES ($1,$2,$3,$4) RETURNING id',['Docs Admin','docs-admin-ci','ci-only-hash',companyA]);
  const adminId=delegated.rows[0].id;
  await put('adminAccess:'+companyA+':'+adminId,fullAdminAccess());
  assert.equal((await request('/api/electronic-documents/'+created.id+'/print',{role:'employee',id:employeeA})).status,403);
  assert.equal((await request('/api/electronic-documents/'+created.id+'/cancel',{role:'employee',id:employeeA,method:'POST',body:'{}'})).status,403);
  assert.equal((await request('/api/electronic-documents/'+created.id,{role:'employee',id:employeeA,method:'DELETE'})).status,403);
  const employeeList:any[]=await (await request('/api/electronic-documents',{role:'employee',id:employeeA})).json();
  assert.equal(employeeList[0].formData,undefined);
  assert.equal(employeeList[0].employeeSignature,undefined);
  assert.equal(employeeList[0].shareTokenEncrypted,undefined);
  const copy=await request('/api/electronic-documents/'+created.id+'/share',{role:'employee',id:employeeA,method:'POST',body:'{}'});
  assert.equal((await copy.json() as any).url,created.url);
  assert.equal((await request('/api/electronic-documents/'+created.id+'/share',{role:'employee',id:employeeB,method:'POST',body:'{}'})).status,404);
  const preview=await request('/api/electronic-documents/'+created.id+'/print',{id:adminId});
  assert.equal(preview.status,200);
  assert.ok((await preview.json() as any).finalHtml.includes('بانتظار توقيع المدير'));
  const managerHeaders=headers('admin',companyA,adminId);
  assert.equal((await fetch(origin+'/api/document-approval/'+tokenValue)).status,401);
  assert.equal((await fetch(origin+'/api/document-approval/'+tokenValue,{headers:headers('employee',companyA,employeeA)})).status,403);
  assert.equal((await fetch(origin+'/api/document-approval/'+tokenValue,{headers:headers('admin',companyB)})).status,403);
  await put('adminAccess:'+companyA+':'+adminId,{...fullAdminAccess(),permissions:{...fullAdminAccess().permissions,canApproveRequests:false}});
  assert.equal((await fetch(origin+'/api/document-approval/'+tokenValue,{headers:managerHeaders})).status,403);
  await put('adminAccess:'+companyA+':'+adminId,{...fullAdminAccess(),departmentIds:[departmentB]});
  assert.equal((await fetch(origin+'/api/document-approval/'+tokenValue,{headers:managerHeaders})).status,404);
  await put('adminAccess:'+companyA+':'+adminId,fullAdminAccess());
  await pool.query('UPDATE shift_app.admins SET email=$1 WHERE id=$2',['a@example.com',adminId]);
  assert.equal((await fetch(origin+'/api/document-approval/'+tokenValue,{headers:managerHeaders})).status,403,'a linked employee identity cannot approve itself');
  await pool.query('UPDATE shift_app.admins SET email=$1 WHERE id=$2',['manager@example.com',adminId]);
  const decision={managerName:'Forged manager',managerSignature:signature,decision:'approved',reason:'ملاحظة الموافقة'};
  assert.equal((await fetch(origin+'/api/document-approval/'+tokenValue,{method:'POST',headers:headers('employee',companyA,employeeA),body:JSON.stringify(decision)})).status,403);
  const opened=await fetch(origin+'/api/document-approval/'+tokenValue,{headers:managerHeaders});
  assert.equal(opened.status,200);
  const approve=()=>fetch(origin+'/api/document-approval/'+tokenValue,{method:'POST',headers:managerHeaders,body:JSON.stringify({managerName:'Forged manager',managerSignature:signature,decision:'approved',reason:'ملاحظة الموافقة'})});
  assert.deepEqual((await Promise.all([approve(),approve()])).map(r=>r.status).sort(),[200,404]);
  const printed=await request('/api/electronic-documents/'+created.id+'/print',{id:adminId});
  assert.ok((await printed.json() as any).finalHtml.includes('ملاحظة الموافقة'));
  const timeline=await request('/api/electronic-documents/'+created.id+'/audit',{id:adminId});
  assert.equal(timeline.status,200);
  const actions=(await timeline.json() as any[]).map(event=>event.action);
  assert.deepEqual(actions.slice(0,2),['employee_signed','manager_link_available']);
  assert.ok(actions.includes('approved')&&actions.includes('print_preview'));
  const managerAudit=await pool.query('SELECT actor_id, details FROM shift_app.electronic_document_audit WHERE document_id=$1 AND action=$2',[created.id,'approved']);
  assert.equal(managerAudit.rows[0].actor_id,String(adminId));
  assert.equal(managerAudit.rows[0].details.managerName,'Docs Admin');
  const noPunchReport:any=await (await request('/api/attendance-report?from='+form.date+'&to='+form.date,{id:adminId})).json();
  assert.equal(noPunchReport.items.length,1);assert.deepEqual(noPunchReport.items[0].ids,[]);assert.equal(noPunchReport.items[0].minutes,null);assert.equal(noPunchReport.items[0].permissions[0].id,created.id);
  const noPunchOwn:any=await (await request('/api/employee-attendance?month=2026-10',{role:'employee',id:employeeA})).json();
  assert.ok(noPunchOwn.items.some((day:any)=>day.date===form.date&&day.permissions[0].id===created.id));
  const peerReport:any=await (await request('/api/attendance-report?from='+form.date+'&to='+form.date+'&empId='+employeeB,{id:adminId})).json();
  assert.equal(peerReport.items.length,0);
  const ownMain:any=await (await request('/api/main-data',{role:'employee',id:employeeA})).json();
  assert.ok(ownMain._permissionDays.some((marker:any)=>marker.id===created.id&&marker.date===form.date));
  const otherMain:any=await (await request('/api/main-data',{role:'employee',id:employeeB})).json();
  assert.equal(otherMain._permissionDays.length,0);
  await pool.query('INSERT INTO shift_app.attendance (emp_id,emp_name,dept,date,company_id,check_in,check_out) VALUES ($1,$2,$3,$4,$5,$6,$7)',[employeeA,'Employee A',departmentA,form.date,companyA,'08:00','17:00']);
  const adminReport:any=await (await request('/api/attendance-report?from='+form.date+'&to='+form.date,{id:adminId})).json();
  assert.ok(adminReport.items[0].permissions.some((marker:any)=>marker.id===created.id));
  const ownReport:any=await (await request('/api/employee-attendance?month=2026-10',{role:'employee',id:employeeA})).json();
  assert.ok(ownReport.items.find((day:any)=>day.date===form.date).permissions.some((marker:any)=>marker.id===created.id));
  const createdB=await createDoc(employeeB);
  await put('adminAccess:'+companyA+':'+adminId,{...fullAdminAccess(),departmentIds:[departmentA]});
  assert.equal((await request('/api/electronic-documents/'+createdB.id,{id:adminId,method:'DELETE'})).status,404);
  assert.equal((await request('/api/electronic-documents/'+createdB.id+'/audit',{id:adminId})).status,404);
  const scopedMain:any=await (await request('/api/main-data',{id:adminId})).json();
  assert.ok(scopedMain._permissionDays.every((marker:any)=>marker.employeeId===employeeA));
  await put('adminAccess:'+companyA+':'+adminId,fullAdminAccess());
  assert.equal((await request('/api/electronic-documents/'+created.id,{id:adminId,method:'DELETE'})).status,200);
  assert.equal((await request('/api/electronic-documents/'+created.id+'/print',{id:adminId})).status,404);
  const afterDelete:any=await (await request('/api/main-data',{role:'employee',id:employeeA})).json();
  assert.equal(afterDelete._permissionDays.length,0);
  assert.equal((await fetch(origin+'/api/document-approval/'+tokenValue,{headers:managerHeaders})).status,404);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM shift_app.audit_log WHERE action='electronic-document.delete' AND entity_id=$1",[String(created.id)])).rows[0].count,1);
  const pending=await createDoc();
  assert.equal((await request('/api/electronic-documents/'+pending.id,{id:adminId,method:'DELETE'})).status,200);
  assert.equal((await fetch(origin+'/api/document-approval/'+pending.url.split('/document-approval/')[1],{headers:managerHeaders})).status,404);
  for(const invalidSignature of [signatureFixture(true),'data:image/png;base64,AAAA'])assert.equal((await request('/api/electronic-documents',{role:'employee',id:employeeA,method:'POST',body:JSON.stringify({formData:form,employeeSignature:invalidSignature})})).status,400);
  assert.equal((await request('/api/companies/'+companyA,{role:'superadmin',companyId:'default',method:'DELETE'})).status,200);
  for(const table of ['electronic_documents','electronic_document_audit'])assert.equal((await pool.query('SELECT count(*)::int AS count FROM shift_app.'+table+' WHERE company_id=$1',[companyA])).rows[0].count,0);
  console.log('PASS: direct employee approval, locked employee forms, reusable manager link, manager signature, admin timeline/printing/deletion and isolated attendance markers.');

} finally {
  child.kill('SIGTERM');
  await pool.end();
  await new Promise(r=>child.exitCode!==null?r(null):child.once('exit',r));
  await fs.rm(directory,{recursive:true,force:true});
}
