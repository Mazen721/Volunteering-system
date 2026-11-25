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
import { buildMyUpcoming } from '../utils/myUpcoming';
import { sortByPhasePriority } from '../utils/opportunityPhase';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];
const BOARD = AR.studentPortal.board;

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

describe('Phase 10 phase ordering and upcoming merge (unit)', () => {
  it('orders_opportunities_open_first_then_live_then_closed_then_ended', () => {
    const ended = buildOpportunity({
      _id: 'ended',
      phase: 'ended',
      startAt: '2026-01-01T07:00:00.000Z',
    });
    const closed = buildOpportunity({
      _id: 'closed',
      phase: 'registration_closed',
      startAt: '2026-06-01T07:00:00.000Z',
    });
    const live = buildOpportunity({
      _id: 'live',
      phase: 'in_progress',
      startAt: '2026-08-01T07:00:00.000Z',
    });
    const openLate = buildOpportunity({
      _id: 'open-late',
      phase: 'upcoming',
      startAt: '2026-12-05T07:00:00.000Z',
    });
    const openEarly = buildOpportunity({
      _id: 'open-early',
      phase: 'upcoming',
      startAt: '2026-12-01T07:00:00.000Z',
    });

    const sorted = sortByPhasePriority([ended, closed, live, openLate, openEarly]);

    expect(sorted.map((opportunity) => opportunity._id)).toEqual([
      'open-early',
      'open-late',
      'live',
      'closed',
      'ended',
    ]);
  });

  it('drops_pending_and_waitlisted_applications_on_ended_opportunities_from_my_upcoming', () => {
    const endedOpportunity = buildOpportunity({ _id: 'op-ended', phase: 'ended' });
    const openOpportunity = buildOpportunity({ _id: 'op-open', phase: 'upcoming' });
    const applicationOn = (opportunity: Opportunity, status: Application['status']) =>
      ({
        ...buildApplication({ opportunity: opportunity._id, status }),
        opportunity,
      }) as StudentApplication;

    const items = buildMyUpcoming({
      upcomingAccepted: [],
      activeApplications: [
        applicationOn(endedOpportunity, 'pending'),
        applicationOn(endedOpportunity, 'waitlisted'),
        applicationOn(openOpportunity, 'pending'),
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0].opportunity._id).toBe('op-open');
    expect(items[0].status).toBe('pending');
  });
});

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
  }),
  http.get(`${API_BASE}/opportunities/:id`, ({ params }) => {
    const opportunity = boardList.find((entry) => entry._id === params.id);
    if (!opportunity) {
      return HttpResponse.json({ message: 'الفرصة التطوعية غير موجودة' }, { status: 404 });
    }
    return HttpResponse.json({ opportunity });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('phase10-token');
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

describe('Phase 10 true board and honest application states', () => {
  it('shows_applied_opportunities_on_the_board_with_their_real_status_chips', async () => {
    const recommended = buildOpportunity({
      _id: 'op-rec',
      title: 'فرصة مقترحة',
      matchedFields: ['medical'],
      recommendationScore: 13,
    });
    const pending = buildOpportunity({
      _id: 'op-pending',
      title: 'ندوة بانتظار الموافقة',
      myApplication: buildApplication({ opportunity: 'op-pending', status: 'pending' }),
    });
    const rejected = buildOpportunity({
      _id: 'op-rejected',
      title: 'فرصة اترفض طلبي عليها',
      myApplication: buildApplication({ opportunity: 'op-rejected', status: 'rejected' }),
    });
    const cancelled = buildOpportunity({
      _id: 'op-cancelled',
      title: 'فرصة ألغيت طلبي عليها',
      myApplication: buildApplication({ opportunity: 'op-cancelled', status: 'cancelled' }),
    });
    boardList = [pending, rejected, cancelled, recommended];
    recommendedList = [recommended];

    renderAppAt('/opportunities', buildStudentUser());

    expect(
      await screen.findByRole('heading', { name: BOARD.pageTitle })
    ).toBeInTheDocument();
    expect(screen.getByText(BOARD.visibilityHint)).toBeInTheDocument();
    expect(await screen.findByText('ندوة بانتظار الموافقة')).toBeInTheDocument();

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(4);
    // Recommended work leads the board and carries the suggested ribbon.
    expect(within(cards[0]).getByText('فرصة مقترحة')).toBeInTheDocument();
    expect(within(cards[0]).getByText(AR.studentPortal.home.suggestedRibbon)).toBeInTheDocument();

    const cardByTitle = (title: string) => cards.find((card) => within(card).queryByText(title));
    expect(
      within(cardByTitle('ندوة بانتظار الموافقة')!).getByText(BOARD.myStatusChips.pending)
    ).toBeInTheDocument();
    expect(
      within(cardByTitle('فرصة اترفض طلبي عليها')!).getByText(BOARD.myStatusChips.rejected)
    ).toBeInTheDocument();
    expect(
      within(cardByTitle('فرصة ألغيت طلبي عليها')!).getByText(BOARD.myStatusChips.cancelled)
    ).toBeInTheDocument();
    // Phase is visible on the cards too.
    expect(
      within(cardByTitle('ندوة بانتظار الموافقة')!).getByText(BOARD.phaseLabels.upcoming)
    ).toBeInTheDocument();
  });

  it('shows_a_terminal_notice_instead_of_an_apply_button_when_the_application_was_rejected', async () => {
    boardList = [
      buildOpportunity({
        _id: 'op-rejected',
        title: 'فرصة اترفض طلبي عليها',
        myApplication: buildApplication({ opportunity: 'op-rejected', status: 'rejected' }),
      }),
    ];

    renderAppAt('/opportunities/op-rejected', buildStudentUser());

    expect(await screen.findByText('فرصة اترفض طلبي عليها')).toBeInTheDocument();
    expect(screen.getByText(AR.studentPortal.details.rejectedNotice)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: AR.studentPortal.details.applyButton })
    ).not.toBeInTheDocument();
  });

  it('offers_the_apply_button_again_after_a_cancelled_application', async () => {
    boardList = [
      buildOpportunity({
        _id: 'op-cancelled',
        title: 'فرصة ألغيت طلبي عليها',
        myApplication: buildApplication({ opportunity: 'op-cancelled', status: 'cancelled' }),
      }),
    ];

    renderAppAt('/opportunities/op-cancelled', buildStudentUser());

    expect(await screen.findByText('فرصة ألغيت طلبي عليها')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: AR.studentPortal.details.applyButton })
    ).toBeInTheDocument();
  });

  it('leads_the_home_all_work_preview_with_registration_open_opportunities', async () => {
    const ended = buildOpportunity({
      _id: 'op-ended',
      title: 'نشاط منتهي قديم',
      phase: 'ended',
      startAt: '2026-01-01T07:00:00.000Z',
      endAt: '2026-01-01T09:00:00.000Z',
    });
    const closed = buildOpportunity({
      _id: 'op-closed',
      title: 'نشاط تسجيله قفل',
      phase: 'registration_closed',
      startAt: '2026-06-01T07:00:00.000Z',
      endAt: '2026-06-01T09:00:00.000Z',
    });
    const open = buildOpportunity({
      _id: 'op-open',
      title: 'نشاط تسجيله مفتوح',
      phase: 'upcoming',
      startAt: '2026-12-01T07:00:00.000Z',
    });
    // The plain list arrives oldest-first: ended, closed, open.
    boardList = [ended, closed, open];
    recommendedList = [];

    renderAppAt('/home', buildStudentUser());

    const heading = await screen.findByRole('heading', {
      name: AR.studentPortal.home.allWorkTitle,
    });
    const section = heading.closest('section');
    expect(section).not.toBeNull();
    const rows = within(section!).getAllByRole('article');
    // Round A+B ruling: the ended opportunity is history and must not appear
    // in the home preview at all — only the open and the closed rows remain.
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('نشاط تسجيله مفتوح')).toBeInTheDocument();
    expect(within(rows[0]).getByText(BOARD.phaseLabels.upcoming)).toBeInTheDocument();
    expect(within(rows[1]).getByText('نشاط تسجيله قفل')).toBeInTheDocument();
    expect(within(section!).queryByText('نشاط منتهي قديم')).not.toBeInTheDocument();
    expect(screen.getByText(BOARD.visibilityHint)).toBeInTheDocument();
  });
});
