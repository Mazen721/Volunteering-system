import type { ComponentType } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  ClipboardList,
  FileSpreadsheet,
  Home,
  LayoutDashboard,
  LogOut,
  Shield,
  ShieldCheck,
  UserCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { AR } from '../constants/ar';
import type { UserRole } from '../constants/enums';
import { useAuth } from '../context/authContext';
import { UniversityLogo } from './UniversityLogo';

interface NavIconProps {
  className?: string;
}

interface NavLinkItem {
  to: string;
  label: string;
  Icon: ComponentType<NavIconProps>;
  end: boolean;
  roles: UserRole[];
}

function getNavLinks(role: UserRole | undefined): NavLinkItem[] {
  const effectiveRole: UserRole = role ?? 'admin';
  const allLinks: NavLinkItem[] = [
    { to: '/home', label: AR.studentPortal.nav.home, Icon: Home, end: true, roles: ['student'] },
    { to: '/me', label: AR.studentPortal.nav.dashboard, Icon: LayoutDashboard, end: true, roles: ['student'] },
    {
      to: '/opportunities',
      label: AR.studentPortal.nav.opportunities,
      Icon: CalendarClock,
      end: true,
      roles: ['student'],
    },
    {
      to: '/me/applications',
      label: AR.studentPortal.nav.applications,
      Icon: ClipboardList,
      end: true,
      roles: ['student'],
    },
    {
      to: '/me/profile',
      label: AR.studentPortal.nav.profile,
      Icon: UserRound,
      end: true,
      roles: ['student'],
    },
    { to: '/', label: AR.nav.dashboard, Icon: LayoutDashboard, end: true, roles: ['admin', 'dean'] },
    { to: '/volunteers', label: AR.nav.volunteers, Icon: Users, end: false, roles: ['admin', 'dean'] },
    { to: '/activities', label: AR.nav.activities, Icon: ClipboardList, end: true, roles: ['admin', 'dean'] },
    { to: '/opportunities/manage', label: AR.nav.opportunities, Icon: CalendarClock, end: true, roles: ['admin', 'dean'] },
    { to: '/approvals', label: AR.nav.approvals, Icon: UserCheck, end: true, roles: ['admin', 'dean'] },
    { to: '/deans', label: AR.nav.deans, Icon: Shield, end: true, roles: ['admin'] },
    {
      to: '/import-export',
      label: effectiveRole === 'dean' ? AR.nav.exportOnly : AR.nav.importExport,
      Icon: FileSpreadsheet,
      end: true,
      roles: ['admin', 'dean'],
    },
  ];
  return allLinks.filter((item) => item.roles.includes(effectiveRole));
}

/**
 * Sticky top navigation bar displaying MNU branding, role-aware primary navigation, and logout action.
 */
export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const roleLabel = user ? AR.roles[user.role] : AR.nav.adminRole;
  const navLinks = getNavLinks(user?.role);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="sticky top-0 z-40 glass-nav text-white shadow-xl print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="min-h-20 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 shrink-0 rounded-full bg-white p-0.5 flex items-center justify-center shadow-md ring-2 ring-mnu-gold/50 overflow-hidden">
              <UniversityLogo className="w-full h-full" />
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
            {navLinks.map(({ to, label, Icon, end }) => (
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
              <span>{roleLabel}</span>
              {user?.role === 'dean' && user.faculty && (
                <span className="text-emerald-100/90">— {user.faculty}</span>
              )}
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
