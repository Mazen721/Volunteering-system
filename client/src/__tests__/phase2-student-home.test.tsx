import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type {
  Application,
  AuthUser,
  Opportunity,
  StudentApplication,
  StudentDashboardSummary,
} from '../types';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];
const HOME = AR.studentPortal.home;

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
    location: { name: 'مركز خدمة المجتمع', address: 'الحرم الجامعي - جامعة المنصورة الأهلية' },
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
  overrides: Partial<StudentApplication> = {},
): StudentApplication {
  return {
    ...buildApplication({ opportunity: opportunity._id }),
    opportunity,
    ...overrides,
  };
}

function buildSummary(overrides: Partial<StudentDashboardSummary> = {}): StudentDashboardSummary {
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
    approvedHours: 12,
    pendingHours: 4,
    certificateHours: 30,
    remainingHours: 18,
    eligible: false,
    eventsAttended: 3,
    happeningNow: [],
    upcomingAccepted: [],
    activeApplications: [],
    recentActivities: [],
    ...overrides,
  };
}

let activeUser: AuthUser | null = null;
let opportunitiesList: Opportunity[] = [];
let dashboardSummary = buildSummary();

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'جلسة الدخول غير صالحة أو منتهية' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/stats/me`, () => {
    return HttpResponse.json(dashboardSummary);
  }),
  http.get(`${API_BASE}/opportunities`, () => {
    return HttpResponse.json({ opportunities: opportunitiesList });
  }),
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('phase2-token');
  window.history.pushState({}, '', route);
  return render(<App />);
}

function sectionByHeading(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  const section = heading.closest('section');
  if (!section) {
    throw new Error(`Section not found for heading: ${name}`);
  }
  return section;
}

beforeAll(() => {
  mswServer.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  mswServer.resetHandlers();
  localStorage.clear();
  activeUser = null;
  opportunitiesList = [];
  dashboardSummary = buildSummary();
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase 2 Student Home Page', () => {
  it('shows_the_live_hero_with_place_times_and_checkin_when_an_activity_is_happening_now', async () => {
    const now = Date.now();
    const live = buildOpportunity({
      _id: 'op-live',
      title: 'قافلة الكشف الطبي المباشر',
      startAt: new Date(now - 60 * 60000).toISOString(),
      endAt: new Date(now + 4 * 60 * 60000).toISOString(),
      hours: 5,
    });
    dashboardSummary = buildSummary({ happeningNow: [live] });

    renderAppAt('/home', buildStudentUser());

    expect(await screen.findByText(HOME.liveBadge)).toBeInTheDocument();
    expect(screen.getByText('قافلة الكشف الطبي المباشر')).toBeInTheDocument();
    expect(screen.getByText(live.location.name)).toBeInTheDocument();
    expect(screen.getByText(live.location.address)).toBeInTheDocument();
    const checkInLink = screen.getByRole('link', {
      name: new RegExp(AR.studentPortal.dashboard.happeningNowCta),
    });
    expect(checkInLink).toHaveAttribute('href', '/checkin/op-live');
    expect(screen.queryByText(HOME.welcomeTitle)).not.toBeInTheDocument();
  });

  it('shows_the_next_activity_hero_with_countdown_when_nothing_is_live', async () => {
    const next = buildOpportunity({
      _id: 'op-next',
      title: 'حملة التوعية الصحية القادمة',
      startAt: new Date(Date.now() + 3 * 24 * 60 * 60000).toISOString(),
      endAt: new Date(Date.now() + 3 * 24 * 60 * 60000 + 4 * 60 * 60000).toISOString(),
    });
    dashboardSummary = buildSummary({ upcomingAccepted: [next] });

    renderAppAt('/home', buildStudentUser());

    expect(await screen.findByText(HOME.nextBadge)).toBeInTheDocument();
    // Phase 5: the featured activity is the hero itself and is not repeated
    // in the rows below it.
    expect(screen.getAllByText('حملة التوعية الصحية القادمة').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(new RegExp(HOME.startsInLabel))).toBeInTheDocument();
    expect(screen.getByText(HOME.checkInOpensNote)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: new RegExp(AR.studentPortal.dashboard.happeningNowCta) }),
    ).not.toBeInTheDocument();
  });

  it('shows_the_welcome_hero_for_a_student_registered_in_nothing', async () => {
    dashboardSummary = buildSummary();

    renderAppAt('/home', buildStudentUser());

    expect(await screen.findByText(HOME.welcomeTitle)).toBeInTheDocument();
    expect(screen.getByText(HOME.welcomeBadge)).toBeInTheDocument();
    expect(screen.queryByText(HOME.myUpcomingTitle)).not.toBeInTheDocument();
    expect(screen.queryByText(HOME.liveBadge)).not.toBeInTheDocument();
    expect(screen.queryByText(HOME.nextBadge)).not.toBeInTheDocument();
  });

  it('shows_a_hero_and_a_review_note_when_only_applications_are_under_review', async () => {
    const pendingOpportunity = buildOpportunity({
      _id: 'op-pending',
      title: 'ندوة بانتظار المراجعة',
    });
    dashboardSummary = buildSummary({
      activeApplications: [buildStudentApplication(pendingOpportunity)],
    });

    renderAppAt('/home', buildStudentUser());

    const section = await screen.findByText(HOME.myUpcomingTitle).then(() => sectionByHeading(HOME.myUpcomingTitle));
    expect(within(section).getByText('ندوة بانتظار المراجعة')).toBeInTheDocument();
    expect(
      within(section).getByText(AR.opportunities.applicationStatuses.pending),
    ).toBeInTheDocument();
    // Phase 5 fix: the hero never disappears for review-only students — with
    // no recommendations available it falls back to the welcome hero, and a
    // calm under-review note is shown under it.
    expect(await screen.findByText(HOME.welcomeTitle)).toBeInTheDocument();
    expect(screen.getByText(HOME.reviewNoteTitle + ':')).toBeInTheDocument();
    expect(screen.queryByText(HOME.liveBadge)).not.toBeInTheDocument();
    expect(screen.queryByText(HOME.nextBadge)).not.toBeInTheDocument();
  });

  it('marks_suggested_cards_with_the_gold_ribbon_and_keeps_all_work_cards_plain', async () => {
    opportunitiesList = [
      buildOpportunity({ _id: 'op-a', title: 'فرصة أولى' }),
      buildOpportunity({ _id: 'op-b', title: 'فرصة ثانية' }),
    ];

    renderAppAt('/home', buildStudentUser());

    // Phase 5: the top recommendation becomes the photo hero itself.
    expect(await screen.findByText(HOME.featuredBadge)).toBeInTheDocument();
    expect(screen.getAllByText('فرصة أولى').length).toBeGreaterThanOrEqual(1);

    const suggestedSection = await screen
      .findByRole('heading', { name: HOME.suggestedTitle })
      .then(() => sectionByHeading(HOME.suggestedTitle));
    const suggestedCards = within(suggestedSection).getAllByRole('article');
    expect(suggestedCards).toHaveLength(1);
    for (const card of suggestedCards) {
      expect(within(card).getByText(HOME.suggestedRibbon, { exact: false })).toBeInTheDocument();
    }

    const allWorkSection = sectionByHeading(HOME.allWorkTitle);
    const allWorkCards = within(allWorkSection).getAllByRole('article');
    expect(allWorkCards).toHaveLength(2);
    for (const card of allWorkCards) {
      expect(within(card).queryByText(HOME.suggestedRibbon)).not.toBeInTheDocument();
    }
  });

  it('shows_only_three_all_work_cards_with_a_see_all_link', async () => {
    opportunitiesList = [1, 2, 3, 4, 5].map((index) =>
      buildOpportunity({ _id: `op-${index}`, title: `فرصة رقم ${index}` }),
    );

    renderAppAt('/home', buildStudentUser());

    const allWorkSection = await screen
      .findByRole('heading', { name: HOME.allWorkTitle })
      .then(() => sectionByHeading(HOME.allWorkTitle));
    expect(within(allWorkSection).getAllByRole('article')).toHaveLength(3);
    expect(
      within(allWorkSection).getByRole('link', { name: new RegExp(HOME.seeAllButton) }),
    ).toHaveAttribute('href', '/opportunities');
  });

  it('keeps_statistics_off_the_home_page', async () => {
    renderAppAt('/home', buildStudentUser());

    expect(await screen.findByText(HOME.welcomeTitle)).toBeInTheDocument();
    expect(screen.queryByTestId('approved-hours')).not.toBeInTheDocument();
    expect(
      screen.queryByText(AR.studentPortal.dashboard.approvedHoursLabel),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(AR.studentPortal.dashboard.certificateHoursLabel, { exact: false }),
    ).not.toBeInTheDocument();
  });

  it('lands_students_on_home_after_login_and_shows_home_in_the_navbar', async () => {
    renderAppAt('/login', buildStudentUser());

    await waitFor(() => {
      expect(window.location.pathname).toBe('/home');
    });
    // Scoped to the top navbar: since Phase 3 the mobile dock repeats these
    // links (and the page greeting is itself a <header>, so select by class).
    const banner = document.querySelector('header.glass-nav') as HTMLElement;
    expect(
      await within(banner).findByRole('link', { name: new RegExp(AR.studentPortal.nav.home) }),
    ).toBeInTheDocument();
    expect(
      within(banner).getByRole('link', { name: new RegExp(AR.studentPortal.nav.dashboard) }),
    ).toHaveAttribute('href', '/me');
  });

  it('shows_the_pending_notice_and_browsable_home_for_a_pending_student', async () => {
    dashboardSummary = buildSummary({ volunteer: null });
    opportunitiesList = [buildOpportunity({ _id: 'op-open', title: 'فرصة متاحة للتصفح' })];

    renderAppAt('/home', buildStudentUser({ status: 'pending' }));

    expect(await screen.findByText(AR.pending.waitingTitle)).toBeInTheDocument();
    // Phase 5: the open opportunity becomes the featured photo hero, but the
    // apply CTA stays hidden while the account is pending (participation is
    // locked until approval, matching the server 403 behaviour).
    expect(await screen.findByText(HOME.featuredBadge)).toBeInTheDocument();
    expect(screen.getAllByText('فرصة متاحة للتصفح').length).toBeGreaterThan(0);
    expect(screen.queryByText(HOME.applyNowCta)).not.toBeInTheDocument();
  });
});
