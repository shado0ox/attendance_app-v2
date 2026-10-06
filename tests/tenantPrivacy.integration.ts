import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { welcomeStateKey } from '../src/server/systemHealth';
import { emailVerificationKey, emailVerificationQuotaKey } from '../src/server/emailVerification';
import { notificationStateKey } from '../src/server/adminNotifications';
const secret='privacy-ci-only-secret',origin='http://127.0.0.1:3011',companyId='privacy-ci';
const pool=new pg.Pool({host:process.env.SQL_HOST,port:Number(process.env.SQL_PORT || 5432),user:process.env.SQL_USER,password:process.env.SQL_PASSWORD,database:process.env.SQL_DB_NAME});
const child=spawn(process.execPath,['dist/server.cjs'],{env:{...process.env,NODE_ENV:'production',JWT_SECRET:secret,BACKUP_ENABLED:'false'},stdio:'inherit'});
const anonymous={'Content-Type':'application/json'},root={...anonymous,Authorization:'Bearer '+jwt.sign({role:'superadmin',companyId:'default'},secret,{expiresIn:'1h'})},legacyRoot={...anonymous,Authorization:'Bearer '+jwt.sign({role:'superadmin',companyId},secret,{expiresIn:'1h'})};
const request=(path:string,auth:Record<string,string>=root,method='GET',body?:any)=>fetch(origin+path,{headers:auth,method,...(body===undefined?{}:{body:JSON.stringify(body)})});
const put=(key:string,value:any)=>pool.query('INSERT INTO shift_app.system_data(key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[key,JSON.stringify(value)]);
const signup={id:companyId,name:'Private company',adminUsername:'privacy-owner',adminEmail:'privacy-owner@example.com',adminPassword:'original-owner-password',privacyAccepted:true};
try {
 let ready=false;for(let i=0;i<60;i++){try{if((await request('/api/health/live',anonymous)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 assert.equal((await request('/api/company-registration',root,'POST',signup)).status,403);
 const registered=await request('/api/company-registration',anonymous,'POST',signup);assert.equal(registered.status,200);const registration:any=await registered.json();assert.ok(Number(registration.companyCode)>=102);
 assert.equal((await request('/api/auth/admin-login',anonymous,'POST',{username:signup.adminUsername,password:signup.adminPassword})).status,403,'pending accounts cannot access business data');
 assert.equal((await request('/api/companies',root,'POST',{id:companyId,subscriptionStatus:'active'})).status,200);
 const login:any=await (await request('/api/auth/admin-login',anonymous,'POST',{username:signup.adminUsername,password:signup.adminPassword})).json();assert.ok(login.token);const owner={...anonymous,Authorization:'Bearer '+login.token};
 const payload:any=await (await request('/api/main-data?companyId='+companyId,owner)).json();payload.employees=[{id:'private-employee',name:'Private employee',email:'private-staff@example.com',password:'private-password',dept:''}];assert.equal((await request('/api/main-data?companyId='+companyId,owner,'POST',{...payload,_baseVersion:payload._version})).status,200);
 const routes=['main-data','attendance','attendance-months','attendance-report','attendance-exceptions','requests','registration-requests','admins','audit-log','employee-audit','notifications','schedule-publication','system-health','employees/private-employee/profile'];
 for(const auth of [root,legacyRoot])for(const route of routes)assert.equal((await request('/api/'+route+'?companyId='+companyId,auth)).status,403,route+' must deny platform access');
 const writes=['main-data','admins','attendance','attendance-months','requests','schedule-publication','notifications/read','employees/private-employee/welcome-email','system-health/backup','system-health/verify-restore','company-owner/password','auth/webauthn-register-options','auth/webauthn-register-verify','auth/webauthn-challenge','auth/webauthn-verify'];
 for(const route of writes)assert.equal((await request('/api/'+route+'?companyId='+companyId,root,'POST',{companyId})).status,403,route+' must deny platform writes');
 assert.equal((await request('/api/main-data?companyId=default',root)).status,200);
 const publicMain:any=await (await request('/api/main-data?companyId='+companyId,anonymous)).json();assert.equal(publicMain.employees.length,0);assert.ok(!JSON.stringify(publicMain).includes('Private company'));
 const companyList:any=await (await request('/api/companies')).json();const listed=companyList.find((c:any)=>c.id===companyId);assert.ok(listed);for(const key of ['adminUsername','adminEmail','adminPassword','logoUrl'])assert.equal(listed[key],undefined);
 const [before]=(await pool.query('SELECT * FROM shift_app.companies WHERE id=$1',[companyId])).rows;
 for(const key of ['adminPassword','adminEmail','adminUsername','name','companyCode'])assert.equal((await request('/api/companies',root,'POST',{id:companyId,subscriptionStatus:'active',[key]:'forged'})).status,403);
 assert.deepEqual((await pool.query('SELECT * FROM shift_app.companies WHERE id=$1',[companyId])).rows[0],before);
 // ID-based endpoints must scope the stored row even without any companyId in the request.
 const attendance=(await pool.query("INSERT INTO shift_app.attendance(company_id,emp_id,emp_name,date) VALUES ($1,'private-employee','Private employee','2026-10-06') RETURNING id",[companyId])).rows[0].id;
 const admin=(await pool.query("INSERT INTO shift_app.admins(company_id,name,username,password) VALUES ($1,'Private admin','privacy-delegated','hash') RETURNING id",[companyId])).rows[0].id;
 const registrationId=(await pool.query("INSERT INTO shift_app.registration_requests(company_id,name,type,phone,password) VALUES ($1,'Private registrant','employee','0500000000','password') RETURNING id",[companyId])).rows[0].id;
 const changeId=(await pool.query("INSERT INTO shift_app.requests(company_id,emp_id,emp_name,date,type) VALUES ($1,'private-employee','Private employee','2026-10-06','leave') RETURNING id",[companyId])).rows[0].id;
 for(const auth of [root,legacyRoot]){
  for(const path of ['/api/attendance/'+attendance,'/api/admins/'+admin,'/api/registration-requests/'+registrationId])assert.equal((await request(path,auth,'DELETE')).status,404);
  assert.equal((await request('/api/requests/'+changeId,auth,'PUT',{status:'approved'})).status,404);
  assert.equal((await request('/api/registration-requests/'+registrationId,auth,'PUT',{status:'approved'})).status,404);
  assert.equal((await request('/api/attendance',auth,'POST',{id:attendance,companyId:'default',checkIn:'08:00'})).status,404);
 }
 // Suspension applies to already-issued tokens, and renewal restores owner access only.
 assert.equal((await request('/api/companies',root,'POST',{id:companyId,subscriptionStatus:'suspended'})).status,200);
 assert.equal((await request('/api/main-data?companyId='+companyId,owner)).status,403);
 assert.equal((await request('/api/companies',root,'POST',{id:companyId,subscriptionStatus:'active',subscriptionExpiresAt:'2030-01-01T00:00:00Z'})).status,200);
 assert.equal((await request('/api/main-data?companyId='+companyId,owner)).status,200);
 assert.equal((await request('/api/company-owner/password?companyId='+companyId,owner,'POST',{currentPassword:signup.adminPassword,newPassword:'new-private-owner-password'})).status,200);
 assert.equal((await request('/api/main-data?companyId='+companyId,owner)).status,403,'old owner session revoked');
 assert.equal((await request('/api/admins?companyId='+companyId,owner)).status,403,'old session revoked across APIs');
 assert.equal((await request('/api/auth/admin-login',anonymous,'POST',{username:signup.adminUsername,password:signup.adminPassword})).status,401);
 const fresh:any=await (await request('/api/auth/admin-login',anonymous,'POST',{username:signup.adminUsername,password:'new-private-owner-password'})).json();const freshOwner={...anonymous,Authorization:'Bearer '+fresh.token};assert.equal((await request('/api/main-data?companyId='+companyId,freshOwner)).status,200);
 const privateKeys=[welcomeStateKey(companyId,'private-employee'),emailVerificationKey(companyId,'private-employee'),emailVerificationQuotaKey(companyId),'adminAccess:'+companyId+':'+admin,notificationStateKey(companyId,{role:'admin',id:admin}),notificationStateKey(companyId,{role:'admin'}),notificationStateKey(companyId,{role:'superadmin'}),notificationStateKey(companyId,{role:'admin',username:signup.adminUsername})];
 for(const key of privateKeys)await put(key,{private:'private-content'});
 await pool.query("INSERT INTO shift_app.audit_log(company_id,actor_id,actor_role,action,details) VALUES ($1,'private-employee','employee','private.event',$2)",[companyId,JSON.stringify({private:true})]);
 await pool.query('INSERT INTO shift_app.attendance_months(key,company_id,month,value) VALUES ($1,$2,$3,$4)',[companyId+':2026-10',companyId,'2026-10',JSON.stringify({private:true})]);
 assert.equal((await request('/api/companies/'+companyId,root,'DELETE')).status,200);
 for(const table of ['companies','attendance','requests','registration_requests','admins','audit_log','attendance_months'])assert.equal((await pool.query('SELECT count(*)::int AS count FROM shift_app.'+table+' WHERE '+(table==='companies'?'id':'company_id')+'=$1',[companyId])).rows[0].count,0,table);
 const allKeys=['mainData_'+companyId,'companyPrivacy:'+companyId,'ownerPasswordRevision:'+companyId,...privateKeys];assert.equal((await pool.query('SELECT count(*)::int AS count FROM shift_app.system_data WHERE key=ANY($1::text[])',[allKeys])).rows[0].count,0);
 assert.equal((await request('/api/main-data?companyId='+companyId,freshOwner)).status,403);assert.equal((await request('/api/main-data?companyId='+companyId,freshOwner,'POST',payload)).status,403);
 assert.equal((await request('/api/company-registration',anonymous,'POST',signup)).status,409,'deleted namespace cannot be reused');
 assert.equal((await request('/api/companies/default',root,'DELETE')).status,400);
 assert.equal((await request('/privacy.html',anonymous)).status,200);assert.equal((await request('/api/privacy-info',anonymous)).status,200);
 console.log('PASS: platform role limited to company 101, foreign read/write/ID routes denied, minimal subscription metadata, owner registration and credential rotation, existing-session revocation, suspension, complete live-data deletion and reserved namespaces.');
} finally {child.kill('SIGTERM');await pool.end();await new Promise(r=>child.exitCode!==null?r(null):child.once('exit',r));}
