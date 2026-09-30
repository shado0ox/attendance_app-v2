import { formatMinutes, formatPunch } from './attendanceReport';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export interface AttendancePrintOptions {
  companyName: string;
  days: any[];
  period: string;
  approvedAt?: string;
  approvedBy?: string;
}
export function attendancePrintHtml({ companyName, days, period, approvedAt, approvedBy }: AttendancePrintOptions) {
  const total = days.reduce((sum, day) => sum + (day.minutes || 0), 0);
  const incomplete = days.filter(day => day.analysis ? day.analysis.needsReview : day.minutes === null).length;
  const analyzed = days.some(day => day.analysis);
  const analysisTotals = analyzed ? `<span>غياب: ${days.filter(day => day.analysis?.absent).length}</span><span>أيام تأخير: ${days.filter(day => day.analysis?.lateMinutes > 0).length}</span><span>دقائق التأخير: ${days.reduce((sum, day) => sum + (day.analysis?.lateMinutes || 0), 0)}</span><span>إضافي محتمل بالدقائق: ${days.reduce((sum, day) => sum + (day.analysis?.overtimeMinutes || 0), 0)}</span>` : '';
  const employees = new Set(days.map(day => day.empId)).size;
  const rows = days.map(day => {
    const weekday = new Date(day.date + 'T12:00:00Z').toLocaleDateString('ar-SA', { weekday: 'long', timeZone: 'Asia/Riyadh' });
    return `<tr>${[day.date, weekday, day.empName, day.departmentName || day.dept, formatPunch(day.first), formatPunch(day.last), formatMinutes(day.minutes), day.first?.location || 'غير مسجل', day.last?.location || 'غير مسجل', day.reportStatus, day.note || '', ...(analyzed ? [day.analysis ? `${day.analysis.status}؛ تأخير: ${day.analysis.lateMinutes ?? '—'} د؛ مبكر: ${day.analysis.earlyMinutes ?? '—'} د؛ إضافي محتمل: ${day.analysis.overtimeMinutes ?? '—'} د` : 'غير محلل'] : [])].map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`;
  }).join('');
  const approval = approvedAt ? `<p>نسخة معتمدة — المسؤول: ${escapeHtml(approvedBy)} — تاريخ الاعتماد: ${escapeHtml(new Date(approvedAt).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }))}</p>` : '<p>كشف للمراجعة — غير معتمد</p>';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(companyName)} — كشف الحضور</title><style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; } body { margin: 0; color: #172b3a; font-family: Tahoma, Arial, sans-serif; font-size: 12px; }
  header { border-bottom: 2px solid #0369a1; margin-bottom: 12px; padding-bottom: 8px; } h1 { font-size: 22px; margin: 0 0 8px; } h2 { font-size: 17px; margin: 0; } p { margin: 7px 0; }
  .summary { display: flex; flex-wrap: wrap; gap: 18px; margin: 12px 0; font-weight: bold; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 11px; } th, td { border: 1px solid #64748b; padding: 7px 4px; text-align: right; overflow-wrap: anywhere; }
  th { background: #e0f2fe; } thead { display: table-header-group; } tr { break-inside: avoid; page-break-inside: avoid; }
  .signatures { display: flex; justify-content: space-between; gap: 25px; margin-top: 25px; break-inside: avoid; } .signatures div { flex: 1; line-height: 2.5; }
  .instruction { background: #f1f5f9; padding: 12px; margin-bottom: 12px; }
  @media print { .instruction { display: none; } th { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style></head><body><div class="instruction">للطباعة أو حفظ PDF استخدم أمر الطباعة في المتصفح، واختر ورق A4 بالعرض. قد يمتد الكشف إلى أكثر من صفحة للحفاظ على وضوح الكتابة.</div>
  <header><h1>${escapeHtml(companyName || 'الشركة')}</h1><h2>كشف الحضور والانصراف</h2><p>الفترة: ${escapeHtml(period)}</p>${approval}</header>
  <div class="summary"><span>الموظفون: ${employees}</span><span>${analyzed ? 'أيام الموظفين في الكشف' : 'أيام الموظفين المسجلة'}: ${days.length}</span><span>إجمالي مدة العمل: ${escapeHtml(formatMinutes(total))}</span><span>أيام تحتاج مراجعة: ${incomplete}</span>${analysisTotals}</div>
  <table><thead><tr>${['التاريخ', 'اليوم', 'الموظف', 'القسم', 'أول حضور', 'آخر انصراف', 'مدة العمل', 'مكان الحضور', 'مكان الانصراف', 'الحالة', 'ملاحظات', ...(analyzed ? ['تحليل الدوام'] : [])].map(title => `<th>${title}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  <p>مدة العمل من أول حضور إلى آخر انصراف وتشمل الفواصل بين الفترات. البصمات المكررة والوسيطة مستبعدة، والأيام الناقصة لا تدخل في إجمالي المدة. ${analyzed ? 'التحليل حسب الجدول الحالي؛ الغياب بعد انتهاء الدوام فقط والسماح يُخصم من التأخير. الإضافي المحتمل بعد نهاية الدوام يحتاج اعتمادًا منفصلًا، ودوام الفترتين يحتاج مراجعة بصمات الفترات.' : 'الكشف يعرض الأيام المسجلة فقط؛ لا يحسب الغياب أو التأخير من جدول الدوام.'}</p>
  <div class="signatures"><div>توقيع الموظف: ................................<br>التاريخ: ................................</div><div>مراجعة المسؤول: ................................<br>التاريخ: ................................</div><div>اعتماد الإدارة: ................................<br>التاريخ: ................................</div></div></body></html>`;
}
export function printAttendance(options: AttendancePrintOptions, target?: Window) {
  const preview = target || window.open('', '_blank');
  if (!preview) return false;
  preview.opener = null;
  preview.document.write(attendancePrintHtml(options));
  preview.document.close();
  preview.focus();
  // The preview remains available after closing the print dialog.
  setTimeout(() => { if (!preview.closed) preview.print(); }, 250);
  return true;
}
