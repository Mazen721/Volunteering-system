import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type { AuthUser, VolunteeringReport } from '../types';

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
      facultyName: null,
      from: null,
      to: null,
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
      ],
      totals: {
        volunteerCount: 3,
        totalActivities: 2,
        approvedActivities: 2,
        approvedHours: 45,
        avgHours: 15,
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
    leaderboard: { leaderboard: [], certificateHours: 30 },
    interests: [],
    opportunityStatuses: [{ status: 'published', count: 1, percentage: 100 }],
    opportunities: [],
    summary: {
      totalOpportunities: 1,
      totalApplications: 6,
      approvalRate: 66.7,
      attendanceRate: 50,
      totalAttended: 2,
    },
    ...overrides,
  } as VolunteeringReport;
}

let activeUser: AuthUser | null = null;
let reportPayload: VolunteeringReport = buildReport();
let lastReportSearch = '';

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'غير مصرح' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/stats/report`, ({ request }) => {
    lastReportSearch = new URL(request.url).search;
    return HttpResponse.json(reportPayload);
  }),
  http.get(`${API_BASE}/registrations`, () => {
    return HttpResponse.json({ registrations: [] });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('phase14-token');
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
  lastReportSearch = '';
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase 14 Report Export Filters', () => {
  it('shows_a_faculty_dropdown_for_admin_and_builds_the_configured_print_url', async () => {
    renderAppAt('/import-export', buildUser());

    const select = (await screen.findByTestId('report-faculty-select')) as HTMLSelectElement;
    expect(screen.getByRole('option', { name: AR.report.allFaculties })).toBeInTheDocument();
    for (const faculty of FACULTIES) {
      expect(screen.getByRole('option', { name: faculty })).toBeInTheDocument();
    }

    // Default: no faculty, no period.
    expect(screen.getByTestId('report-export-link').getAttribute('href')).toBe(
      '/reports/print?autoprint=1'
    );

    fireEvent.change(select, { target: { value: FACULTY_B } });
    fireEvent.change(screen.getByTestId('report-from-input'), {
      target: { value: '2026-11-01' },
    });
    fireEvent.change(screen.getByTestId('report-to-input'), {
      target: { value: '2026-11-30' },
    });

    const href = screen.getByTestId('report-export-link').getAttribute('href') ?? '';
    const params = new URLSearchParams(href.split('?')[1]);
    expect(href.startsWith('/reports/print?')).toBe(true);
    expect(params.get('autoprint')).toBe('1');
    expect(params.get('faculty')).toBe(FACULTY_B);
    expect(params.get('from')).toBe('2026-11-01');
    expect(params.get('to')).toBe('2026-11-30');
  });

  it('shows_a_dean_his_faculty_as_fixed_text_without_a_dropdown', async () => {
    renderAppAt(
      '/import-export',
      buildUser({
        id: 'dean-1',
        email: 'medicine.dean@mnu.edu.eg',
        fullName: 'عميد كلية الطب البشري',
        role: 'dean',
        faculty: FACULTY_A,
      })
    );

    expect(await screen.findByTestId('report-export-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('report-faculty-select')).not.toBeInTheDocument();
    expect(screen.getByText(AR.report.panel.deanFacultyNote)).toBeInTheDocument();
    expect(screen.getByTestId('report-export-panel').textContent).toContain(FACULTY_A);

    fireEvent.change(screen.getByTestId('report-from-input'), {
      target: { value: '2026-11-01' },
    });

    const href = screen.getByTestId('report-export-link').getAttribute('href') ?? '';
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('faculty')).toBeNull();
    expect(params.get('from')).toBe('2026-11-01');
    expect(params.get('to')).toBeNull();
  });

  it('passes_params_to_the_api_and_badges_scope_and_period_on_the_print_view', async () => {
    reportPayload = buildReport({
      meta: {
        scope: 'faculty',
        faculty: FACULTY_B,
        facultyName: FACULTY_B,
        from: '2026-11-01',
        to: '2026-11-30',
        generatedAt: '2026-11-25T08:00:00.000Z',
        generatedBy: {
          id: 'user-admin',
          fullName: 'مسؤول النظام',
          email: 'admin@mnu.edu.eg',
          role: 'admin',
        },
      },
    });
    renderAppAt(
      `/reports/print?faculty=${encodeURIComponent(FACULTY_B)}&from=2026-11-01&to=2026-11-30`,
      buildUser()
    );

    expect(await screen.findByRole('heading', { name: AR.report.title })).toBeInTheDocument();

    const sentParams = new URLSearchParams(lastReportSearch);
    expect(sentParams.get('faculty')).toBe(FACULTY_B);
    expect(sentParams.get('from')).toBe('2026-11-01');
    expect(sentParams.get('to')).toBe('2026-11-30');

    expect(screen.getByText(`${AR.report.facultyScopePrefix} ${FACULTY_B}`)).toBeInTheDocument();
    const periodBadge = screen.getByTestId('report-period-badge');
    expect(periodBadge.textContent).toContain(AR.report.periodLabel);
    expect(periodBadge.textContent).toContain('نوفمبر');
    // Eligibility is honestly labelled as period-scoped under a range.
    expect(screen.getByText(AR.report.kpis.certificatesInPeriod)).toBeInTheDocument();
    expect(screen.queryByText(AR.report.kpis.certificates)).not.toBeInTheDocument();
  });

  it('badges_all_periods_and_keeps_the_default_eligibility_label_without_params', async () => {
    renderAppAt('/reports/print', buildUser());

    expect(await screen.findByRole('heading', { name: AR.report.title })).toBeInTheDocument();
    expect(lastReportSearch).toBe('');
    expect(screen.getByTestId('report-period-badge').textContent).toContain(AR.report.allPeriods);
    expect(screen.getByText(AR.report.kpis.certificates)).toBeInTheDocument();
    expect(screen.queryByText(AR.report.kpis.certificatesInPeriod)).not.toBeInTheDocument();
  });
});
