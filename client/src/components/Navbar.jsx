import { NavLink, useNavigate } from 'react-router-dom';
import {
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { AR } from '../constants/ar.js';
import { useAuth } from '../context/authContext.js';

const NAV_LINKS = [
  { to: '/', label: AR.nav.dashboard, Icon: LayoutDashboard, end: true },
  { to: '/volunteers', label: AR.nav.volunteers, Icon: Users, end: false },
  { to: '/import-export', label: AR.nav.importExport, Icon: FileSpreadsheet, end: true },
];

/**
 * Sticky top navigation bar displaying MNU branding, primary navigation, and logout action.
 */
export function Navbar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 glass-nav text-white shadow-xl print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="min-h-20 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
              <GraduationCap className="w-6 h-6 text-mnu-gold" />
            </div>
            <div className="min-w-0">
              <h1 className="font-extrabold text-base sm:text-xl flex flex-wrap items-center gap-2">
                <span>{AR.brand.university}</span>
                <span className="text-[11px] sm:text-xs font-semibold px-2.5 py-0.5 rounded-full bg-mnu-gold/20 text-yellow-300 border border-yellow-400/30">
                  {AR.brand.badge}
                </span>
              </h1>
              <p className="text-[11px] sm:text-xs text-blue-200 font-light truncate">
                {AR.brand.subtitle}
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
            {NAV_LINKS.map(({ to, label, Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold transition ${
                    isActive
                      ? 'bg-white/20 text-white border border-white/25'
                      : 'text-blue-100 hover:bg-white/10'
                  }`
                }
              >
                <Icon className="w-4 h-4 text-mnu-gold shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}

            <span className="hidden lg:inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/30 px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{AR.nav.adminRole}</span>
            </span>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-rose-500/80 text-white px-3 py-2 rounded-xl border border-white/20 text-xs font-bold transition active:scale-95 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{AR.nav.logout}</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
