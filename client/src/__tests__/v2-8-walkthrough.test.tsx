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
  Opportunity,
  StudentDashboardSummary,
  Volunteer,
} from '../types';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_MED = FACULTIES[0];

function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'user@mnu.edu.eg',
    fullName: 'مستخدم اختبار',
    role: 'student',
    status: 'active',
    faculty: FACULTY_MED,
    volunteer: 'vol-1',
    interests: ['medical'],
    registration: null,
    rejectionReason: null,
    lastLoginAt: null,
    ...overrides,
  };
}

function buildLiveOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    _id: 'opp-live-demo',
    title: 'قافلة الكشف الطبي المباشرة',
    description: 'قافلة تطوعية جارية الآن',
    requirements: '',
    fields: ['medical'],
    activityType: 'قافلة',
    location: { name: 'العيادات الخارجية', address: 'جامعة المنصورة الأهلية' },
    startAt: '2026-11-18T12:00:00.000Z',
    endAt: '2026-11-18T16:00:00.000Z',
    registrationDeadline: '2026-11-18T11:30:00.000Z',
    hours: 5,
    contactName: 'د. منسق',
    contactPhone: '01000000002',
    contactEmail: 'admin@mnu.edu.eg',
    faculty: null,
    slots: { student: 25, academic: 5, admin: 5 },
    acceptedCounts: { student: 1, academic: 0, admin: 0 },
    approvalMode: 'auto',
    status: 'published',
    createdBy: 'admin-1',
    createdAt: '2026-11-10T08:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
    phase: 'in_progress',
    checkInOpen: true,
    remainingSlots: { student: 24, academic: 5, admin: 5 },
    ...overrides,
  };
}

function buildApplication(overrides: Partial<Application> = {}): Application {
  return {
    _id: 'app-demo-1',
    opportunity: 'opp-live-demo',
    volunteer: 'vol-1',
    user: 'student-1',
    faculty: FACULTY_MED,
    category: 'student',
    status: 'accepted',
    note: '',
    decidedBy: null,
    decidedAt: null,
    attended: false,
    checkedInAt: null,
    hoursGranted: 0,
    appliedAt: '2026-11-15T10:00:00.000Z',
    createdAt: '2026-11-15T10:00:00.000Z',
    updatedAt: '2026-11-15T10:00:00.000Z',
    ...overrides,
  };
}

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
  server.resetHandlers();
});
afterAll(() => server.close());

describe('Phase V2-8 Security Error Display & End-to-End Walkthrough', () => {
  it('shows_arabic_429_rate_limit_alert_on_login', async () => {
    const loginLimitMessage =
      'تم تجاوز الحد المسموح به لمحاولات تسجيل الدخول، يرجى الانتظار والمحاولة لاحقاً';

    server.use(
      http.post(`${API_BASE}/auth/login`, () =>
        HttpResponse.json({ message: loginLimitMessage }, { status: 429 })
      )
    );

    const user = userEvent.setup();
    window.history.pushState({}, '', '/login');
    render(<App />);

    await user.type(screen.getByLabelText(AR.auth.emailLabel), 'sara@mnu.edu.eg');
    await user.type(screen.getByLabelText(AR.auth.passwordLabel), 'Password123!');
    await user.click(screen.getByRole('button', { name: AR.auth.submitLogin }));

    expect(await screen.findByRole('alert')).toHaveTextContent(loginLimitMessage);
  });

  it('shows_arabic_rate_limit_fallback_and_domain_error_on_register', async () => {
    let attemptCount = 0;
    server.use(
      http.post(`${API_BASE}/auth/register`, () => {
        attemptCount += 1;
        if (attemptCount === 1) {
          return HttpResponse.json(
            { message: AR.register.emailDomainNotAllowed },
            { status: 400 }
          );
        }
        return new HttpResponse(null, { status: 429 });
      })
    );

    const user = userEvent.setup();
    window.history.pushState({}, '', '/register');
    render(<App />);

    await user.type(screen.getByLabelText(AR.register.fullNameLabel), 'سارة محمود حسن');
    await user.type(screen.getByLabelText(AR.register.volunteerIdLabel), '20260002');
    await user.type(screen.getByLabelText(AR.register.emailLabel), 'user@gmail.com');
    await user.type(screen.getByLabelText(AR.register.passwordLabel), 'Password123!');
    await user.selectOptions(screen.getByLabelText(AR.register.facultyLabel), FACULTY_MED);
    await user.click(screen.getByText(AR.interests.medical));
    await user.click(screen.getByRole('button', { name: AR.register.submitButton }));

    expect(await screen.findByRole('alert')).toHaveTextContent(AR.register.emailDomainNotAllowed);

    await user.click(screen.getByRole('button', { name: AR.register.submitButton }));
    expect(await screen.findByRole('alert')).toHaveTextContent(AR.errors.rateLimited);
  });

  it('shows_arabic_429_rate_limit_alert_on_checkin', async () => {
    const studentUser = buildUser({
      id: 'student-1',
      email: 'sara@mnu.edu.eg',
      fullName: 'سارة محمود حسن',
      role: 'student',
    });
    const liveOpp = buildLiveOpportunity({
      myApplication: buildApplication(),
    });

    server.use(
      http.get(`${API_BASE}/auth/me`, () => HttpResponse.json({ user: studentUser })),
      http.get(`${API_BASE}/opportunities/opp-live-demo`, () =>
        HttpResponse.json({ opportunity: liveOpp })
      ),
      http.post(`${API_BASE}/opportunities/opp-live-demo/checkin`, () =>
        HttpResponse.json(
          {
            message:
              'تم تجاوز الحد المسموح به لمحاولات تسجيل الحضور، يرجى الانتظار قليلاً ثم المحاولة مرة أخرى',
          },
          { status: 429 }
        )
      )
    );

    const user = userEvent.setup();
    setStoredToken('student-token');
    window.history.pushState({}, '', '/checkin/opp-live-demo');
    render(<App />);

    const tokenInput = await screen.findByLabelText(AR.studentPortal.checkin.tokenLabel);
    await user.type(tokenInput, 'signed-qr-token');
    await user.click(
      screen.getByRole('button', { name: AR.studentPortal.checkin.submitBtn })
    );

    const alerts = await screen.findAllByRole('alert');
    expect(
      alerts.some((el) =>
        el.textContent?.includes('تم تجاوز الحد المسموح به لمحاولات تسجيل الحضور')
      )
    ).toBe(true);
  });

  it('completes_walkthrough_from_student_live_checkin_to_dean_certificate_printing', async () => {
    const studentUser = buildUser({
      id: 'student-ahmed',
      email: 'ahmed.student@mnu.edu.eg',
      fullName: 'أحمد محمد علي',
      role: 'student',
      faculty: FACULTY_MED,
    });
    const deanUser = buildUser({
      id: 'dean-med',
      email: 'medicine.dean@mnu.edu.eg',
      fullName: 'عميد كلية الطب البشري',
      role: 'dean',
      faculty: FACULTY_MED,
      volunteer: null,
    });

    const liveOpp = buildLiveOpportunity({
      myApplication: buildApplication(),
    });
    const studentSummary: StudentDashboardSummary = {
      volunteer: {
        _id: 'vol-1',
        volunteerId: '20260001',
        fullName: 'أحمد محمد علي',
        category: 'student',
        faculty: FACULTY_MED,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      approvedHours: 31,
      pendingHours: 0,
      certificateHours: 30,
      remainingHours: 0,
      eligible: true,
      eventsAttended: 3,
      happeningNow: [liveOpp],
      upcomingAccepted: [],
      activeApplications: [],
      recentActivities: [],
    };
    const eligibleVolunteer: Volunteer = {
      _id: 'vol-1',
      volunteerId: '20260001',
      fullName: 'أحمد محمد علي',
      category: 'student',
      categoryLabel: AR.categories.student,
      faculty: FACULTY_MED,
      approvedHours: 31,
      approvedActivities: 3,
      totalActivities: 3,
      remainingHours: 0,
      eligible: true,
    };

    let activeToken = 'student-token';

    server.use(
      http.post(`${API_BASE}/auth/login`, () =>
        HttpResponse.json({ token: 'student-token', user: studentUser })
      ),
      http.get(`${API_BASE}/auth/me`, () =>
        HttpResponse.json({
          user: activeToken === 'dean-token' ? deanUser : studentUser,
        })
      ),
      http.get(`${API_BASE}/stats/me`, () => HttpResponse.json(studentSummary)),
      http.get(`${API_BASE}/opportunities`, () => HttpResponse.json({ opportunities: [liveOpp] })),
      http.get(`${API_BASE}/opportunities/opp-live-demo`, () =>
        HttpResponse.json({ opportunity: liveOpp })
      ),
      http.post(`${API_BASE}/opportunities/opp-live-demo/checkin`, () =>
        HttpResponse.json({
          application: buildApplication({
            attended: true,
            checkedInAt: '2026-11-18T12:15:00.000Z',
          }),
        })
      ),
      http.get(`${API_BASE}/volunteers/20260001`, () =>
        HttpResponse.json({
          volunteer: eligibleVolunteer,
          activities: [],
          certificateHours: 30,
        })
      )
    );

    const user = userEvent.setup();
    window.history.pushState({}, '', '/login');
    const studentView = render(<App />);

    await user.type(screen.getByLabelText(AR.auth.emailLabel), 'ahmed.student@mnu.edu.eg');
    await user.type(screen.getByLabelText(AR.auth.passwordLabel), 'Admin@12345');
    await user.click(screen.getByRole('button', { name: AR.auth.submitLogin }));

    expect(
      await screen.findByText(AR.studentPortal.dashboard.happeningNowTitle)
    ).toBeInTheDocument();
    expect(
      screen.getByText(AR.studentPortal.dashboard.eligibleNotice)
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('link', {
        name: new RegExp(AR.studentPortal.dashboard.happeningNowCta),
      })
    );
    const tokenInput = await screen.findByLabelText(AR.studentPortal.checkin.tokenLabel);
    await user.type(tokenInput, 'valid-rotating-qr-token');
    await user.click(
      screen.getByRole('button', { name: AR.studentPortal.checkin.submitBtn })
    );

    expect(
      await screen.findByText(AR.studentPortal.checkin.successMessage)
    ).toBeInTheDocument();
    studentView.unmount();

    // Student cannot open /certificate/20260001 (redirected back to /me)
    window.history.pushState({}, '', '/certificate/20260001');
    const blockedCertView = render(<App />);
    await waitFor(() => {
      expect(window.location.pathname).toBe('/me');
    });
    blockedCertView.unmount();

    // Medicine Dean opens /certificate/20260001 and sees official printable certificate
    activeToken = 'dean-token';
    setStoredToken('dean-token');
    window.history.pushState({}, '', '/certificate/20260001');
    render(<App />);

    expect(await screen.findByText(AR.certificate.heading)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: AR.certificate.printButton })).toBeInTheDocument();
  });
});
