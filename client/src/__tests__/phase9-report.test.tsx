import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type { AuthUser, StudentDashboardSummary, VolunteeringReport } from '../types';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];
const FACULTY_B = FACULTIES[1];

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

function buildReport(overrides: Partial<VolunteeringReport> = {}): VolunteeringReport {
  return {
    meta: {
      scope: 'university',
      faculty: null,
      generatedAt: '2026-11-25T08:00:00.000Z',
      generatedBy: {
        id: 'user-admin',
        fullName: 'مسؤول النظام',
        email: 'admin@mnu.edu.eg',
        role: 'admin',
      },
    },
    overview: {
      totalApprovedHours: 85,
      totalActivities: 3,
      approvedActivities: 3,
      registeredVolunteers: 4,
      activeVolunteers: 3,
      eligibleVolunteers: 2,
      activeFaculties: 2,
      avgHoursPerRegistered: 21.25,
      avgHoursPerActive: 28.33,
      certificateHours: 30,
      eventsThisMonth: 1,
      pendingRegistrations: 0,
      pendingApplications: 1,
      certificateBuckets: { eligible: 2, nearEligible: 0, inProgress: 1, zeroHours: 1 },
      zeroHourVolunteers: [],
    },
    faculties: {
      faculties: [
        {
          faculty: FACULTY_A,
          volunteerCount: 3,
          totalActivities: 2,
          approvedActivities: 2,
          approvedHours: 45,
          avgHours: 15,
          percentage: 52.9,
          activeVolunteers: 2,
          participationRate: 66.7,
        },
        {
          faculty: FACULTY_B,
          volunteerCount: 1,
          totalActivities: 1,
          approvedActivities: 1,
          approvedHours: 40,
          avgHours: 40,
          percentage: 47.1,
          activeVolunteers: 1,
          participationRate: 100,
        },
      ],
      totals: {
        volunteerCount: 4,
        totalActivities: 3,
        approvedActivities: 3,
        approvedHours: 85,
        avgHours: 21.25,
      },
    },
    categories: {
      categories: [
        {
          category: 'student',
          label: 'الطلاب',
          volunteerCount: 4,
          totalActivities: 3,
          approvedActivities: 3,
          approvedHours: 85,
          avgHours: 21.25,
        },
        {
          category: 'academic',
          label: 'أعضاء الكادر الأكاديمي',
          volunteerCount: 0,
          totalActivities: 0,
          approvedActivities: 0,
          approvedHours: 0,
          avgHours: 0,
        },
        {
          category: 'admin',
          label: 'أعضاء الجهاز الإداري',
          volunteerCount: 0,
          totalActivities: 0,
          approvedActivities: 0,
          approvedHours: 0,
          avgHours: 0,
        },
      ],
      totals: {
        volunteerCount: 4,
        totalActivities: 3,
        approvedActivities: 3,
        approvedHours: 85,
        avgHours: 21.25,
      },
    },
    participation: {
      funnel: { applied: 6, accepted: 4, attended: 2, rejected: 1, noShow: 1 },
      engagement: { joined: 3, zeroHours: 1 },
    },
    monthlyHours: {
      months: [
        { month: '2026-11', label: 'نوفمبر ٢٠٢٦', approvedHours: 85, approvedActivities: 3 },
      ],
    },
    leaderboard: {
      leaderboard: [
        {
          _id: 'v-b1',
          volunteerId: 'B-901',
          fullName: 'يوسف سامي',
          category: 'student',
          categoryLabel: 'الطلاب',
          faculty: FACULTY_B,
          totalActivities: 1,
          approvedActivities: 1,
          approvedHours: 40,
          remainingHours: 0,
          eligible: true,
        },
      ],
      certificateHours: 30,
    },
    interests: [
      {
        field: 'medical',
        label: 'القطاع الطبي',
        opportunitiesCount: 2,
        totalHours: 12,
        percentage: 66.7,
      },
      {
        field: 'charity_community',
        label: 'التكافل والعمل الخيري',
        opportunitiesCount: 1,
        totalHours: 6,
        percentage: 33.3,
      },
      {
        field: 'education',
        label: 'التعليم ومحو الأمية',
        opportunitiesCount: 1,
        totalHours: 6,
        percentage: 33.3,
      },
    ],
    opportunityStatuses: [
      { status: 'draft', count: 0, percentage: 0 },
      { status: 'published', count: 2, percentage: 66.7 },
      { status: 'cancelled', count: 0, percentage: 0 },
      { status: 'completed', count: 1, percentage: 33.3 },
    ],
    opportunities: [
      {
        _id: 'opp-a',
        title: 'قافلة كلية الطب المكتملة',
        faculty: FACULTY_A,
        status: 'completed',
        fields: ['medical', 'education'],
        startAt: '2026-11-01T09:00:00.000Z',
        endAt: '2026-11-01T15:00:00.000Z',
        hours: 6,
        totalSlots: 4,
        applicationsCount: 3,
        pendingCount: 0,
        acceptedCount: 2,
        attendedCount: 1,
        rejectedCount: 1,
        fillRate: 50,
        attendanceRate: 50,
      },
      {
        _id: 'opp-b',
        title: 'عيادة الأسنان الميدانية',
        faculty: FACULTY_B,
        status: 'published',
        fields: ['medical'],
        startAt: '2026-12-01T09:00:00.000Z',
        endAt: '2026-12-01T15:00:00.000Z',
        hours: 6,
        totalSlots: 2,
        applicationsCount: 1,
        pendingCount: 0,
        acceptedCount: 1,
        attendedCount: 1,
        rejectedCount: 0,
        fillRate: 50,
        attendanceRate: 100,
      },
    ],
    summary: {
      totalOpportunities: 3,
      totalApplications: 6,
      approvalRate: 66.7,
      attendanceRate: 50,
      totalAttended: 2,
    },
    ...overrides,
  };
}

function buildDeanReport(): VolunteeringReport {
  const adminReport = buildReport();
  return buildReport({
    meta: {
      scope: 'faculty',
      faculty: FACULTY_A,
      generatedAt: '2026-11-25T08:00:00.000Z',
      generatedBy: {
        id: 'dean-1',
        fullName: 'عميد كلية الطب البشري',
        email: 'medicine.dean@mnu.edu.eg',
        role: 'dean',
      },
    },
    faculties: {
      faculties: [adminReport.faculties.faculties[0]],
      totals: {
        volunteerCount: 3,
        totalActivities: 2,
        approvedActivities: 2,
        approvedHours: 45,
        avgHours: 15,
      },
    },
    leaderboard: {
      leaderboard: [
        {
          _id: 'v-a1',
          volunteerId: 'A-901',
          fullName: 'سارة أحمد',
          category: 'student',
          categoryLabel: 'الطلاب',
          faculty: FACULTY_A,
          totalActivities: 1,
          approvedActivities: 1,
          approvedHours: 35,
          remainingHours: 0,
          eligible: true,
        },
      ],
      certificateHours: 30,
    },
    opportunities: [adminReport.opportunities[0]],
    summary: {
      totalOpportunities: 1,
      totalApplications: 4,
      approvalRate: 75,
      attendanceRate: 50,
      totalAttended: 1,
    },
  });
}

const STUDENT_SUMMARY: StudentDashboardSummary = {
  volunteer: null,
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
};

let activeUser: AuthUser | null = null;
let reportPayload: VolunteeringReport = buildReport();

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'غير مصرح' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/stats/report`, () => {
    return HttpResponse.json(reportPayload);
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
  setStoredToken('phase9-token');
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
  reportPayload = buildReport();
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase 9 Printable PDF Report', () => {
  it('renders_the_university_report_for_admin_with_charts_and_all_tables', async () => {
    renderAppAt('/reports/print', buildUser());

    expect(await screen.findByRole('heading', { name: AR.report.title })).toBeInTheDocument();
    expect(screen.getByText(AR.report.universityScope)).toBeInTheDocument();
    expect(screen.getByTestId('report-kpis')).toBeInTheDocument();
    expect(screen.getByTestId('report-faculty-chart')).toBeInTheDocument();
    expect(screen.getByTestId('report-interest-chart')).toBeInTheDocument();
    expect(screen.getByTestId('report-monthly-chart')).toBeInTheDocument();
    expect(screen.getByTestId('report-status-chart')).toBeInTheDocument();
    expect(screen.getByTestId('report-funnel-chart')).toBeInTheDocument();
    expect(screen.getByTestId('report-faculty-table')).toBeInTheDocument();
    expect(screen.getByTestId('report-top-volunteers-table')).toBeInTheDocument();
    expect(screen.getByTestId('report-opportunities-table')).toBeInTheDocument();
    expect(screen.getAllByText('قافلة كلية الطب المكتملة').length).toBeGreaterThan(0);
    expect(screen.getAllByText('عيادة الأسنان الميدانية').length).toBeGreaterThan(0);
    expect(screen.getAllByText(FACULTY_B).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: new RegExp(AR.report.printButton) })
    ).toBeInTheDocument();
  });

  it('renders_only_his_faculty_for_a_dean_without_cross_faculty_content', async () => {
    reportPayload = buildDeanReport();
    renderAppAt(
      '/reports/print',
      buildUser({
        id: 'dean-1',
        email: 'medicine.dean@mnu.edu.eg',
        fullName: 'عميد كلية الطب البشري',
        role: 'dean',
        faculty: FACULTY_A,
      })
    );

    expect(await screen.findByRole('heading', { name: AR.report.title })).toBeInTheDocument();
    expect(screen.queryByTestId('report-faculty-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('report-faculty-table')).not.toBeInTheDocument();
    expect(screen.getByTestId('report-opportunities-table')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(FACULTY_B);
    expect(document.body.textContent).not.toContain('عيادة الأسنان الميدانية');
    expect(document.body.textContent).not.toContain('يوسف سامي');
    expect(document.body.textContent).toContain('سارة أحمد');
  });

  it('redirects_students_away_from_the_report_route', async () => {
    renderAppAt(
      '/reports/print',
      buildUser({
        id: 'student-1',
        email: 'student@mnu.edu.eg',
        fullName: 'طالب',
        role: 'student',
        faculty: FACULTY_A,
      })
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe('/home');
    });
    expect(screen.queryByRole('heading', { name: AR.report.title })).not.toBeInTheDocument();
  });
});
