import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { AR } from '../constants/ar';
import type { VolunteerInput, VolunteerProfileResponse } from '../types';

const API_BASE = 'http://localhost:5000/api';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.phase6-token';

const EDGE_VOLUNTEERS: Record<string, VolunteerProfileResponse> = {
  20260090: {
    volunteer: {
      _id: 'v-90',
      volunteerId: '20260090',
      fullName: 'سلمى حسام الدين',
      category: 'student',
      categoryLabel: 'الطلاب',
      faculty: 'كلية الهندسة',
      totalActivities: 0,
      approvedActivities: 0,
      approvedHours: 0,
      remainingHours: 30,
      eligible: false,
    },
    activities: [],
    certificateHours: 30,
  },
  20260030: {
    volunteer: {
      _id: 'v-30',
      volunteerId: '20260030',
      fullName: 'يوسف طارق محمود',
      category: 'admin',
      categoryLabel: 'أعضاء الجهاز الإداري',
      faculty: 'كلية الصيدلة',
      totalActivities: 3,
      approvedActivities: 2,
      approvedHours: 30,
      remainingHours: 0,
      eligible: true,
    },
    activities: [
      {
        _id: 'a-301',
        title: 'قافلة صيدلانية',
        type: 'قافلة',
        hours: 18,
        date: '2026-10-01T00:00:00.000Z',
        status: 'approved',
        supervisor: 'د. هبة شريف',
      },
      {
        _id: 'a-302',
        title: 'مبادرة دوائية',
        type: 'مبادرة',
        hours: 12,
        date: '2026-10-02T00:00:00.000Z',
        status: 'approved',
        supervisor: 'د. هبة شريف',
      },
    ],
    certificateHours: 30,
  },
  20260040: {
    volunteer: {
      _id: 'v-40',
      volunteerId: '20260040',
      fullName: 'منة الله كريم',
      category: 'student',
      categoryLabel: 'الطلاب',
      faculty: 'كلية الهندسة',
      totalActivities: 2,
      approvedActivities: 0,
      approvedHours: 0,
      remainingHours: 30,
      eligible: false,
    },
    activities: [
      {
        _id: 'a-401',
        title: 'نشاط مرفوض أول',
        type: 'ندوة',
        hours: 15,
        date: '2026-10-02T00:00:00.000Z',
        status: 'rejected',
        supervisor: 'د. شريف كامل',
      },
      {
        _id: 'a-402',
        title: 'نشاط مرفوض ثان',
        type: 'ندوة',
        hours: 15,
        date: '2026-10-03T00:00:00.000Z',
        status: 'rejected',
        supervisor: 'د. شريف كامل',
      },
    ],
    certificateHours: 30,
  },
};

const mswServer = setupServer(
  // The mobile dock asks for the pending-approvals count on staff pages.
  http.get(`${API_BASE}/registrations`, () => {
    return HttpResponse.json({ registrations: [] });
  }),
  http.get(`${API_BASE}/auth/me`, () =>
    HttpResponse.json({ admin: { id: 'admin-1', email: 'admin@mnu.edu.eg' } })
  ),
  http.get(`${API_BASE}/volunteers`, () => {
    const volunteers = Object.values(EDGE_VOLUNTEERS).map((entry) => entry.volunteer);
    return HttpResponse.json({
      volunteers,
      total: volunteers.length,
      page: 1,
      pages: 1,
      certificateHours: 30,
    });
  }),
  http.get(`${API_BASE}/volunteers/:volunteerId`, ({ params }) => {
    const profile = EDGE_VOLUNTEERS[String(params.volunteerId)];
    if (!profile) {
      return HttpResponse.json({ message: 'المتطوع غير موجود' }, { status: 404 });
    }
    return HttpResponse.json(profile);
  }),
  http.post(`${API_BASE}/volunteers`, async ({ request }) => {
    const body = (await request.json()) as VolunteerInput;
    if (EDGE_VOLUNTEERS[body.volunteerId]) {
      return HttpResponse.json({ message: 'الرقم التعريفي للمتطوع مسجل مسبقاً' }, { status: 409 });
    }
    return HttpResponse.json({ volunteer: body }, { status: 201 });
  })
);

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function renderAuthenticatedRoute(routePath: string) {
  localStorage.setItem('mnu_admin_token', TEST_TOKEN);
  window.history.pushState({}, '', routePath);
  return render(<App />);
}

describe('Phase 6 UI edge cases', () => {
  it('renders_zero_activity_volunteer_profile_with_empty_state_and_zero_progress', async () => {
    renderAuthenticatedRoute('/volunteers/20260090');

    await screen.findByRole('heading', { name: 'سلمى حسام الدين' });
    expect(screen.getByText('متبقي ٣٠ ساعة')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText(AR.profile.emptyActivities)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: AR.volunteers.certificateLocked })).toBeDisabled();
  });

  it('unlocks_certificate_and_shows_100_percent_progress_at_exactly_30_hours', async () => {
    renderAuthenticatedRoute('/volunteers/20260030');

    await screen.findByRole('heading', { name: 'يوسف طارق محمود' });
    expect(screen.getByText(AR.volunteers.eligibleBadge)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('link', { name: AR.volunteers.issueCertificate })).toHaveAttribute(
      'href',
      '/certificate/20260030'
    );
  });

  it('shows_zero_approved_hours_and_rejected_badges_for_only_rejected_activities', async () => {
    renderAuthenticatedRoute('/volunteers/20260040');

    await screen.findByRole('heading', { name: 'منة الله كريم' });
    expect(screen.getByText('متبقي ٣٠ ساعة')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('نشاط مرفوض أول')).toBeInTheDocument();
    expect(screen.getByText('نشاط مرفوض ثان')).toBeInTheDocument();
    expect(screen.getAllByText(AR.statuses.rejected).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole('button', { name: AR.volunteers.certificateLocked })).toBeDisabled();
  });

  it('displays_409_arabic_error_and_keeps_modal_open_on_duplicate_volunteer_id', async () => {
    const user = userEvent.setup();
    renderAuthenticatedRoute('/volunteers');
    await screen.findByText('سلمى حسام الدين');

    await user.click(screen.getByRole('button', { name: AR.volunteers.addVolunteerBtn }));
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(AR.volunteerModal.idLabel), '20260030');
    await user.type(within(dialog).getByLabelText(AR.volunteerModal.nameLabel), 'اسم مكرر');
    await user.selectOptions(
      within(dialog).getByLabelText(AR.volunteerModal.facultyLabel),
      'كلية الهندسة'
    );
    await user.click(within(dialog).getByRole('button', { name: AR.common.save }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('الرقم التعريفي للمتطوع مسجل مسبقاً');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
