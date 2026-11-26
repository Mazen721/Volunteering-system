import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type { AuthUser, Opportunity, StudentDashboardSummary } from '../types';
import { getApplyBlockReason } from '../utils/applyEligibility';
import { listCategorySeats } from '../utils/categorySeats';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];
const FACULTY_B = FACULTIES[1];
const BOARD = AR.studentPortal.board;
const HOME = AR.studentPortal.home;
const DETAILS = AR.studentPortal.details;

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
let detailsOpportunity: Opportunity | null = null;
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
    if (detailsOpportunity && detailsOpportunity._id === params.id) {
      return HttpResponse.json({ opportunity: detailsOpportunity });
    }
    return HttpResponse.json({ message: 'الفرصة التطوعية غير موجودة' }, { status: 404 });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('phase16-token');
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
  detailsOpportunity = null;
  dashboardSummary = buildSummary();
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase 16 per-category seats (utils)', () => {
  it('lists_only_categories_with_a_quota_and_mirrors_server_remaining_math', () => {
    const opportunity = buildOpportunity({
      slots: { student: 10, academic: 5, admin: 0 },
      acceptedCounts: { student: 8, academic: 0, admin: 0 },
      remainingSlots: { student: 2, academic: 5, admin: 0 },
    });

    expect(listCategorySeats(opportunity)).toEqual([
      { category: 'student', quota: 10, remaining: 2 },
      { category: 'academic', quota: 5, remaining: 5 },
    ]);
  });
});

describe('Phase 16 apply block reasons (utils)', () => {
  const viewer = { category: 'student' as const, faculty: FACULTY_A };

  it('derives_each_reason_from_phase_faculty_and_quota', () => {
    expect(getApplyBlockReason(buildOpportunity({ phase: 'in_progress' }), viewer)).toBe(
      'started'
    );
    expect(
      getApplyBlockReason(buildOpportunity({ phase: 'registration_closed' }), viewer)
    ).toBe('deadlinePassed');
    expect(getApplyBlockReason(buildOpportunity({ phase: 'ended' }), viewer)).toBe('ended');
    expect(getApplyBlockReason(buildOpportunity({ faculty: FACULTY_B }), viewer)).toBe(
      'facultyRestricted'
    );
    expect(
      getApplyBlockReason(
        buildOpportunity({ slots: { student: 0, academic: 3, admin: 0 } }),
        viewer
      )
    ).toBe('noCategoryQuota');
  });

  it('does_not_block_an_open_opportunity_or_a_full_but_waitlistable_one', () => {
    expect(getApplyBlockReason(buildOpportunity(), viewer)).toBeNull();
    // Full category (quota open, no seats left): the server still accepts a
    // waitlist application, so there is no block reason.
    expect(
      getApplyBlockReason(
        buildOpportunity({
          slots: { student: 4, academic: 0, admin: 0 },
          remainingSlots: { student: 0, academic: 0, admin: 0 },
          isFull: true,
        }),
        viewer
      )
    ).toBeNull();
  });
});

describe('Phase 16 details page — per-category seats', () => {
  it('shows_remaining_per_category_highlights_his_own_and_flags_scarcity', async () => {
    detailsOpportunity = buildOpportunity({
      slots: { student: 10, academic: 5, admin: 0 },
      acceptedCounts: { student: 8, academic: 0, admin: 0 },
      remainingSlots: { student: 2, academic: 5, admin: 0 },
    });

    renderAppAt('/opportunities/op-1', buildStudentUser());

    const ownLine = await screen.findByTestId('seats-category-student');
    expect(ownLine).toHaveAttribute('data-own', 'true');
    expect(ownLine).toHaveAttribute('data-scarce', 'true');
    expect(ownLine.textContent).toContain(DETAILS.remainingPrefix);
    expect(ownLine.textContent).toContain(AR.studentPortal.common.categoryShortLabels.student);
    expect(within(ownLine).getByText(DETAILS.ownCategoryTag)).toBeInTheDocument();
    expect(within(ownLine).getByText(DETAILS.scarceTag)).toBeInTheDocument();

    const academicLine = screen.getByTestId('seats-category-academic');
    expect(academicLine).not.toHaveAttribute('data-own');
    expect(academicLine.textContent).toContain(
      AR.studentPortal.common.categoryShortLabels.academic
    );
    // A category the organizer never opened is not listed at all.
    expect(screen.queryByTestId('seats-category-admin')).not.toBeInTheDocument();
    // The old single student-only slots line is gone.
    expect(screen.queryByText(DETAILS.slotsLabel, { exact: false })).not.toBeInTheDocument();
  });

  it('does_not_flag_scarcity_when_his_category_has_plenty_of_seats', async () => {
    detailsOpportunity = buildOpportunity({
      slots: { student: 10, academic: 0, admin: 0 },
      remainingSlots: { student: 8, academic: 0, admin: 0 },
    });

    renderAppAt('/opportunities/op-1', buildStudentUser());

    const ownLine = await screen.findByTestId('seats-category-student');
    expect(ownLine).toHaveAttribute('data-own', 'true');
    expect(ownLine).not.toHaveAttribute('data-scarce');
    expect(screen.queryByText(DETAILS.scarceTag)).not.toBeInTheDocument();
  });
});

describe('Phase 16 details page — honest closed reasons', () => {
  it('says_the_activity_started_instead_of_the_generic_message', async () => {
    detailsOpportunity = buildOpportunity({ phase: 'in_progress', checkInOpen: true });

    renderAppAt('/opportunities/op-1', buildStudentUser());

    expect(await screen.findByText(DETAILS.unavailableReasons.started)).toBeInTheDocument();
    expect(screen.queryByText(DETAILS.applyUnavailable)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: DETAILS.applyButton })
    ).not.toBeInTheDocument();
  });

  it('says_the_deadline_passed_when_registration_closed', async () => {
    detailsOpportunity = buildOpportunity({ phase: 'registration_closed' });

    renderAppAt('/opportunities/op-1', buildStudentUser());

    expect(await screen.findByText(DETAILS.unavailableReasons.deadlinePassed)).toBeInTheDocument();
    expect(screen.queryByText(DETAILS.applyUnavailable)).not.toBeInTheDocument();
  });

  it('says_the_opportunity_ended_when_it_is_over', async () => {
    detailsOpportunity = buildOpportunity({ phase: 'ended' });

    renderAppAt('/opportunities/op-1', buildStudentUser());

    expect(await screen.findByText(DETAILS.unavailableReasons.ended)).toBeInTheDocument();
    expect(screen.queryByText(DETAILS.applyUnavailable)).not.toBeInTheDocument();
  });

  it('names_the_faculty_when_the_opportunity_is_restricted_to_another_one', async () => {
    detailsOpportunity = buildOpportunity({ faculty: FACULTY_B });

    renderAppAt('/opportunities/op-1', buildStudentUser());

    const expected = DETAILS.unavailableReasons.facultyRestricted.replace(
      '{faculty}',
      FACULTY_B
    );
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: DETAILS.applyButton })
    ).not.toBeInTheDocument();
  });

  it('explains_when_his_category_has_no_quota_and_hides_the_apply_button', async () => {
    detailsOpportunity = buildOpportunity({
      slots: { student: 0, academic: 3, admin: 0 },
      remainingSlots: { student: 0, academic: 3, admin: 0 },
    });

    renderAppAt('/opportunities/op-1', buildStudentUser());

    expect(await screen.findByText(DETAILS.unavailableReasons.noCategoryQuota)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: DETAILS.applyButton })
    ).not.toBeInTheDocument();
  });

  it('keeps_the_waitlist_path_when_his_category_is_full_but_open', async () => {
    detailsOpportunity = buildOpportunity({
      slots: { student: 4, academic: 0, admin: 0 },
      acceptedCounts: { student: 4, academic: 0, admin: 0 },
      remainingSlots: { student: 0, academic: 0, admin: 0 },
      isFull: undefined,
      waitlistAvailable: undefined,
    });

    renderAppAt('/opportunities/op-1', buildStudentUser());

    expect(await screen.findByText(DETAILS.waitlistNotice)).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: BOARD.waitlistBadge })
    ).toBeInTheDocument();
    expect(screen.queryByText(DETAILS.applyUnavailable)).not.toBeInTheDocument();
  });
});

describe('Phase 16 details page — history-aware back button', () => {
  it('falls_back_to_the_board_on_a_direct_landing', async () => {
    detailsOpportunity = buildOpportunity();

    renderAppAt('/opportunities/op-1', buildStudentUser());

    expect(await screen.findByText('قافلة طبية مجتمعية')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: DETAILS.backToBoard }));

    expect(
      await screen.findByRole('heading', { name: BOARD.pageTitle })
    ).toBeInTheDocument();
  });

  it('returns_home_when_the_student_came_from_home', async () => {
    const fresh = buildOpportunity({ _id: 'op-1', title: 'فرصة من الرئيسية' });
    recommendedList = [fresh];
    detailsOpportunity = fresh;
    boardList = [fresh];

    renderAppAt('/home', buildStudentUser());

    const detailsLink = await screen.findByRole('link', { name: HOME.detailsButton });
    fireEvent.click(detailsLink);
    expect(await screen.findByText('فرصة من الرئيسية')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: DETAILS.backToBoard }));

    // History back lands on Home again — the hero, not the board heading.
    expect(await screen.findByText(HOME.featuredBadge)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: BOARD.pageTitle })
    ).not.toBeInTheDocument();
  });
});

describe('Phase 16 hero — honest recommendation CTA and seats line', () => {
  it('never_invites_applying_to_a_registration_closed_recommendation', async () => {
    recommendedList = [
      buildOpportunity({
        _id: 'op-closed',
        title: 'فرصة تسجيلها قفل',
        phase: 'registration_closed',
      }),
    ];

    renderAppAt('/home', buildStudentUser());

    expect(await screen.findByText('فرصة تسجيلها قفل')).toBeInTheDocument();
    expect(screen.queryByText(HOME.applyNowCta)).not.toBeInTheDocument();
    expect(screen.getByText(BOARD.phaseLabels.registration_closed)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: HOME.detailsButton })).toHaveAttribute(
      'href',
      '/opportunities/op-closed'
    );
  });

  it('never_invites_applying_to_a_full_recommendation', async () => {
    recommendedList = [
      buildOpportunity({
        _id: 'op-full',
        title: 'فرصة اكتمل عددها',
        isFull: true,
        waitlistAvailable: true,
        remainingSlots: { student: 0, academic: 0, admin: 0 },
      }),
    ];

    renderAppAt('/home', buildStudentUser());

    expect(await screen.findByText('فرصة اكتمل عددها')).toBeInTheDocument();
    expect(screen.queryByText(HOME.applyNowCta)).not.toBeInTheDocument();
    expect(screen.getByText(BOARD.fullBadge)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: HOME.detailsButton })).toHaveAttribute(
      'href',
      '/opportunities/op-full'
    );
  });

  it('shows_the_apply_cta_and_per_category_seats_for_an_open_recommendation', async () => {
    recommendedList = [
      buildOpportunity({
        _id: 'op-open',
        title: 'فرصة مفتوحة',
        slots: { student: 6, academic: 4, admin: 0 },
        remainingSlots: { student: 4, academic: 2, admin: 0 },
      }),
    ];

    renderAppAt('/home', buildStudentUser());

    expect(await screen.findByText(HOME.applyNowCta)).toBeInTheDocument();
    const seatsLine = screen.getByTestId('hero-seats-line');
    expect(seatsLine.textContent).toContain(BOARD.remainingSlotsLabel);
    expect(seatsLine.textContent).toContain(
      AR.studentPortal.common.categoryShortLabels.student
    );
    expect(seatsLine.textContent).toContain(
      AR.studentPortal.common.categoryShortLabels.academic
    );
    expect(seatsLine.textContent).not.toContain(
      AR.studentPortal.common.categoryShortLabels.admin
    );
  });

  it('shows_the_seats_line_on_his_next_application_hero', async () => {
    const now = Date.now();
    const next = buildOpportunity({
      _id: 'op-next',
      title: 'نشاطي القادم',
      startAt: new Date(now + 24 * 60 * 60000).toISOString(),
      endAt: new Date(now + 24 * 60 * 60000 + 2 * 60 * 60000).toISOString(),
      slots: { student: 6, academic: 4, admin: 0 },
      remainingSlots: { student: 3, academic: 4, admin: 0 },
    });
    dashboardSummary = buildSummary({ upcomingAccepted: [next] });

    renderAppAt('/home', buildStudentUser());

    expect(await screen.findByText(HOME.nextBadge)).toBeInTheDocument();
    const seatsLine = screen.getByTestId('hero-seats-line');
    expect(seatsLine.textContent).toContain(
      AR.studentPortal.common.categoryShortLabels.academic
    );
  });
});
