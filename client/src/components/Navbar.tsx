import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut, ShieldCheck } from 'lucide-react';
import { AR } from '../constants/ar';
import { useAuth } from '../context/authContext';
import { getNavLinks } from './navLinks';
import { MobileBottomNav } from './MobileBottomNav';
import { UniversityLogo } from './UniversityLogo';

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
    <>
    <header className="sticky top-0 z-40 glass-nav text-white shadow-xl print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="min-h-20 py-3 flex flex-nowrap lg:flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 shrink-0 rounded-full bg-white p-0.5 flex items-center justify-center shadow-md ring-2 ring-mnu-gold/50 overflow-hidden">
              <UniversityLogo className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <h1 className="font-extrabold text-base sm:text-xl flex items-center gap-2">
                <span>{AR.brand.university}</span>
              </h1>
              <p className="text-[11px] sm:text-xs text-blue-200 font-light truncate">
                {AR.brand.subtitle}
              </p>
            </div>
          </div>

          {/* Mobile keeps logout one tap away; the links move to the bottom dock. */}
          <button
            type="button"
            onClick={handleLogout}
            aria-label={AR.nav.logout}
            className="flex items-center justify-center bg-white/10 hover:bg-rose-500/80 text-white p-2.5 rounded-xl border border-white/20 transition active:scale-95 cursor-pointer lg:hidden"
          >
            <LogOut className="w-4 h-4" />
          </button>

          <nav className="hidden lg:flex flex-wrap items-center gap-1.5 sm:gap-2.5">
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
    <MobileBottomNav />
    </>
  );
}
