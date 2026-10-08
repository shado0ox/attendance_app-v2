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

  const opened=await fetch(origin+'/api/document-approval/'+encodeURIComponent(tokenValue)+'?companyId='+encodeURIComponent(companyA));
  assert.equal(opened.status,200);
  const publicDoc:any=await opened.json();
  assert.equal(publicDoc.employeeName,'Employee A');
  assert.equal(publicDoc.managerSignature,undefined);

  const approved=await fetch(origin+'/api/document-approval/'+encodeURIComponent(tokenValue),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId:companyA,managerName:'Manager A',managerSignature:signature,decision:'approved',reason:'ملاحظة الموافقة'})});
  assert.equal(approved.status,200);

  assert.equal((await fetch(origin+'/api/document-approval/'+encodeURIComponent(tokenValue)+'?companyId='+encodeURIComponent(companyA))).status,404);
  assert.equal((await request('/api/electronic-documents/'+created.id+'/cancel',{role:'employee',companyId:companyA,id:employeeA,method:'POST',body:'{}'})).status,404);
  const adminPrint=await request('/api/electronic-documents/'+created.id+'/print',{role:'admin',companyId:companyA,id:adminId});
  assert.equal(adminPrint.status,200);
  const printPayload:any=await adminPrint.json();
  assert.ok(typeof printPayload.finalHtml==='string' && printPayload.finalHtml.includes('نموذج استئذان') && printPayload.finalHtml.includes('ملاحظة الموافقة'));
  await put('adminAccess:'+companyA+':'+adminId,{...fullAdminAccess(),permissions:{...fullAdminAccess().permissions,canPrint:false}});
  assert.equal((await request('/api/electronic-documents/'+created.id+'/print',{role:'admin',companyId:companyA,id:adminId})).status,403);
  await put('adminAccess:'+companyA+':'+adminId,{...fullAdminAccess(),departmentIds:[departmentA]});

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

  const scoped=await request('/api/electronic-documents',{role:'admin',companyId:companyA,id:adminId});
  assert.equal(scoped.status,200);
  const scopedDocs:any[]=await scoped.json();
  assert.ok(scopedDocs.every(d=>d.departmentName==='Department A'));
  assert.equal((await request('/api/electronic-documents/'+created.id+'/status',{role:'admin',companyId:companyA,id:adminId,method:'POST',body:JSON.stringify({status:'cancelled'})})).status,404);

  const otherCompanyList=await request('/api/electronic-documents',{role:'superadmin',companyId:'default',requestCompanyId:companyB});
  assert.equal(otherCompanyList.status,403);

  await put('adminAccess:'+companyA+':'+adminId,fullAdminAccess());
  for (const invalidSignature of [signatureFixture(true),'data:image/png;base64,AAAA']) {
    assert.equal((await request('/api/electronic-documents',{role:'employee',id:employeeA,method:'POST',body:JSON.stringify({formData:form,employeeSignature:invalidSignature})})).status,400);
  }
  const createDoc=async()=>{
    const response=await request('/api/electronic-documents',{role:'employee',id:employeeA,method:'POST',body:JSON.stringify({formData:form,employeeSignature:signature})});
    assert.equal(response.status,201);return response.json() as Promise<any>;
  };
  // Hold the row while share reads the old state; finish a terminal transition
  // before releasing the lock. Its UPDATE must recheck the current state.
  for (const terminal of ['approved','cancelled','rejected']) {
    const doc=await createDoc();
    const blocker=await pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM shift_app.electronic_documents WHERE id=$1 FOR UPDATE',[doc.id]);
      const sharing=request('/api/electronic-documents/'+doc.id+'/share',{id:adminId,method:'POST',body:'{}'});
      let waiting=false;
      for(let attempt=0;attempt<100;attempt++) {
        const active=await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%electronic_documents%' AND query LIKE 'update%'");
        if(active.rowCount){waiting=true;break;}
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert.ok(waiting,'share did not reach its blocked UPDATE');
      await blocker.query('UPDATE shift_app.electronic_documents SET status=$1 WHERE id=$2',[terminal,doc.id]);
      await blocker.query('COMMIT');
      assert.equal((await sharing).status,409);
      const stored=await pool.query('SELECT status,share_token_hash FROM shift_app.electronic_documents WHERE id=$1',[doc.id]);
      assert.equal(stored.rows[0].status,terminal);
      assert.equal(stored.rows[0].share_token_hash,null);
    } finally {await blocker.query('ROLLBACK');blocker.release();}
  }
  const twice=await createDoc();
  const sharing=await request('/api/electronic-documents/'+twice.id+'/share',{id:adminId,method:'POST',body:'{}'});
  const approvalToken=(await sharing.json() as any).url.split('/document-approval/')[1];
  const decisions=await Promise.all([1,2].map(()=>fetch(origin+'/api/document-approval/'+approvalToken,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({managerName:'Manager',managerSignature:signature,decision:'approved',reason:''})})));
  assert.deepEqual(decisions.map(r=>r.status).sort(),[200,404]);
  const pending=await createDoc();
  const pendingShare=await request('/api/electronic-documents/'+pending.id+'/share',{id:adminId,method:'POST',body:'{}'});
  const deletedToken=(await pendingShare.json() as any).url.split('/document-approval/')[1];
  assert.equal((await request('/api/companies/'+companyA,{role:'superadmin',companyId:'default',method:'DELETE'})).status,200);
  for(const table of ['electronic_documents','electronic_document_audit']) {
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM shift_app.'+table+' WHERE company_id=$1',[companyA])).rows[0].count,0);
  }
  assert.equal((await fetch(origin+'/api/document-approval/'+deletedToken)).status,404);
  assert.equal((await fetch(origin+'/api/document-approval/'+deletedToken,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({managerName:'Manager',managerSignature:signature,decision:'approved'})})).status,404);

  console.log('PASS: electronic documents creation, admin manager link, public approval, one-time token, immutability, company isolation and department scope.');
} finally {
  child.kill('SIGTERM');
  await pool.end();
  await new Promise(r=>child.exitCode!==null?r(null):child.once('exit',r));
  await fs.rm(directory,{recursive:true,force:true});
}
