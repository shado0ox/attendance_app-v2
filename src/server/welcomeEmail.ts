import { validEmployeeEmail } from '../lib/employeeDirectory';
export { validEmployeeEmail } from '../lib/employeeDirectory';
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function welcomePayload(employee: { name: string; email: string; username?: string }, company: string, env: NodeJS.ProcessEnv = process.env) {
  if (!validEmployeeEmail(employee.email)) throw new Error('بريد الموظف غير صحيح');
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) throw new Error('يلزم ضبط RESEND_API_KEY وRESEND_FROM على السيرفر');
  let url: URL;
  try { url = new URL(env.APP_URL || ''); } catch { throw new Error('يلزم ضبط APP_URL على رابط البرنامج الصحيح'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('رابط البرنامج يجب أن يستخدم HTTPS');
  const text = `مرحبًا ${employee.name}،\nأهلًا بك في برنامج الحضور وجدول الدوام — ${company}.\nيمكنك عرض جدولك وشيفتاتك، وتسجيل الحضور والانصراف بالبصمة وفق إعدادات الشركة والمواقع المسموحة، وإرسال طلب تعديل دوام للمراجعة والاعتماد من الإدارة.\nرابط البرنامج: ${url.href}\nاسم المستخدم: ${employee.username || employee.name}\nاستخدم بيانات الدخول التي استلمتها من الإدارة.\nتثبيت البرنامج على آيفون: افتح الرابط في Safari، ثم مشاركة، ثم إضافة إلى الشاشة الرئيسية (قد تكون داخل المزيد)، ثم إضافة.\nأندرويد: افتح الرابط في Chrome، ثم قائمة ⋮، ثم تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.\nبعد التثبيت افتح البرنامج من الأيقونة، واسمح بالموقع عند تسجيل البصمة. يلزم فتح البرنامج لتسجيل الحضور والانصراف؛ التثبيت وحده لا يسجل بصمة.\nإذا تعذر الدخول، تواصل مع إدارة الشركة.`;
  return { from: env.RESEND_FROM, to: [employee.email], subject: 'مرحبًا بك في برنامج الحضور وجدول الدوام', text,
    html: `<div lang="ar" dir="rtl" style="font-family:Arial,sans-serif;line-height:1.9;color:#183044;padding:24px;max-width:640px;margin:auto"><h2>مرحبًا بك 👋</h2>${text.split('\n').map(line => `<p>${escape(line)}</p>`).join('')}<a href="${escape(url.href)}" style="background:#01696f;color:white;padding:12px 24px;text-decoration:none;border-radius:8px">فتح برنامج الحضور</a></div>` };
}

export async function deliverWelcome(payload: ReturnType<typeof welcomePayload>, key: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(response.status === 429 ? 'خدمة البريد مشغولة، حاول لاحقًا' : 'رفضت خدمة البريد الإرسال؛ راجع المفتاح وعنوان الإرسال والدومين الموثق');
  const result = await response.json();
  if (!result.id) throw new Error('لم تؤكد خدمة البريد قبول الرسالة');
  return String(result.id);
}
