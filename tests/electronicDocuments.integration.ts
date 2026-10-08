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
const request=async(endpoint:string,opts:any={})=>fetch(origin+endpoint,{...opts,headers:{...headers(opts.role||'admin',opts.companyId||companyA,opts.id),...(opts.headers||{})}});
const put=async(key:string,value:any)=>pool.query('INSERT INTO shift_app.system_data (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[key,JSON.stringify(value)]);
const form={date:'2026-10-09',requestType:'temporary_exit',absenceType:'annual',exitTime:'10:30',expectedReturnTime:'12:00',actualAttendanceTime:'',absenceFrom:'',absenceTo:'',reason:'اختبار مستند إلكتروني',employeeCommitment:true};
const signature='data:image/png;base64,AAAA';
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

  const employeeCreate=await request('/api/electronic-documents',{role:'employee',companyId:companyA,id:employeeA,method:'POST',body:JSON.stringify({companyId:companyA,formData:form,employeeSignature:signature})});
  assert.equal(employeeCreate.status,201);
  const created:any=await employeeCreate.json();

  const delegated=await pool.query('INSERT INTO shift_app.admins(name,username,password,company_id) VALUES ($1,$2,$3,$4) RETURNING id',['Docs Admin','docs-admin-ci','ci-only-hash',companyA]);
  const adminId=delegated.rows[0].id;
  await put('adminAccess:'+companyA+':'+adminId,fullAdminAccess());

  assert.equal((await request('/api/electronic-documents/'+created.id+'/share',{role:'employee',companyId:companyA,id:employeeA,method:'POST',body:JSON.stringify({companyId:companyA})})).status,403);
  const share=await request('/api/electronic-documents/'+created.id+'/share',{role:'admin',companyId:companyA,id:adminId,method:'POST',body:JSON.stringify({companyId:companyA})});
  assert.equal(share.status,200);
  const shared:any=await share.json();
  const tokenValue=shared.url.split('/document-approval/')[1];
  assert.ok(tokenValue);

  const opened=await fetch(origin+'/api/document-approval/'+encodeURIComponent(tokenValue));
  assert.equal(opened.status,200);
  const publicDoc:any=await opened.json();
  assert.equal(publicDoc.employeeName,'Employee A');
  assert.equal(publicDoc.managerSignature,undefined);

  const approved=await fetch(origin+'/api/document-approval/'+encodeURIComponent(tokenValue),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({managerName:'Manager A',managerSignature:signature,decision:'approved',reason:''})});
  assert.equal(approved.status,200);

  assert.equal((await fetch(origin+'/api/document-approval/'+encodeURIComponent(tokenValue))).status,404);
  assert.equal((await request('/api/electronic-documents/'+created.id+'/cancel',{role:'employee',companyId:companyA,id:employeeA,method:'POST',body:'{}'})).status,404);
  assert.equal((await request('/api/electronic-documents/'+created.id+'/status',{role:'admin',companyId:companyA,id:adminId,method:'POST',body:JSON.stringify({status:'cancelled'})})).status,409);
  const employeeBCreate=await request('/api/electronic-documents',{role:'employee',companyId:companyA,id:employeeB,method:'POST',body:JSON.stringify({companyId:companyA,formData:form,employeeSignature:signature})});
  assert.equal(employeeBCreate.status,201);
  const createdB:any=await employeeBCreate.json();
  assert.equal((await request('/api/electronic-documents/'+createdB.id+'/status',{role:'admin',companyId:companyA,id:adminId,method:'POST',body:JSON.stringify({status:'cancelled'})})).status,404);

  const employeeList=await request('/api/electronic-documents',{role:'employee',companyId:companyA,id:employeeA});
  assert.equal(employeeList.status,200);
  const list:any[]=await employeeList.json();
  assert.equal(list.length,1);
  assert.equal(list[0].finalHtml,undefined);
  assert.equal(list[0].employeeSignature,undefined);
  assert.equal(list[0].managerSignature,undefined);
  assert.equal(list[0].shareTokenHash,undefined);

  await put('adminAccess:'+companyA+':'+adminId,{...fullAdminAccess(),departmentIds:[departmentA]});
  const scoped=await request('/api/electronic-documents',{role:'admin',companyId:companyA,id:adminId});
  assert.equal(scoped.status,200);
  const scopedDocs:any[]=await scoped.json();
  assert.ok(scopedDocs.every(d=>d.departmentName==='Department A'));
  assert.equal((await request('/api/electronic-documents/'+created.id+'/status',{role:'admin',companyId:companyA,id:adminId,method:'POST',body:JSON.stringify({status:'cancelled'})})).status,409);

  const otherCompanyList=await request('/api/electronic-documents?companyId='+encodeURIComponent(companyB),{role:'superadmin',companyId:'default'});
  assert.equal(otherCompanyList.status,200);
  const otherDocs:any[]=await otherCompanyList.json();
  assert.equal(otherDocs.length,0);

  console.log('PASS: electronic documents creation, admin manager link, public approval, one-time token, immutability, company isolation and department scope.');
} finally {
  child.kill('SIGTERM');
  await pool.end();
  await new Promise(r=>child.exitCode!==null?r(null):child.once('exit',r));
  await fs.rm(directory,{recursive:true,force:true});
}
