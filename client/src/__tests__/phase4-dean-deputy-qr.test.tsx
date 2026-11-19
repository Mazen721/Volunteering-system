import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { DeanFacultyCard } from '../components/dashboard/DeanFacultyCard';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type {
  Application,
  AuthUser,
  FacultyStatsRow,
  LiveOpportunityResponse,
  Opportunity,
} from '../types';
import { formatNumber, formatPercent } from '../utils/format';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];

function buildUser(role: 'admin' | 'student', id = `${role}-user`): AuthUser {
  return {
    id,
    email: `${id}@mnu.edu.eg`,
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
    attendanceDeputy: null,
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
let detailOpportunity: Opportunity;
let lastDeputyBody: { deputyUserId: string | null } | null = null;

function resetFixtures() {
  lastDeputyBody = null;
  liveResponse = {
    opportunity: buildOpportunity({ endAt: '2020-01-01T10:00:00.000Z' }),
    counters: { accepted: 2, checkedIn: 0, notArrived: 2 },
    attendees: [
      buildApplication({ _id: 'app-1' }),
      buildApplication({
        _id: 'app-2',
        user: 'student-user-2',
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
  detailOpportunity = buildOpportunity({
    attendanceDeputy: 'student-user',
    myApplication: buildApplication({ _id: 'app-1' }),
  });
}

resetFixtures();

const mswServer = setupServer(
  http.get(`${API_BASE}/registrations`, () => HttpResponse.json({ registrations: [] })),
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'غير مصرح' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/opportunities/:id/live`, () => HttpResponse.json(liveResponse)),
  http.get(`${API_BASE}/opportunities/:id/checkin-token`, () =>
    HttpResponse.json({ token: 'qr-token-1', expiresAt: '2026-11-18T12:00:45.000Z' })
  ),
  http.put(`${API_BASE}/opportunities/:id/deputy`, async ({ request }) => {
    lastDeputyBody = (await request.json()) as { deputyUserId: string | null };
    liveResponse = {
      ...liveResponse,
      opportunity: { ...liveResponse.opportunity, attendanceDeputy: lastDeputyBody.deputyUserId },
    };
    return HttpResponse.json({ opportunity: liveResponse.opportunity });
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
  http.get(`${API_BASE}/opportunities/:id`, () =>
    HttpResponse.json({ opportunity: detailOpportunity })
  ),
  http.get(`${API_BASE}/opportunities`, () => HttpResponse.json({ opportunities: [] }))
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

describe('Phase 4 Dean card, attendance deputy & in-site QR scan', () => {
  it('dean_faculty_card_shows_only_his_faculty_numbers_in_a_full_card', () => {
    const row: FacultyStatsRow = {
      faculty: FACULTY_A,
      volunteerCount: 40,
      totalActivities: 34,
      approvedActivities: 30,
      approvedHours: 120,
      avgHours: 3,
      percentage: 45,
      activeVolunteers: 25,
      participationRate: 62.5,
    };
    render(<DeanFacultyCard faculties={[row]} />);

    const card = screen.getByTestId('dean-faculty-card');
    expect(within(card).getByText(FACULTY_A)).toBeInTheDocument();
    expect(within(card).getByText(formatNumber(40))).toBeInTheDocument();
    expect(within(card).getByText(new RegExp(formatNumber(25)))).toBeInTheDocument();
    expect(within(card).getByText(formatNumber(120))).toBeInTheDocument();
    expect(within(card).getAllByText(formatPercent(62.5)).length).toBeGreaterThanOrEqual(1);
    // No other faculty appears — this is not the admin comparison chart.
    for (const other of FACULTIES.slice(1)) {
      expect(within(card).queryByText(other)).not.toBeInTheDocument();
    }
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '63');
  });

  it('staff_assigns_attendance_deputy_from_the_live_page', async () => {
    const user = userEvent.setup();
    renderAppAt('/opportunities/op-live-1/live', buildUser('admin', 'admin-user'));

    const card = await screen.findByTestId('attendance-deputy-card');
    expect(within(card).getByText(AR.opportunities.live.deputy.notAssigned)).toBeInTheDocument();

    await user.selectOptions(
      within(card).getByLabelText(AR.opportunities.live.deputy.selectLabel),
      'student-user-2'
    );
    await user.click(
      within(card).getByRole('button', { name: AR.opportunities.live.deputy.saveBtn })
    );

    expect(await within(card).findByText('سارة علي', { exact: true })).toBeInTheDocument();
    expect(lastDeputyBody).toEqual({ deputyUserId: 'student-user-2' });
  });

  it('student_deputy_opens_live_sees_qr_and_manual_toggle_but_no_complete_or_deputy_card', async () => {
    const user = userEvent.setup();
    liveResponse = {
      ...liveResponse,
      opportunity: { ...liveResponse.opportunity, attendanceDeputy: 'student-user' },
    };
    renderAppAt('/opportunities/op-live-1/live', buildUser('student', 'student-user'));

    expect(await screen.findByText(AR.opportunities.live.deputyBanner)).toBeInTheDocument();
    expect(await screen.findByTestId('live-checkin-token')).toHaveTextContent('qr-token-1');
    expect(screen.queryByTestId('attendance-deputy-card')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: AR.opportunities.live.completeBtn })
    ).not.toBeInTheDocument();

    // The deputy can still mark a classmate's attendance manually.
    const markButtons = await screen.findAllByRole('button', {
      name: new RegExp(AR.opportunities.live.markAttendedBtn),
    });
    await user.click(markButtons[0]);
    expect(
      await screen.findByText(AR.opportunities.live.manualToggleSuccess)
    ).toBeInTheDocument();
  });

  it('student_sees_deputy_banner_and_live_link_on_opportunity_details', async () => {
    renderAppAt('/opportunities/op-live-1', buildUser('student', 'student-user'));

    const card = await screen.findByTestId('deputy-live-card');
    expect(within(card).getByText(AR.studentPortal.details.deputyTitle)).toBeInTheDocument();
    expect(
      within(card).getByRole('link', { name: AR.studentPortal.details.deputyLiveBtn })
    ).toHaveAttribute('href', '/opportunities/op-live-1/live');
  });

  it('checkin_page_offers_camera_scan_and_falls_back_when_detector_is_unavailable', async () => {
    const user = userEvent.setup();
    renderAppAt('/checkin/op-live-1', buildUser('student', 'student-user'));

    const scanButton = await screen.findByRole('button', {
      name: AR.studentPortal.checkin.scanCameraBtn,
    });
    await user.click(scanButton);

    // jsdom has no BarcodeDetector, so the in-site scanner must explain the
    // fallback instead of breaking — the paste field stays available.
    expect(
      await screen.findByText(AR.studentPortal.checkin.cameraUnsupported)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(AR.studentPortal.checkin.tokenLabel)).toBeInTheDocument();
  });
});
