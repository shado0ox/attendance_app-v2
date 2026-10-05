import { validAttendanceDate } from './attendanceMonths';
export const notificationCategories = { requests: 'طلبات الموظفين', coverage: 'تغطية الشيفتات', attendance: 'استثناءات الحضور' };
export type NotificationCategory = keyof typeof notificationCategories;
export type AdminNotification = { id: string; category: NotificationCategory; date: string; dept: string; departmentName: string; empId?: string; title: string; message: string; priority: number; read?: boolean; readAt?: string | null; target: { view: 'requests' | 'schedule' | 'exceptions'; date: string; dept: string; empId?: string }; };
export const dateOffset = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
export function parseNotificationQuery(query: Record<string, unknown>, today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10)) {
  const from = query.from ?? dateOffset(today, -6), to = query.to ?? dateOffset(today, 6);
  if (!validAttendanceDate(from) || !validAttendanceDate(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 30) throw new Error('اختر فترة صحيحة لا تتجاوز 31 يومًا');
  const category = query.category ?? '', read = query.read ?? '', dept = query.dept ?? '';
  if (typeof category !== 'string' || (category && !Object.hasOwn(notificationCategories, category)) || typeof read !== 'string' || !['', 'read', 'unread'].includes(read) || typeof dept !== 'string' || dept.length > 200) throw new Error('فلتر التنبيهات غير صحيح');
  const integer = (key: string, fallback: number, max: number) => { const value = query[key]; if (value === undefined) return fallback; if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) throw new Error('رقم الصفحة أو حجمها غير صحيح'); return Number(value); };
  return { from, to, category: category as NotificationCategory | '', read, dept, page: integer('page', 1, 100000), pageSize: integer('pageSize', 30, 100) };
}
export function notificationPage(items: AdminNotification[], state: any, query: ReturnType<typeof parseNotificationQuery>) {
  const unique = [...new Map(items.map(item => [item.id, item])).values()].map(item => ({ ...item, read: !!state?.read?.[item.id], readAt: state?.read?.[item.id] || null }));
  const unread = unique.filter(item => !item.read).length;
  const counts = Object.fromEntries(Object.keys(notificationCategories).map(category => [category, { total: unique.filter(item => item.category === category).length, unread: unique.filter(item => item.category === category && !item.read).length }]));
  const filtered = unique.filter(item => (!query.category || query.category === item.category) && (!query.read || item.read === (query.read === 'read'))).sort((a, b) => Number(a.read) - Number(b.read) || a.priority - b.priority || (a.category === 'coverage' && b.category === 'coverage' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) || a.id.localeCompare(b.id));
  const total = filtered.length, pageCount = Math.max(1, Math.ceil(total / query.pageSize)), page = Math.min(query.page, pageCount);
  return { items: filtered.slice((page - 1) * query.pageSize, page * query.pageSize), total, activeTotal: unique.length, unread, counts, page, pageCount };
}
export function updateNotificationRead(state: any, ids: unknown, read: unknown, allowedIds: Set<string>, now = Date.now()) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string' || !/^(requests|coverage|attendance)-[a-f0-9]{64}$/.test(id)) || typeof read !== 'boolean') throw new Error('حدد من 1 إلى 100 تنبيه وإجراء قراءة صحيحًا');
  if (ids.some(id => !allowedIds.has(id))) throw new Error('تنبيه خارج نطاقك أو تغيّر؛ حدّث القائمة');
  const next = { ...(state?.read || {}) };
  for (const id of ids) if (read) next[id] = new Date(now).toISOString(); else delete next[id];
  return { read: Object.fromEntries(Object.entries(next).sort((a, b) => String(b[1]).localeCompare(String(a[1]))).slice(0, 2000)) };
}
