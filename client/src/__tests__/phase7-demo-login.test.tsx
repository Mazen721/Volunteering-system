import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import { AuthProvider } from '../context/AuthContext.tsx';
import { LoginPage } from '../pages/LoginPage';
import type { AuthUser, DemoAccount } from '../types';

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

const DEMO_USERS: Record<DemoAccount, AuthUser> = {
  admin: buildAuthUser({ id: 'admin-1', email: 'admin@mnu.edu.eg', role: 'admin' }),
  dean: buildAuthUser({
    id: 'dean-1',
    email: 'medicine.dean@mnu.edu.eg',
    role: 'dean',
    faculty: FACULTIES[0],
  }),
  student: buildAuthUser({
    id: 'student-1',
    email: 'ahmed.student@mnu.edu.eg',
    role: 'student',
    status: 'active',
    faculty: FACULTIES[0],
  }),
};

let demoEnabled = true;
let probeCalls = 0;
let lastDemoAccount: string | null = null;
let activeAuthUser: AuthUser | null = null;

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/demo-login`, () => {
    probeCalls += 1;
    return HttpResponse.json({ enabled: demoEnabled });
  }),
  http.post(`${API_BASE}/auth/demo-login`, async ({ request }) => {
    const body = (await request.json()) as { account: DemoAccount };
    lastDemoAccount = body.account;
    const user = DEMO_USERS[body.account];
    activeAuthUser = user;
    return HttpResponse.json({ token: `${body.account}-token`, user });
  }),
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeAuthUser) {
      return HttpResponse.json({ message: 'جلسة الدخول غير صالحة أو منتهية' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeAuthUser });
  })
);

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute allowedRoles={['admin', 'dean']} />}>
            <Route path="/" element={<div>صفحة الإدارة والعميد</div>} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['student']} />}>
            <Route path="/home" element={<div>بوابة الطالب</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeAll(() => mswServer.listen());
afterEach(() => {
  mswServer.resetHandlers();
  localStorage.clear();
});
afterAll(() => mswServer.close());

beforeEach(() => {
  demoEnabled = true;
  probeCalls = 0;
  lastDemoAccount = null;
  activeAuthUser = null;
  localStorage.clear();
});

describe('Phase 7 demo login buttons', () => {
  it('shows the three demo buttons when the server enables demo login', async () => {
    renderLogin();
    expect(await screen.findByRole('button', { name: new RegExp(AR.auth.demoAdmin) })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(AR.auth.demoDean) })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(AR.auth.demoStudent) })).toBeTruthy();
    expect(screen.getByText(AR.auth.demoTitle)).toBeTruthy();
  });

  it('hides the demo buttons when demo login is disabled', async () => {
    demoEnabled = false;
    renderLogin();
    expect(await screen.findByRole('button', { name: AR.auth.submitLogin })).toBeTruthy();
    await waitFor(() => expect(probeCalls).toBeGreaterThan(0));
    expect(screen.queryByText(AR.auth.demoTitle)).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(AR.auth.demoAdmin) })).toBeNull();
  });

  it('student button posts account=student and lands on the student home', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(await screen.findByRole('button', { name: new RegExp(AR.auth.demoStudent) }));
    expect(await screen.findByText('بوابة الطالب')).toBeTruthy();
    expect(lastDemoAccount).toBe('student');
  });

  it('admin button posts account=admin and lands on the staff dashboard', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(await screen.findByRole('button', { name: new RegExp(AR.auth.demoAdmin) }));
    expect(await screen.findByText('صفحة الإدارة والعميد')).toBeTruthy();
    expect(lastDemoAccount).toBe('admin');
  });
});
