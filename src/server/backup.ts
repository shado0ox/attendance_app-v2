import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { backupDirectory, readHealthFile, writeHealthFile } from './systemHealth';
const run=promisify(execFile), timeout=300000;
export function backupConnection(env:NodeJS.ProcessEnv=process.env) {
  let url:URL|undefined;
  const raw=env.DATABASE_URL;
  if(raw && !raw.includes('cmccnjkusdcqbpbkclke')) { url=new URL(raw); if(!['postgres:','postgresql:'].includes(url.protocol)) throw new Error('invalid_connection'); }
  const schema=env.DB_SCHEMA || 'shift_app'; if(!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(schema)) throw new Error('invalid_schema');
  const host=url?.hostname || env.SQL_HOST || 'localhost';
  const ssl=env.DB_SSL==='true'?'require':env.DB_SSL==='false'?'disable':url?.searchParams.get('sslmode') || (/supabase|neon|render/.test(host)?'require':'disable');
  return {schema,pgEnv:{...process.env,PGHOST:host,PGPORT:url?.port || env.SQL_PORT || '5432',PGUSER:url?decodeURIComponent(url.username):env.SQL_USER || 'postgres',PGPASSWORD:url?decodeURIComponent(url.password):env.SQL_PASSWORD || '',PGDATABASE:url?decodeURIComponent(url.pathname.slice(1)):env.SQL_DB_NAME || 'postgres',PGSSLMODE:ssl,PGCONNECT_TIMEOUT:'10'}};
}
export async function archiveHash(file:string) { const hash=crypto.createHash('sha256');for await(const chunk of createReadStream(file)) hash.update(chunk);return hash.digest('hex'); }
async function lock() {
  const dir=backupDirectory(), file=path.join(dir,'.backup-lock'); await fs.mkdir(dir,{recursive:true,mode:0o700});
  try {await fs.mkdir(file,{mode:0o700});} catch(error:any) {
    if(error.code!=='EEXIST') throw error;
    const stat=await fs.stat(file); if(Date.now()-stat.mtimeMs<timeout*2+60000) throw Object.assign(new Error('عملية نسخ أو فحص استرجاع جارية'),{status:409});
    await fs.rm(file,{recursive:true,force:true}); await fs.mkdir(file,{mode:0o700});
  }
  return async()=>fs.rm(file,{recursive:true,force:true});
}
async function retention(latest:string) { const files=(await fs.readdir(backupDirectory())).filter(f=>/^attendance-[a-zA-Z0-9-]+\.dump$/.test(f)).sort().reverse();for(const f of files.slice(14))if(f!==latest)await fs.unlink(path.join(backupDirectory(),f)); }
export async function runBackup() {
  const release=await lock(), at=new Date().toISOString();let partial:string|undefined;
  try {
    const previous=await readHealthFile('backup-status.json') || {};await writeHealthFile('backup-status.json',{...previous,lastAttempt:{status:'running',at}});
    const {schema,pgEnv}=backupConnection(), name='attendance-'+at.replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.dump';partial=path.join(backupDirectory(),name+'.partial');
    await run('pg_dump',['--format=custom','--no-owner','--no-acl','--schema="'+schema+'"','--file='+partial],{env:pgEnv,timeout,maxBuffer:1024*1024});
    const list=await run('pg_restore',['--list',partial],{env:pgEnv,timeout:30000,maxBuffer:8*1024*1024});if(!list.stdout.includes('TABLE '+schema+' system_data'))throw new Error('archive_invalid');
    await fs.chmod(partial,0o600);const bytes=(await fs.stat(partial)).size,sha256=await archiveHash(partial);await fs.rename(partial,path.join(backupDirectory(),name));partial=undefined;
    const success={name,bytes,sha256,createdAt:new Date().toISOString(),archiveVerified:true,schema};await writeHealthFile('backup-status.json',{...previous,lastSuccess:success,lastAttempt:{status:'success',at,finishedAt:success.createdAt,message:'تم إنشاء النسخة وفحص بنية الأرشيف'}});await retention(name).catch(()=>{});return success;
  }catch{const previous=await readHealthFile('backup-status.json') || {};await writeHealthFile('backup-status.json',{...previous,lastAttempt:{status:'failed',at,finishedAt:new Date().toISOString(),message:'فشل النسخ؛ راجع إعدادات الاتصال وتوفر pg_dump ومساحة التخزين'}}).catch(()=>{});throw Object.assign(new Error('فشل النسخ الاحتياطي؛ راجع إعدادات السيرفر'),{status:503});}
  finally{if(partial)await fs.unlink(partial).catch(()=>{});await release();}
}
export async function verifyBackupRestore() {
  const release=await lock(),at=new Date().toISOString(); let admin:pg.Pool|undefined,restored:pg.Pool|undefined,created=false,testDb='attendance_restore_check_'+crypto.randomUUID().replaceAll('-','');
  try {
    const state=await readHealthFile('backup-status.json'), latest=state?.lastSuccess;
    if(!latest || !/^attendance-[a-zA-Z0-9-]+\.dump$/.test(latest.name || ''))throw new Error('missing_backup');
    await writeHealthFile('backup-status.json',{...state,lastVerification:{status:'running',at,backupName:latest.name}});
    const {schema,pgEnv}=backupConnection(),file=path.join(backupDirectory(),latest.name);if(await archiveHash(file)!==latest.sha256)throw new Error('checksum_failed');
    const options={host:pgEnv.PGHOST,port:Number(pgEnv.PGPORT),user:pgEnv.PGUSER,password:pgEnv.PGPASSWORD,database:pgEnv.PGDATABASE,ssl:pgEnv.PGSSLMODE==='disable'?undefined:{rejectUnauthorized:false},connectionTimeoutMillis:10000,options:'-c statement_timeout=30000'};
    admin=new pg.Pool(options);await admin.query('CREATE DATABASE "'+testDb+'"');created=true;
    await run('pg_restore',['--exit-on-error','--no-owner','--no-acl','--dbname='+testDb,file],{env:{...pgEnv,PGDATABASE:testDb},timeout,maxBuffer:1024*1024});
    restored=new pg.Pool({...options,database:testDb});const tables=await restored.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1',[schema]);
    for(const name of ['system_data','attendance','requests','admins','companies'])if(!tables.rows.some(r=>r.table_name===name))throw new Error('missing_table');
    await restored.query('SELECT count(*) FROM "'+schema+'".system_data');await restored.end();restored=undefined;
    await admin.query('DROP DATABASE "'+testDb+'" WITH (FORCE)');created=false;
    const current=await readHealthFile('backup-status.json') || {};const result={status:'success',at,backupName:latest.name,tables:tables.rows.length,message:'نجح الاسترجاع في قاعدة مؤقتة وتم حذفها'};await writeHealthFile('backup-status.json',{...current,lastVerification:result});return result;
  }catch{const current=await readHealthFile('backup-status.json') || {};await writeHealthFile('backup-status.json',{...current,lastVerification:{status:'failed',at,backupName:current.lastSuccess?.name || null,message:'فشل اختبار الاسترجاع؛ راجع صلاحية إنشاء قواعد البيانات وسلامة الأرشيف'}}).catch(()=>{});throw Object.assign(new Error('فشل اختبار الاسترجاع في القاعدة المؤقتة'),{status:503});}
  finally{if(restored)await restored.end().catch(()=>{});if(admin){if(created)await admin.query('DROP DATABASE "'+testDb+'" WITH (FORCE)').catch(async()=>{const current=await readHealthFile('backup-status.json') || {};await writeHealthFile('backup-status.json',{...current,lastVerification:{...current.lastVerification,status:'failed',cleanupRequired:true,testDatabase:testDb,message:'تعذر حذف قاعدة الاختبار المؤقتة؛ يلزم مراجعة مسؤول PostgreSQL'}}).catch(()=>{});});await admin.end().catch(()=>{});}await release();}
}
export function startBackupScheduler() {
  if(process.env.BACKUP_ENABLED!=='true')return;
  const tick=async()=> {let delay=3600000;try{const state=await readHealthFile('backup-status.json');const age=Date.now()-Date.parse(state?.lastSuccess?.createdAt || '1970-01-01');const attemptAge=Date.now()-Date.parse(state?.lastAttempt?.at || '1970-01-01');if(age>=86400000&&attemptAge>=3600000)await runBackup();else if(age<86400000)delay=Math.max(60000,86400000-age);}catch{}setTimeout(tick,delay).unref();};setTimeout(tick,60000).unref();
}
