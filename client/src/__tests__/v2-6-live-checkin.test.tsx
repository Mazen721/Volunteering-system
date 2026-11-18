import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type {
  Application,
  AuthUser,
  LiveOpportunityResponse,
  Opportunity,
  StudentDashboardSummary,
} from '../types';
import { formatNumber } from '../utils/format';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];

function buildUser(role: 'admin' | 'student'): AuthUser {
  return {
    id: `${role}-user`,
    email: `${role}@mnu.edu.eg`,
    fullName: role === 'admin' ? 'مدير النظام' : 'طالب متطوع',
    role,
    status: 'active',
    faculty: role === 'admin' ? null : FACULTY_A,
    volunteer: role === 'admin' ? null : 'vol-1',
    interests: ['medical'],
    registration: null,
    rejectionReason: null,
    lastLoginAt: null,
  };
}

function buildOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    _id: 'op-live-1',
    title: 'قافلة طبية مباشرة',
    description: 'وصف تفصيلي لفعالية تطوعية مفتوحة لتسجيل الحضور المباشر',
    requirements: '',
    fields: ['medical'],
    activityType: 'قافلة',
    location: { name: 'مستشفى الجامعة', address: 'مدينة المنصورة الجديدة' },
    startAt: '2026-11-18T08:00:00.000Z',
    endAt: '2026-11-18T11:00:00.000Z',
    registrationDeadline: '2026-11-17T08:00:00.000Z',
    hours: 4,
    contactName: 'د. مسؤول الفعالية',
    contactPhone: '01000000000',
    contactEmail: 'live@mnu.edu.eg',
    faculty: FACULTY_A,
    slots: { student: 5, academic: 0, admin: 0 },
    acceptedCounts: { student: 2, academic: 0, admin: 0 },
    approvalMode: 'auto',
    status: 'published',
    createdBy: 'admin-user',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    phase: 'in_progress',
    checkInOpen: true,
    remainingSlots: { student: 3, academic: 0, admin: 0 },
    ...overrides,
  };
}

function buildApplication(overrides: Partial<Application> = {}): Application {
  return {
    _id: 'app-1',
    opportunity: 'op-live-1',
    volunteer: {
      _id: 'vol-1',
      volunteerId: '20260010',
      fullName: 'أحمد محمود',
      category: 'student',
      faculty: FACULTY_A,
    },
    user: 'student-user',
    faculty: FACULTY_A,
    category: 'student',
    status: 'accepted',
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

let activeUser: AuthUser | null = null;
let liveResponse: LiveOpportunityResponse;
let tokenCounter = 0;
let studentOpportunity: Opportunity;
let checkInOutcome: { status: number; body: Record<string, unknown> } = {
  status: 200,
  body: {},
};
let completeCalls = 0;

function resetFixtures() {
  tokenCounter = 0;
  completeCalls = 0;
  const opp = buildOpportunity({ endAt: '2020-01-01T10:00:00.000Z' });
  liveResponse = {
    opportunity: opp,
    counters: { accepted: 2, checkedIn: 0, notArrived: 2 },
    attendees: [
      buildApplication({ _id: 'app-1' }),
      buildApplication({
        _id: 'app-2',
        volunteer: {
          _id: 'vol-2',
          volunteerId: '20260011',
          fullName: 'سارة علي',
          category: 'student',
          faculty: FACULTY_A,
        },
      }),
    ],
  };
  studentOpportunity = buildOpportunity({
    myApplication: buildApplication({ _id: 'app-1' }),
  });
  checkInOutcome = {
    status: 200,
    body: {
      application: buildApplication({
        _id: 'app-1',
        attended: true,
        checkedInAt: '2026-11-18T10:00:00.000Z',
      }),
    },
  };
}

resetFixtures();

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
  http.get(`${API_BASE}/opportunities/:id/live`, () => HttpResponse.json(liveResponse)),
  http.get(`${API_BASE}/opportunities/:id/checkin-token`, () => {
    tokenCounter += 1;
    return HttpResponse.json({
      token: `qr-token-${tokenCounter}`,
      expiresAt: '2026-11-18T12:00:45.000Z',
    });
  }),
  http.post(`${API_BASE}/opportunities/:id/checkin/manual`, async ({ request }) => {
    const body = (await request.json()) as { applicationId: string; attended: boolean };
    const updated = liveResponse.attendees.find((item) => item._id === body.applicationId)!;
    const nextApp: Application = {
      ...updated,
      attended: body.attended,
      checkedInAt: body.attended ? '2026-11-18T10:05:00.000Z' : null,
    };
    liveResponse = {
      ...liveResponse,
      attendees: liveResponse.attendees.map((item) =>
        item._id === body.applicationId ? nextApp : item
      ),
    };
    return HttpResponse.json({ application: nextApp });
  }),
  http.post(`${API_BASE}/opportunities/:id/complete`, () => {
    completeCalls += 1;
    liveResponse = {
      ...liveResponse,
      opportunity: { ...liveResponse.opportunity, status: 'completed', checkInOpen: false },
    };
    return HttpResponse.json({
      opportunity: liveResponse.opportunity,
      creditedCount: 1,
      noShowCount: 1,
    });
  }),
  http.get(`${API_BASE}/stats/me`, () => {
    const summary: StudentDashboardSummary = {
      volunteer: {
        _id: 'vol-1',
        volunteerId: '20260010',
        fullName: 'أحمد محمود',
        category: 'student',
        faculty: FACULTY_A,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
      approvedHours: 10,
      pendingHours: 0,
      certificateHours: 30,
      remainingHours: 20,
      eligible: false,
      eventsAttended: 1,
      happeningNow: [studentOpportunity],
      upcomingAccepted: [],
      activeApplications: [],
      recentActivities: [],
    };
    return HttpResponse.json(summary);
  }),
  http.get(`${API_BASE}/opportunities`, () => HttpResponse.json({ opportunities: [] })),
  http.get(`${API_BASE}/opportunities/:id`, () =>
    HttpResponse.json({ opportunity: studentOpportunity })
  ),
  http.post(`${API_BASE}/opportunities/:id/checkin`, () =>
    HttpResponse.json(checkInOutcome.body, { status: checkInOutcome.status })
  )
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('valid-token');
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
  resetFixtures();
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase V2-6 Live QR Check-in & Completion UI', () => {
  it('renders_rotating_qr_toggles_manual_checkin_and_completes_event_on_live_page', async () => {
    const user = userEvent.setup();
    renderAppAt('/opportunities/op-live-1/live', buildUser('admin'));

    expect(await screen.findByText('قافلة طبية مباشرة')).toBeInTheDocument();
    expect(await screen.findByTestId('live-checkin-token')).toHaveTextContent('qr-token-1');
    expect(screen.getByTestId('live-qr-wrapper').querySelector('svg')).not.toBeNull();
    expect(screen.getByTestId('counter-accepted')).toHaveTextContent(formatNumber(2));
    expect(screen.getByTestId('counter-checked-in')).toHaveTextContent(formatNumber(0));

    // Manual token rotation button fetches the next token.
    await user.click(screen.getByRole('button', { name: AR.opportunities.live.qrRefreshBtn }));
    expect(await screen.findByTestId('live-checkin-token')).toHaveTextContent('qr-token-2');

    // Manual check-in toggle updates counters immediately.
    const markButtons = screen.getAllByRole('button', {
      name: AR.opportunities.live.markAttendedBtn,
    });
    await user.click(markButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('counter-checked-in')).toHaveTextContent(formatNumber(1));
      expect(screen.getByTestId('counter-not-arrived')).toHaveTextContent(formatNumber(1));
    });

    // Completing the event shows confirmation dialog and closes QR section.
    await user.click(screen.getByRole('button', { name: AR.opportunities.live.completeBtn }));
    expect(await screen.findByText(AR.opportunities.live.completeConfirmTitle)).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', {
      name: AR.opportunities.live.completeBtn,
    });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(completeCalls).toBe(1);
    });
    expect(await screen.findByText(AR.opportunities.live.completedNotice)).toBeInTheDocument();
    expect(screen.queryByTestId('live-checkin-token')).not.toBeInTheDocument();
  });

  it('navigates_from_happening_now_banner_to_checkin_and_shows_success_and_arabic_errors', async () => {
    const user = userEvent.setup();
    renderAppAt('/me', buildUser('student'));

    expect(await screen.findByText(AR.studentPortal.dashboard.happeningNowTitle)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /قافلة طبية مباشرة/ }));

    expect(await screen.findByText(AR.studentPortal.checkin.pageTitle)).toBeInTheDocument();

    // First simulate an expired QR token error (400) — must stay logged in and display Arabic alert.
    checkInOutcome = {
      status: 400,
      body: { message: 'انتهت صلاحية رمز الحضور، يرجى مسح الرمز المحدث' },
    };
    const tokenInput = screen.getByLabelText(AR.studentPortal.checkin.tokenLabel);
    await user.type(tokenInput, 'expired-jwt');
    await user.click(screen.getByRole('button', { name: AR.studentPortal.checkin.submitBtn }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((el) => el.textContent?.includes('انتهت صلاحية رمز الحضور'))).toBe(true);
    expect(localStorage.getItem('mnu_admin_token')).toBe('valid-token');

    // Now submit a valid rotating QR token.
    checkInOutcome = {
      status: 200,
      body: {
        application: buildApplication({
          _id: 'app-1',
          attended: true,
          checkedInAt: '2026-11-18T10:00:00.000Z',
        }),
      },
    };
    await user.clear(tokenInput);
    await user.type(tokenInput, 'valid-jwt');
    await user.click(screen.getByRole('button', { name: AR.studentPortal.checkin.submitBtn }));

    expect(await screen.findByText(AR.studentPortal.checkin.successMessage)).toBeInTheDocument();
  });
});
