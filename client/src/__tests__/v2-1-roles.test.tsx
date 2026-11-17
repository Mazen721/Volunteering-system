import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setStoredToken } from '../api/client';
import { Navbar } from '../components/Navbar';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import { AuthProvider } from '../context/AuthContext.tsx';
import { LoginPage } from '../pages/LoginPage';
import type { AuthUser } from '../types';

const API_BASE = 'http://localhost:5000/api';

function buildAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'user@mnu.edu.eg',
    fullName: 'مستخدم تجريبي',
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

let activeAuthUser: AuthUser | null = null;

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeAuthUser) {
      return HttpResponse.json({ message: 'جلسة الدخول غير صالحة أو منتهية' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeAuthUser });
  }),
  http.post(`${API_BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === 'student@mnu.edu.eg') {
      const studentUser = buildAuthUser({
        id: 'student-1',
        email: 'student@mnu.edu.eg',
        role: 'student',
        status: 'active',
        faculty: FACULTIES[0],
      });
      activeAuthUser = studentUser;
      return HttpResponse.json({ token: 'student-token', user: studentUser });
    }
    return HttpResponse.json({ message: 'بيانات الدخول غير صحيحة' }, { status: 401 });
  })
);

function renderAppRoutes(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute allowedRoles={['admin', 'dean']} />}>
            <Route
              path="/"
              element={
                <div>
                  <Navbar />
                  <span>صفحة الإدارة والعميد</span>
                </div>
              }
            />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/deans" element={<div>إدارة العمداء</div>} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['student']} />}>
            <Route path="/me" element={<div>بوابة الطالب</div>} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/pending" element={<div>حسابك قيد المراجعة في البوابة</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Phase V2-1 AuthContext & ProtectedRoute role guards', () => {
  beforeAll(() => {
    mswServer.listen({ onUnhandledFrame: 'error' });
  });

  afterEach(() => {
    mswServer.resetHandlers();
    activeAuthUser = null;
  });

  afterAll(() => {
    mswServer.close();
  });

  it('displays_role_badge_in_navbar_for_active_admin_and_dean', async () => {
    activeAuthUser = buildAuthUser({
      role: 'dean',
      faculty: FACULTIES[1],
      email: 'dentistry.dean@mnu.edu.eg',
    });
    setStoredToken('valid-dean-token');

    renderAppRoutes('/');

    expect(await screen.findByText('صفحة الإدارة والعميد')).toBeInTheDocument();
    expect(screen.getByText(AR.roles.dean)).toBeInTheDocument();
  });

  it.each(['pending', 'rejected'] as const)(
    'redirects_%s_user_to_pending_screen',
    async (userStatus) => {
      activeAuthUser = buildAuthUser({
        role: 'student',
        status: userStatus,
        faculty: FACULTIES[0],
      });
      setStoredToken('non-active-token');

      renderAppRoutes('/');

      expect(await screen.findByText('حسابك قيد المراجعة في البوابة')).toBeInTheDocument();
    }
  );

  it('shows_disabled_arabic_notice_with_logout_for_disabled_account', async () => {
    activeAuthUser = buildAuthUser({
      role: 'student',
      status: 'disabled',
      faculty: FACULTIES[0],
    });
    setStoredToken('disabled-token');

    renderAppRoutes('/');

    expect(await screen.findByText(AR.auth.disabledAccount)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: AR.nav.logout }));
    expect(await screen.findByText(AR.auth.loginTitle)).toBeInTheDocument();
  });

  it('redirects_active_student_from_admin_route_to_me', async () => {
    activeAuthUser = buildAuthUser({
      role: 'student',
      status: 'active',
      faculty: FACULTIES[0],
    });
    setStoredToken('student-token');

    renderAppRoutes('/');

    expect(await screen.findByText('بوابة الطالب')).toBeInTheDocument();
  });

  it('redirects_active_dean_from_admin_only_route_to_dashboard', async () => {
    activeAuthUser = buildAuthUser({
      role: 'dean',
      status: 'active',
      faculty: FACULTIES[2],
    });
    setStoredToken('dean-token');

    renderAppRoutes('/deans');

    expect(await screen.findByText('صفحة الإدارة والعميد')).toBeInTheDocument();
  });

  it('redirects_student_to_me_immediately_after_login', async () => {
    renderAppRoutes('/login');

    await userEvent.type(screen.getByLabelText(AR.auth.emailLabel), 'student@mnu.edu.eg');
    await userEvent.type(screen.getByLabelText(AR.auth.passwordLabel), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: AR.auth.submitLogin }));

    await waitFor(() => {
      expect(screen.getByText('بوابة الطالب')).toBeInTheDocument();
    });
  });
});
