import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
import { isLapsedApplication } from '../utils/applications';
import { selectFeaturedHome } from '../utils/featuredHome';
import { isStudentDiscoverable } from '../utils/opportunityPhase';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];
const BOARD = AR.studentPortal.board;
const LAPSED = AR.studentPortal.applications.lapsedLabel;

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
    remainingSlots: { student: 25, academic: 0, admin: 0 },
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
    ...overrides,
  };
}

describe('Phase 12 discovery and lapse rules (unit)', () => {
  it('treats_only_published_not_ended_opportunities_as_discoverable', () => {
    expect(isStudentDiscoverable(buildOpportunity({ phase: 'upcoming' }))).toBe(true);
    expect(isStudentDiscoverable(buildOpportunity({ phase: 'registration_closed' }))).toBe(true);
    expect(isStudentDiscoverable(buildOpportunity({ phase: 'in_progress' }))).toBe(true);
    expect(isStudentDiscoverable(buildOpportunity({ phase: 'ended' }))).toBe(false);
    expect(isStudentDiscoverable(buildOpportunity({ status: 'completed', phase: 'ended' }))).toBe(
      false
    );
    expect(isStudentDiscoverable(buildOpportunity({ status: 'cancelled', phase: 'ended' }))).toBe(
      false
    );
    expect(isStudentDiscoverable(buildOpportunity({ status: 'draft', phase: 'upcoming' }))).toBe(
      false
    );
  });

  it('marks_pending_and_waitlisted_applications_on_ended_opportunities_as_lapsed', () => {
    const ended = buildOpportunity({ phase: 'ended' });
    const upcoming = buildOpportunity({ phase: 'upcoming' });
    expect(isLapsedApplication({ status: 'pending' }, ended)).toBe(true);
    expect(isLapsedApplication({ status: 'waitlisted' }, ended)).toBe(true);
    expect(isLapsedApplication({ status: 'pending' }, upcoming)).toBe(false);
    expect(isLapsedApplication({ status: 'accepted' }, ended)).toBe(false);
    expect(isLapsedApplication({ status: 'rejected' }, ended)).toBe(false);
  });

  it('never_features_an_ended_recommendation_in_the_hero', () => {
    const ended = buildOpportunity({ _id: 'op-ended', phase: 'ended' });
    const open = buildOpportunity({ _id: 'op-open', phase: 'upcoming' });

    const featured = selectFeaturedHome(buildSummary(), [ended, open]);
    expect(featured.kind).toBe('suggested');
    expect(featured.opportunity?._id).toBe('op-open');

    const onlyEnded = selectFeaturedHome(buildSummary(), [ended]);
    expect(onlyEnded.kind).toBe('welcome');
    expect(onlyEnded.opportunity).toBeNull();
  });
});

let activeUser: AuthUser | null = null;
let boardList: Opportunity[] = [];
let recommendedList: Opportunity[] = [];
let myApplications: StudentApplication[] = [];
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
  http.get(`${API_BASE}/opportunities`, ({ request }) => {
    const url = new URL(request.url);
    if (url.searchParams.get('sort') === 'recommended') {
      return HttpResponse.json({ opportunities: recommendedList });
    }
    return HttpResponse.json({ opportunities: boardList });
  }),
  http.get(`${API_BASE}/opportunities/:id`, ({ params }) => {
    const opportunity = boardList.find((entry) => entry._id === params.id);
    if (!opportunity) {
      return HttpResponse.json({ message: 'الفرصة التطوعية غير موجودة' }, { status: 404 });
    }
    return HttpResponse.json({ opportunity });
  }),
  http.get(`${API_BASE}/applications/me`, () => {
    return HttpResponse.json({ applications: myApplications });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('phase12-token');
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
  boardList = [];
  recommendedList = [];
  myApplications = [];
  dashboardSummary = buildSummary();
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase 12 board, applications history, and ended details', () => {
  it('excludes_ended_and_closed_out_opportunities_from_the_board', async () => {
    const open = buildOpportunity({ _id: 'op-open', title: 'فرصة مفتوحة للتقديم' });
    const endedAccepted = buildOpportunity({
      _id: 'op-ended-accepted',
      title: 'قافلة انتهت واتقبلت فيها',
      phase: 'ended',
      startAt: '2026-01-05T07:00:00.000Z',
      endAt: '2026-01-05T09:00:00.000Z',
      myApplication: buildApplication({ opportunity: 'op-ended-accepted', status: 'accepted' }),
    });
    const endedPending = buildOpportunity({
      _id: 'op-ended-pending',
      title: 'ندوة انتهت وطلبي معلق عليها',
      phase: 'ended',
      startAt: '2026-01-06T07:00:00.000Z',
      endAt: '2026-01-06T09:00:00.000Z',
      myApplication: buildApplication({ opportunity: 'op-ended-pending', status: 'pending' }),
    });
    const completedApplied = buildOpportunity({
      _id: 'op-completed',
      title: 'مبادرة مكتملة حضرتها',
      status: 'completed',
      phase: 'ended',
      startAt: '2026-01-07T07:00:00.000Z',
      endAt: '2026-01-07T09:00:00.000Z',
      myApplication: buildApplication({
        opportunity: 'op-completed',
        status: 'accepted',
        attended: true,
      }),
    });
    boardList = [open, endedAccepted, endedPending, completedApplied];
    // Even if a stale ended item slipped into the recommended payload, the
    // board must not render it.
    recommendedList = [endedPending];

    renderAppAt('/opportunities', buildStudentUser());

    expect(await screen.findByText('فرصة مفتوحة للتقديم')).toBeInTheDocument();
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(1);
    expect(screen.queryByText('قافلة انتهت واتقبلت فيها')).not.toBeInTheDocument();
    expect(screen.queryByText('ندوة انتهت وطلبي معلق عليها')).not.toBeInTheDocument();
    expect(screen.queryByText('مبادرة مكتملة حضرتها')).not.toBeInTheDocument();
    // The open card still carries its live remaining-seats line.
    expect(within(cards[0]).getByText(new RegExp(BOARD.remainingSlotsLabel))).toBeInTheDocument();
  });

  it('renders_lapsed_state_for_pending_on_ended_and_real_statuses_elsewhere_in_my_applications', async () => {
    const endedOpportunity = buildOpportunity({
      _id: 'op-ended',
      title: 'ندوة انتهت دون رد',
      phase: 'ended',
      startAt: '2026-01-06T07:00:00.000Z',
      endAt: '2026-01-06T09:00:00.000Z',
    });
    const openOpportunity = buildOpportunity({ _id: 'op-open', title: 'ندوة قادمة قيد المراجعة' });
    const attendedOpportunity = buildOpportunity({
      _id: 'op-attended',
      title: 'قافلة انتهت وحضرتها',
      phase: 'ended',
      startAt: '2026-01-05T07:00:00.000Z',
      endAt: '2026-01-05T09:00:00.000Z',
    });
    const asStudentApplication = (
      opportunity: Opportunity,
      overrides: Partial<Application>
    ): StudentApplication =>
      ({
        ...buildApplication({ opportunity: opportunity._id, ...overrides }),
        opportunity,
      }) as StudentApplication;

    myApplications = [
      asStudentApplication(endedOpportunity, { _id: 'app-lapsed', status: 'pending' }),
      asStudentApplication(openOpportunity, { _id: 'app-pending', status: 'pending' }),
      asStudentApplication(attendedOpportunity, {
        _id: 'app-attended',
        status: 'accepted',
        attended: true,
        hoursGranted: 2,
      }),
    ];

    renderAppAt('/me/applications', buildStudentUser());

    expect(await screen.findByText('ندوة انتهت دون رد')).toBeInTheDocument();
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(3);
    const cardByTitle = (title: string) => cards.find((card) => within(card).queryByText(title));

    // Lapsed: the honest «انتهت دون اعتماد» replaces «قيد المراجعة».
    const lapsedCard = cardByTitle('ندوة انتهت دون رد')!;
    expect(within(lapsedCard).getByText(LAPSED)).toBeInTheDocument();
    expect(
      within(lapsedCard).queryByText(AR.opportunities.applicationStatuses.pending)
    ).not.toBeInTheDocument();

    // Still alive: a pending application on an upcoming opportunity keeps
    // its real «قيد المراجعة» status.
    const pendingCard = cardByTitle('ندوة قادمة قيد المراجعة')!;
    expect(
      within(pendingCard).getByText(AR.opportunities.applicationStatuses.pending)
    ).toBeInTheDocument();
    expect(within(pendingCard).queryByText(LAPSED)).not.toBeInTheDocument();

    // Accepted history on an ended opportunity keeps its presentation.
    const attendedCard = cardByTitle('قافلة انتهت وحضرتها')!;
    expect(
      within(attendedCard).getByText(AR.opportunities.applicationStatuses.accepted)
    ).toBeInTheDocument();
  });

  it('hides_remaining_seats_and_withdraw_on_the_details_of_an_ended_opportunity', async () => {
    boardList = [
      buildOpportunity({
        _id: 'op-ended',
        title: 'ندوة انتهت وطلبي معلق عليها',
        phase: 'ended',
        startAt: '2026-01-06T07:00:00.000Z',
        endAt: '2026-01-06T09:00:00.000Z',
        myApplication: buildApplication({ opportunity: 'op-ended', status: 'pending' }),
      }),
    ];

    const { container } = renderAppAt('/opportunities/op-ended', buildStudentUser());

    expect(await screen.findByText('ندوة انتهت وطلبي معلق عليها')).toBeInTheDocument();
    // The page stays reachable by direct link (from «طلباتي») but shows no
    // remaining-seats line for a dead opportunity...
    expect(container.textContent).not.toContain(AR.studentPortal.details.slotsLabel);
    // ...the banner reports the lapse instead of «قيد المراجعة»...
    expect(container.textContent).toContain(LAPSED);
    // ...and there is nothing to withdraw from an ended opportunity.
    expect(
      screen.queryByRole('button', { name: AR.studentPortal.details.withdrawButton })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: AR.studentPortal.details.applyButton })
    ).not.toBeInTheDocument();
  });
});
