import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setStoredToken } from '../api/client';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AR, INTEREST_LABELS } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import { AuthProvider } from '../context/AuthContext.tsx';
import { ToastProvider } from '../context/ToastContext.tsx';
import { ApprovalsPage } from '../pages/ApprovalsPage';
import { PendingApprovalPage } from '../pages/PendingApprovalPage';
import { RegisterPage } from '../pages/RegisterPage';
import type { AuthUser, RegistrationQueueItem } from '../types';

const API_BASE = 'http://localhost:5000/api';

function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'student@mnu.edu.eg',
    fullName: 'سلمى أحمد',
    role: 'student',
    status: 'pending',
    faculty: FACULTIES[0],
    volunteer: null,
    interests: ['medical'],
    registration: {
      volunteerId: '20261234',
      category: 'student',
      faculty: FACULTIES[0],
      facultyMismatch: false,
    },
    rejectionReason: null,
    lastLoginAt: null,
    ...overrides,
  };
}

function buildQueueItem(overrides: Partial<RegistrationQueueItem> = {}): RegistrationQueueItem {
  return {
    id: 'reg-1',
    email: 'salma@mnu.edu.eg',
    fullName: 'سلمى أحمد',
    status: 'pending',
    faculty: FACULTIES[0],
    volunteer: null,
    interests: ['medical', 'education'],
    registration: {
      volunteerId: '20261234',
      category: 'student',
      faculty: FACULTIES[0],
      facultyMismatch: false,
    },
    facultyMismatch: false,
    existingVolunteer: null,
    rejectionReason: null,
    approvedAt: null,
    createdAt: '2026-11-16T10:00:00.000Z',
    ...overrides,
  };
}

let activeUser: AuthUser | null = null;
let queueItems: RegistrationQueueItem[] = [];
let lastRegisterBody: Record<string, unknown> | null = null;
let lastRejectBody: Record<string, unknown> | null = null;

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'جلسة الدخول غير صالحة أو منتهية' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.post(`${API_BASE}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    lastRegisterBody = body;
    const registeredUser = buildUser({
      id: 'reg-new',
      email: String(body.email),
      fullName: String(body.fullName),
      status: 'pending',
      faculty: body.faculty as AuthUser['faculty'],
      interests: body.interests as AuthUser['interests'],
      registration: {
        volunteerId: String(body.volunteerId),
        category: body.category as 'student' | 'academic' | 'admin',
        faculty: body.faculty as (typeof FACULTIES)[number],
        facultyMismatch: false,
      },
    });
    activeUser = registeredUser;
    return HttpResponse.json({ token: 'pending-token', user: registeredUser }, { status: 201 });
  }),
  http.get(`${API_BASE}/registrations`, () => {
    return HttpResponse.json({ registrations: queueItems });
  }),
  http.post(`${API_BASE}/registrations/:userId/approve`, ({ params }) => {
    const target = queueItems.find((entry) => entry.id === params.userId);
    if (!target) {
      return HttpResponse.json({ message: 'طلب التسجيل غير موجود' }, { status: 404 });
    }
    queueItems = queueItems.filter((entry) => entry.id !== params.userId);
    return HttpResponse.json({
      user: buildUser({ id: target.id, status: 'active' }),
      volunteer: { _id: 'vol-99', volunteerId: target.registration.volunteerId },
    });
  }),
  http.post(`${API_BASE}/registrations/:userId/reject`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    lastRejectBody = body;
    queueItems = queueItems.filter((entry) => entry.id !== params.userId);
    return HttpResponse.json({
      user: buildUser({
        id: String(params.userId),
        status: 'rejected',
        rejectionReason: String(body.rejectionReason),
      }),
    });
  })
);

function renderApp(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/pending" element={<PendingApprovalPage />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={['admin', 'dean']} />}>
              <Route path="/approvals" element={<ApprovalsPage />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={['student']} />}>
              <Route path="/me" element={<div>بوابة المتطوع النشطة</div>} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Phase V2-2 Registration, Pending Screen & Approvals Queue UI', () => {
  beforeAll(() => {
    mswServer.listen({ onUnhandledFrame: 'error' });
  });

  afterEach(() => {
    mswServer.resetHandlers();
    activeUser = null;
    queueItems = [];
    lastRegisterBody = null;
    lastRejectBody = null;
  });

  afterAll(() => {
    mswServer.close();
  });

  it('validates_and_submits_registration_then_redirects_to_student_home', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await user.click(screen.getByRole('button', { name: AR.register.submitButton }));
    expect(await screen.findByText(AR.register.fullNameMin)).toBeInTheDocument();
    expect(screen.getByText(AR.register.interestsMin)).toBeInTheDocument();

    await user.type(screen.getByLabelText(AR.register.fullNameLabel), 'علي محمود');
    await user.type(screen.getByLabelText(AR.register.volunteerIdLabel), '20265555');
    await user.type(screen.getByLabelText(AR.register.emailLabel), 'ali@mnu.edu.eg');
    await user.type(screen.getByLabelText(AR.register.passwordLabel), 'Password123!');
    await user.selectOptions(screen.getByLabelText(AR.register.facultyLabel), FACULTIES[1]);
    await user.click(screen.getByLabelText(INTEREST_LABELS.medical));
    await user.click(screen.getByLabelText(INTEREST_LABELS.technology));

    await user.click(screen.getByRole('button', { name: AR.register.submitButton }));

    expect(await screen.findByText('بوابة المتطوع النشطة')).toBeInTheDocument();
    expect(lastRegisterBody?.faculty).toBe(FACULTIES[1]);
    expect(lastRegisterBody?.interests).toEqual(['medical', 'technology']);
  });

  it('displays_rejection_reason_and_transitions_when_pending_account_is_approved', async () => {
    const user = userEvent.setup();
    activeUser = buildUser({
      status: 'rejected',
      rejectionReason: 'الرقم الجامعي غير مطابق لسجلات شؤون الطلاب',
    });
    setStoredToken('rejected-token');

    renderApp('/pending');

    expect(await screen.findByRole('heading', { name: AR.pending.rejectedTitle })).toBeInTheDocument();
    expect(screen.getByText('الرقم الجامعي غير مطابق لسجلات شؤون الطلاب')).toBeInTheDocument();

    activeUser = buildUser({ status: 'active' });
    await user.click(screen.getByRole('button', { name: AR.pending.refreshStatusButton }));

    await waitFor(() => {
      expect(screen.getByText('بوابة المتطوع النشطة')).toBeInTheDocument();
    });
  });

  it('blocks_dean_from_approving_faculty_mismatch_while_allowing_matching_record_approval', async () => {
    const user = userEvent.setup();
    activeUser = buildUser({
      id: 'dean-1',
      role: 'dean',
      status: 'active',
      faculty: FACULTIES[0],
      registration: null,
    });
    queueItems = [
      buildQueueItem({
        id: 'reg-match',
        fullName: 'نور الهدى',
        registration: {
          volunteerId: '20260001',
          category: 'student',
          faculty: FACULTIES[0],
          facultyMismatch: false,
        },
        existingVolunteer: {
          _id: 'vol-1',
          volunteerId: '20260001',
          fullName: 'نور الهدى',
          category: 'student',
          faculty: FACULTIES[0],
          approvedHours: 18,
          approvedActivities: 3,
          totalActivities: 3,
        },
      }),
      buildQueueItem({
        id: 'reg-mismatch',
        fullName: 'كريم طارق',
        facultyMismatch: true,
        registration: {
          volunteerId: '20260002',
          category: 'student',
          faculty: FACULTIES[0],
          facultyMismatch: true,
        },
        existingVolunteer: {
          _id: 'vol-2',
          volunteerId: '20260002',
          fullName: 'كريم طارق',
          category: 'student',
          faculty: FACULTIES[3],
          approvedHours: 10,
          approvedActivities: 2,
          totalActivities: 2,
        },
      }),
    ];
    setStoredToken('dean-token');

    renderApp('/approvals');

    expect(await screen.findByText('نور الهدى')).toBeInTheDocument();
    expect(screen.getByText(AR.approvals.mismatchBadge)).toBeInTheDocument();
    expect(screen.getByText(AR.approvals.mismatchDeanBlockedNote)).toBeInTheDocument();

    const mismatchCard = screen.getByText('كريم طارق').closest('article')!;
    expect(within(mismatchCard).getByRole('button', { name: AR.approvals.approveButton })).toBeDisabled();

    const matchCard = screen.getByText('نور الهدى').closest('article')!;
    await user.click(within(matchCard).getByRole('button', { name: AR.approvals.approveButton }));

    expect(await screen.findByText(AR.approvals.approveSuccess)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('نور الهدى')).not.toBeInTheDocument();
    });
  });

  it('allows_admin_to_reject_registration_with_arabic_reason_modal', async () => {
    const user = userEvent.setup();
    activeUser = buildUser({
      id: 'admin-1',
      role: 'admin',
      status: 'active',
      faculty: null,
      registration: null,
    });
    queueItems = [
      buildQueueItem({
        id: 'reg-reject',
        fullName: 'مريم عادل',
        registration: {
          volunteerId: '20269999',
          category: 'academic',
          faculty: FACULTIES[2],
          facultyMismatch: false,
        },
      }),
    ];
    setStoredToken('admin-token');

    renderApp('/approvals');

    expect(await screen.findByText('مريم عادل')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: AR.approvals.rejectButton }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: AR.approvals.confirmRejectButton }));
    expect(within(dialog).getByText(AR.approvals.rejectionReasonMin)).toBeInTheDocument();

    await user.type(
      within(dialog).getByLabelText(AR.approvals.rejectionReasonLabel),
      'يرجى مراجعة شؤون العاملين لتأكيد الرقم التعريفي'
    );
    await user.click(within(dialog).getByRole('button', { name: AR.approvals.confirmRejectButton }));

    expect(await screen.findByText(AR.approvals.rejectSuccess)).toBeInTheDocument();
    expect(lastRejectBody?.rejectionReason).toBe('يرجى مراجعة شؤون العاملين لتأكيد الرقم التعريفي');
  });
});
