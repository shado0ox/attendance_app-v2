import { useEffect, useState } from 'react';
import { isValidLocation } from '../lib/attendanceLocations';

export default function AttendanceLocationsEditor({ settings, onSave }: {
  settings: any; onSave: (settings: any) => Promise<boolean>;
}) {
  const [locations, setLocations] = useState<any[]>(settings?.attendanceLocations || []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!dirty) setLocations(settings?.attendanceLocations || []);
  }, [settings?.attendanceLocations, dirty]);
  const update = (id: string, patch: any) => {
    setDirty(true); setMessage('');
    setLocations(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
  };
  return <section className="p-6 bg-white border border-sky-100 rounded-2xl shadow-sm flex flex-col gap-4">
    <h3 className="font-extrabold text-sm">مواقع بصمة الفروع لنفس الشركة</h3>
    <p className="text-xs text-slate-600">المقر الرئيسي يظل معتمدًا. يمكن للموظف تسجيل الحضور داخل أي فرع مفعّل، ويطبق شرط الانصراف داخل الموقع على جميع المواقع المعتمدة.</p>
    {locations.map((location, index) => <div key={location.id} className="border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <strong className="text-sm">الموقع {index + 1}</strong>
        <button disabled={saving} className="text-rose-600 text-xs" onClick={() => {
          if (!window.confirm('حذف موقع هذا الفرع؟ لن يتم تطبيق الحذف إلا عند الحفظ.')) return;
          setDirty(true); setLocations(items => items.filter(item => item.id !== location.id));
        }}>حذف الموقع</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="text-xs">اسم الفرع<input disabled={saving} className="border rounded-lg p-2 w-full mt-1" value={location.name || ''} onChange={e => update(location.id, { name: e.target.value })} /></label>
        {(['lat', 'lng', 'radius'] as const).map(key => <label key={key} className="text-xs">
          {{ lat: 'خط العرض', lng: 'خط الطول', radius: 'النطاق بالمتر' }[key]}
          <input disabled={saving} type="number" step={key === 'radius' ? '1' : 'any'} dir="ltr" className="border rounded-lg p-2 w-full mt-1" value={location[key] ?? ''} onChange={e => update(location.id, { [key]: e.target.value })} />
        </label>)}
      </div>
      <div className="flex gap-4 items-center text-xs">
        <label><input disabled={saving} type="checkbox" checked={location.enabled !== false} onChange={e => update(location.id, { enabled: e.target.checked })} /> موقع مفعّل للبصمة</label>
        <button disabled={saving} className="text-sky-700 underline" onClick={() => {
          if (!navigator.geolocation) { setMessage('المتصفح لا يدعم تحديد الموقع'); return; }
          navigator.geolocation.getCurrentPosition(pos => update(location.id, { lat: pos.coords.latitude, lng: pos.coords.longitude }), () => setMessage('تعذر تحديد الموقع، راجع إذن المتصفح.'), { enableHighAccuracy: true, timeout: 12000 });
        }}>استخدام موقعي الحالي</button>
      </div>
    </div>)}
    {!locations.length && <p className="text-xs text-slate-500">لا توجد مواقع فروع إضافية.</p>}
    <div className="flex gap-3">
      <button disabled={saving} className="border rounded-lg px-4 py-2 text-sm" onClick={() => {
        setDirty(true); setLocations(items => [...items, { id: 'branch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9), name: '', lat: '', lng: '', radius: 150, enabled: true }]);
      }}>إضافة موقع فرع</button>
      <button disabled={saving || !dirty} className="bg-sky-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50" onClick={async () => {
        if (locations.some(item => !item.name?.trim() || !isValidLocation(item))) { setMessage('أدخل اسم كل فرع وإحداثيات صحيحة ونطاقًا أكبر من صفر.'); return; }
        setSaving(true);
        try {
          const next = locations.map(item => ({ ...item, name: item.name.trim(), lat: Number(item.lat), lng: Number(item.lng), radius: Number(item.radius) }));
          if (await onSave({ ...settings, attendanceLocations: next })) { setDirty(false); setMessage('تم حفظ مواقع الفروع بنجاح.'); }
          else setMessage('لم يتم الحفظ. راجع رسالة الخطأ أعلى الصفحة وأعد المحاولة.');
        } finally { setSaving(false); }
      }}>{saving ? 'جاري الحفظ...' : 'حفظ مواقع الفروع'}</button>
    </div>
    {message && <p role="status" className="text-xs font-bold">{message}</p>}
  </section>;
}
