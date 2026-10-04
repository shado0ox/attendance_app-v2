import { coverage, planningDates, requirements, shiftPeriods } from './schedulePlanning';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const chunk = <T,>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
const time = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const hoursLabel = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
const weekday = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('ar-SA', { weekday: 'long', timeZone: 'Asia/Riyadh' });
function period(start: string, end: string) {
  const a = time(start), b = time(end);
  return a === null || b === null || a === b ? null : { minutes: (b - a + 1440) % 1440, overnight: b < a };
}
export function shiftPrintInfo(shift: any) {
  if (!shift) return { minutes: null, times: 'مواعيد غير معروفة' };
  const first = period(shift.start, shift.end);
  const second = shift.type === 'double' ? period(shift.start2, shift.end2) : undefined;
  const label = (start: string, end: string, p: ReturnType<typeof period>) => p ? `${start} - ${end}${p.overnight ? ' (نهاية في اليوم التالي)' : ''}` : 'مواعيد ناقصة / غير صحيحة';
  return {
    minutes: first && (shift.type !== 'double' || second) ? first.minutes + (second?.minutes || 0) : null,
    times: label(shift.start, shift.end, first) + (shift.type === 'double' ? ` / ${label(shift.start2, shift.end2, second)}` : '')
  };
}
export interface SchedulePrintOptions {
  companyName: string; logoDataUrl?: string; departments: any[]; employees: any[];
  shiftTypes: any[]; schedule: any; month: string; exportedAt?: Date; publicationLabel?: string;
}
export function schedulePrintHtml(o: SchedulePrintOptions) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(o.month)) throw new Error('اختر شهراً صحيحاً للتصدير');
  const [year, month] = o.month.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const dates = planningDates(o.month + '-01', last);
  if (!o.departments.length) throw new Error('اختر قسماً للتصدير');
  const title = `${o.companyName || 'الشركة'} - جدول الدوام ${o.month}`;
  const stamp = (o.exportedAt || new Date()).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh', numberingSystem: 'latn' });
  const logo = /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(o.logoDataUrl || '') ? `<img class="logo" src="${o.logoDataUrl}" alt="شعار الشركة">` : '';
  const pages: string[] = [];
  const byId = new Map(o.shiftTypes.map(s => [s.id, s]));
  const table = (head: string[], rows: string, extra = '') => `<table ${extra}>${extra.includes('notes') ? '<colgroup><col style="width:12%"><col style="width:9%"><col style="width:19%"><col style="width:17%"><col style="width:43%"></colgroup>' : ''}<thead><tr>${head.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  const row = (values: unknown[]) => `<tr>${values.map(v => `<td>${escape(v)}</td>`).join('')}</tr>`;
  const add = (dept: any, subtitle: string, body: string) => pages.push(`<section class="page"><header>${logo}<div><h1>${escape(o.companyName || 'الشركة')}</h1><h2>جدول الدوام والشيفتات - ${escape(dept.name)}</h2>${o.publicationLabel ? `<p><strong>${escape(o.publicationLabel)}</strong></p>` : ''}<p>الشهر: <b dir="ltr">${escape(o.month)}</b> · ${escape(subtitle)}</p></div></header>${body}<div class="section-footer">${escape(dept.name)} · ${escape(o.month)} · جزء التقرير ${pages.length + 1}</div></section>`);
  for (const dept of o.departments) {
    const staff = o.employees.filter(e => e.dept === dept.id);
    const summaries = staff.map(e => {
      const totals = { work: 0, morning: 0, evening: 0, rest: 0, missing: 0, unknown: 0, invalid: 0, minutes: 0 };
      for (const date of dates) {
        const entry = o.schedule[date]?.[e.id], id = entry?.shiftType;
        if (!id) { totals.missing++; continue; }
        if (['A', 'OFF'].includes(id)) { totals.rest++; continue; }
        const shift = byId.get(id);
        if (!shift) { totals.unknown++; continue; }
        totals.work++;
        for (const p of shiftPeriods(shift)) totals[p]++;
        const info = shiftPrintInfo(shift);
        if (info.minutes === null) totals.invalid++; else totals.minutes += info.minutes;
      }
      return { e, totals };
    });
    const totalMinutes = summaries.reduce((n,s) => n + s.totals.minutes,0);
    const missing = summaries.reduce((n,s) => n + s.totals.missing,0);
    const unknown = summaries.reduce((n,s) => n + s.totals.unknown + s.totals.invalid,0);
    for (const group of chunk(summaries.length ? summaries : [{ e: null, totals: null }], 12)) {
      add(dept, 'ملخص توزيع الموظفين للمراجعة', `<div class="cards"><span>الموظفون: ${staff.length}</span><span>ساعات مخططة معلومة: <b dir="ltr">${hoursLabel(totalMinutes)}</b></span><span>خانات غير مجدولة: ${missing}</span><span>تعيينات تحتاج مراجعة: ${unknown}</span></div><p class="notice">نسخة للمراجعة وليست اعتماداً للجدول. الساعات مخططة حسب مواعيد الشيفتات، وليست ساعات حضور فعلية. الشيفت المزدوج يُحسب يوماً واحداً للعمل وفترة في كل من الصباح والمساء. المواعيد الناقصة والتعيينات غير المعروفة لا تدخل في إجمالي الساعات.</p>${table(['الموظف','أيام العمل','صباحي','مسائي','راحة / إجازة','غير مجدول','تحتاج مراجعة','ساعات مخططة'], group.map(({e,totals:t}) => e ? row([e.name,t.work,t.morning,t.evening,t.rest,t.missing,t.unknown+t.invalid,hoursLabel(t.minutes)]) : row(['لا يوجد موظفون بالقسم','','','','','','',''])).join(''))}<div class="signatures"><span>إعداد: ................................</span><span>مراجعة: ................................</span><span>اعتماد الإدارة: ................................</span></div>`);
    }
    const used = o.shiftTypes.filter(s => !['A', 'OFF'].includes(s.id) && dates.some(d => staff.some(e => o.schedule[d]?.[e.id]?.shiftType === s.id)));
    for (const group of chunk(used.length ? used : [null], 10)) {
      add(dept, 'دليل الشيفتات ومواعيد العمل', table(['الرمز','الشيفت','التصنيف','مواعيد الفترات','مدة العمل'],group.map(s => {
        if (!s) return row(['—','لا توجد شيفتات عمل معينة','','','']);
        const info = shiftPrintInfo(s);
        return row([s.id,s.name,shiftPeriods(s).map(p=>p==='morning'?'صباحي':'مسائي').join(' + ') || 'غير مصنف',info.times,info.minutes===null?'تحتاج مراجعة':hoursLabel(info.minutes)]);
      }).join('')) + '<p class="notice">راحة / إجازة = تعيين صريح A أو OFF. غير مجدول = خانة فارغة، ولا تعتبر إجازة. علامة «ملاحظة» تشير إلى التفاصيل في ملحق الملاحظات. الشيفت الممتد بعد منتصف الليل ينتمي لتاريخ بدايته.</p>');
    }
    for (const employees of chunk(staff, 6)) for (const days of chunk(dates, 4)) {
      const rows = days.map(date => `<tr class="${new Date(date+'T12:00:00Z').getUTCDay()===5?'friday':''}"><td><b dir="ltr">${date}</b><br>${escape(weekday(date))}</td>${employees.map(e=> {
        const entry=o.schedule[date]?.[e.id], id=entry?.shiftType;
        const shift=byId.get(id);
        const rest=['A','OFF'].includes(id);
        const label=!id?'غير مجدول':rest?'راحة / إجازة':shift?.name || `شيفت غير معروف (${id})`;
        const kind = rest?'rest':shiftPeriods(shift).length===2?'double':shiftPeriods(shift)[0] || 'missing';
        return `<td class="${kind}"><strong>${escape(label)}</strong>${shift&&!rest?`<div class="times" dir="ltr">${escape(shiftPrintInfo(shift).times).replace(' / ', '<br>')}</div>`:''}${entry?.note?'<div class="note-mark">ملاحظة - راجع الملحق</div>':''}</td>`;
      }).join('')}</tr>`).join('');
      add(dept, `التوزيع اليومي · ${days[0]} إلى ${days[days.length-1]}`, `<p class="notice">الجدول مقسم حسب الأيام والموظفين للحفاظ على وضوح القراءة. تفاصيل الملاحظات في الملحق.</p>${table(['التاريخ / اليوم',...employees.map(e=>e.name)],rows,'class="matrix"')}<p class="legend">صباحي: أخضر · مسائي: أزرق · مزدوج: كهرماني · راحة / إجازة: رمادي · الخانات غير المجدولة تحتاج تعييناً.</p>`);
    }
    const coverRows = dates.map(date=> {
      const counts=coverage(staff,o.shiftTypes,o.schedule,date),need=requirements(dept,date);
      const any=staff.filter(e=>shiftPeriods(byId.get(o.schedule[date]?.[e.id]?.shiftType)).length).length;
      const gaps: string[]=[];
      if(counts.morning<need.morning) gaps.push('نقص صباحي');
      if(counts.evening<need.evening) gaps.push('نقص مسائي');
      if(any<need.any) gaps.push('نقص الجمعة الجزئي');
      return {date,values:[date,weekday(date),counts.morning,counts.evening,need.any?'موظف واحد بأي فترة':`${need.morning} صباحي / ${need.evening} مسائي`,gaps.join('، ') || 'مكتملة حسب إعدادات القسم']};
    });
    for(const days of chunk(coverRows,12)) add(dept,'مراجعة التغطية اليومية', '<p class="notice">التغطية حسب احتياج القسم وسياسة الجمعة المحفوظة. هذا الفحص يعدّ الموظفين حسب تصنيف الشيفت؛ لا يضمن التغطية الدقيقة لكل ساعة.</p>'+table(['التاريخ','اليوم','صباحي','مسائي','المطلوب','نتيجة المراجعة'],days.map(d=>row(d.values)).join('')));
    const notes: {date:string;name:string;shift:string;note:string}[]=[];
    for(const date of dates) for(const e of staff) {
      const entry=o.schedule[date]?.[e.id];
      if(entry?.note) notes.push({date,name:e.name,shift:byId.get(entry.shiftType)?.name || (['A','OFF'].includes(entry.shiftType)?'راحة / إجازة':entry.shiftType || 'غير مجدول'),note:entry.note});
    }
    if(notes.length) add(dept,'ملحق الملاحظات التفصيلي',table(['التاريخ','اليوم','الموظف','التعيين','الملاحظة كاملة'],notes.map(n=>row([n.date,weekday(n.date),n.name,n.shift,n.note])).join(''),'class="notes"').replace('<thead>', `<thead><tr><th colspan="5">${escape(o.companyName)} - ${escape(dept.name)} - ${escape(o.month)} - متابعة الملاحظات</th></tr>`)+'<p>نهاية ملاحظات القسم.</p>');
  }
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escape(title)}</title><style>
    @page { size:A4 landscape; margin:10mm 11mm 13mm; @bottom-center { content: "صفحة " counter(page) " من " counter(pages); font-family:Tahoma,Arial,sans-serif; font-size:9pt; } }
    *{box-sizing:border-box} body{margin:0;font:12px Tahoma,Arial,sans-serif;color:#142d42;background:#e9eef3} h1{font-size:23px;margin:0 0 5px} h2{font-size:18px;margin:0} p{line-height:1.7;margin:8px 0} header{display:flex;align-items:center;gap:15px;border-bottom:2px solid #1672a5;padding-bottom:10px;margin-bottom:12px} .logo{width:62px;height:62px;object-fit:contain} .page{background:white;padding:12mm;width:297mm;margin:15px auto;break-before:page;page-break-before:always}.page:first-of-type{break-before:auto;page-break-before:auto}
    table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:13px} th,td{border:1px solid #91a5b7;padding:8px 6px;text-align:center;overflow-wrap:anywhere;white-space:pre-wrap;line-height:1.55} th{background:#e7f2fa;color:#174567;font-weight:bold} thead{display:table-header-group} tr{break-inside:avoid;page-break-inside:avoid} .matrix td{padding:8px 5px}.matrix th:first-child{width:112px}.times{font-size:12px;margin-top:5px;line-height:1.7}.morning{background:#edf8f0}.evening{background:#eef3ff}.double{background:#fff5df}.rest{background:#f1f3f5;color:#536273}.missing{color:#a54421}.note-mark{font-size:10px;color:#475569;margin-top:4px}.friday td:first-child{background:#edf1f7}.notice{background:#f4f7fb;padding:9px 12px;border-right:3px solid #327aa2;color:#43576a}.cards{display:flex;gap:20px;flex-wrap:wrap;margin:12px 0;font-weight:bold}.signatures{display:flex;justify-content:space-between;margin-top:24px;gap:15px;break-inside:avoid}.legend{color:#43576a}.section-footer{border-top:1px solid #ccd8e3;padding-top:7px;margin-top:16px;font-size:10px;color:#60748a}.notes th:nth-child(5){width:43%}.notes td{text-align:right}.notes td:last-child{white-space:pre-wrap}.toolbar{position:sticky;top:0;padding:14px;background:#173f5c;color:white;text-align:center;z-index:2}.toolbar button{font:inherit;background:white;color:#173f5c;border:0;border-radius:6px;padding:9px 16px;cursor:pointer}.export-stamp{font-size:10px;color:#627488;text-align:center;margin:10px} @media print{body{background:white}.page{width:auto;margin:0;padding:0}.toolbar{display:none}th,td,.notice{print-color-adjust:exact;-webkit-print-color-adjust:exact}.export-stamp{break-inside:avoid}}
    </style></head><body><div class="toolbar"><button id="print-report" type="button">طباعة / حفظ كملف PDF</button> اختر حفظ بصيغة PDF وورق A4 بالعرض. التقرير قابل للبحث ويحتفظ بوضوح النصوص.</div>${pages.join('')}<p class="export-stamp">تاريخ إعداد النسخة: ${escape(stamp)} - توقيت الرياض. البيانات حسب الجدول المتاح وقت التصدير.</p></body></html>`;
}
export function printSchedule(options: SchedulePrintOptions) {
  // Generate before opening so invalid input does not leave an empty tab.
  const html = schedulePrintHtml(options);
  const preview = window.open('', '_blank');
  if (!preview) return false;
  preview.opener = null;
  preview.document.write(html);
  preview.document.close();
  preview.document.getElementById('print-report')?.addEventListener('click', () => preview.print());
  preview.focus();
  // Keep the review visible; the administrator chooses when to print/save it.
  return true;
}
