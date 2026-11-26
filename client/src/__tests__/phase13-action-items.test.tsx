import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type {
  ActionItemsResponse,
  Application,
  AuthUser,
  AwaitingCompletionItem,
  CategoryStatsResponse,
  EventStatsResponse,
  FacultyStatsResponse,
  LeaderboardVolunteer,
  LiveCounters,
  MonthlyHoursResponse,
  Opportunity,
  OverviewStats,
  ParticipationStatsResponse,
  PendingUrgentItem,
} from '../types';
import { formatDateTimeAr, formatNumber } from '../utils/format';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];
const ACTION = AR.dashboard.actionItems;

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

function buildOverview(overrides: Partial<OverviewStats> = {}): OverviewStats {
  return {
    totalApprovedHours: 145,
    totalActivities: 14,
    approvedActivities: 12,
    registeredVolunteers: 10,
    activeVolunteers: 8,
    eligibleVolunteers: 3,
    activeFaculties: 4,
    avgHoursPerRegistered: 14.5,
    avgHoursPerActive: 18.13,
    certificateHours: 30,
    eventsThisMonth: 3,
    pendingRegistrations: 2,
    pendingApplications: 4,
    certificateBuckets: { eligible: 3, nearEligible: 2, inProgress: 3, zeroHours: 2 },
    zeroHourVolunteers: [],
    ...overrides,
  };
}

const FACULTIES_PAYLOAD: FacultyStatsResponse = {
  faculties: [
    {
      faculty: FACULTY_A,
      volunteerCount: 6,
      totalActivities: 8,
      approvedActivities: 7,
      approvedHours: 95,
      avgHours: 15.83,
      percentage: 65.5,
      activeVolunteers: 5,
      participationRate: 83.3,
    },
  ],
  totals: {
    volunteerCount: 6,
    totalActivities: 8,
    approvedActivities: 7,
    approvedHours: 95,
    avgHours: 15.83,
  },
};

const CATEGORIES_PAYLOAD: CategoryStatsResponse = {
  categories: [
    {
      category: 'student',
      label: AR.categories.student,
      volunteerCount: 4,
      totalActivities: 6,
      approvedActivities: 5,
      approvedHours: 70,
      avgHours: 17.5,
    },
  ],
  totals: {
    volunteerCount: 4,
    totalActivities: 6,
    approvedActivities: 5,
    approvedHours: 70,
    avgHours: 17.5,
  },
};

const PARTICIPATION_PAYLOAD: ParticipationStatsResponse = {
  funnel: { applied: 24, accepted: 18, attended: 15, rejected: 3, noShow: 2 },
  engagement: { joined: 8, zeroHours: 2 },
};

const EVENTS_PAYLOAD: EventStatsResponse = {
  topEvents: [],
  completedEvents: [],
  summary: { totalEvents: 0, completedCount: 0, avgFillRate: 0, avgNoShowRate: 0 },
};

const MONTHLY_PAYLOAD: MonthlyHoursResponse = {
  months: [{ month: '2026-11', label: 'نوفمبر ٢٠٢٦', approvedHours: 85, approvedActivities: 7 }],
};

const LEADERBOARD_PAYLOAD: LeaderboardVolunteer[] = [];

function buildAwaitingItem(
  overrides: Partial<AwaitingCompletionItem> = {}
): AwaitingCompletionItem {
  return {
    opportunityId: 'opp-await-1',
    title: 'قافلة طبية انتهت وبانتظار الإتمام',
    faculty: FACULTY_A,
    startAt: '2026-11-20T07:00:00.000Z',
    endAt: '2026-11-20T11:00:00.000Z',
    hours: 4,
    acceptedCount: 3,
    attendedCount: 2,
    ...overrides,
  };
}

function buildPendingItem(overrides: Partial<PendingUrgentItem> = {}): PendingUrgentItem {
  return {
    opportunityId: 'opp-pending-1',
    title: 'حملة توعية تبدأ قريباً',
    faculty: FACULTY_A,
    startAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    phase: 'upcoming',
    pendingCount: 2,
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
    hours: 4,
    contactName: 'د. مسؤول الفرصة',
    contactPhone: '01000000000',
    contactEmail: 'opportunity@mnu.edu.eg',
    faculty: FACULTY_A,
    slots: { student: 10, academic: 0, admin: 0 },
    acceptedCounts: { student: 3, academic: 0, admin: 0 },
    approvalMode: 'manual',
    status: 'published',
    createdBy: 'admin-user',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    phase: 'upcoming',
    checkInOpen: false,
    remainingSlots: { student: 7, academic: 0, admin: 0 },
    ...overrides,
  };
}

function buildApplication(overrides: Partial<Application> = {}): Application {
  return {
    _id: 'app-1',
    opportunity: 'opp-ended',
    volunteer: {
      volunteerId: 'V-1001',
      fullName: 'متطوع حاضر أول',
      category: 'student',
      faculty: FACULTY_A,
    },
    user: 'student-user-1',
    faculty: FACULTY_A,
    category: 'student',
    status: 'accepted',
    note: '',
    decidedBy: 'admin-user',
    decidedAt: '2026-11-19T07:00:00.000Z',
    attended: true,
    checkedInAt: '2026-11-20T07:05:00.000Z',
    hoursGranted: 0,
    appliedAt: '2026-11-18T07:00:00.000Z',
    createdAt: '2026-11-18T07:00:00.000Z',
    updatedAt: '2026-11-20T07:05:00.000Z',
    ...overrides,
  };
}

let activeUser: AuthUser | null = null;
let actionItemsPayload: ActionItemsResponse = { awaitingCompletion: [], pendingUrgent: [] };
let opportunitiesList: Opportunity[] = [];
let liveCounters: LiveCounters = { accepted: 3, checkedIn: 2, notArrived: 1 };
let liveAttendees: Application[] = [];
let completeCalls: string[] = [];

const mswServer = setupServer(
  http.get(`${API_BASE}/registrations`, () => {
    return HttpResponse.json({ registrations: [] });
  }),
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'غير مصرح' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/stats/overview`, () => {
    return HttpResponse.json(buildOverview());
  }),
  http.get(`${API_BASE}/stats/faculties`, () => {
    return HttpResponse.json(FACULTIES_PAYLOAD);
  }),
  http.get(`${API_BASE}/stats/categories`, () => {
    return HttpResponse.json(CATEGORIES_PAYLOAD);
  }),
  http.get(`${API_BASE}/stats/leaderboard`, () => {
    return HttpResponse.json({ leaderboard: LEADERBOARD_PAYLOAD, certificateHours: 30 });
  }),
  http.get(`${API_BASE}/stats/participation`, () => {
    return HttpResponse.json(PARTICIPATION_PAYLOAD);
  }),
  http.get(`${API_BASE}/stats/events`, () => {
    return HttpResponse.json(EVENTS_PAYLOAD);
  }),
  http.get(`${API_BASE}/stats/monthly-hours`, () => {
    return HttpResponse.json(MONTHLY_PAYLOAD);
  }),
  http.get(`${API_BASE}/stats/action-items`, () => {
    return HttpResponse.json(actionItemsPayload);
  }),
  http.get(`${API_BASE}/opportunities`, () => {
    return HttpResponse.json({ opportunities: opportunitiesList });
  }),
  http.get(`${API_BASE}/opportunities/:id/live`, ({ params }) => {
    const opportunity = opportunitiesList.find((entry) => entry._id === params.id);
    if (!opportunity) {
      return HttpResponse.json({ message: 'غير موجودة' }, { status: 404 });
    }
    return HttpResponse.json({ opportunity, counters: liveCounters, attendees: liveAttendees });
  }),
  http.post(`${API_BASE}/opportunities/:id/complete`, ({ params }) => {
    completeCalls.push(String(params.id));
    const opportunity = opportunitiesList.find((entry) => entry._id === params.id);
    return HttpResponse.json({
      opportunity: { ...opportunity, status: 'completed' },
      creditedCount: liveCounters.checkedIn,
      noShowCount: liveCounters.notArrived,
    });
  }),
  http.get(`${API_BASE}/opportunities/:id/applications`, () => {
    return HttpResponse.json({ applications: [], readOnly: false });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('phase13-token');
  window.history.pushState({}, '', route);
  return render(<App />);
}

beforeAll(() => {
  mswServer.listen();
});

afterEach(() => {
  mswServer.resetHandlers();
  localStorage.clear();
  activeUser = null;
  actionItemsPayload = { awaitingCompletion: [], pendingUrgent: [] };
  opportunitiesList = [];
  liveCounters = { accepted: 3, checkedIn: 2, notArrived: 1 };
  liveAttendees = [];
  completeCalls = [];
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase 13 Dashboard Action Blocks', () => {
  it('renders_both_blocks_with_counts_rows_and_links_for_admin', async () => {
    actionItemsPayload = {
      awaitingCompletion: [buildAwaitingItem()],
      pendingUrgent: [buildPendingItem()],
    };
    renderAppAt('/', buildUser());

    const awaitingBlock = await screen.findByTestId('action-items-awaiting');
    expect(within(awaitingBlock).getByText(ACTION.awaitingTitle)).toBeInTheDocument();
    expect(
      within(awaitingBlock).getByText('قافلة طبية انتهت وبانتظار الإتمام')
    ).toBeInTheDocument();
    expect(within(awaitingBlock).getByText(new RegExp(ACTION.acceptedLabel))).toBeInTheDocument();
    expect(within(awaitingBlock).getByText(formatNumber(3))).toBeInTheDocument();
    expect(within(awaitingBlock).getByText(new RegExp(ACTION.attendedLabel))).toBeInTheDocument();
    expect(within(awaitingBlock).getByText(formatNumber(2))).toBeInTheDocument();
    const awaitingLink = within(awaitingBlock).getByRole('link', {
      name: /قافلة طبية انتهت وبانتظار الإتمام/,
    });
    expect(awaitingLink).toHaveAttribute('href', '/opportunities/manage?complete=opp-await-1');
    // One item only -> no «عرض الكل» noise.
    expect(within(awaitingBlock).queryByText(ACTION.viewAll)).not.toBeInTheDocument();

    const pendingBlock = await screen.findByTestId('action-items-pending');
    expect(within(pendingBlock).getByText(ACTION.pendingTitle)).toBeInTheDocument();
    expect(within(pendingBlock).getByText('حملة توعية تبدأ قريباً')).toBeInTheDocument();
    expect(within(pendingBlock).getByText(new RegExp(ACTION.startsInLabel))).toBeInTheDocument();
    const pendingLink = within(pendingBlock).getByRole('link', {
      name: /حملة توعية تبدأ قريباً/,
    });
    expect(pendingLink).toHaveAttribute('href', '/opportunities/manage?applicants=opp-pending-1');
  });

  it('hides_both_blocks_when_nothing_needs_attention', async () => {
    actionItemsPayload = { awaitingCompletion: [], pendingUrgent: [] };
    renderAppAt('/', buildUser());

    expect(await screen.findByRole('heading', { name: AR.dashboard.title })).toBeInTheDocument();
    expect(screen.queryByTestId('action-items-awaiting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-items-pending')).not.toBeInTheDocument();
  });

  it('caps_awaiting_rows_at_five_and_shows_view_all_link', async () => {
    actionItemsPayload = {
      awaitingCompletion: Array.from({ length: 7 }, (_, index) =>
        buildAwaitingItem({
          opportunityId: `opp-await-${index + 1}`,
          title: `فرصة منتهية رقم ${index + 1}`,
        })
      ),
      pendingUrgent: [],
    };
    renderAppAt('/', buildUser());

    const awaitingBlock = await screen.findByTestId('action-items-awaiting');
    expect(within(awaitingBlock).getAllByRole('listitem')).toHaveLength(5);
    expect(within(awaitingBlock).getByText(ACTION.viewAll)).toBeInTheDocument();
    expect(within(awaitingBlock).queryByText('فرصة منتهية رقم 6')).not.toBeInTheDocument();
  });

  it('renders_action_blocks_for_a_dean_as_well', async () => {
    actionItemsPayload = {
      awaitingCompletion: [buildAwaitingItem()],
      pendingUrgent: [],
    };
    renderAppAt(
      '/',
      buildUser({
        id: 'dean-user',
        email: 'dean@mnu.edu.eg',
        role: 'dean',
        faculty: FACULTY_A,
      })
    );

    const awaitingBlock = await screen.findByTestId('action-items-awaiting');
    expect(
      within(awaitingBlock).getByText('قافلة طبية انتهت وبانتظار الإتمام')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('action-items-pending')).not.toBeInTheDocument();
  });
});

describe('Phase 13 Manage Page Completion', () => {
  const endedPublished = () =>
    buildOpportunity({
      _id: 'opp-ended',
      title: 'حملة منتهية بانتظار الإتمام',
      status: 'published',
      phase: 'ended',
      startAt: '2026-11-20T07:00:00.000Z',
      endAt: '2026-11-20T11:00:00.000Z',
      registrationDeadline: '2026-11-19T07:00:00.000Z',
    });
  const upcomingPublished = () =>
    buildOpportunity({ _id: 'opp-upcoming', title: 'حملة قادمة للتسجيل', phase: 'upcoming' });
  const endedCompleted = () =>
    buildOpportunity({
      _id: 'opp-completed',
      title: 'حملة مكتملة سابقة',
      status: 'completed',
      phase: 'ended',
      startAt: '2026-11-10T07:00:00.000Z',
      endAt: '2026-11-10T11:00:00.000Z',
    });

  function rowOf(title: string): HTMLElement {
    const cell = screen.getByText(title);
    const row = cell.closest('tr');
    if (!row) throw new Error(`row not found for ${title}`);
    return row;
  }

  it('shows_complete_button_only_on_ended_published_rows_and_hides_cancel_when_ended', async () => {
    opportunitiesList = [endedPublished(), upcomingPublished(), endedCompleted()];
    renderAppAt('/opportunities/manage', buildUser());

    await screen.findByText('حملة منتهية بانتظار الإتمام');

    const endedRow = rowOf('حملة منتهية بانتظار الإتمام');
    expect(
      within(endedRow).getByRole('button', { name: new RegExp(AR.opportunities.completeBtn) })
    ).toBeInTheDocument();
    expect(
      within(endedRow).queryByRole('button', { name: new RegExp(AR.opportunities.cancelBtn) })
    ).not.toBeInTheDocument();

    const upcomingRow = rowOf('حملة قادمة للتسجيل');
    expect(
      within(upcomingRow).queryByRole('button', { name: new RegExp(AR.opportunities.completeBtn) })
    ).not.toBeInTheDocument();
    expect(
      within(upcomingRow).getByRole('button', { name: new RegExp(AR.opportunities.cancelBtn) })
    ).toBeInTheDocument();

    const completedRow = rowOf('حملة مكتملة سابقة');
    expect(
      within(completedRow).queryByRole('button', {
        name: new RegExp(AR.opportunities.completeBtn),
      })
    ).not.toBeInTheDocument();
    expect(
      within(completedRow).queryByRole('button', { name: new RegExp(AR.opportunities.cancelBtn) })
    ).not.toBeInTheDocument();
  });

  it('confirming_the_dialog_calls_the_complete_endpoint_and_flips_the_row_to_completed', async () => {
    const user = userEvent.setup();
    opportunitiesList = [endedPublished(), upcomingPublished()];
    renderAppAt('/opportunities/manage', buildUser());

    await screen.findByText('حملة منتهية بانتظار الإتمام');
    const endedRow = rowOf('حملة منتهية بانتظار الإتمام');
    await user.click(
      within(endedRow).getByRole('button', { name: new RegExp(AR.opportunities.completeBtn) })
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(AR.opportunities.completeConfirmTitle)).toBeInTheDocument();
    // Attendance details come from the live-state endpoint: 3 accepted, 2 attended,
    // and 2 × 4 hours = 8 hours will be credited.
    expect(await within(dialog).findByText(formatNumber(3))).toBeInTheDocument();
    expect(within(dialog).getByText(formatNumber(2))).toBeInTheDocument();
    expect(within(dialog).getByText(new RegExp(formatNumber(8)))).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: AR.opportunities.confirmCompleteBtn })
    );

    await waitFor(() => {
      expect(completeCalls).toEqual(['opp-ended']);
    });
    await waitFor(() => {
      expect(
        within(rowOf('حملة منتهية بانتظار الإتمام')).getByText(AR.opportunities.statuses.completed)
      ).toBeInTheDocument();
    });
    expect(
      within(rowOf('حملة منتهية بانتظار الإتمام')).queryByRole('button', {
        name: new RegExp(AR.opportunities.completeBtn),
      })
    ).not.toBeInTheDocument();
  });

  it('auto_opens_the_completion_dialog_for_a_completable_complete_param_and_completes_from_it', async () => {
    const user = userEvent.setup();
    opportunitiesList = [endedPublished(), upcomingPublished()];
    renderAppAt('/opportunities/manage?complete=opp-ended', buildUser());

    // No button was clicked: the dialog opens by itself for the deep-linked row.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(AR.opportunities.completeConfirmTitle)).toBeInTheDocument();
    expect(within(dialog).getByText('حملة منتهية بانتظار الإتمام')).toBeInTheDocument();
    expect(await within(dialog).findByText(formatNumber(3))).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: AR.opportunities.confirmCompleteBtn })
    );

    await waitFor(() => {
      expect(completeCalls).toEqual(['opp-ended']);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(
      within(rowOf('حملة منتهية بانتظار الإتمام')).getByText(AR.opportunities.statuses.completed)
    ).toBeInTheDocument();
  });

  it('deep_linked_dialog_lists_every_attendee_with_check_in_time_and_the_absent_count', async () => {
    opportunitiesList = [endedPublished(), upcomingPublished()];
    liveAttendees = [
      buildApplication({
        _id: 'app-attended-late',
        checkedInAt: '2026-11-20T07:20:00.000Z',
        volunteer: {
          volunteerId: 'V-1002',
          fullName: 'متطوعة حاضرة ثانية',
          category: 'academic',
          faculty: FACULTY_A,
        },
        category: 'academic',
      }),
      buildApplication({
        _id: 'app-attended-early',
        checkedInAt: '2026-11-20T07:05:00.000Z',
      }),
      buildApplication({
        _id: 'app-absent',
        attended: false,
        checkedInAt: null,
        absenceCount: 1,
        volunteer: {
          volunteerId: 'V-1003',
          fullName: 'متطوع لم يحضر',
          category: 'student',
          faculty: FACULTY_A,
        },
      }),
    ];
    renderAppAt('/opportunities/manage?complete=opp-ended', buildUser());

    const dialog = await screen.findByRole('dialog');
    // Both attendees are listed by name with their category and exact
    // check-in time; the absent accepted volunteer is NOT in the attendees
    // list — since Phase 19 he appears in the absent section instead.
    expect(await within(dialog).findByText('متطوع حاضر أول')).toBeInTheDocument();
    expect(within(dialog).getByText('متطوعة حاضرة ثانية')).toBeInTheDocument();
    expect(
      within(within(dialog).getByTestId('complete-attendees-list')).queryByText('متطوع لم يحضر')
    ).not.toBeInTheDocument();
    expect(
      within(within(dialog).getByTestId('complete-absent-list')).getByText('متطوع لم يحضر')
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText(AR.categories.student).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(AR.categories.academic)).toBeInTheDocument();
    expect(
      within(dialog).getByText(new RegExp(formatDateTimeAr('2026-11-20T07:05:00.000Z')))
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(new RegExp(formatDateTimeAr('2026-11-20T07:20:00.000Z')))
    ).toBeInTheDocument();
    // The attended list length equals the attended counter (2), and the
    // absent section header reports the one accepted volunteer who never came.
    const list = within(dialog).getByTestId('complete-attendees-list');
    expect(list.querySelectorAll('li')).toHaveLength(2);
    expect(
      within(dialog).getByText(
        new RegExp(`${AR.opportunities.completeAbsentLabel} \\(${formatNumber(1)}\\)`)
      )
    ).toBeInTheDocument();
  });

  it('opens_no_dialog_for_a_completed_or_unknown_complete_param', async () => {
    opportunitiesList = [endedPublished(), endedCompleted()];
    renderAppAt('/opportunities/manage?complete=opp-completed', buildUser());

    await screen.findByText('حملة مكتملة سابقة');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    renderAppAt('/opportunities/manage?complete=opp-missing', buildUser());
    await screen.findByText('حملة منتهية بانتظار الإتمام');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens_no_dialog_when_the_complete_param_targets_an_opportunity_the_dean_cannot_manage', async () => {
    opportunitiesList = [endedPublished()];
    renderAppAt(
      '/opportunities/manage?complete=opp-ended',
      buildUser({
        id: 'dean-user',
        email: 'dean@mnu.edu.eg',
        role: 'dean',
        faculty: FACULTY_A,
      })
    );

    await screen.findByText('حملة منتهية بانتظار الإتمام');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides_completion_actions_from_a_dean_who_did_not_create_the_opportunity', async () => {
    opportunitiesList = [endedPublished(), upcomingPublished()];
    renderAppAt(
      '/opportunities/manage',
      buildUser({
        id: 'dean-user',
        email: 'dean@mnu.edu.eg',
        role: 'dean',
        faculty: FACULTY_A,
      })
    );

    await screen.findByText('حملة منتهية بانتظار الإتمام');
    const endedRow = rowOf('حملة منتهية بانتظار الإتمام');
    expect(
      within(endedRow).queryByRole('button', { name: new RegExp(AR.opportunities.completeBtn) })
    ).not.toBeInTheDocument();
    expect(
      within(endedRow).queryByRole('button', { name: new RegExp(AR.opportunities.cancelBtn) })
    ).not.toBeInTheDocument();
  });
});
