import { eq, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
export const identityValue=(value:unknown)=>typeof value==='string'?value.trim().toLowerCase():'';
export type AccountIdentity={owner:string;companyId:string;kind:'employee'|'admin'|'master'|'root';id?:string;username:string;email:string;legacyName?:string;phone?:string};
export const identityAliases=(account:AccountIdentity)=>[...new Set([identityValue(account.username),identityValue(account.email)].filter(Boolean))];
export function conflictingIdentity(incoming:AccountIdentity[],current:AccountIdentity[],all:AccountIdentity[]) {
 const before=new Map(current.map(a=>[a.owner,a]));
 const others=all.filter(a=>!current.some(c=>c.owner===a.owner));
 for(const account of incoming){const previous=before.get(account.owner);for(const value of identityAliases(account)){
  const unchanged=previous && identityAliases(previous).includes(value);
  const collision=[...others,...incoming.filter(a=>a.owner!==account.owner)].some(a=>identityAliases(a).includes(value));
  if(collision && !unchanged)return value;
 }}return null;
}
export function resolveIdentity(accounts:AccountIdentity[],input:unknown,kind:'employee'|'admin') {
 const normalized=identityValue(input);if(!normalized)return null;
 // A username/email always outranks legacy display-name or phone aliases. Ambiguity fails closed.
 let matches=accounts.filter(a=>identityAliases(a).includes(normalized));
 if(!matches.length)matches=accounts.filter(a=>identityValue(a.legacyName)===normalized || (kind==='employee'&&identityValue(a.phone)===normalized));
 if(matches.length!==1)return null;const account=matches[0];return (kind==='employee'?account.kind==='employee':account.kind!=='employee')?account:null;
}
export const employeeIdentities=(companyId:string,employees:any[]):AccountIdentity[]=>employees.map(e=>({owner:'employee:'+companyId+':'+String(e.id),companyId,kind:'employee',id:String(e.id),username:identityValue(e.username),email:identityValue(e.email),legacyName:identityValue(e.name),phone:identityValue(e.phone)}));
export const adminIdentity=(row:any):AccountIdentity=>({owner:'admin:'+row.id,companyId:row.companyId || 'default',kind:'admin',id:String(row.id),username:identityValue(row.username),email:identityValue(row.email),legacyName:identityValue(row.name)});
export const masterIdentity=(row:any):AccountIdentity=>({owner:'master:'+row.id,companyId:row.id,kind:'master',username:identityValue(row.adminUsername),email:identityValue(row.adminEmail)});
export async function identityLock(tx:any){await tx.execute(sql`SELECT pg_advisory_xact_lock(101, 101)`);}
export async function allIdentities(executor:any):Promise<AccountIdentity[]> {
 const [rows,admins,companies]=await Promise.all([
 executor.execute(sql`SELECT key, COALESCE(jsonb_agg(jsonb_build_object('id', employee->>'id','username',employee->>'username','email',employee->>'email','name',employee->>'name','phone',employee->>'phone')) FILTER(WHERE employee IS NOT NULL),'[]'::jsonb) AS employees FROM ${schema.systemData} LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(value->'employees')='array' THEN value->'employees' ELSE '[]'::jsonb END) employee ON true WHERE key='mainData' OR left(key,9)='mainData_' GROUP BY key`),
 executor.select({id:schema.admins.id,companyId:schema.admins.companyId,username:schema.admins.username,email:schema.admins.email,name:schema.admins.name}).from(schema.admins),executor.select({id:schema.companies.id,adminUsername:schema.companies.adminUsername,adminEmail:schema.companies.adminEmail}).from(schema.companies)]);
 return [{owner:'root',companyId:'default',kind:'root',username:'admin',email:''},...rows.rows.flatMap((r:any)=>employeeIdentities(r.key==='mainData'?'default':r.key.slice(9),r.employees)),...admins.map(adminIdentity),...companies.filter((c:any)=>c.id!=='default').map(masterIdentity)];
}
export async function assertUnique(tx:any,incoming:AccountIdentity[],current:AccountIdentity[]=[]) {
 if(incoming.length===current.length && incoming.every(a=>current.some(c=>c.owner===a.owner && JSON.stringify(identityAliases(c).sort())===JSON.stringify(identityAliases(a).sort()))))return;
 const conflict=conflictingIdentity(incoming,current,await allIdentities(tx));
 const pending=await tx.select().from(schema.registrationRequests).where(eq(schema.registrationRequests.status,'pending'));
 for(const account of incoming)for(const value of identityAliases(account)){if(current.some(c=>c.owner===account.owner && identityAliases(c).includes(value)))continue;if(pending.some((r:any)=>identityValue(r.username)===value && !(account.kind==='employee' && r.companyId===account.companyId)))throw Object.assign(new Error('اسم المستخدم محجوز في طلب حساب قيد المراجعة'),{status:409,code:'IDENTITY_CONFLICT'});}
 if(conflict)throw Object.assign(new Error('اسم المستخدم أو البريد مستخدم بالفعل؛ اختر بيانات دخول مختلفة'),{status:409,code:'IDENTITY_CONFLICT'});
}
export async function migrateCompanyCodes(db:any) {
 await db.transaction(async(tx:any)=>{await identityLock(tx);const marker=await tx.select().from(schema.systemData).where(eq(schema.systemData.key,'companyCodesV1')).limit(1);if(marker.length)return;
 const companies=await tx.select().from(schema.companies).orderBy(schema.companies.createdAt,schema.companies.id);let next=102;
 for(const company of companies)await tx.update(schema.companies).set({companyCode:company.id==='default'?'101':String(next++)}).where(eq(schema.companies.id,company.id));
 await tx.insert(schema.systemData).values({key:'companyCodesV1',value:{next}});
 });
}
export async function nextCompanyCode(tx:any) {
 const rows=await tx.select().from(schema.systemData).where(eq(schema.systemData.key,'companyCodesV1')).limit(1);const next=Math.max(102,Number(rows[0]?.value?.next)||102);
 await tx.update(schema.systemData).set({value:{next:next+1},updatedAt:new Date()}).where(eq(schema.systemData.key,'companyCodesV1'));return String(next);
}
