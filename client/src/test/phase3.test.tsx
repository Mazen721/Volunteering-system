import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { AR } from '../constants/ar';
import type {
  FacultyStatsResponse,
  LeaderboardVolunteer,
  OverviewStats,
} from '../types';

const API_BASE = 'http://localhost:5000/api';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';

const OVERVIEW_PAYLOAD: OverviewStats = {
  totalApprovedHours: 129,
  totalActivities: 12,
  approvedActivities: 11,
  registeredVolunteers: 8,
  activeVolunteers: 7,
  eligibleVolunteers: 2,
  activeFaculties: 7,
  avgHoursPerRegistered: 16.13,
  avgHoursPerActive: 18.43,
  certificateHours: 30,
};

const FACULTIES_PAYLOAD: FacultyStatsResponse = {
  faculties: [
    {
      faculty: 'كلية الصيدلة',
      volunteerCount: 1,
      totalActivities: 3,
      approvedActivities: 3,
      approvedHours: 37,
      avgHours: 37,
      percentage: 28.7,
    },
    {
      faculty: 'كلية الطب البشري',
      volunteerCount: 2,
      totalActivities: 3,
      approvedActivities: 3,
      approvedHours: 31,
      avgHours: 15.5,
      percentage: 24,
    },
    {
      faculty: 'كلية التمريض',
      volunteerCount: 1,
      totalActivities: 1,
      approvedActivities: 0,
      approvedHours: 0,
      avgHours: 0,
      percentage: 0,
    },
  ],
  totals: {
    volunteerCount: 4,
    totalActivities: 7,
    approvedActivities: 6,
    approvedHours: 68,
    avgHours: 17,
  },
};

interface LeaderboardQueryCapture {
  category: string;
  limit: string | null;
}

interface LoginRequestBody {
  email: string;
  password: string;
}

const LEADERBOARD_BY_CATEGORY: Record<string, LeaderboardVolunteer[]> = {
  all: [
    {
      _id: 'v3',
      volunteerId: '20260003',
      fullName: 'د. عمرو عبد الرحمن',
      category: 'academic',
      categoryLabel: 'أعضاء الكادر الأكاديمي',
      faculty: 'كلية الصيدلة',
      approvedActivities: 3,
      approvedHours: 37,
    },
    {
      _id: 'v1',
      volunteerId: '20260001',
      fullName: 'أحمد محمد علي',
      category: 'student',
      categoryLabel: 'الطلاب',
      faculty: 'كلية الطب البشري',
      approvedActivities: 3,
      approvedHours: 31,
    },
  ],
  student: [
    {
      _id: 'v1',
      volunteerId: '20260001',
      fullName: 'أحمد محمد علي',
      category: 'student',
      categoryLabel: 'الطلاب',
      faculty: 'كلية الطب البشري',
      approvedActivities: 3,
      approvedHours: 31,
    },
  ],
  academic: [
    {
      _id: 'v3',
      volunteerId: '20260003',
      fullName: 'د. عمرو عبد الرحمن',
      category: 'academic',
      categoryLabel: 'أعضاء الكادر الأكاديمي',
      faculty: 'كلية الصيدلة',
      approvedActivities: 3,
      approvedHours: 37,
    },
  ],
  admin: [
    {
      _id: 'v5',
      volunteerId: '20260005',
      fullName: 'أ. محمود مصطفى',
      category: 'admin',
      categoryLabel: 'أعضاء الجهاز الإداري',
      faculty: 'كلية الهندسة',
      approvedActivities: 2,
      approvedHours: 24,
    },
  ],
};

let capturedAuthHeaders: Array<string | null> = [];
let capturedLeaderboardQueries: LeaderboardQueryCapture[] = [];

const mswServer = setupServer(
  // The mobile dock asks for the pending-approvals count on staff pages.
  http.get(`${API_BASE}/registrations`, () => {
    return HttpResponse.json({ registrations: [] });
  }),
  http.post(`${API_BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as LoginRequestBody;
    if (body.email === 'admin@mnu.edu.eg' && body.password === 'secret123') {
      return HttpResponse.json({
        token: TEST_TOKEN,
        admin: { id: 'admin-1', email: 'admin@mnu.edu.eg' },
      });
    }
    return HttpResponse.json({ message: 'بيانات الدخول غير صحيحة' }, { status: 401 });
  }),

  http.get(`${API_BASE}/auth/me`, ({ request }) => {
    const authHeader = request.headers.get('authorization');
    if (authHeader === `Bearer ${TEST_TOKEN}`) {
      return HttpResponse.json({ admin: { id: 'admin-1', email: 'admin@mnu.edu.eg' } });
    }
    return HttpResponse.json({ message: 'جلسة الدخول غير صالحة أو منتهية' }, { status: 401 });
  }),

  http.get(`${API_BASE}/stats/overview`, ({ request }) => {
    capturedAuthHeaders.push(request.headers.get('authorization'));
    return HttpResponse.json(OVERVIEW_PAYLOAD);
  }),

  http.get(`${API_BASE}/stats/faculties`, ({ request }) => {
    capturedAuthHeaders.push(request.headers.get('authorization'));
    return HttpResponse.json(FACULTIES_PAYLOAD);
  }),

  http.get(`${API_BASE}/stats/leaderboard`, ({ request }) => {
    const url = new URL(request.url);
    const category = url.searchParams.get('category') || 'all';
    capturedLeaderboardQueries.push({ category, limit: url.searchParams.get('limit') });
    return HttpResponse.json({
      leaderboard: LEADERBOARD_BY_CATEGORY[category] || [],
      certificateHours: 30,
    });
  })
);

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  capturedAuthHeaders = [];
  capturedLeaderboardQueries = [];
});
afterAll(() => mswServer.close());

describe('Phase 3 Authentication and Dashboard', () => {
  it('redirects_unauthenticated_root_visit_to_login_without_english_text', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: AR.auth.loginTitle })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(document.body.textContent).not.toMatch(/[A-Za-z]/);
  });

  it.each([
    ['', 'secret123', AR.auth.emailRequired],
    ['not-an-email', 'secret123', AR.auth.emailInvalid],
    ['admin@mnu.edu.eg', '', AR.auth.passwordRequired],
  ])(
    'shows_arabic_validation_error_for_invalid_credentials(%s)',
    async (emailValue, passwordValue, expectedMessage) => {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/login');
      render(<App />);

      if (emailValue) {
        await user.type(screen.getByLabelText(AR.auth.emailLabel), emailValue);
      }
      if (passwordValue) {
        await user.type(screen.getByLabelText(AR.auth.passwordLabel), passwordValue);
      }
      await user.click(screen.getByRole('button', { name: AR.auth.submitLogin }));

      expect(screen.getByText(expectedMessage)).toBeInTheDocument();
    }
  );

  it('displays_arabic_error_when_login_credentials_are_rejected', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/login');
    render(<App />);

    await user.type(screen.getByLabelText(AR.auth.emailLabel), 'admin@mnu.edu.eg');
    await user.type(screen.getByLabelText(AR.auth.passwordLabel), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: AR.auth.submitLogin }));

    expect(await screen.findByRole('alert')).toHaveTextContent('بيانات الدخول غير صحيحة');
    expect(localStorage.getItem('mnu_admin_token')).toBeNull();
  });

  it('logs_in_stores_jwt_and_renders_arabic_kpis_sorted_faculties_and_leaderboard', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(AR.auth.emailLabel), 'admin@mnu.edu.eg');
    await user.type(screen.getByLabelText(AR.auth.passwordLabel), 'secret123');
    await user.click(screen.getByRole('button', { name: AR.auth.submitLogin }));

    expect(await screen.findByRole('heading', { name: AR.dashboard.title })).toBeInTheDocument();
    expect(localStorage.getItem('mnu_admin_token')).toBe(TEST_TOKEN);
    expect(capturedAuthHeaders.every((header) => header === `Bearer ${TEST_TOKEN}`)).toBe(true);

    expect(within(screen.getByTestId('kpi-card-totalHours')).getByText('١٢٩')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-card-volunteers')).getByText('٨')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-card-faculties')).getByText('٧')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-card-avgHours')).getByText('١٦٫١٣')).toBeInTheDocument();

    const facultyRows = screen.getAllByTestId('faculty-bar-row');
    expect(facultyRows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('كلية الصيدلة'),
      expect.stringContaining('كلية الطب البشري'),
      expect.stringContaining('كلية التمريض'),
    ]);
    expect(facultyRows[0]).toHaveTextContent('٣٧ ساعة (٢٨٫٧٪)');

    expect(document.body.textContent).not.toMatch(/[A-Za-z]/);
  });

  it('restores_authenticated_session_from_stored_token_and_clears_it_on_logout', async () => {
    const user = userEvent.setup();
    localStorage.setItem('mnu_admin_token', TEST_TOKEN);
    render(<App />);

    expect(await screen.findByRole('heading', { name: AR.dashboard.title })).toBeInTheDocument();

    // Scoped to the desktop nav inside the banner: since Phase 3 the header
    // also carries a compact mobile logout button with the same name.
    const bannerNav = screen.getByRole('banner').querySelector('nav');
    await user.click(within(bannerNav!).getByRole('button', { name: AR.nav.logout }));

    expect(await screen.findByRole('heading', { name: AR.auth.loginTitle })).toBeInTheDocument();
    expect(localStorage.getItem('mnu_admin_token')).toBeNull();
    expect(window.location.pathname).toBe('/login');
  });

  it('redirects_to_login_when_stored_token_is_invalid_on_refresh', async () => {
    localStorage.setItem('mnu_admin_token', 'expired-token');
    render(<App />);

    expect(await screen.findByRole('heading', { name: AR.auth.loginTitle })).toBeInTheDocument();
    expect(localStorage.getItem('mnu_admin_token')).toBeNull();
  });

  it('shows_arabic_error_and_recovers_when_api_is_down_during_session_restore', async () => {
    const user = userEvent.setup();
    localStorage.setItem('mnu_admin_token', TEST_TOKEN);

    let failSessionCheck = true;
    mswServer.use(
      http.get(`${API_BASE}/auth/me`, () => {
        if (failSessionCheck) {
          return HttpResponse.error();
        }
        return HttpResponse.json({ admin: { id: 'admin-1', email: 'admin@mnu.edu.eg' } });
      })
    );

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: AR.auth.sessionCheckFailedTitle })
    ).toBeInTheDocument();
    expect(screen.getByText(AR.errors.networkUnavailable)).toBeInTheDocument();

    failSessionCheck = false;
    await user.click(screen.getByRole('button', { name: AR.auth.retrySessionCheck }));

    expect(await screen.findByRole('heading', { name: AR.dashboard.title })).toBeInTheDocument();
  });

  it.each([
    ['الكل', 'all', 'د. عمرو عبد الرحمن'],
    ['الطلاب', 'student', 'أحمد محمد علي'],
    ['أعضاء الكادر الأكاديمي', 'academic', 'د. عمرو عبد الرحمن'],
    ['أعضاء الجهاز الإداري', 'admin', 'أ. محمود مصطفى'],
  ])(
    'switches_leaderboard_tab_to_%s_and_displays_matching_volunteers',
    async (tabLabel, expectedQueryCategory, expectedVolunteerName) => {
      const user = userEvent.setup();
      localStorage.setItem('mnu_admin_token', TEST_TOKEN);
      render(<App />);

      await screen.findByRole('heading', { name: AR.dashboard.title });
      await user.click(screen.getByRole('tab', { name: tabLabel }));

      const rows = await screen.findAllByTestId('leaderboard-row');
      expect(rows[0]).toHaveTextContent(expectedVolunteerName);
      expect(capturedLeaderboardQueries.at(-1)).toEqual({
        category: expectedQueryCategory,
        limit: '5',
      });
    }
  );

  it('shows_arabic_network_error_with_retry_when_api_is_unavailable', async () => {
    const user = userEvent.setup();
    localStorage.setItem('mnu_admin_token', TEST_TOKEN);

    let failStats = true;
    mswServer.use(
      http.get(`${API_BASE}/stats/overview`, () => {
        if (failStats) {
          return HttpResponse.error();
        }
        return HttpResponse.json(OVERVIEW_PAYLOAD);
      })
    );

    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(AR.dashboard.errorTitle);
    expect(alert).toHaveTextContent(AR.errors.networkUnavailable);

    failStats = false;
    await user.click(screen.getByRole('button', { name: AR.dashboard.retryButton }));

    expect(await screen.findByRole('heading', { name: AR.dashboard.title })).toBeInTheDocument();
  });
});
