import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type { Application, AuthUser, Opportunity } from '../types';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];

function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'admin-user',
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

function buildOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    _id: 'op-1',
    title: 'قافلة طبية مجتمعية',
    description: 'وصف تفصيلي لفرصة تطوعية تخدم المجتمع المحيط بالجامعة',
    requirements: '',
    fields: ['medical'],
    activityType: 'قافلة',
    location: { name: 'مركز خدمة المجتمع', address: 'جامعة المنصورة الأهلية' },
    startAt: '2026-12-01T07:00:00.000Z',
    endAt: '2026-12-01T09:00:00.000Z',
    registrationDeadline: '2026-11-30T07:00:00.000Z',
    hours: 2,
    contactName: 'د. مسؤول الفرصة',
    contactPhone: '01000000000',
    contactEmail: 'opportunity@mnu.edu.eg',
    faculty: FACULTY_A,
    slots: { student: 2, academic: 0, admin: 0 },
    acceptedCounts: { student: 0, academic: 0, admin: 0 },
    approvalMode: 'manual',
    status: 'published',
    createdBy: 'admin-user',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    phase: 'upcoming',
    checkInOpen: false,
    remainingSlots: { student: 2, academic: 0, admin: 0 },
    ...overrides,
  };
}

function buildApplication(overrides: Partial<Application> = {}): Application {
  return {
    _id: 'app-1',
    opportunity: 'op-1',
    volunteer: {
      volunteerId: '20260001',
      fullName: 'أحمد محمد علي',
      category: 'student',
      faculty: FACULTY_A,
    },
    user: 'student-user-1',
    faculty: FACULTY_A,
    category: 'student',
    status: 'pending',
    note: '',
    decidedBy: null,
    decidedAt: null,
    attended: false,
    checkedInAt: null,
    hoursGranted: 0,
    appliedAt: '2026-11-10T08:00:00.000Z',
    createdAt: '2026-11-10T08:00:00.000Z',
    updatedAt: '2026-11-10T08:00:00.000Z',
    ...overrides,
  };
}

let activeUser: AuthUser | null = null;
let opportunitiesList: Opportunity[] = [];
let applicantsList: Application[] = [];
let applicantsReadOnly = false;
let lastCreateBody: Record<string, unknown> | null = null;
let patchOpportunityCalls: Array<{ id: string; body: Record<string, unknown> }> = [];
let patchApplicationCalls: Array<{ id: string; body: Record<string, unknown> }> = [];

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'جلسة الدخول غير صالحة أو منتهية' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/opportunities`, () => {
    return HttpResponse.json({ opportunities: opportunitiesList });
  }),
  http.get(`${API_BASE}/opportunities/:id`, ({ params }) => {
    const opportunity = opportunitiesList.find((entry) => entry._id === params.id);
    if (!opportunity) {
      return HttpResponse.json({ message: 'الفرصة التطوعية غير موجودة' }, { status: 404 });
    }
    return HttpResponse.json({ opportunity });
  }),
  http.post(`${API_BASE}/opportunities`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    lastCreateBody = body;
    const created = buildOpportunity({
      _id: 'op-new',
      title: String(body.title),
      description: String(body.description),
      status: 'draft',
      faculty: (body.faculty as Opportunity['faculty']) ?? FACULTY_A,
    });
    opportunitiesList = [created, ...opportunitiesList];
    return HttpResponse.json({ opportunity: created }, { status: 201 });
  }),
  http.patch(`${API_BASE}/opportunities/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    patchOpportunityCalls.push({ id: String(params.id), body });
    const existing = opportunitiesList.find((entry) => entry._id === params.id);
    return HttpResponse.json({
      opportunity: { ...(existing ?? buildOpportunity()), ...body },
    });
  }),
  http.post(`${API_BASE}/opportunities/:id/publish`, ({ params }) => {
    const existing = opportunitiesList.find((entry) => entry._id === params.id);
    const published = { ...(existing ?? buildOpportunity()), status: 'published' as const };
    opportunitiesList = opportunitiesList.map((entry) =>
      entry._id === params.id ? published : entry
    );
    return HttpResponse.json({ opportunity: published });
  }),
  http.post(`${API_BASE}/opportunities/:id/cancel`, ({ params }) => {
    const existing = opportunitiesList.find((entry) => entry._id === params.id);
    const cancelled = { ...(existing ?? buildOpportunity()), status: 'cancelled' as const };
    opportunitiesList = opportunitiesList.map((entry) =>
      entry._id === params.id ? cancelled : entry
    );
    return HttpResponse.json({ opportunity: cancelled });
  }),
  http.get(`${API_BASE}/opportunities/:id/applications`, () => {
    return HttpResponse.json({ applications: applicantsList, readOnly: applicantsReadOnly });
  }),
  http.patch(`${API_BASE}/applications/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    patchApplicationCalls.push({ id: String(params.id), body });
    const current = applicantsList.find((entry) => entry._id === params.id);
    const updated = {
      ...(current ?? buildApplication()),
      status: body.status as Application['status'],
    };
    applicantsList = applicantsList.map((entry) =>
      entry._id === params.id ? updated : entry
    );
    return HttpResponse.json({ application: updated });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('v2-4-token');
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
  opportunitiesList = [];
  applicantsList = [];
  applicantsReadOnly = false;
  lastCreateBody = null;
  patchOpportunityCalls = [];
  patchApplicationCalls = [];
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

function changeDateTimeInput(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('Phase V2-4 Opportunities & Applications Engine', () => {
  it('creates_opportunity_with_dean_locked_faculty_and_cairo_wall_clock_dates', async () => {
    const user = userEvent.setup();
    const deanUser = buildUser({
      id: 'dean-1',
      email: 'dean.med@mnu.edu.eg',
      fullName: 'عميد الطب',
      role: 'dean',
      faculty: FACULTY_A,
    });

    renderAppAt('/opportunities/new', deanUser);

    expect(await screen.findByText(AR.opportunities.form.createTitle)).toBeInTheDocument();
    // Faculty is forced by the dean's own faculty and cannot be changed.
    expect(screen.getByText(FACULTY_A)).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: AR.opportunities.form.facultyLabel })
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText(AR.opportunities.form.titleLabel),
      'قافلة توعية صحية'
    );
    await user.type(
      screen.getByLabelText(AR.opportunities.form.descriptionLabel),
      'فرصة تطوعية لتنظيم قافلة توعية صحية لأهالي المنصورة'
    );
    await user.type(
      screen.getByLabelText(AR.opportunities.form.locationNameLabel),
      'مركز صحة الأسرة'
    );
    await user.type(
      screen.getByLabelText(AR.opportunities.form.locationAddressLabel),
      'شارع الجمهورية بالمنصورة'
    );

    changeDateTimeInput(AR.opportunities.form.startAtLabel, '2026-12-05T09:00');
    changeDateTimeInput(AR.opportunities.form.endAtLabel, '2026-12-05T12:00');
    changeDateTimeInput(
      AR.opportunities.form.registrationDeadlineLabel,
      '2026-12-03T20:00'
    );

    await user.type(screen.getByLabelText(AR.opportunities.form.hoursLabel), '4');
    await user.clear(screen.getByLabelText(AR.opportunities.form.studentSlotsLabel));
    await user.type(screen.getByLabelText(AR.opportunities.form.studentSlotsLabel), '3');
    await user.click(screen.getByRole('checkbox', { name: AR.interests.education }));

    await user.type(
      screen.getByLabelText(AR.opportunities.form.contactNameLabel),
      'د. سارة محمود'
    );
    await user.type(
      screen.getByLabelText(AR.opportunities.form.contactPhoneLabel),
      '01123456789'
    );
    await user.type(
      screen.getByLabelText(AR.opportunities.form.contactEmailLabel),
      'health@mnu.edu.eg'
    );

    await user.click(
      screen.getByRole('button', { name: AR.opportunities.form.saveDraftButton })
    );

    await waitFor(() => {
      expect(lastCreateBody).not.toBeNull();
    });
    expect(lastCreateBody).toEqual({
      title: 'قافلة توعية صحية',
      description: 'فرصة تطوعية لتنظيم قافلة توعية صحية لأهالي المنصورة',
      requirements: '',
      fields: ['education'],
      activityType: 'قافلة',
      location: {
        name: 'مركز صحة الأسرة',
        address: 'شارع الجمهورية بالمنصورة',
      },
      startAt: '2026-12-05T09:00',
      endAt: '2026-12-05T12:00',
      registrationDeadline: '2026-12-03T20:00',
      hours: 4,
      contactName: 'د. سارة محمود',
      contactPhone: '01123456789',
      contactEmail: 'health@mnu.edu.eg',
      slots: { student: 3, academic: 0, admin: 0 },
      approvalMode: 'auto',
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/opportunities/manage');
    });
    expect(await screen.findByText(AR.opportunities.pageTitle)).toBeInTheDocument();
  });

  it('shows_edit_locks_after_acceptance_and_blocks_lowering_slots_below_accepted', async () => {
    const user = userEvent.setup();
    const acceptedOpportunity = buildOpportunity({
      _id: 'op-locked',
      acceptedCounts: { student: 1, academic: 0, admin: 0 },
      remainingSlots: { student: 1, academic: 0, admin: 0 },
    });
    opportunitiesList = [acceptedOpportunity];

    renderAppAt('/opportunities/op-locked/edit', buildUser({ role: 'admin', faculty: null }));

    expect(await screen.findByText(AR.opportunities.form.editTitle)).toBeInTheDocument();
    expect(screen.getAllByText(AR.opportunities.form.lockedNotice).length).toBeGreaterThan(0);

    expect(screen.getByLabelText(AR.opportunities.form.hoursLabel)).toBeDisabled();
    expect(screen.getByLabelText(AR.opportunities.form.startAtLabel)).toBeDisabled();
    expect(screen.getByLabelText(AR.opportunities.form.endAtLabel)).toBeDisabled();
    expect(
      screen.getByRole('combobox', { name: AR.opportunities.form.facultyLabel })
    ).toBeDisabled();

    const studentSlots = screen.getByLabelText(AR.opportunities.form.studentSlotsLabel);
    expect(studentSlots).not.toBeDisabled();
    expect(studentSlots).toHaveValue(2);

    // The stored UTC instant must render as Africa/Cairo wall-clock time (09:00).
    expect(screen.getByLabelText(AR.opportunities.form.startAtLabel)).toHaveValue(
      '2026-12-01T09:00'
    );

    await user.clear(studentSlots);
    await user.type(studentSlots, '0');
    await user.click(
      screen.getByRole('button', { name: AR.opportunities.form.saveDraftButton })
    );

    expect(
      await screen.findByText(AR.opportunities.form.slotsBelowAccepted)
    ).toBeInTheDocument();
    expect(patchOpportunityCalls).toHaveLength(0);
  });

  it('manages_applicants_with_accept_reject_waitlist_decisions', async () => {
    const user = userEvent.setup();
    opportunitiesList = [
      buildOpportunity({
        _id: 'op-1',
        acceptedCounts: { student: 0, academic: 0, admin: 0 },
        remainingSlots: { student: 2, academic: 0, admin: 0 },
      }),
    ];
    applicantsList = [
      buildApplication({ _id: 'app-1', appliedAt: '2026-11-10T08:00:00.000Z' }),
      buildApplication({
        _id: 'app-2',
        volunteer: {
          volunteerId: '20260002',
          fullName: 'منى إبراهيم',
          category: 'student',
          faculty: FACULTY_A,
        },
        user: 'student-user-2',
        appliedAt: '2026-11-11T08:00:00.000Z',
      }),
    ];

    renderAppAt('/opportunities/manage', buildUser({ role: 'admin', faculty: null }));

    expect(await screen.findByText('قافلة طبية مجتمعية')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: AR.opportunities.applicantsBtn }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('أحمد محمد علي')).toBeInTheDocument();
    expect(within(dialog).getByText('منى إبراهيم')).toBeInTheDocument();
    expect(within(dialog).queryByText(AR.opportunities.applicants.readOnlyBadge)).not.toBeInTheDocument();

    const firstRow = within(dialog).getByText('أحمد محمد علي').closest('tr');
    expect(firstRow).not.toBeNull();
    await user.click(
      within(firstRow!).getByRole('button', { name: AR.opportunities.applicants.acceptBtn })
    );

    await waitFor(() => {
      expect(patchApplicationCalls).toEqual([{ id: 'app-1', body: { status: 'accepted' } }]);
    });
    expect(
      await within(firstRow!).findByText(AR.opportunities.applicationStatuses.accepted)
    ).toBeInTheDocument();

    const secondRow = within(dialog).getByText('منى إبراهيم').closest('tr');
    expect(secondRow).not.toBeNull();
    await user.click(
      within(secondRow!).getByRole('button', {
        name: AR.opportunities.applicants.waitlistBtn,
      })
    );

    await waitFor(() => {
      expect(patchApplicationCalls).toContainEqual({
        id: 'app-2',
        body: { status: 'waitlisted' },
      });
    });
    expect(
      await within(secondRow!).findByText(AR.opportunities.applicationStatuses.waitlisted)
    ).toBeInTheDocument();
  });

  it('gives_deans_a_read_only_faculty_scoped_applicant_view_on_admin_opportunities', async () => {
    const user = userEvent.setup();
    opportunitiesList = [
      buildOpportunity({
        _id: 'op-all',
        faculty: null,
        createdBy: 'admin-user',
        acceptedCounts: { student: 0, academic: 0, admin: 0 },
        remainingSlots: { student: 2, academic: 0, admin: 0 },
      }),
    ];
    applicantsReadOnly = true;
    applicantsList = [buildApplication({ _id: 'app-dean-view' })];

    renderAppAt(
      '/opportunities/manage',
      buildUser({
        id: 'dean-1',
        email: 'dean.med@mnu.edu.eg',
        fullName: 'عميد الطب',
        role: 'dean',
        faculty: FACULTY_A,
      })
    );

    expect(await screen.findByText('قافلة طبية مجتمعية')).toBeInTheDocument();
    expect(screen.getByTitle(AR.opportunities.notOwnerNote)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: AR.opportunities.applicantsBtn }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('أحمد محمد علي')).toBeInTheDocument();
    expect(within(dialog).getByText(AR.opportunities.applicants.readOnlyBadge)).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: AR.opportunities.applicants.acceptBtn })
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: AR.opportunities.applicants.rejectBtn })
    ).not.toBeInTheDocument();
  });
});
