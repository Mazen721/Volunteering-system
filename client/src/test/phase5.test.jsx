import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App.jsx';
import { AR } from '../constants/ar.js';
import { formatDateAr, formatNumber } from '../utils/format.js';

const API_BASE = 'http://localhost:5000/api';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.phase5-token';

const VOLUNTEER_PROFILES = {
  20260001: {
    volunteer: {
      _id: 'v-1',
      volunteerId: '20260001',
      fullName: 'أحمد محمد علي',
      category: 'student',
      categoryLabel: 'الطلاب',
      faculty: 'كلية الطب البشري',
      totalActivities: 3,
      approvedActivities: 3,
      approvedHours: 31,
      remainingHours: 0,
      eligible: true,
    },
    activities: [],
    certificateHours: 30,
  },
  20260002: {
    volunteer: {
      _id: 'v-2',
      volunteerId: '20260002',
      fullName: 'سارة إبراهيم حسن',
      category: 'student',
      categoryLabel: 'الطلاب',
      faculty: 'كلية طب الأسنان',
      totalActivities: 2,
      approvedActivities: 2,
      approvedHours: 15,
      remainingHours: 15,
      eligible: false,
    },
    activities: [],
    certificateHours: 30,
  },
  20260099: {
    volunteer: {
      _id: 'v-99',
      volunteerId: '20260099',
      fullName: 'عبد الرحمن محمد محمود الشربيني',
      category: 'academic',
      categoryLabel: 'أعضاء الكادر الأكاديمي',
      faculty: 'كلية تكنولوجيا العلوم الصحية',
      totalActivities: 1,
      approvedActivities: 1,
      approvedHours: 30,
      remainingHours: 0,
      eligible: true,
    },
    activities: [],
    certificateHours: 30,
  },
};

let failNextProfileRequest = false;

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/me`, () =>
    HttpResponse.json({ admin: { id: 'admin-1', email: 'admin@mnu.edu.eg' } })
  ),
  http.get(`${API_BASE}/volunteers/:volunteerId`, ({ params }) => {
    if (failNextProfileRequest) {
      failNextProfileRequest = false;
      return HttpResponse.json({ message: 'تعذر تحميل ملف المتطوع مؤقتاً' }, { status: 500 });
    }
    const profile = VOLUNTEER_PROFILES[params.volunteerId];
    if (!profile) {
      return HttpResponse.json({ message: 'المتطوع غير موجود' }, { status: 404 });
    }
    return HttpResponse.json(profile);
  })
);

function renderAuthenticatedRoute(routePath) {
  localStorage.setItem('mnu_admin_token', TEST_TOKEN);
  window.history.pushState({}, '', routePath);
  return render(<App />);
}

beforeAll(() => {
  mswServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  mswServer.resetHandlers();
  localStorage.clear();
  failNextProfileRequest = false;
  vi.restoreAllMocks();
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('Phase 5 Volunteer Certificate', () => {
  it('blocks_ineligible_volunteer_certificate_url_with_arabic_message', async () => {
    renderAuthenticatedRoute('/certificate/20260002');

    const alertRegion = await screen.findByRole('alert');
    expect(within(alertRegion).getByText(AR.certificate.blockedTitle)).toBeInTheDocument();
    expect(within(alertRegion).getByText(/سارة إبراهيم حسن/)).toBeInTheDocument();
    expect(within(alertRegion).getAllByText(/١٥ ساعة/)).toHaveLength(2);
    expect(within(alertRegion).getByText(/٣٠ ساعة/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: AR.certificate.printButton })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: AR.certificate.heading })).not.toBeInTheDocument();
  });

  it.each([
    {
      volunteerId: '20260001',
      expectedName: 'أحمد محمد علي',
      expectedCategory: 'الطلاب',
      expectedFaculty: 'كلية الطب البشري',
      expectedHours: formatNumber(31),
      expectedActivities: formatNumber(3),
      expectedActivityLabel: AR.certificate.activityPlural,
    },
    {
      volunteerId: '20260099',
      expectedName: 'عبد الرحمن محمد محمود الشربيني',
      expectedCategory: 'أعضاء الكادر الأكاديمي',
      expectedFaculty: 'كلية تكنولوجيا العلوم الصحية',
      expectedHours: formatNumber(30),
      expectedActivities: formatNumber(1),
      expectedActivityLabel: AR.certificate.activitySingular,
    },
  ])(
    'renders_eligible_certificate_details_and_triggers_print($volunteerId)',
    async ({
      volunteerId,
      expectedName,
      expectedCategory,
      expectedFaculty,
      expectedHours,
      expectedActivities,
      expectedActivityLabel,
    }) => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
      const user = userEvent.setup();

      renderAuthenticatedRoute(`/certificate/${volunteerId}`);

      const certificate = await screen.findByRole('article', { name: AR.certificate.heading });
      expect(
        within(certificate).getByRole('heading', { name: AR.certificate.authority })
      ).toBeInTheDocument();
      expect(
        within(certificate).getByRole('heading', { name: AR.certificate.heading })
      ).toBeInTheDocument();
      expect(within(certificate).getByText(expectedName)).toBeInTheDocument();
      expect(within(certificate).getByText(volunteerId)).toBeInTheDocument();
      expect(within(certificate).getByText(expectedCategory)).toBeInTheDocument();
      expect(within(certificate).getByText(expectedFaculty)).toBeInTheDocument();
      expect(within(certificate).getByText(expectedHours)).toBeInTheDocument();
      expect(within(certificate).getByText(expectedActivities)).toBeInTheDocument();
      expect(within(certificate).getByText(new RegExp(expectedActivityLabel))).toBeInTheDocument();
      expect(within(certificate).getByText(formatDateAr(new Date()))).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: AR.certificate.printButton }));
      expect(printSpy).toHaveBeenCalledTimes(1);
    }
  );

  it('recovers_certificate_after_api_error_when_retry_is_clicked', async () => {
    failNextProfileRequest = true;
    const user = userEvent.setup();

    renderAuthenticatedRoute('/certificate/20260001');

    const alertRegion = await screen.findByRole('alert');
    expect(within(alertRegion).getByText(AR.certificate.notFoundTitle)).toBeInTheDocument();

    await user.click(within(alertRegion).getByRole('button', { name: AR.common.retry }));

    const certificate = await screen.findByRole('article', { name: AR.certificate.heading });
    expect(within(certificate).getByText('أحمد محمد علي')).toBeInTheDocument();
  });
});
