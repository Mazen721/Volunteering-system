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
  AuthUser,
  EventStatsResponse,
  FacultyStatsResponse,
  LeaderboardVolunteer,
  MonthlyHoursResponse,
  OverviewStats,
  ParticipationStatsResponse,
  StudentDashboardSummary,
} from '../types';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];

function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-admin',
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
    certificateBuckets: {
      eligible: 3,
      nearEligible: 2,
      inProgress: 3,
      zeroHours: 2,
    },
    zeroHourVolunteers: [
      {
        _id: 'v-zero-1',
        volunteerId: '20260099',
        fullName: 'طارق نبيل عادل',
        category: 'student',
        faculty: FACULTY_A,
      },
    ],
    ...overrides,
  };
}

const POPULATED_FACULTIES: FacultyStatsResponse = {
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
    {
      faculty: FACULTIES[1],
      volunteerCount: 4,
      totalActivities: 6,
      approvedActivities: 5,
      approvedHours: 50,
      avgHours: 12.5,
      percentage: 34.5,
      activeVolunteers: 3,
      participationRate: 75,
    },
  ],
  totals: {
    volunteerCount: 10,
    totalActivities: 14,
    approvedActivities: 12,
    approvedHours: 145,
    avgHours: 14.5,
  },
};

const POPULATED_PARTICIPATION: ParticipationStatsResponse = {
  funnel: {
    applied: 24,
    accepted: 18,
    attended: 15,
    rejected: 3,
    noShow: 2,
  },
  engagement: {
    joined: 8,
    zeroHours: 2,
  },
};

const POPULATED_EVENTS: EventStatsResponse = {
  topEvents: [
    {
      _id: 'opp-1',
      title: 'قافلة الكلية الطبية',
      faculty: FACULTY_A,
      status: 'completed',
      startAt: '2026-11-10T08:00:00.000Z',
      hours: 6,
      totalSlots: 20,
      acceptedCount: 18,
      attendedCount: 15,
      noShowCount: 3,
      fillRate: 90,
      noShowRate: 16.7,
    },
  ],
  completedEvents: [
    {
      _id: 'opp-1',
      title: 'قافلة الكلية الطبية',
      faculty: FACULTY_A,
      status: 'completed',
      startAt: '2026-11-10T08:00:00.000Z',
      hours: 6,
      totalSlots: 20,
      acceptedCount: 18,
      attendedCount: 15,
      noShowCount: 3,
      fillRate: 90,
      noShowRate: 16.7,
    },
  ],
  summary: {
    totalEvents: 1,
    completedCount: 1,
    avgFillRate: 90,
    avgNoShowRate: 16.7,
  },
};

const POPULATED_MONTHLY: MonthlyHoursResponse = {
  months: [
    { month: '2026-10', label: 'أكتوبر ٢٠٢٦', approvedHours: 60, approvedActivities: 5 },
    { month: '2026-11', label: 'نوفمبر ٢٠٢٦', approvedHours: 85, approvedActivities: 7 },
  ],
};

const POPULATED_LEADERBOARD: LeaderboardVolunteer[] = [
  {
    _id: 'v-top-1',
    volunteerId: '20260001',
    fullName: 'أحمد محمد علي',
    category: 'student',
    categoryLabel: 'الطلاب',
    faculty: FACULTY_A,
    totalActivities: 5,
    approvedActivities: 4,
    approvedHours: 36,
    remainingHours: 0,
    eligible: true,
  },
];

const STUDENT_SUMMARY: StudentDashboardSummary = {
  volunteer: {
    _id: 'vol-student-1',
    volunteerId: '20260001',
    fullName: 'ندى أشرف',
    category: 'student',
    faculty: FACULTY_A,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  approvedHours: 20,
  pendingHours: 4,
  certificateHours: 30,
  remainingHours: 10,
  eligible: false,
  eventsAttended: 3,
  happeningNow: [],
  upcomingAccepted: [],
  activeApplications: [],
  recentActivities: [],
};

let activeUser: AuthUser | null = null;
let overviewPayload: OverviewStats = buildOverview();
let facultiesPayload: FacultyStatsResponse = POPULATED_FACULTIES;
let participationPayload: ParticipationStatsResponse = POPULATED_PARTICIPATION;
let eventsPayload: EventStatsResponse = POPULATED_EVENTS;
let monthlyPayload: MonthlyHoursResponse = POPULATED_MONTHLY;
let capturedOverviewFaculties: Array<string | null> = [];
let capturedParticipationFaculties: Array<string | null> = [];

const mswServer = setupServer(
  // The mobile dock asks for the pending-approvals count on staff pages.
  http.get(`${API_BASE}/registrations`, () => {
    return HttpResponse.json({ registrations: [] });
  }),
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'غير مصرح' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/stats/overview`, ({ request }) => {
    const url = new URL(request.url);
    capturedOverviewFaculties.push(url.searchParams.get('faculty'));
    return HttpResponse.json(overviewPayload);
  }),
  http.get(`${API_BASE}/stats/faculties`, () => {
    return HttpResponse.json(facultiesPayload);
  }),
  http.get(`${API_BASE}/stats/leaderboard`, () => {
    return HttpResponse.json({
      leaderboard: POPULATED_LEADERBOARD,
      certificateHours: overviewPayload.certificateHours,
    });
  }),
  http.get(`${API_BASE}/stats/participation`, ({ request }) => {
    const url = new URL(request.url);
    capturedParticipationFaculties.push(url.searchParams.get('faculty'));
    return HttpResponse.json(participationPayload);
  }),
  http.get(`${API_BASE}/stats/events`, () => {
    return HttpResponse.json(eventsPayload);
  }),
  http.get(`${API_BASE}/stats/monthly-hours`, () => {
    return HttpResponse.json(monthlyPayload);
  }),
  http.get(`${API_BASE}/stats/me`, () => {
    return HttpResponse.json(STUDENT_SUMMARY);
  }),
  http.get(`${API_BASE}/opportunities`, () => {
    return HttpResponse.json({ opportunities: [] });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('v2-7-token');
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
  overviewPayload = buildOverview();
  facultiesPayload = POPULATED_FACULTIES;
  participationPayload = POPULATED_PARTICIPATION;
  eventsPayload = POPULATED_EVENTS;
  monthlyPayload = POPULATED_MONTHLY;
  capturedOverviewFaculties = [];
  capturedParticipationFaculties = [];
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase V2-7 Role-Based Dashboards & Recharts Analytics', () => {
  it('renders_admin_dashboard_with_all_arabic_analytics_widgets_and_faculty_filter', async () => {
    const user = userEvent.setup();
    renderAppAt('/', buildUser());

    expect(await screen.findByRole('heading', { name: AR.dashboard.title })).toBeInTheDocument();
    expect(screen.getByTestId('faculty-comparison-card')).toBeInTheDocument();
    expect(screen.getByTestId('participation-funnel-card')).toBeInTheDocument();
    expect(screen.getByTestId('engagement-donut-card')).toBeInTheDocument();
    expect(screen.getByTestId('monthly-hours-card')).toBeInTheDocument();
    expect(screen.getByTestId('certificate-buckets-card')).toBeInTheDocument();
    expect(screen.getByTestId('event-efficiency-card')).toBeInTheDocument();
    expect(screen.getByTestId('zero-hour-volunteers-card')).toBeInTheDocument();

    expect(
      within(screen.getByTestId('event-efficiency-card')).getAllByText('قافلة الكلية الطبية')
    ).toHaveLength(2);
    expect(within(screen.getByTestId('zero-hour-volunteers-card')).getByText('طارق نبيل عادل')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[A-Za-z]/);

    // Selecting a faculty sends ?faculty=... across stats endpoints and hides multi-faculty comparison
    await user.selectOptions(screen.getByLabelText(AR.dashboard.facultyFilterLabel), FACULTY_A);
    await waitFor(() => {
      expect(capturedOverviewFaculties).toContain(FACULTY_A);
      expect(capturedParticipationFaculties).toContain(FACULTY_A);
    });
    expect(screen.queryByTestId('faculty-comparison-card')).not.toBeInTheDocument();
  });

  it('renders_dean_faculty_scoped_dashboard_without_faculty_dropdown_or_deans_link', async () => {
    renderAppAt(
      '/',
      buildUser({
        id: 'dean-1',
        email: 'dean.med@mnu.edu.eg',
        fullName: 'عميد الطب',
        role: 'dean',
        faculty: FACULTY_A,
      })
    );

    expect(
      await screen.findByRole('heading', { name: `${AR.dashboard.deanTitlePrefix} ${FACULTY_A}` })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(AR.dashboard.facultyFilterLabel)).not.toBeInTheDocument();
    expect(screen.queryByTestId('faculty-comparison-card')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: AR.dashboard.openDeansLink })).not.toBeInTheDocument();
    expect(screen.getByTestId('participation-funnel-card')).toBeInTheDocument();
    expect(screen.getByTestId('certificate-buckets-card')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[A-Za-z]/);
  });

  it('renders_arabic_empty_states_across_analytics_widgets_when_no_data_exists', async () => {
    overviewPayload = buildOverview({
      registeredVolunteers: 0,
      activeVolunteers: 0,
      eligibleVolunteers: 0,
      eventsThisMonth: 0,
      pendingRegistrations: 0,
      pendingApplications: 0,
      certificateBuckets: { eligible: 0, nearEligible: 0, inProgress: 0, zeroHours: 0 },
      zeroHourVolunteers: [],
    });
    facultiesPayload = {
      faculties: [],
      totals: { volunteerCount: 0, totalActivities: 0, approvedActivities: 0, approvedHours: 0, avgHours: 0 },
    };
    participationPayload = {
      funnel: { applied: 0, accepted: 0, attended: 0, rejected: 0, noShow: 0 },
      engagement: { joined: 0, zeroHours: 0 },
    };
    eventsPayload = {
      topEvents: [],
      completedEvents: [],
      summary: { totalEvents: 0, completedCount: 0, avgFillRate: 0, avgNoShowRate: 0 },
    };
    monthlyPayload = { months: [] };

    renderAppAt('/', buildUser());

    expect(await screen.findByText(AR.analytics.funnelEmpty)).toBeInTheDocument();
    expect(screen.getByText(AR.analytics.engagementEmpty)).toBeInTheDocument();
    expect(screen.getByText(AR.analytics.monthlyEmpty)).toBeInTheDocument();
    expect(screen.getByText(AR.analytics.bucketsEmpty)).toBeInTheDocument();
    expect(screen.getByText(AR.analytics.eventsEmpty)).toBeInTheDocument();
    expect(screen.getByText(AR.dashboard.zeroHourStudentsEmpty)).toBeInTheDocument();
  });

  it('shows_arabic_analytics_error_alert_and_recovers_on_retry', async () => {
    const user = userEvent.setup();
    let failParticipation = true;
    mswServer.use(
      http.get(`${API_BASE}/stats/participation`, () => {
        if (failParticipation) {
          return HttpResponse.json({ message: 'تعذر تحميل التحليلات' }, { status: 500 });
        }
        return HttpResponse.json(POPULATED_PARTICIPATION);
      })
    );

    renderAppAt('/', buildUser());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(AR.dashboard.analyticsErrorTitle);
    expect(alert).toHaveTextContent('تعذر تحميل التحليلات');

    failParticipation = false;
    await user.click(within(alert).getByRole('button', { name: AR.dashboard.retryButton }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('renders_student_dashboard_with_recharts_hours_breakdown_in_arabic', async () => {
    renderAppAt(
      '/me',
      buildUser({
        id: 'student-1',
        email: 'student@mnu.edu.eg',
        fullName: 'ندى أشرف',
        role: 'student',
        faculty: FACULTY_A,
        volunteer: 'vol-student-1',
      })
    );

    expect(await screen.findByTestId('student-hours-chart')).toBeInTheDocument();
    expect(screen.getByText(AR.analytics.studentChartTitle)).toBeInTheDocument();
    expect(screen.getByText(AR.analytics.studentChartApproved)).toBeInTheDocument();
    expect(screen.getByText(AR.analytics.studentChartPending)).toBeInTheDocument();
    expect(screen.getByText(AR.analytics.studentChartRemaining)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[A-Za-z]/);
  });
});
