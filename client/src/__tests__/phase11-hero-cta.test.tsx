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

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];
const BOARD = AR.studentPortal.board;
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

let activeUser: AuthUser | null = null;
let boardList: Opportunity[] = [];
let recommendedList: Opportunity[] = [];
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
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('phase11-token');
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
  dashboardSummary = buildSummary();
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase 11 state-aware CTA buttons', () => {
  it('labels_board_card_buttons_by_application_status', async () => {
    const withStatus = (status: Application['status']) =>
      buildApplication({ opportunity: `op-${status}`, status });
    boardList = [
      buildOpportunity({
        _id: 'op-pending',
        title: 'فرصة معلقة',
        myApplication: withStatus('pending'),
      }),
      buildOpportunity({
        _id: 'op-waitlisted',
        title: 'فرصة قائمة انتظار',
        myApplication: withStatus('waitlisted'),
      }),
      buildOpportunity({
        _id: 'op-accepted',
        title: 'فرصة مقبولة',
        myApplication: withStatus('accepted'),
      }),
      buildOpportunity({
        _id: 'op-rejected',
        title: 'فرصة مرفوضة',
        myApplication: withStatus('rejected'),
      }),
      buildOpportunity({
        _id: 'op-cancelled',
        title: 'فرصة ملغية',
        myApplication: withStatus('cancelled'),
      }),
      buildOpportunity({ _id: 'op-fresh', title: 'فرصة جديدة' }),
    ];

    renderAppAt('/opportunities', buildStudentUser());

    expect(await screen.findByRole('heading', { name: BOARD.pageTitle })).toBeInTheDocument();
    expect(await screen.findByText('فرصة معلقة')).toBeInTheDocument();
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(6);
    const cardByTitle = (title: string) => cards.find((card) => within(card).queryByText(title))!;
    const buttonIn = (title: string) =>
      within(cardByTitle(title)).getByRole('link', {
        name: new RegExp(`${BOARD.viewApplicationButton}|${BOARD.detailsButton}`),
      });

    for (const title of ['فرصة معلقة', 'فرصة قائمة انتظار', 'فرصة مقبولة']) {
      expect(buttonIn(title)).toHaveTextContent(BOARD.viewApplicationButton);
    }
    for (const title of ['فرصة مرفوضة', 'فرصة ملغية', 'فرصة جديدة']) {
      expect(buttonIn(title)).toHaveTextContent(BOARD.detailsButton);
    }
    // No applied card ever invites him to apply again from the board.
    for (const card of cards) {
      expect(within(card).queryByText(HOME.applyNowCta)).not.toBeInTheDocument();
    }
  });

  it('shows_view_application_on_home_rows_for_applied_opportunities', async () => {
    boardList = [
      buildOpportunity({
        _id: 'op-pending',
        title: 'فرصة قدمت عليها',
        myApplication: buildApplication({ opportunity: 'op-pending', status: 'pending' }),
      }),
      buildOpportunity({ _id: 'op-fresh', title: 'فرصة لسه ما قدمتش' }),
    ];
    recommendedList = [];

    renderAppAt('/home', buildStudentUser());

    const heading = await screen.findByRole('heading', { name: HOME.allWorkTitle });
    const section = heading.closest('section');
    expect(section).not.toBeNull();
    const rows = within(section!).getAllByRole('article');
    expect(rows).toHaveLength(2);
    const rowByTitle = (title: string) => rows.find((row) => within(row).queryByText(title))!;

    expect(
      within(rowByTitle('فرصة قدمت عليها')).getByRole('link', {
        name: BOARD.viewApplicationButton,
      })
    ).toHaveAttribute('href', '/opportunities/op-pending');
    expect(
      within(rowByTitle('فرصة قدمت عليها')).getByText(BOARD.myStatusChips.pending)
    ).toBeInTheDocument();
    expect(
      within(rowByTitle('فرصة لسه ما قدمتش')).getByRole('link', {
        name: BOARD.detailsButton,
      })
    ).toBeInTheDocument();
    expect(
      within(rowByTitle('فرصة لسه ما قدمتش')).queryByText(BOARD.viewApplicationButton)
    ).not.toBeInTheDocument();
  });
});

describe('Phase 11 hero priority across statuses', () => {
  it('features_the_soonest_pending_application_over_a_later_accepted_one', async () => {
    const now = Date.now();
    const acceptedLater = buildOpportunity({
      _id: 'op-accepted-later',
      title: 'نشاط مقبول بعد يومين',
      startAt: new Date(now + 2 * 24 * 60 * 60000).toISOString(),
      endAt: new Date(now + 2 * 24 * 60 * 60000 + 2 * 60 * 60000).toISOString(),
    });
    const pendingSooner = buildOpportunity({
      _id: 'op-pending-sooner',
      title: 'ندوة معلقة بكرة',
      startAt: new Date(now + 24 * 60 * 60000).toISOString(),
      endAt: new Date(now + 24 * 60 * 60000 + 2 * 60 * 60000).toISOString(),
    });
    const pendingApplication = {
      ...buildApplication({ opportunity: 'op-pending-sooner', status: 'pending' }),
      opportunity: pendingSooner,
    } as StudentApplication;
    dashboardSummary = buildSummary({
      upcomingAccepted: [acceptedLater],
      activeApplications: [pendingApplication],
    });

    renderAppAt('/home', buildStudentUser());

    // The hero is the soonest application — the pending one — shown honestly
    // as under review with a «شوف طلبك» call to action.
    expect(await screen.findByText(HOME.pendingBadge)).toBeInTheDocument();
    expect(screen.getByText('ندوة معلقة بكرة')).toBeInTheDocument();
    const heroCta = screen
      .getAllByRole('link', { name: new RegExp(BOARD.viewApplicationButton) })
      .find((link) => link.getAttribute('href') === '/opportunities/op-pending-sooner');
    expect(heroCta).toBeDefined();
    expect(screen.queryByText(HOME.nextBadge)).not.toBeInTheDocument();
    // The accepted activity is not lost: it waits in «شغلي القادم», and its
    // row button is state-aware too.
    const upcomingHeading = screen.getByRole('heading', { name: HOME.myUpcomingTitle });
    const upcomingSection = upcomingHeading.closest('section');
    expect(upcomingSection).not.toBeNull();
    expect(within(upcomingSection!).getByText('نشاط مقبول بعد يومين')).toBeInTheDocument();
    expect(
      within(upcomingSection!).getByRole('link', { name: BOARD.viewApplicationButton })
    ).toHaveAttribute('href', '/opportunities/op-accepted-later');
  });
});
