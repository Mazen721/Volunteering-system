import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR, INTEREST_LABELS } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type {
  Application,
  AuthUser,
  Opportunity,
  StudentApplication,
  StudentDashboardSummary,
} from '../types';
import { formatNumber } from '../utils/format';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];
const CERTIFICATE_HOURS = 50;

function buildStudentUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'student-user',
    email: 'student@mnu.edu.eg',
    fullName: 'طالب متطوع',
    role: 'student',
    status: 'active',
    faculty: FACULTY_A,
    volunteer: 'volunteer-1',
    interests: ['medical'],
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
    slots: { student: 4, academic: 0, admin: 0 },
    acceptedCounts: { student: 0, academic: 0, admin: 0 },
    approvalMode: 'auto',
    status: 'published',
    createdBy: 'admin-user',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    phase: 'upcoming',
    checkInOpen: false,
    remainingSlots: { student: 4, academic: 0, admin: 0 },
    recommendationScore: 13,
    matchedFields: ['medical'],
    isFull: false,
    waitlistAvailable: false,
    ...overrides,
  };
}

function buildApplication(overrides: Partial<Application> = {}): Application {
  return {
    _id: 'application-1',
    opportunity: 'op-1',
    volunteer: 'volunteer-1',
    user: 'student-user',
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

function buildStudentApplication(
  opportunity: Opportunity,
  overrides: Partial<StudentApplication> = {}
): StudentApplication {
  return {
    ...buildApplication({ opportunity: opportunity._id }),
    opportunity,
    ...overrides,
  };
}

function buildDashboardSummary(
  overrides: Partial<StudentDashboardSummary> = {}
): StudentDashboardSummary {
  return {
    volunteer: {
      _id: 'volunteer-1',
      volunteerId: '20260001',
      fullName: 'طالب متطوع',
      category: 'student',
      faculty: FACULTY_A,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    approvedHours: 0,
    pendingHours: 0,
    certificateHours: CERTIFICATE_HOURS,
    remainingHours: CERTIFICATE_HOURS,
    eligible: false,
    eventsAttended: 0,
    happeningNow: [],
    upcomingAccepted: [],
    activeApplications: [],
    recentActivities: [],
    ...overrides,
  };
}

let activeUser: AuthUser | null = null;
let opportunitiesList: Opportunity[] = [];
let dashboardSummary = buildDashboardSummary();
let studentApplications: StudentApplication[] = [];
let applyCalls: string[] = [];
let withdrawCalls: string[] = [];
let lastProfilePatch: Record<string, unknown> | null = null;

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'جلسة الدخول غير صالحة أو منتهية' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.patch(`${API_BASE}/auth/me`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    lastProfilePatch = body;
    if (!activeUser) {
      return HttpResponse.json({ message: 'جلسة الدخول غير صالحة أو منتهية' }, { status: 401 });
    }
    activeUser = {
      ...activeUser,
      ...(Array.isArray(body.interests) ? { interests: body.interests as AuthUser['interests'] } : {}),
    };
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/stats/me`, () => {
    return HttpResponse.json(dashboardSummary);
  }),
  http.get(`${API_BASE}/applications/me`, () => {
    return HttpResponse.json({ applications: studentApplications });
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
  http.post(`${API_BASE}/opportunities/:id/apply`, ({ params }) => {
    applyCalls.push(String(params.id));
    return HttpResponse.json({ application: buildApplication() }, { status: 201 });
  }),
  http.delete(`${API_BASE}/opportunities/:id/apply`, ({ params }) => {
    withdrawCalls.push(String(params.id));
    return HttpResponse.json({
      application: buildApplication({ status: 'cancelled', decidedAt: new Date().toISOString() }),
    });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('v2-5-token');
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
  dashboardSummary = buildDashboardSummary();
  studentApplications = [];
  applyCalls = [];
  withdrawCalls = [];
  lastProfilePatch = null;
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase V2-5 Student Portal & Recommendations', () => {
  it('renders_recommended_opportunities_with_matched_interest_and_waitlist_badges', async () => {
    opportunitiesList = [
      buildOpportunity({
        _id: 'op-match',
        title: 'قافلة طبية مجتمعية',
        fields: ['medical'],
        matchedFields: ['medical'],
        recommendationScore: 13,
      }),
      buildOpportunity({
        _id: 'op-full',
        title: 'بطولة رياضية مجتمعية',
        fields: ['sports'],
        matchedFields: [],
        recommendationScore: 3,
        acceptedCounts: { student: 4, academic: 0, admin: 0 },
        remainingSlots: { student: 0, academic: 0, admin: 0 },
        isFull: true,
        waitlistAvailable: true,
      }),
    ];

    renderAppAt('/opportunities', buildStudentUser());

    expect(
      await screen.findByRole('heading', { name: AR.studentPortal.board.pageTitle })
    ).toBeInTheDocument();
    expect(await screen.findByText('قافلة طبية مجتمعية')).toBeInTheDocument();

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);

    const matchBadges = within(cards[0]).getByTestId('match-badges');
    expect(matchBadges).toHaveTextContent(AR.studentPortal.board.matchBadgePrefix);
    expect(matchBadges).toHaveTextContent(INTEREST_LABELS.medical);

    expect(
      within(cards[1]).getByText(AR.studentPortal.board.waitlistBadge)
    ).toBeInTheDocument();
    expect(within(cards[1]).getByText(AR.studentPortal.board.fullBadge)).toBeInTheDocument();
  });

  it('applies_to_and_withdraws_from_an_opportunity_from_the_details_page', async () => {
    const user = userEvent.setup();
    opportunitiesList = [
      buildOpportunity({ _id: 'op-apply', title: 'فرصة للتقديم والسحب' }),
    ];

    renderAppAt('/opportunities/op-apply', buildStudentUser());

    expect(await screen.findByText('فرصة للتقديم والسحب')).toBeInTheDocument();
    await user.click(
      await screen.findByRole('button', { name: AR.studentPortal.details.applyButton })
    );

    await waitFor(() => {
      expect(applyCalls).toEqual(['op-apply']);
    });
    expect(
      await screen.findByText(
        `${AR.studentPortal.details.applicationStatusLabel}: ${AR.opportunities.applicationStatuses.pending}`
      )
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: AR.studentPortal.details.withdrawButton })
    );

    await waitFor(() => {
      expect(withdrawCalls).toEqual(['op-apply']);
    });
    expect(
      await screen.findByRole('button', { name: AR.studentPortal.details.applyButton })
    ).toBeInTheDocument();
  });

  it('shows_accurate_certificate_math_at_c_minus_one_c_and_c_plus_one_without_certificate_access', async () => {
    const scenarios = [
      { approvedHours: CERTIFICATE_HOURS - 1, remainingHours: 1, eligible: false, percent: 98 },
      { approvedHours: CERTIFICATE_HOURS, remainingHours: 0, eligible: true, percent: 100 },
      { approvedHours: CERTIFICATE_HOURS + 1, remainingHours: 0, eligible: true, percent: 100 },
    ];

    for (const scenario of scenarios) {
      dashboardSummary = buildDashboardSummary({
        approvedHours: scenario.approvedHours,
        remainingHours: scenario.remainingHours,
        eligible: scenario.eligible,
      });

      const view = renderAppAt('/me', buildStudentUser());

      expect(
        await screen.findByTestId('approved-hours')
      ).toHaveTextContent(formatNumber(scenario.approvedHours));
      expect(screen.getByTestId('remaining-hours')).toHaveTextContent(
        formatNumber(scenario.remainingHours)
      );
      expect(screen.getByTestId('certificate-hours')).toHaveTextContent(
        formatNumber(CERTIFICATE_HOURS)
      );
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        String(scenario.percent)
      );

      if (scenario.eligible) {
        expect(screen.getByText(AR.studentPortal.dashboard.eligibleNotice)).toBeInTheDocument();
      } else {
        expect(
          screen.queryByText(AR.studentPortal.dashboard.eligibleNotice)
        ).not.toBeInTheDocument();
      }

      expect(document.querySelector('a[href*="certificate"]')).toBeNull();
      expect(screen.queryByText(AR.certificate.printButton)).not.toBeInTheDocument();

      view.unmount();
      window.history.pushState({}, '', '/me');
    }
  });

  it('updates_student_interests_from_the_profile_page', async () => {
    const user = userEvent.setup();
    renderAppAt('/me/profile', buildStudentUser({ interests: ['medical'] }));

    expect(
      await screen.findByRole('heading', { name: AR.studentPortal.profile.pageTitle })
    ).toBeInTheDocument();

    const medicalCheckbox = screen.getByRole('checkbox', {
      name: INTEREST_LABELS.medical,
    });
    expect(medicalCheckbox).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: INTEREST_LABELS.sports }));
    await user.click(
      screen.getByRole('button', { name: AR.studentPortal.profile.saveInterestsButton })
    );

    await waitFor(() => {
      expect(lastProfilePatch).toEqual({ interests: ['medical', 'sports'] });
    });
    expect(
      await screen.findByText(AR.studentPortal.profile.interestsSaved)
    ).toBeInTheDocument();
  });

  it('lists_student_applications_with_their_current_status', async () => {
    const opportunity = buildOpportunity({ _id: 'op-list', title: 'فرصة ضمن طلباتي' });
    studentApplications = [
      buildStudentApplication(opportunity, { status: 'accepted' }),
    ];

    renderAppAt('/me/applications', buildStudentUser());

    expect(
      await screen.findByText(AR.studentPortal.applications.pageTitle)
    ).toBeInTheDocument();
    expect(await screen.findByText('فرصة ضمن طلباتي')).toBeInTheDocument();
    expect(
      screen.getByText(AR.opportunities.applicationStatuses.accepted)
    ).toBeInTheDocument();
  });
});
