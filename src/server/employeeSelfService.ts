import crypto from 'node:crypto';
export const employeePhotoKey=(companyId:string,id:string)=>'employeePhoto_'+crypto.createHash('sha256').update(JSON.stringify([companyId,id])).digest('hex');
import { validEmployeeEmail } from '../lib/employeeDirectory';
import { normalizedEmail } from '../lib/emailVerification';
import { statusLabels, employeeStatus } from '../lib/employeeLifecycle';
export function selfProfile(employee:any, departments:any[]=[]) {
  return {id:employee.id,name:employee.name,displayName:employee.displayName || '',username:employee.username || '',phone:employee.phone || '',email:employee.email || '',photoDataUrl:employee.photoDataUrl || '',departmentName:departments.find(d=>d.id===employee.dept)?.name || 'بدون قسم',status:statusLabels[employeeStatus(employee)]};
}
export function selfProfileUpdate(body:any) {
  const fail=(message:string)=>{throw Object.assign(new Error(message),{status:400});};
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!['displayName','phone','email','photoDataUrl'].includes(key)))fail('يمكن تعديل الاسم الظاهر والجوال والبريد والصورة فقط');
  const update:any={};
  for(const [field,max] of [['displayName',100],['phone',30]] as const)if(body[field]!==undefined){if(typeof body[field]!=='string'||body[field].length>max)fail('بيانات الملف غير صحيحة');update[field]=body[field].trim();}
  if(body.email!==undefined){if(!validEmployeeEmail(normalizedEmail(body.email)))fail('أدخل بريدًا إلكترونيًا صحيحًا');update.email=normalizedEmail(body.email);}
  if(body.photoDataUrl!==undefined){
    if(typeof body.photoDataUrl!=='string')fail('الصورة غير صحيحة');
    if(body.photoDataUrl==='')update.photoDataUrl='';
    else {
      const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.photoDataUrl);
      if(!match||body.photoDataUrl.length>420000)fail('استخدم صورة PNG أو JPEG أو WebP لا تتجاوز 300 كيلوبايت');
      const bytes=Buffer.from(match![2],'base64');
      const valid=match![1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match![1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
      if(!valid||bytes.length>300*1024||bytes.toString('base64')!==match![2])fail('محتوى الصورة أو حجمها غير صحيح');
      update.photoDataUrl=body.photoDataUrl;
    }
  }
  if(!Object.keys(update).length)fail('لا توجد بيانات لحفظها');
  return update;
}
export const privateAttendanceDay=(day:any)=>({date:day.date,first:day.first?{time:day.first.time,location:day.first.location}:null,last:day.last?{time:day.last.time,location:day.last.location}:null,minutes:day.minutes,status:day.analysis?.status || day.reportStatus,absent:!!day.analysis?.absent,lateMinutes:day.analysis?.lateMinutes || 0,needsReview:!!day.analysis?.needsReview});
