import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR, INTEREST_LABELS } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type { AuthUser, Opportunity, StudentDashboardSummary } from '../types';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];
const CERTIFICATE_HOURS = 50;

function buildStudentUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'student-user',
    email: 'student@mnu.edu.eg',
    fullName: 'طالب متطوع',
    role: 'student',
    status: 'pending',
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
    recommendationScore: 13,
    matchedFields: ['medical'],
    isFull: false,
    waitlistAvailable: false,
    ...overrides,
  };
}

function buildDashboardSummary(
  overrides: Partial<StudentDashboardSummary> = {}
): StudentDashboardSummary {
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
    certificateHours: CERTIFICATE_HOURS,
    remainingHours: CERTIFICATE_HOURS,
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
let opportunitiesList: Opportunity[] = [];
let applyCalls: string[] = [];
let registerCalls: number = 0;

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'جلسة الدخول غير صالحة أو منتهية' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.post(`${API_BASE}/auth/register`, () => {
    registerCalls += 1;
    return HttpResponse.json({ token: 'new-token', user: buildStudentUser() }, { status: 201 });
  }),
  http.get(`${API_BASE}/stats/me`, () => {
    return HttpResponse.json(buildDashboardSummary());
  }),
  http.get(`${API_BASE}/applications/me`, () => {
    return HttpResponse.json({ applications: [] });
  }),
  http.get(`${API_BASE}/opportunities`, () => {
    return HttpResponse.json({ opportunities: opportunitiesList });
  }),
  http.get(`${API_BASE}/opportunities/:id`, ({ params }) => {
    const opportunity = opportunitiesList.find((entry) => entry._id === params.id);
    if (!opportunity) {
      return HttpResponse.json({ message: 'الفرصة التطوعية غير موجودة' }, { status: 404 });
    }
    return HttpResponse.json({ opportunity });
  }),
  http.post(`${API_BASE}/opportunities/:id/apply`, ({ params }) => {
    applyCalls.push(String(params.id));
    return HttpResponse.json({ message: 'غير متوقع' }, { status: 500 });
  })
);

function renderAppAt(route: string, user: AuthUser | null) {
  activeUser = user;
  if (user) {
    setStoredToken('phase1-token');
  }
  window.history.pushState({}, '', route);
  return render(<App />);
}

describe('Phase 1 Pending Student Flow & University Email Rule (Client)', () => {
  beforeAll(() => {
    mswServer.listen({ onUnhandledFrame: 'error' });
  });

  afterEach(() => {
    mswServer.resetHandlers();
    localStorage.clear();
    activeUser = null;
    opportunitiesList = [];
    applyCalls = [];
    registerCalls = 0;
  });

  afterAll(() => {
    mswServer.close();
  });

  it('pending_student_reaches_student_home_and_sees_pending_notice', async () => {
    renderAppAt('/me', buildStudentUser());

    expect(
      await screen.findByRole('heading', { name: AR.studentPortal.dashboard.pageTitle })
    ).toBeInTheDocument();
    expect(await screen.findByText(AR.pending.waitingTitle)).toBeInTheDocument();
    expect(screen.getByText(AR.pending.waitingSubtitle)).toBeInTheDocument();
  });

  it('pending_student_visiting_pending_screen_is_redirected_home', async () => {
    renderAppAt('/pending', buildStudentUser());

    // Since Phase 2 the student home is the new main page at /home.
    await waitFor(() => {
      expect(window.location.pathname).toBe('/home');
    });
    expect(await screen.findByText(AR.pending.waitingTitle)).toBeInTheDocument();
  });

  it('apply_action_is_locked_for_pending_student_on_opportunity_details', async () => {
    opportunitiesList = [buildOpportunity()];
    renderAppAt('/opportunities/op-1', buildStudentUser());

    expect(await screen.findByText(AR.studentPortal.details.applyLocked)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: AR.studentPortal.details.applyButton })
    ).not.toBeInTheDocument();
    expect(applyCalls).toEqual([]);
  });

  it('register_validation_rejects_non_university_email_with_domain_message', async () => {
    const user = userEvent.setup();
    renderAppAt('/register', null);

    await user.type(screen.getByLabelText(AR.register.fullNameLabel), 'علي محمود');
    await user.type(screen.getByLabelText(AR.register.volunteerIdLabel), '20265555');
    await user.type(screen.getByLabelText(AR.register.emailLabel), 'ali@gmail.com');
    await user.type(screen.getByLabelText(AR.register.passwordLabel), 'Password123!');
    await user.selectOptions(screen.getByLabelText(AR.register.facultyLabel), FACULTIES[1]);
    await user.click(screen.getByLabelText(INTEREST_LABELS.medical));

    await user.click(screen.getByRole('button', { name: AR.register.submitButton }));

    expect(await screen.findByText(AR.register.emailDomainNotAllowed)).toBeInTheDocument();
    expect(registerCalls).toBe(0);
  });
});
