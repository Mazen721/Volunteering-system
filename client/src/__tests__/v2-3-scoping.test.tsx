import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type { Activity, AuthUser, Volunteer } from '../types';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];

function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'admin@mnu.edu.eg',
    fullName: 'مسؤول النظام',
    role: 'admin',
    status: 'active',
    faculty: null,
    volunteer: null,
    interests: [],
    registration: null,
    rejectionReason: null,
    lastLoginAt: null,
    ...overrides,
  };
}

let activeUser: AuthUser | null = null;
let deansList: AuthUser[] = [];
let volunteersList: Volunteer[] = [];
let activitiesList: Activity[] = [];
let lastCreateVolunteerBody: Record<string, unknown> | null = null;
let lastPatchUserCalls: Array<{ id: string; body: Record<string, unknown> }> = [];
let lastCreateDeanBody: Record<string, unknown> | null = null;

const mswServer = setupServer(
  // The mobile dock asks for the pending-approvals count on staff pages.
  http.get(`${API_BASE}/registrations`, () => {
    return HttpResponse.json({ registrations: [] });
  }),
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'جلسة الدخول غير صالحة أو منتهية' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/volunteers`, () => {
    return HttpResponse.json({
      volunteers: volunteersList,
      total: volunteersList.length,
      page: 1,
      pages: 1,
      certificateHours: 30,
    });
  }),
  http.post(`${API_BASE}/volunteers`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    lastCreateVolunteerBody = body;
    return HttpResponse.json(
      {
        volunteer: {
          _id: 'vol-new',
          volunteerId: String(body.volunteerId),
          fullName: String(body.fullName),
          category: body.category,
          faculty: body.faculty,
        },
      },
      { status: 201 }
    );
  }),
  http.get(`${API_BASE}/activities`, () => {
    return HttpResponse.json({
      activities: activitiesList,
      total: activitiesList.length,
      page: 1,
      pages: 1,
    });
  }),
  http.patch(`${API_BASE}/activities/:id/status`, async ({ params, request }) => {
    const body = (await request.json()) as { status: Activity['status'] };
    activitiesList = activitiesList.map((act) =>
      act._id === params.id ? { ...act, status: body.status } : act
    );
    const updated = activitiesList.find((act) => act._id === params.id);
    return HttpResponse.json({ activity: updated });
  }),
  http.get(`${API_BASE}/users`, () => {
    return HttpResponse.json({ users: deansList });
  }),
  http.post(`${API_BASE}/users`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    lastCreateDeanBody = body;
    const created = buildUser({
      id: `dean-${deansList.length + 1}`,
      email: String(body.email),
      fullName: String(body.fullName),
      role: 'dean',
      status: 'active',
      faculty: body.faculty as AuthUser['faculty'],
    });
    deansList = [created, ...deansList];
    return HttpResponse.json({ user: created }, { status: 201 });
  }),
  http.patch(`${API_BASE}/users/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    lastPatchUserCalls.push({ id: String(params.id), body });
    deansList = deansList.map((dean) => {
      if (dean.id !== params.id) return dean;
      return {
        ...dean,
        status: (body.status as AuthUser['status']) ?? dean.status,
      };
    });
    const updated = deansList.find((dean) => dean.id === params.id) ?? buildUser({ id: String(params.id) });
    return HttpResponse.json({ user: updated });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('v2-3-token');
  window.history.pushState({}, '', route);
  return render(<App />);
}

beforeAll(() => {
  mswServer.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  mswServer.resetHandlers();
  localStorage.clear();
  activeUser = null;
  deansList = [];
  volunteersList = [];
  activitiesList = [];
  lastCreateVolunteerBody = null;
  lastPatchUserCalls = [];
  lastCreateDeanBody = null;
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase V2-3 Dean Scoping, Deans Management & Certificate Role Guards', () => {
  it('locks_faculty_in_volunteers_modal_hides_faculty_filter_and_import_for_dean', async () => {
    const user = userEvent.setup();
    volunteersList = [
      {
        _id: 'v-1',
        volunteerId: '20260001',
        fullName: 'أحمد محمد علي',
        category: 'student',
        categoryLabel: 'الطلاب',
        faculty: FACULTY_A,
        totalActivities: 1,
        approvedActivities: 1,
        approvedHours: 12,
        remainingHours: 18,
        eligible: false,
        linkedUserId: 'student-user-1',
      },
    ];

    const deanUser = buildUser({
      id: 'dean-1',
      email: 'dean.med@mnu.edu.eg',
      fullName: 'عميد الطب',
      role: 'dean',
      faculty: FACULTY_A,
    });

    renderAppAt('/volunteers', deanUser);

    expect(await screen.findByText('أحمد محمد علي')).toBeInTheDocument();
    expect(screen.queryByLabelText(AR.volunteers.facultyFilterLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: AR.nav.deans })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: AR.nav.exportOnly })).toBeInTheDocument();

    // Open Add Volunteer modal: faculty is locked, not a dropdown
    await user.click(screen.getByRole('button', { name: AR.volunteers.addVolunteerBtn }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(FACULTY_A)).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox', { name: AR.volunteerModal.facultyLabel })).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(AR.volunteerModal.idLabel), '20260099');
    await user.type(within(dialog).getByLabelText(AR.volunteerModal.nameLabel), 'سلمى مصطفى');
    await user.click(within(dialog).getByRole('button', { name: AR.common.save }));

    await waitForModalClose();
    expect(lastCreateVolunteerBody?.faculty).toBe(FACULTY_A);

    // Reset linked student's temporary password
    await user.click(screen.getByRole('button', { name: `${AR.volunteers.resetPassword} أحمد محمد علي` }));
    const resetDialog = screen.getByRole('dialog');
    await user.type(
      within(resetDialog).getByLabelText(AR.resetPasswordModal.passwordLabel),
      'TempPass123!'
    );
    await user.click(within(resetDialog).getByRole('button', { name: AR.resetPasswordModal.submitButton }));

    await waitForModalClose();
    expect(lastPatchUserCalls).toEqual([
      { id: 'student-user-1', body: { temporaryPassword: 'TempPass123!' } },
    ]);

    // Navigate to Export-only page via navbar
    await user.click(screen.getByRole('link', { name: AR.nav.exportOnly }));
    expect(await screen.findByText(AR.importExport.deanPageTitle)).toBeInTheDocument();
    expect(screen.getByText(AR.importExport.deanImportRestrictedNotice)).toBeInTheDocument();
    expect(screen.queryByText(AR.importExport.importTitle)).not.toBeInTheDocument();
  });

  it('blocks_student_from_certificate_and_deans_routes', async () => {
    const studentUser = buildUser({
      id: 'student-1',
      email: 'student@mnu.edu.eg',
      fullName: 'طالب نشط',
      role: 'student',
      faculty: FACULTY_A,
      volunteer: 'vol-1',
    });

    renderAppAt('/certificate/20260001', studentUser);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/home');
    });
    expect(await screen.findByText(AR.roles.student)).toBeInTheDocument();
    expect(screen.queryByText(AR.certificate.heading)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: AR.certificate.printButton })).not.toBeInTheDocument();
  });

  it('allows_admin_to_create_toggle_and_reset_dean_accounts_on_deans_page', async () => {
    const user = userEvent.setup();
    deansList = [
      buildUser({
        id: 'dean-1',
        email: 'dean.eng@mnu.edu.eg',
        fullName: 'د. عميد الهندسة',
        role: 'dean',
        status: 'active',
        faculty: FACULTIES[3],
      }),
    ];

    const adminUser = buildUser({ role: 'admin', faculty: null });
    renderAppAt('/deans', adminUser);

    expect(await screen.findByText('د. عميد الهندسة')).toBeInTheDocument();

    // Create a new dean
    await user.click(screen.getByRole('button', { name: AR.deans.addDeanBtn }));
    const createDialog = screen.getByRole('dialog');
    await user.type(within(createDialog).getByLabelText(AR.deans.fullNameLabel), 'د. عميد الصيدلة');
    await user.type(within(createDialog).getByLabelText(AR.deans.emailLabel), 'dean.pharm@mnu.edu.eg');
    await user.selectOptions(within(createDialog).getByLabelText(AR.deans.facultyLabel), FACULTIES[2]);
    await user.type(within(createDialog).getByLabelText(AR.deans.passwordLabel), 'DeanPass123!');
    await user.click(within(createDialog).getByRole('button', { name: AR.deans.createButton }));

    expect(await screen.findByText('د. عميد الصيدلة')).toBeInTheDocument();
    expect(lastCreateDeanBody).toEqual({
      fullName: 'د. عميد الصيدلة',
      email: 'dean.pharm@mnu.edu.eg',
      faculty: FACULTIES[2],
      password: 'DeanPass123!',
    });

    // Disable existing dean. The list refetches after the toggle and React
    // replaces the row node, so the row must be re-queried while waiting —
    // asserting on the captured row searches a detached subtree.
    const engRow = screen.getByText('د. عميد الهندسة').closest('tr');
    expect(engRow).not.toBeNull();
    await user.click(within(engRow!).getByRole('button', { name: AR.deans.disableBtn }));
    await waitFor(
      () => {
        const freshRow = screen.getByText('د. عميد الهندسة').closest('tr');
        expect(
          within(freshRow!).getByRole('button', { name: AR.deans.enableBtn })
        ).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Reset temporary password for dean
    const engRowNow = screen.getByText('د. عميد الهندسة').closest('tr');
    await user.click(within(engRowNow!).getByRole('button', { name: AR.deans.resetPasswordBtn }));
    const resetDialog = screen.getByRole('dialog');
    await user.type(
      within(resetDialog).getByLabelText(AR.resetPasswordModal.passwordLabel),
      'NewDeanPass99!'
    );
    await user.click(within(resetDialog).getByRole('button', { name: AR.resetPasswordModal.submitButton }));

    await waitForModalClose();
    expect(lastPatchUserCalls).toContainEqual({
      id: 'dean-1',
      body: { temporaryPassword: 'NewDeanPass99!' },
    });
  });

  it('renders_activities_page_without_faculty_filter_for_dean_and_updates_status', async () => {
    const user = userEvent.setup();
    activitiesList = [
      {
        _id: 'act-1',
        volunteer: {
          volunteerId: '20260001',
          fullName: 'أحمد محمد علي',
          category: 'student',
          faculty: FACULTY_A,
        },
        title: 'قافلة طبية',
        type: 'قافلة',
        hours: 8,
        date: '2026-10-05T00:00:00.000Z',
        status: 'pending',
        supervisor: 'د. خالد',
      },
    ];

    const deanUser = buildUser({
      id: 'dean-1',
      email: 'dean.med@mnu.edu.eg',
      fullName: 'عميد الطب',
      role: 'dean',
      faculty: FACULTY_A,
    });

    renderAppAt('/activities', deanUser);

    expect(await screen.findByText('قافلة طبية')).toBeInTheDocument();
    expect(screen.queryByLabelText(AR.activitiesPage.facultyFilterLabel)).not.toBeInTheDocument();

    const statusSelect = screen.getByLabelText(`${AR.activityModal.statusLabel} قافلة طبية`);
    await user.selectOptions(statusSelect, 'approved');
    await waitFor(
      () => {
        const current = screen.getByLabelText(
          `${AR.activityModal.statusLabel} قافلة طبية`
        ) as HTMLSelectElement;
        expect(current.value).toBe('approved');
      },
      { timeout: 5000 }
    );
  });
});

async function waitForModalClose() {
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
}
