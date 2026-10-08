import crypto from 'crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.ts';

type Auth = { role: 'superadmin'|'admin'|'employee'; companyId: string; id?: string|number; name?: string; username?: string };

const tokenHash = (token:string) => crypto.createHash('sha256').update(token).digest('hex');
const makeToken = () => crypto.randomBytes(32).toString('base64url');
const clean = (v:unknown, max=5000) => typeof v === 'string' ? v.trim().slice(0,max) : '';
const escapeHtml = (v:unknown) => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch] as string));
const typeLabel = (v:string) => ({temporary_exit:'استئذان (خروج مؤقت)',early_exit:'خروج مبكر',late_arrival:'تأخير عن الدوام',absence:'غياب عن الدوام'}[v] || v);
const statusLabel = (v:string) => ({employee_signed:'موقّع من الموظف',pending_manager:'بانتظار اعتماد المدير',approved:'معتمد',rejected:'مرفوض',cancelled:'ملغي'}[v] || v);

const validDate = (value:unknown) => {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const validTime = (value:unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const validPngDataUrl = (value:unknown) =>
  typeof value === 'string' &&
  value.length <= 500000 &&
  /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value);

const normalizeForm = (form:any) => {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return { error: 'بيانات الطلب غير صالحة' };

  const requestType = clean(form.requestType, 30);
  const absenceType = clean(form.absenceType, 20);
  const date = clean(form.date, 10);
  const reason = clean(form.reason, 2000);
  const exitTime = clean(form.exitTime, 5);
  const expectedReturnTime = clean(form.expectedReturnTime, 5);
  const actualAttendanceTime = clean(form.actualAttendanceTime, 5);
  const absenceFrom = clean(form.absenceFrom, 10);
  const absenceTo = clean(form.absenceTo, 10);

  if (!validDate(date) || !reason) return { error: 'التاريخ وسبب الطلب مطلوبان وبصيغة صحيحة' };
  if (!['temporary_exit', 'early_exit', 'late_arrival', 'absence'].includes(requestType)) return { error: 'نوع الطلب غير صالح' };

  if (requestType === 'temporary_exit' || requestType === 'early_exit') {
    if (!validTime(exitTime) || !validTime(expectedReturnTime)) return { error: 'وقت الخروج ووقت العودة المتوقع مطلوبان وبصيغة صحيحة' };
  }

  if (requestType === 'late_arrival' && !validTime(actualAttendanceTime)) {
    return { error: 'وقت الحضور الفعلي مطلوب وبصيغة صحيحة' };
  }

  if (requestType === 'absence') {
    if (!['annual', 'sick', 'other'].includes(absenceType)) return { error: 'نوع الغياب غير صالح' };
    if (!validDate(absenceFrom) || !validDate(absenceTo) || absenceTo < absenceFrom) {
      return { error: 'فترة الغياب مطلوبة ويجب أن تكون صحيحة' };
    }
  }

  return {
    value: {
      date,
      requestType,
      absenceType: requestType === 'absence' ? absenceType : '',
      expectedReturnTime: requestType === 'temporary_exit' || requestType === 'early_exit' ? expectedReturnTime : '',
      exitTime: requestType === 'temporary_exit' || requestType === 'early_exit' ? exitTime : '',
      actualAttendanceTime: requestType === 'late_arrival' ? actualAttendanceTime : '',
      absenceFrom: requestType === 'absence' ? absenceFrom : '',
      absenceTo: requestType === 'absence' ? absenceTo : '',
      reason,
      employeeCommitment: true,
    },
  };
};

const safeImageSrc = (value:unknown) =>
  typeof value === 'string' && /^data:image\\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
    ? value
    : '';

function finalHtml(doc:any, company:any) {
  const f=doc.formData || {};
  const companyName=company?.settings?.companyName || company?.name || 'الشركة';
  const logo=safeImageSrc(company?.settings?.logoDataUrl);
  const rows=[
    ['التاريخ',f.date],
    ['اسم الموظف',doc.employeeName],
    ['القسم',doc.departmentName || ''],
    ['نوع الطلب',typeLabel(f.requestType)],
    ...(f.absenceType ? [['نوع الغياب',({annual:'إجازة سنوية',sick:'إجازة مرضية',other:'أخرى'} as any)[f.absenceType] || f.absenceType]] : []),
    ...(f.exitTime ? [['وقت الخروج',f.exitTime]] : []),
    ...(f.expectedReturnTime ? [['وقت العودة المتوقع',f.expectedReturnTime]] : []),
    ...(f.actualAttendanceTime ? [['وقت الحضور الفعلي',f.actualAttendanceTime]] : []),
    ...(f.absenceFrom ? [['من',f.absenceFrom]] : []),
    ...(f.absenceTo ? [['إلى',f.absenceTo]] : []),
    ['سبب الطلب',f.reason]
  ];
  const rowHtml=rows.map(([a,b])=>'<tr><th>'+escapeHtml(a)+'</th><td>'+escapeHtml(b).replace(/\n/g,'<br>')+'</td></tr>').join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>نموذج استئذان</title>
  <style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#111;direction:rtl;margin:0}.page{width:100%;min-height:260mm}.head{text-align:center;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:18px}.logo{max-height:65px;max-width:180px;object-fit:contain}.company{font-size:18px;font-weight:800;margin-top:7px}.title{font-size:22px;font-weight:900;margin:20px 0;text-align:center}.meta{font-size:11px;color:#555;text-align:left}.section{font-weight:800;font-size:14px;border-right:4px solid #111;padding:5px 8px;background:#f4f4f4;margin:15px 0 8px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #aaa;padding:9px;text-align:right;vertical-align:top}th{width:28%;background:#f7f7f7}.reason{min-height:55px}.signs{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:35px}.sign{border:1px solid #aaa;min-height:125px;padding:10px}.sign h4{margin:0 0 8px}.sig{height:65px;max-width:100%;object-fit:contain;display:block;margin:auto}.decision{font-weight:800;font-size:14px;margin-top:20px}.foot{margin-top:25px;font-size:10px;color:#666;text-align:center}</style></head><body><div class="page">
  <div class="head">${logo?'<img class="logo" src="'+escapeHtml(logo)+'">':''}<div class="company">${escapeHtml(companyName)}</div></div>
  <div class="title">نموذج استئذان</div><div class="meta">رقم المستند: ${escapeHtml(doc.id)} &nbsp; | &nbsp; الإصدار: ${escapeHtml(doc.version)}</div>
  <div class="section">بيانات الطلب</div><table>${rowHtml}</table>
  <div class="section">إقرار الموظف</div><p class="reason">أقر بصحة البيانات الواردة في هذا الطلب وألتزم بما يترتب عليه، وأوافق على استخدام توقيعي الإلكتروني لإثبات تقديم الطلب.</p>
  <div class="signs"><div class="sign"><h4>توقيع الموظف</h4>${doc.employeeSignature?'<img class="sig" src="'+escapeHtml(doc.employeeSignature)+'">':''}<div>${escapeHtml(doc.employeeName)}</div></div>
  <div class="sign"><h4>اعتماد الإدارة</h4><div class="decision">القرار: معتمد</div>${doc.managerSignature?'<img class="sig" src="'+escapeHtml(doc.managerSignature)+'">':''}<div>${escapeHtml(doc.managerName)}</div></div></div>
  <div class="foot">تم إنشاء هذا المستند إلكترونيًا وحفظه ضمن ملف الموظف.</div></div></body></html>`;
}

export function registerElectronicDocumentRoutes(
  app: Express,
  requireAuth: (roles: Auth['role'][], matchCompany?: boolean) => any,
  getMainDataByCompanyId: (companyId:string)=>Promise<any>
) {
  const employeeOrAdmin = requireAuth(['employee','admin','superadmin']);
  const adminOnly = requireAuth(['admin','superadmin']);

  app.get('/api/electronic-documents', employeeOrAdmin, async (req:Request,res:Response)=>{
    const auth=(req as any).auth as Auth;
    const companyId=auth.role==='superadmin'
      ? String(req.query.companyId || 'default')
      : String(auth.companyId || 'default');
    const requestedEmployee=clean(req.query.employeeId,100);
    try {
      let rows=await db.select().from(schema.electronicDocuments)
        .where(eq(schema.electronicDocuments.companyId,companyId))
        .orderBy(desc(schema.electronicDocuments.createdAt),desc(schema.electronicDocuments.id));
      if(auth.role==='employee') rows=rows.filter(r=>String(r.employeeId)===String(auth.id));
      else {
        if(requestedEmployee) rows=rows.filter(r=>String(r.employeeId)===requestedEmployee);
        const access=(req as any).adminAccess;
        if(access?.departmentIds !== null && Array.isArray(access?.departmentIds)) {
          const mainData=await getMainDataByCompanyId(companyId);
          const allowed=new Set((mainData?.employees||[]).filter((e:any)=>access.departmentIds.includes(e.dept)).map((e:any)=>String(e.id)));
          rows=rows.filter(r=>allowed.has(String(r.employeeId)));
        }
      }
      return res.json(rows);
    } catch(error:any){return res.status(500).json({error:'تعذر تحميل المستندات الإلكترونية'});}
  });

  app.post('/api/electronic-documents', employeeOrAdmin, async (req:Request,res:Response)=>{
    const auth=(req as any).auth as Auth;
    if(auth.role!=='employee') return res.status(403).json({error:'إنشاء المستند يتم من بوابة الموظف'});
    const companyId=String(auth.companyId || req.body?.companyId || 'default');
    const data=await getMainDataByCompanyId(companyId);
    const employee=(data?.employees || []).find((e:any)=>String(e.id)===String(auth.id));
    if(!employee) return res.status(404).json({error:'الموظف غير موجود'});
    const parsed=normalizeForm(req.body?.formData);
    const signature=clean(req.body?.employeeSignature,500000);
    if ('error' in parsed || !validPngDataUrl(signature) || req.body?.formData?.employeeCommitment!==true) {
      return res.status(400).json({error: 'error' in parsed ? parsed.error : 'التوقيع الإلكتروني غير صالح'});
    }
    const form=parsed.value;
    const departmentName=(data?.departments || []).find((d:any)=>String(d.id)===String(employee.dept))?.name || 'بدون قسم';
    try {
      const [doc]=await db.insert(schema.electronicDocuments).values({
        companyId, employeeId:String(employee.id), employeeName:clean(employee.name,200), departmentName,
        documentType:'permission', status:'employee_signed', version:'1', formData:form,
        employeeSignature:signature, employeeSignedAt:new Date()
      }).returning();
      await db.insert(schema.electronicDocumentAudit).values({companyId,documentId:doc.id,actorId:String(auth.id),actorRole:auth.role,action:'employee_signed',details:{type:'permission'}});
      return res.status(201).json(doc);
    } catch(error:any){console.error('electronic document create failed',error);return res.status(500).json({error:'تعذر حفظ المستند'});}
  });

  app.post('/api/electronic-documents/:id/share', adminOnly, async (req:Request,res:Response)=>{
    const auth=(req as any).auth as Auth;
    const id=Number(req.params.id);
    try {
      const rows=await db.select().from(schema.electronicDocuments).where(eq(schema.electronicDocuments.id,id)).limit(1);
      const doc=rows[0];
      if(!doc || String(doc.companyId)!==String(auth.companyId)) return res.status(404).json({error:'المستند غير موجود'});
      const access=(req as any).adminAccess;
      if(access?.departmentIds !== null && Array.isArray(access?.departmentIds)) {
        const data=await getMainDataByCompanyId(String(doc.companyId));
        const employee=(data?.employees || []).find((e:any)=>String(e.id)===String(doc.employeeId));
        if(!employee || !access.departmentIds.includes(employee.dept)) return res.status(404).json({error:'المستند غير موجود'});
      }
      if(doc.status!=='employee_signed' && doc.status!=='pending_manager') return res.status(409).json({error:'المستند غير جاهز للإرسال للمدير'});
      const wasPending=doc.status==='pending_manager';
      const token=makeToken(), hash=tokenHash(token), expires=new Date(Date.now()+72*60*60*1000);
      await db.update(schema.electronicDocuments).set({shareTokenHash:hash,shareExpiresAt:expires,shareUsedAt:null,status:'pending_manager',updatedAt:new Date()}).where(eq(schema.electronicDocuments.id,id));
      await db.insert(schema.electronicDocumentAudit).values({companyId:String(doc.companyId),documentId:id,actorId:String(auth.id || auth.username || 'employee'),actorRole:auth.role,action:'shared_with_manager',details:{expiresAt:expires.toISOString(),reissued:wasPending}});
      const base=String(process.env.APP_URL || '').trim();
      if(!base) return res.status(500).json({error:'APP_URL غير مضبوط في إعدادات الخادم؛ لا يمكن إنشاء رابط المدير'});
      return res.json({url:`${base.replace(/\/$/,'')}/document-approval/${token}`,expiresAt:expires.toISOString()});
    } catch(error:any){return res.status(500).json({error:'تعذر إنشاء رابط المدير'});}
  });

  app.get('/api/document-approval/:token', async (req:Request,res:Response)=>{
    const hash=tokenHash(String(req.params.token||''));
    try {
      const rows=await db.select().from(schema.electronicDocuments).where(eq(schema.electronicDocuments.shareTokenHash,hash)).limit(1);
      const doc=rows[0];
      if(!doc || !doc.shareExpiresAt || doc.shareUsedAt || doc.status!=='pending_manager' || doc.shareExpiresAt.getTime()<Date.now()) return res.status(404).json({error:'الرابط غير صالح أو منتهي'});
      const company=await getMainDataByCompanyId(String(doc.companyId));
      return res.json({id:doc.id,employeeName:doc.employeeName,departmentName:doc.departmentName,documentType:doc.documentType,status:doc.status,formData:doc.formData,employeeSignature:doc.employeeSignature,companyName:company?.settings?.companyName || 'الشركة',logoDataUrl:company?.settings?.logoDataUrl || '',expiresAt:doc.shareExpiresAt});
    } catch(error:any){return res.status(500).json({error:'تعذر تحميل المستند'});}
  });

  app.post('/api/document-approval/:token', async (req:Request,res:Response)=>{
    const hash=tokenHash(String(req.params.token||'')), managerName=clean(req.body?.managerName,200), managerSignature=clean(req.body?.managerSignature,500000), decision=clean(req.body?.decision,20), reason=clean(req.body?.reason,2000);
    if(!managerName || !validPngDataUrl(managerSignature) || !['approved','rejected'].includes(decision)) return res.status(400).json({error:'أدخل اسم المدير والتوقيع والقرار بصيغة صحيحة'});
    if(decision==='rejected' && !reason) return res.status(400).json({error:'سبب الرفض مطلوب'});
    try {
      const result=await db.transaction(async tx=>{
        const rows=await tx.select().from(schema.electronicDocuments).where(eq(schema.electronicDocuments.shareTokenHash,hash)).limit(1).for('update');
        const doc=rows[0];
        if(!doc || !doc.shareExpiresAt || doc.shareUsedAt || doc.status!=='pending_manager' || doc.shareExpiresAt.getTime()<Date.now()) throw Object.assign(new Error('الرابط غير صالح أو منتهي'),{status:404});
        const company=await getMainDataByCompanyId(String(doc.companyId));
        if(decision==='rejected'){
          const [updated]=await tx.update(schema.electronicDocuments).set({status:'rejected',managerName,managerSignature,managerSignedAt:new Date(),managerDecision:'rejected',reviewReason:reason,shareUsedAt:new Date(),updatedAt:new Date()}).where(eq(schema.electronicDocuments.id,doc.id)).returning();
          await tx.insert(schema.electronicDocumentAudit).values({companyId:String(doc.companyId),documentId:doc.id,actorId:managerName,actorRole:'manager',action:'rejected',details:{reason}});
          return updated;
        }
        const updatedBase={status:'approved',managerName,managerSignature,managerSignedAt:new Date(),managerDecision:'approved',reviewReason:null,shareUsedAt:new Date(),updatedAt:new Date()};
        const preview={...doc,...updatedBase};
        const html=finalHtml(preview,company);
        const [updated]=await tx.update(schema.electronicDocuments).set({...updatedBase,finalHtml:html}).where(eq(schema.electronicDocuments.id,doc.id)).returning();
        await tx.insert(schema.electronicDocumentAudit).values({companyId:String(doc.companyId),documentId:doc.id,actorId:managerName,actorRole:'manager',action:'approved',details:{}});
        return updated;
      });
      return res.json({success:true,status:result.status,documentId:result.id,finalHtml:result.finalHtml || null});
    } catch(error:any){return res.status(error?.status || 500).json({error:error?.status?error.message:'تعذر اعتماد المستند'});}
  });

  app.post('/api/electronic-documents/:id/cancel', employeeOrAdmin, async (req:Request,res:Response)=>{
    const auth=(req as any).auth as Auth;
    const id=Number(req.params.id);
    try {
      const rows=await db.select().from(schema.electronicDocuments).where(eq(schema.electronicDocuments.id,id)).limit(1);
      const doc=rows[0];
      const ownsDocument=doc && String(doc.companyId)===String(auth.companyId) &&
        (auth.role!=='employee' || String(doc.employeeId)===String(auth.id));
      if(!ownsDocument || !['employee_signed','pending_manager'].includes(doc.status)) {
        return res.status(404).json({error:'المستند غير موجود أو لا يمكن إلغاؤه'});
      }

      await db.update(schema.electronicDocuments)
        .set({status:'cancelled',shareTokenHash:null,shareExpiresAt:null,shareUsedAt:null,updatedAt:new Date()})
        .where(eq(schema.electronicDocuments.id,id));

      await db.insert(schema.electronicDocumentAudit).values({
        companyId:String(doc.companyId),
        documentId:id,
        actorId:String(auth.id || auth.username || 'employee'),
        actorRole:auth.role,
        action:'cancelled',
        details:{},
      });

      return res.json({success:true});
    } catch(error:any) {
      return res.status(500).json({error:'تعذر إلغاء المستند'});
    }
  });

  app.post('/api/electronic-documents/:id/status', adminOnly, async (req:Request,res:Response)=>{
    const id=Number(req.params.id), status=clean(req.body?.status,30);
    if(!['cancelled'].includes(status)) return res.status(400).json({error:'الحالة المتاحة بعد الحفظ هي الإلغاء فقط'});
    try {
      const rows=await db.select().from(schema.electronicDocuments).where(eq(schema.electronicDocuments.id,id)).limit(1), doc=rows[0];
      const auth=(req as any).auth as Auth;
      if(!doc || String(doc.companyId)!==String(auth.companyId) || doc.status==='approved') return res.status(404).json({error:'المستند غير موجود أو لا يمكن تعديله'});
      const access=(req as any).adminAccess;
      if(access?.departmentIds !== null && Array.isArray(access?.departmentIds)) {
        const data=await getMainDataByCompanyId(String(doc.companyId));
        const employee=(data?.employees || []).find((e:any)=>String(e.id)===String(doc.employeeId));
        if(!employee || !access.departmentIds.includes(employee.dept)) return res.status(404).json({error:'المستند غير موجود أو لا يمكن تعديله'});
      }
      const [updated]=await db.update(schema.electronicDocuments)
        .set({status,shareTokenHash:null,shareExpiresAt:null,shareUsedAt:null,updatedAt:new Date()})
        .where(and(eq(schema.electronicDocuments.id,id),ne(schema.electronicDocuments.status,'approved')))
        .returning();
      if(!updated) return res.status(409).json({error:'تعذر الإلغاء لأن المستند تم اعتماده أو تغيّرت حالته أثناء العملية'});
      await db.insert(schema.electronicDocumentAudit).values({companyId:String(updated.companyId),documentId:id,actorId:String(auth.id || auth.username || 'admin'),actorRole:auth.role,action:'status_changed',details:{status}});
      return res.json({success:true});
    } catch(error:any){return res.status(500).json({error:'تعذر تحديث حالة المستند'});}
  });
}
