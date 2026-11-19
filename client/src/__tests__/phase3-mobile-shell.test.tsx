import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type { AuthUser, RegistrationQueueItem, StudentDashboardSummary } from '../types';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];

function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'user@mnu.edu.eg',
    fullName: 'مستخدم تجريبي',
    role: 'student',
    status: 'active',
    faculty: FACULTY_A,
    volunteer: 'volunteer-1',
    interests: [],
    registration: {
      volunteerId: '20260001',
      category: 'student',
      faculty: FACULTY_A,
      facultyMismatch: false,
    },
    rejectionReason: null,
    lastLoginAt: null,
    ...overrides,
  };
}

function buildSummary(): StudentDashboardSummary {
  return {
    volunteer: {
      _id: 'volunteer-1',
      volunteerId: '20260001',
      fullName: 'مستخدم تجريبي',
      category: 'student',
      faculty: FACULTY_A,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    approvedHours: 0,
    pendingHours: 0,
    certificateHours: 30,
    remainingHours: 30,
    eligible: false,
    eventsAttended: 0,
    happeningNow: [],
    upcomingAccepted: [],
    activeApplications: [],
    recentActivities: [],
  };
}

function buildRegistration(
  overrides: Partial<RegistrationQueueItem> = {}
): RegistrationQueueItem {
  return {
    id: 'reg-1',
    email: 'pending@mnu.edu.eg',
    fullName: 'طالب بانتظار الموافقة',
    status: 'pending',
    faculty: FACULTY_A,
    volunteer: null,
    interests: [],
    registration: {
      volunteerId: '20260101',
      category: 'student',
      faculty: FACULTY_A,
      facultyMismatch: false,
    },
    facultyMismatch: false,
    existingVolunteer: null,
    rejectionReason: null,
    approvedAt: null,
    createdAt: '2026-11-01T08:00:00.000Z',
    ...overrides,
  };
}

let activeUser: AuthUser | null = null;
let registrationsList: RegistrationQueueItem[] = [];

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'جلسة الدخول غير صالحة أو منتهية' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/stats/me`, () => {
    return HttpResponse.json(buildSummary());
  }),
  http.get(`${API_BASE}/opportunities`, () => {
    return HttpResponse.json({ opportunities: [] });
  }),
  http.get(`${API_BASE}/registrations`, ({ request }) => {
    const status = new URL(request.url).searchParams.get('status');
    const registrations = status
      ? registrationsList.filter((item) => item.status === status)
      : registrationsList;
    return HttpResponse.json({ registrations });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('phase3-token');
  window.history.pushState({}, '', route);
  return render(<App />);
}

async function getDock(): Promise<HTMLElement> {
  return screen.findByRole('navigation', { name: AR.nav.bottomNav });
}

beforeAll(() => {
  mswServer.listen();
});

afterEach(() => {
  mswServer.resetHandlers();
  localStorage.clear();
  activeUser = null;
  registrationsList = [];
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase 3 Mobile Bottom Dock (Concept A)', () => {
  it('shows_all_five_student_sections_in_the_dock_with_home_active', async () => {
    renderAppAt('/home', buildUser());

    const dock = await getDock();
    expect(await within(dock).findByRole('link', { name: new RegExp(AR.studentPortal.nav.home) })).toBeInTheDocument();
    for (const label of [
      AR.studentPortal.nav.dashboard,
      AR.studentPortal.nav.opportunities,
      AR.studentPortal.nav.applications,
      AR.studentPortal.nav.profile,
    ]) {
      expect(within(dock).getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
    // Students have no «المزيد» — everything fits in the dock.
    expect(within(dock).queryByRole('button', { name: AR.nav.more })).not.toBeInTheDocument();

    const homeLink = within(dock).getByRole('link', { name: new RegExp(AR.studentPortal.nav.home) });
    expect(homeLink).toHaveAttribute('aria-current', 'page');
    expect(homeLink.className).toContain('bg-mnu-gold');
  });

  it('reserves_bottom_space_on_the_body_while_the_dock_is_mounted', async () => {
    const { unmount } = renderAppAt('/home', buildUser());

    expect(await screen.findByRole('navigation', { name: AR.nav.bottomNav })).toBeInTheDocument();
    expect(document.body.classList.contains('has-mobile-dock')).toBe(true);

    unmount();
    expect(document.body.classList.contains('has-mobile-dock')).toBe(false);
  });

  it('navigates_from_the_dock_to_the_opportunities_board', async () => {
    const user = userEvent.setup();
    renderAppAt('/home', buildUser());

    const dock = await getDock();
    await user.click(
      await within(dock).findByRole('link', { name: new RegExp(AR.studentPortal.nav.opportunities) })
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe('/opportunities');
    });
  });

  it('shows_four_primary_sections_and_a_pending_badge_for_admin', async () => {
    registrationsList = [
      buildRegistration({ id: 'reg-1' }),
      buildRegistration({ id: 'reg-2', email: 'second@mnu.edu.eg' }),
      buildRegistration({ id: 'reg-3', email: 'done@mnu.edu.eg', status: 'active' }),
    ];
    renderAppAt('/approvals', buildUser({ role: 'admin', faculty: null, volunteer: null, registration: null }));

    const dock = await getDock();
    for (const label of [AR.nav.dashboard, AR.nav.volunteers, AR.nav.opportunities, AR.nav.approvals]) {
      expect(await within(dock).findByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
    // Secondary sections are not in the dock itself — they live in the sheet.
    // Activities (legacy manual hours) was demoted out of the dock in Phase 4.
    expect(within(dock).queryByRole('link', { name: new RegExp(AR.nav.activities) })).not.toBeInTheDocument();
    expect(within(dock).queryByRole('link', { name: new RegExp(AR.nav.deans) })).not.toBeInTheDocument();
    expect(within(dock).getByRole('button', { name: AR.nav.more })).toBeInTheDocument();

    // Two registrations are pending (the already-active one is not counted).
    const approvalsLink = within(dock).getByRole('link', { name: new RegExp(AR.nav.approvals) });
    expect(await within(approvalsLink).findByText('٢')).toBeInTheDocument();
  });

  it('opens_the_more_sheet_with_secondary_sections_and_logout_for_admin', async () => {
    const user = userEvent.setup();
    renderAppAt('/approvals', buildUser({ role: 'admin', faculty: null, volunteer: null, registration: null }));

    const dock = await getDock();
    await user.click(await within(dock).findByRole('button', { name: AR.nav.more }));

    const dialog = await screen.findByRole('dialog', { name: AR.nav.more });
    expect(within(dialog).getByRole('link', { name: new RegExp(AR.nav.activities) })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: new RegExp(AR.nav.deans) })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: new RegExp(AR.nav.importExport) })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: new RegExp(AR.nav.logout) }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/login');
    });
  });

  it('dean_sheet_uses_export_only_label_and_hides_the_deans_section', async () => {
    const user = userEvent.setup();
    renderAppAt('/approvals', buildUser({ role: 'dean' }));

    const dock = await getDock();
    await user.click(await within(dock).findByRole('button', { name: AR.nav.more }));

    const dialog = await screen.findByRole('dialog', { name: AR.nav.more });
    expect(within(dialog).getByRole('link', { name: new RegExp(AR.nav.exportOnly) })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: new RegExp(AR.nav.deans) })).not.toBeInTheDocument();
  });
});
