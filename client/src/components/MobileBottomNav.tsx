import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, LogOut, MoreHorizontal, X } from 'lucide-react';
import { apiClient } from '../api/client';
import { AR } from '../constants/ar';
import { useAuth } from '../context/authContext';
import type { RegistrationsListResponse } from '../types';
import { formatNumber } from '../utils/format';
import { getNavLinks, type NavLinkItem } from './navLinks';

/** Sections that stay visible in the dean/admin dock; the rest move under «المزيد». */
const STAFF_PRIMARY_PATHS = ['/', '/volunteers', '/approvals', '/activities'];
const APPROVALS_PATH = '/approvals';

function dockItemClass({ isActive }: { isActive: boolean }): string {
  return `relative flex flex-col items-center justify-center gap-1 rounded-[20px] px-2 py-2 text-[10px] font-bold transition active:scale-95 ${
    isActive ? 'bg-mnu-gold text-mnu-700 shadow-md' : 'text-white/55 hover:text-white'
  }`;
}

function DockItem({
  item,
  badge,
  onNavigate,
}: {
  item: NavLinkItem;
  badge?: number | null;
  onNavigate?: () => void;
}) {
  const { to, label, Icon, end } = item;
  return (
    <NavLink to={to} end={end} onClick={onNavigate} className={dockItemClass}>
      <span className="relative">
        <Icon className="h-[22px] w-[22px]" />
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -end-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-mnu-700">
            {formatNumber(badge)}
          </span>
        )}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </NavLink>
  );
}

/**
 * Floating bottom dock for small screens (Concept A): students get all five
 * sections; deans/admin get four primary sections plus a «المزيد» sheet holding
 * the remaining sections and logout. Desktop keeps the top navbar only.
 */
export function MobileBottomNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);

  const isStaff = user?.role === 'admin' || user?.role === 'dean';

  // Reserve space at the page bottom while the dock is mounted so it never
  // covers content; login and other dock-less pages stay untouched.
  useEffect(() => {
    document.body.classList.add('has-mobile-dock');
    return () => {
      document.body.classList.remove('has-mobile-dock');
    };
  }, []);

  // Close the sheet whenever navigation happens somewhere else (e.g. back
  // button); sheet links also close it themselves on click.
  const [lastPathname, setLastPathname] = useState(location.pathname);
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname);
    setMoreOpen(false);
  }

  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    apiClient
      .get<RegistrationsListResponse>('/registrations', { params: { status: 'pending' } })
      .then((response) => {
        if (!cancelled) setPendingApprovals(response.data.registrations.length);
      })
      .catch(() => {
        if (!cancelled) setPendingApprovals(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isStaff, location.pathname]);

  if (!user) return null;

  const links = getNavLinks(user.role);
  const primaryItems = isStaff
    ? STAFF_PRIMARY_PATHS.map((path) => links.find((item) => item.to === path)).filter(
        (item): item is NavLinkItem => Boolean(item)
      )
    : links;
  const moreItems = isStaff
    ? links.filter((item) => !STAFF_PRIMARY_PATHS.includes(item.to))
    : [];

  function handleLogout() {
    setMoreOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <nav
        aria-label={AR.nav.bottomNav}
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 lg:hidden print:hidden"
      >
        <div className="flex items-stretch justify-around gap-1 rounded-[28px] bg-mnu-700/95 p-2 shadow-[0_18px_36px_rgba(18,47,74,0.4)] ring-1 ring-white/10 backdrop-blur-md">
          {primaryItems.map((item) => (
            <DockItem
              key={item.to}
              item={item}
              badge={item.to === APPROVALS_PATH ? pendingApprovals : null}
            />
          ))}
          {isStaff && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="flex flex-col items-center justify-center gap-1 rounded-[20px] px-2 py-2 text-[10px] font-bold text-white/55 transition hover:text-white active:scale-95 cursor-pointer"
            >
              <MoreHorizontal className="h-[22px] w-[22px]" />
              <span className="whitespace-nowrap">{AR.nav.more}</span>
            </button>
          )}
        </div>
      </nav>

      {isStaff && moreOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label={AR.nav.more}>
          <button
            type="button"
            aria-label={AR.common.close}
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 h-full w-full bg-mnu-700/50 backdrop-blur-[2px] cursor-pointer"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(0,0,0,0.25)]">
            <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-slate-200" />
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-black text-mnu-700">{AR.nav.more}</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label={AR.common.close}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {moreItems.map(({ to, label, Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 border-b border-slate-100 py-3.5 last:border-b-0"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-mnu-50 text-mnu-500">
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <span className="flex-1 text-sm font-extrabold text-slate-800">{label}</span>
                <ChevronLeft className="h-4 w-4 text-slate-300" />
              </NavLink>
            ))}
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 py-3.5 text-start cursor-pointer"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <LogOut className="h-[22px] w-[22px]" />
              </span>
              <span className="flex-1 text-sm font-extrabold text-rose-600">{AR.nav.logout}</span>
              <ChevronLeft className="h-4 w-4 text-slate-300" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
