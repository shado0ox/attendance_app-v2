import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, ClipboardCheck, Bell, Users, Building2,
  Clock, Inbox, Settings, LogOut
} from 'lucide-react';

interface AdminSidebarProps {
  appSettings: any;
  admin: any;
  activeView: string;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  hasPermission: (perm: string) => boolean;
  unreadAlertsCount: number;
  pendingRequestsCount: number;
  companyId: string;
  onLogout: () => void;
}

// One nav item = one real link to /admin/<view>. Using <Link> instead of a
// setState-only button means middle-click / "open in new tab" / browser
// back-forward all behave the way people expect from a normal website.
function NavItem({
  to,
  active,
  icon,
  label,
  badge,
  onNavigate,
}: {
  to: string;
  active: boolean;
  icon: ReactNode;
  label: string;
  badge?: number;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`relative flex items-center justify-between gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all w-full ${
        active
          ? 'bg-white text-sky-800 shadow-md'
          : 'text-sky-100/90 hover:bg-white/10 hover:text-white'
      }`}
    >
      {active && <span className="absolute right-0 top-1.5 bottom-1.5 w-1 rounded-full bg-amber-400" />}
      <div className="flex items-center gap-3">
        <span className={active ? 'text-sky-600' : 'text-sky-300'}>{icon}</span>
        <span>{label}</span>
      </div>
      {!!badge && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] text-white font-extrabold font-mono shadow-sm">
          {badge}
        </span>
      )}
    </Link>
  );
}

export default function AdminSidebar({
  appSettings,
  admin,
  activeView,
  sidebarOpen,
  setSidebarOpen,
  hasPermission,
  unreadAlertsCount,
  pendingRequestsCount,
  companyId,
  onLogout,
}: AdminSidebarProps) {
  const closeMobileSidebar = () => setSidebarOpen(false);

  return (
    <>
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div
          onClick={closeMobileSidebar}
          className="fixed inset-0 z-40 bg-slate-900 bg-opacity-40 md:hidden transition-all"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 right-0 z-50 flex flex-col w-64 bg-gradient-to-b from-sky-900 via-sky-800 to-sky-900 text-white border-l border-sky-950/40 shadow-2xl transition-all md:sticky md:top-0 md:h-screen md:translate-x-0 flex-shrink-0 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        }`}
      >
        {/* Slim gold identity strip along the top edge */}
        <div className="h-1 bg-gradient-to-l from-amber-400 via-amber-300 to-sky-400" />

        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          {appSettings?.logoDataUrl ? (
            <img
              src={appSettings.logoDataUrl}
              alt="Logo"
              className="w-11 h-11 object-contain rounded-xl bg-white p-1 border border-white/20 shadow-lg"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex items-center justify-center w-11 h-11 text-lg font-black text-sky-900 bg-gradient-to-br from-amber-300 to-amber-500 rounded-xl shadow-lg ring-2 ring-white/10">
              {(appSettings?.companyName || 'د').charAt(0)}
            </div>
          )}
          <div>
            <h2 className="font-extrabold text-[15px] tracking-tight">{appSettings?.companyName || 'نظام الدوام'}</h2>
            <p className="text-[10px] text-sky-300 font-medium tracking-wide">التحكم والتقارير العامة</p>
          </div>
        </div>

        <nav className="flex-1 py-6 px-4 flex flex-col gap-6 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-amber-300/80 uppercase tracking-widest px-3 mb-1">الرئيسية</span>

            <NavItem
              to="/admin/dashboard"
              active={activeView === 'dashboard'}
              icon={<LayoutDashboard size={15} />}
              label="لوحة التحكم المباشرة"
              onNavigate={closeMobileSidebar}
            />

            <NavItem
              to="/admin/schedule"
              active={activeView === 'schedule'}
              icon={<CalendarDays size={15} />}
              label="جدول وشيفتات الدوام"
              onNavigate={closeMobileSidebar}
            />

            {hasPermission('canViewReports') && (
              <NavItem
                to="/admin/attendance"
                active={activeView === 'attendance'}
                icon={<ClipboardCheck size={15} />}
                label="كشف الحضور والانصراف"
                onNavigate={closeMobileSidebar}
              />
            )}

            <NavItem
              to="/admin/alerts"
              active={activeView === 'alerts'}
              icon={<Bell size={15} />}
              label="تنبيهات تغطية الشيفتات"
              badge={unreadAlertsCount}
              onNavigate={closeMobileSidebar}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-amber-300/80 uppercase tracking-widest px-3 mb-1">التنظيم والتنسيق</span>

            {hasPermission('canManageEmployees') && (
              <NavItem
                to="/admin/employees"
                active={activeView === 'employees'}
                icon={<Users size={15} />}
                label="شؤون الموظفين"
                onNavigate={closeMobileSidebar}
              />
            )}

            {hasPermission('canManageDepts') && (
              <NavItem
                to="/admin/departments"
                active={activeView === 'departments'}
                icon={<Building2 size={15} />}
                label="إدارة الأقسام"
                onNavigate={closeMobileSidebar}
              />
            )}

            {hasPermission('canManageDepts') && (
              <NavItem
                to="/admin/shifttypes"
                active={activeView === 'shifttypes'}
                icon={<Clock size={15} />}
                label="نوع ومدة الشيفت"
                onNavigate={closeMobileSidebar}
              />
            )}

            {hasPermission('canApproveRequests') && (
              <NavItem
                to="/admin/requests"
                active={activeView === 'requests'}
                icon={<Inbox size={15} />}
                label="الطلبات الواردة"
                badge={pendingRequestsCount}
                onNavigate={closeMobileSidebar}
              />
            )}

            {hasPermission('canManageSettings') && (
              <NavItem
                to="/admin/settings"
                active={activeView === 'settings'}
                icon={<Settings size={15} />}
                label="بيانات وإعدادات النظام"
                onNavigate={closeMobileSidebar}
              />
            )}

            {admin.role === 'superadmin' && companyId === 'default' && (
              <NavItem
                to="/admin/companies"
                active={activeView === 'companies'}
                icon={<Building2 size={15} />}
                label="الشركات والاشتراكات الشهري"
                onNavigate={closeMobileSidebar}
              />
            )}
          </div>
        </nav>

        <div className="px-5 py-2.5 border-t border-white/10 text-center text-[10px] text-sky-300 font-sans tracking-wide">
          التصميم والتطوير عن طريق <span className="font-extrabold text-white">SHADY NASSEF</span>
        </div>

        <div className="p-4 border-t border-white/10 bg-black/10 flex items-center justify-between text-xs">
          <div className="truncate flex items-center gap-2.5">
            <span className="w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-sky-900 font-black flex items-center justify-center text-xs">
              {(admin.name || 'م').charAt(0)}
            </span>
            <div>
              <span className="block text-[9px] text-sky-300">المستخدم النشط</span>
              <span className="font-extrabold text-white">{admin.name || 'مدير الدوام'}</span>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="تسجيل الخروج"
            className="p-1.5 hover:bg-rose-500 rounded-lg text-rose-200 hover:text-white transition-all flex-shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}
