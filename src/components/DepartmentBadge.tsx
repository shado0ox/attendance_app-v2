import { departmentColor, safeDepartmentLogo } from '../lib/employeeDirectory';
export default function DepartmentBadge({ department }: { department?: any }) {
  const logo = safeDepartmentLogo(department?.logoDataUrl);
  return <span className="inline-flex gap-2 items-center"><span className="w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center text-white text-xs font-bold overflow-hidden" style={{ backgroundColor: departmentColor(department?.color) }}>{logo ? <img src={logo} alt="" className="w-full h-full object-contain bg-white" /> : String(department?.name || '؟').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')}</span><span>{department?.name || 'بدون قسم'}</span></span>;
}
