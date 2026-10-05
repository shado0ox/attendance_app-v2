import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backupConnection, runBackup } from '../src/server/backup';
import { backupHealth, mailHealthRows, recordOperationalError, readHealthFile, writeHealthFile, welcomeRetry, welcomeStateKey } from '../src/server/systemHealth';
import { allowedAdminRoute, fullAdminAccess } from '../src/lib/adminAccess';
test('backup connection validates schema and keeps passwords in process environment',()=>{
 const config=backupConnection({DATABASE_URL:'postgresql://user:p%40ss@db.example:5433/app?sslmode=require',DB_SCHEMA:'shift_app'});
 assert.equal(config.pgEnv.PGPASSWORD,'p@ss');assert.equal(config.pgEnv.PGDATABASE,'app');assert.equal(config.pgEnv.PGSSLMODE,'require');assert.equal(config.pgEnv.PGPORT,'5433');
 assert.throws(()=>backupConnection({DB_SCHEMA:'shift_app; DROP DATABASE app'}));assert.throws(()=>backupConnection({DATABASE_URL:'https://example.com'}));
});
test('welcome retries respect address, activity, sending lease and provider idempotency window',()=>{
 const now=Date.now(),employee={id:'e',email:'employee@example.com'},state={status:'failed',startedAt:now-100000,payload:{to:[employee.email]}};
 assert.equal(welcomeRetry(state,employee,now).allowed,true);
 for(const value of [{...state,status:'sent'},{...state,startedAt:now-24*3600000},{...state,startedAt:undefined},{...state,status:'sending',claimedAt:now}])assert.equal(welcomeRetry(value,employee,now).allowed,false);
 assert.equal(welcomeRetry(state,{...employee,status:'suspended'},now).allowed,false);assert.equal(welcomeRetry(state,{...employee,email:'changed@example.com'},now).allowed,false);
 assert.notEqual(welcomeStateKey('a','e'),welcomeStateKey('b','e'));
});
test('mail health returns latest statuses without provider payloads, credentials or OTP secrets',()=>{
 const employee={id:'e',name:'Employee',email:'e@example.com'},now=Date.now();
 const result=mailHealthRows([employee],[{empId:'e',value:{status:'failed',startedAt:now,payload:{to:[employee.email],text:'secret'},claim:'secret'}}],[{empId:'e',value:{delivery:'sent',requestedAt:now,email:employee.email,codeHash:'secret',nonce:'secret'}}],true,now);
 assert.deepEqual(result.counts,{accepted:1,failed:1,pending:0});assert.equal(result.items.find(i=>i.kind==='verification').canRetry,false);assert.equal(JSON.stringify(result).includes('secret'),false);
 assert.equal(mailHealthRows([],[],[{empId:'outside',value:{}}],true).total,0);
 assert.doesNotThrow(()=>mailHealthRows([employee],[{empId:'e',value:{startedAt:'invalid'}}],[],false));
});
test('health permission is global settings-only and never grants tenant backup writes',()=>{
 const access=fullAdminAccess();assert.equal(allowedAdminRoute(access,'GET','/api/system-health'),true);assert.equal(allowedAdminRoute(access,'POST','/api/system-health/backup'),false);
 assert.equal(allowedAdminRoute({...access,departmentIds:['d']},'GET','/api/system-health'),false);assert.equal(allowedAdminRoute({...access,permissions:{...access.permissions,canManageSettings:false}},'GET','/api/system-health'),false);
});
test('backup metadata detects absent, invalid and stale files; journal is bounded; failed backup preserves success',async()=>{
 const directory=await fs.mkdtemp(path.join(tmpdir(),'health-unit-')),oldDir=process.env.BACKUP_DIR,oldSchema=process.env.DB_SCHEMA;
 process.env.BACKUP_DIR=directory;
 try {
 assert.equal((await backupHealth()).status,'missing');const name='attendance-unit.dump';await fs.writeFile(path.join(directory,name),'data');
 const success={name,bytes:4,createdAt:new Date().toISOString(),sha256:'hash',archiveVerified:true};await writeHealthFile('backup-status.json',{lastSuccess:success});assert.equal((await backupHealth()).status,'ok');
 assert.equal((await backupHealth(Date.now()+37*3600000)).status,'stale');await fs.writeFile(path.join(directory,name),'changed');assert.equal((await backupHealth()).status,'invalid');
 process.env.DB_SCHEMA='invalid;';await assert.rejects(runBackup());assert.deepEqual((await readHealthFile('backup-status.json')).lastSuccess,success);assert.equal((await readHealthFile('backup-status.json')).lastAttempt.status,'failed');
 await Promise.all(Array.from({length:105},(_,i)=>recordOperationalError('company','/api/route/:id','POST',500+i)));const journal=await readHealthFile('health-errors.json');assert.equal(journal.items.length,100);assert.equal(journal.items[0].status,604);assert.equal(journal.items.at(-1).status,505);
 await fs.mkdir(path.join(directory,'.backup-lock'));await assert.rejects(runBackup(),(e:any)=>e.status===409);
 }finally{if(oldDir===undefined)delete process.env.BACKUP_DIR;else process.env.BACKUP_DIR=oldDir;if(oldSchema===undefined)delete process.env.DB_SCHEMA;else process.env.DB_SCHEMA=oldSchema;await fs.rm(directory,{recursive:true,force:true});}
});
