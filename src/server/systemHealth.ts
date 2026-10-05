import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizedEmail } from '../lib/emailVerification';
import { isActiveEmployee } from '../lib/employeeLifecycle';
import { validEmployeeEmail } from '../lib/employeeDirectory';
import crypto from 'node:crypto';
export const backupDirectory = () => path.resolve(process.env.BACKUP_DIR || 'backups');
export async function readHealthFile(name: string) {
  try { const file = path.join(backupDirectory(), name); const stat = await fs.stat(file); if (stat.size > 128000) return null; return JSON.parse(await fs.readFile(file,'utf8')); } catch { return null; }
}
export async function writeHealthFile(name: string, value: any) {
  await fs.mkdir(backupDirectory(), { recursive:true, mode:0o700 });
  const file = path.join(backupDirectory(),name), temp = file + '.' + crypto.randomUUID() + '.tmp';
  try { await fs.writeFile(temp, JSON.stringify(value), {mode:0o600}); await fs.rename(temp,file); } finally { await fs.unlink(temp).catch(()=>{}); }
}
let errorQueue: Promise<void> = Promise.resolve();
export function recordOperationalError(companyId: string, route: string, method: string, status: number) {
  errorQueue = errorQueue.catch(()=>{}).then(async()=> { const old = await readHealthFile('health-errors.json'); const items = [{companyId,route,method,status,at:new Date().toISOString()},...(old?.items || [])].slice(0,100); await writeHealthFile('health-errors.json',{items}); }).catch(()=>{});
  return errorQueue;
}
export const welcomeStateKey = (companyId: string, empId: string) => 'welcomeEmail_' + crypto.createHash('sha256').update(JSON.stringify([companyId,empId])).digest('hex');
export function welcomeRetry(state: any, employee: any, now=Date.now()) {
  if (!isActiveEmployee(employee) || !validEmployeeEmail(employee.email)) return {allowed:false,reason:'حساب أو بريد الموظف يحتاج مراجعة'};
  if (normalizedEmail(state?.payload?.to?.[0]) !== normalizedEmail(employee.email)) return {allowed:false,reason:'تغير البريد؛ راجع سجل Resend قبل إعادة الإرسال'};
  if (state?.status === 'sent') return {allowed:false,reason:'سبق قبول الرسالة لدى Resend'};
  if (!Number.isFinite(state?.startedAt) || now-state.startedAt>23*3600000) return {allowed:false,reason:'انتهت نافذة منع التكرار؛ راجع Resend'};
  if (state?.status === 'sending' && now-(state.claimedAt || state.startedAt)<60000) return {allowed:false,reason:'الإرسال جارٍ'};
  return {allowed:['failed','sending'].includes(state?.status),reason:'إعادة محاولة بنفس هوية الإرسال'};
}
const mailTime = (value:any) => { const date=new Date(value || 0);return Number.isFinite(date.getTime())?date.toISOString():new Date(0).toISOString(); };
export function mailHealthRows(employees:any[], welcome:any[], verification:any[], canRetry:boolean, now=Date.now()) {
  const items:any[]=[], byId=new Map(employees.map(e=>[String(e.id),e]));
  for (const entry of welcome) {
    const employee=byId.get(entry.empId); if(!employee) continue;
    const state=entry.value, retry=welcomeRetry(state,employee,now);
    items.push({kind:'welcome',empId:String(employee.id),name:employee.name,email:employee.email || '',status:state.status==='sent'?'accepted':state.status==='sending'?'pending':'failed',at:mailTime(state.claimedAt || state.startedAt),canRetry:canRetry && retry.allowed,retryReason:retry.reason});
  }
  for(const entry of verification) {
    const employee=byId.get(entry.empId); if(!employee) continue;
    const state=entry.value;
    items.push({kind:'verification',empId:String(employee.id),name:employee.name,email:state.email || employee.email || '',status:state.delivery==='sent'?'accepted':state.delivery==='failed'?'failed':'pending',at:mailTime(state.requestedAt),canRetry:false,retryReason:'يطلب الموظف رمزًا جديدًا من حسابه؛ الرموز القديمة لا تُعاد من الإدارة'});
  }
  items.sort((a,b)=>b.at.localeCompare(a.at)||a.empId.localeCompare(b.empId));
  return {items:items.slice(0,100),total:items.length,counts:{accepted:items.filter(i=>i.status==='accepted').length,failed:items.filter(i=>i.status==='failed').length,pending:items.filter(i=>i.status==='pending').length}};
}
export async function backupHealth(now=Date.now()) {
  const state=await readHealthFile('backup-status.json'); let lastSuccess=state?.lastSuccess || null;
  if(lastSuccess && !/^attendance-[a-zA-Z0-9-]+\.dump$/.test(lastSuccess.name || '')) lastSuccess=null;
  let fileExists=false;
  if(lastSuccess) { try {const stat=await fs.stat(path.join(backupDirectory(),lastSuccess.name)); fileExists=stat.isFile() && stat.size===lastSuccess.bytes;}catch{} }
  const stale=!!lastSuccess && now-Date.parse(lastSuccess.createdAt)>36*3600000;
  return {enabled:process.env.BACKUP_ENABLED==='true',status:!lastSuccess?'missing':!fileExists?'invalid':stale?'stale':'ok',lastSuccess:lastSuccess?{name:lastSuccess.name,bytes:lastSuccess.bytes,createdAt:lastSuccess.createdAt,archiveVerified:lastSuccess.archiveVerified,sha256:lastSuccess.sha256}:null,lastAttempt:state?.lastAttempt?{status:state.lastAttempt.status,at:state.lastAttempt.at,finishedAt:state.lastAttempt.finishedAt,message:state.lastAttempt.message}:null,lastVerification:state?.lastVerification?{status:state.lastVerification.status,at:state.lastVerification.at,backupName:state.lastVerification.backupName,tables:state.lastVerification.tables,message:state.lastVerification.message,cleanupRequired:state.lastVerification.cleanupRequired,testDatabase:state.lastVerification.cleanupRequired?state.lastVerification.testDatabase:undefined}:null,localOnly:true};
}
export async function buildInfo() { try { const data=JSON.parse(await fs.readFile(path.resolve('dist/build-info.json'),'utf8')); return {id:data.id,builtAt:data.builtAt,commit:data.commit || null,entryAssets:data.entryAssets || []}; } catch {return {id:'development',builtAt:null,commit:null,entryAssets:[]};} }
