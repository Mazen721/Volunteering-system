import type { ComponentType } from 'react';
import {
  CalendarClock,
  ClipboardList,
  FileSpreadsheet,
  Home,
  LayoutDashboard,
  Shield,
  UserCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { AR } from '../constants/ar';
import type { UserRole } from '../constants/enums';

interface NavIconProps {
  className?: string;
}

export interface NavLinkItem {
  to: string;
  label: string;
  Icon: ComponentType<NavIconProps>;
  end: boolean;
  roles: UserRole[];
}

/** Single source of truth for role-aware navigation, shared by the top navbar and the mobile dock. */
export function getNavLinks(role: UserRole | undefined): NavLinkItem[] {
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
    // Manual activities / hours approval is legacy since opportunities + live check-in
    // took over, so it sits last for staff on both desktop and mobile.
    { to: '/activities', label: AR.nav.activities, Icon: ClipboardList, end: true, roles: ['admin', 'dean'] },
  ];
  return allLinks.filter((item) => item.roles.includes(effectiveRole));
}
