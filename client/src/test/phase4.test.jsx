import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App.jsx';
import { AR } from '../constants/ar.js';

const API_BASE = 'http://localhost:5000/api';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.phase4-token';

function createInitialStore() {
  return {
    volunteers: [
      {
        _id: 'v-1',
        volunteerId: '20260001',
        fullName: 'أحمد محمد علي',
        category: 'student',
        categoryLabel: 'الطلاب',
        faculty: 'كلية الطب البشري',
        totalActivities: 2,
        approvedActivities: 1,
        approvedHours: 25,
        remainingHours: 5,
        eligible: false,
      },
      {
        _id: 'v-8',
        volunteerId: '20260008',
        fullName: 'نور طاهر حسين',
        category: 'student',
        categoryLabel: 'الطلاب',
        faculty: 'كلية التمريض',
        totalActivities: 1,
        approvedActivities: 0,
        approvedHours: 0,
        remainingHours: 30,
        eligible: false,
      },
    ],
    activities: [
      {
        _id: 'a-1',
        volunteerId: '20260001',
        title: 'حملة التبرع بالدم',
        type: 'حملة توعية',
        hours: 25,
        date: '2026-10-05T00:00:00.000Z',
        status: 'approved',
        supervisor: 'د. خالد السعيد',
      },
      {
        _id: 'a-2',
        volunteerId: '20260001',
        title: 'قافلة طبية',
        type: 'قافلة',
        hours: 6,
        date: '2026-10-12T00:00:00.000Z',
        status: 'pending',
        supervisor: 'د. منى سالم',
      },
      {
        _id: 'a-3',
        volunteerId: '20260008',
        title: 'ندوة التمريض',
        type: 'ندوة',
        hours: 10,
        date: '2026-10-18T00:00:00.000Z',
        status: 'pending',
        supervisor: 'د. سها طارق',
      },
    ],
  };
}

let store = createInitialStore();
let capturedVolunteerQueries = [];
let deleteCallCount = 0;

function recomputeVolunteer(volunteer) {
  const volunteerActivities = store.activities.filter(
    (act) => act.volunteerId === volunteer.volunteerId
  );
  const approvedList = volunteerActivities.filter((act) => act.status === 'approved');
  const approvedHours = approvedList.reduce((sum, act) => sum + act.hours, 0);
  return {
    ...volunteer,
    totalActivities: volunteerActivities.length,
    approvedActivities: approvedList.length,
    approvedHours,
    remainingHours: Math.max(0, 30 - approvedHours),
    eligible: approvedHours >= 30,
  };
}

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/me`, () =>
    HttpResponse.json({ admin: { id: 'admin-1', email: 'admin@mnu.edu.eg' } })
  ),

  http.get(`${API_BASE}/volunteers`, ({ request }) => {
    const url = new URL(request.url);
    const queryObj = Object.fromEntries(url.searchParams.entries());
    capturedVolunteerQueries.push(queryObj);

    let rows = store.volunteers.map(recomputeVolunteer);
    if (queryObj.category) rows = rows.filter((v) => v.category === queryObj.category);
    if (queryObj.faculty) rows = rows.filter((v) => v.faculty === queryObj.faculty);
    if (queryObj.eligibility === 'eligible') rows = rows.filter((v) => v.eligible);
    if (queryObj.eligibility === 'in_progress') rows = rows.filter((v) => !v.eligible);
    if (queryObj.activityStatus) {
      rows = rows.filter((v) =>
        store.activities.some(
          (a) => a.volunteerId === v.volunteerId && a.status === queryObj.activityStatus
        )
      );
    }
    if (queryObj.search) {
      const term = queryObj.search.trim();
      rows = rows.filter((v) => v.fullName.includes(term) || v.volunteerId.includes(term));
    }

    return HttpResponse.json({
      volunteers: rows,
      total: rows.length,
      page: 1,
      pages: 1,
      certificateHours: 30,
    });
  }),

  http.get(`${API_BASE}/volunteers/:volunteerId`, ({ params }) => {
    const found = store.volunteers.find((v) => v.volunteerId === params.volunteerId);
    if (!found) {
      return HttpResponse.json({ message: 'المتطوع غير موجود' }, { status: 404 });
    }
    const volunteer = recomputeVolunteer(found);
    const activities = store.activities.filter((a) => a.volunteerId === found.volunteerId);
    return HttpResponse.json({ volunteer, activities, certificateHours: 30 });
  }),

  http.post(`${API_BASE}/volunteers`, async ({ request }) => {
    const body = await request.json();
    const created = recomputeVolunteer({
      _id: `v-${Date.now()}`,
      ...body,
      categoryLabel: AR.categories[body.category],
    });
    store.volunteers.push(created);
    return HttpResponse.json({ volunteer: created }, { status: 201 });
  }),

  http.delete(`${API_BASE}/volunteers/:volunteerId`, ({ params }) => {
    deleteCallCount += 1;
    store.volunteers = store.volunteers.filter((v) => v.volunteerId !== params.volunteerId);
    return HttpResponse.json({ message: 'تم حذف المتطوع بنجاح' });
  }),

  http.post(`${API_BASE}/activities`, async ({ request }) => {
    const body = await request.json();
    const created = {
      _id: `a-${Date.now()}`,
      ...body,
      date: new Date(body.date).toISOString(),
    };
    store.activities.push(created);
    return HttpResponse.json({ activity: created }, { status: 201 });
  }),

  http.patch(`${API_BASE}/activities/:id/status`, async ({ params, request }) => {
    const body = await request.json();
    const target = store.activities.find((a) => a._id === params.id);
    if (!target) {
      return HttpResponse.json({ message: 'النشاط غير موجود' }, { status: 404 });
    }
    target.status = body.status;
    return HttpResponse.json({ activity: target });
  }),

  http.delete(`${API_BASE}/activities/:id`, ({ params }) => {
    deleteCallCount += 1;
    store.activities = store.activities.filter((a) => a._id !== params.id);
    return HttpResponse.json({ message: 'تم حذف النشاط بنجاح' });
  }),

  http.get(`${API_BASE}/excel/export`, () => {
    return new HttpResponse(new Blob(['xlsx-binary-content']), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });
  }),

  http.post(`${API_BASE}/excel/import`, ({ request }) => {
    const url = new URL(request.url);
    const commit = url.searchParams.get('commit') === 'true';
    const preview = {
      volunteersCount: 8,
      activitiesCount: 0,
      errors: [],
      conflicts: [
        {
          rowNumber: 5,
          message: 'تعارض في الكلية للمتطوع سارة محمود حسن',
        },
      ],
      duplicates: [],
      skippedExactDuplicates: 12,
    };

    if (!commit) {
      return HttpResponse.json({ committed: false, preview });
    }
    return HttpResponse.json({
      committed: true,
      summary: {
        volunteersCreated: 0,
        volunteersUpdated: 0,
        activitiesCreated: 0,
        skippedDuplicates: 12,
      },
      preview,
    });
  })
);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  store = createInitialStore();
  capturedVolunteerQueries = [];
  deleteCallCount = 0;
});
afterAll(() => mswServer.close());

function renderAuthenticatedRoute(routePath) {
  localStorage.setItem('mnu_admin_token', TEST_TOKEN);
  window.history.pushState({}, '', routePath);
  return render(<App />);
}

describe('Phase 4 Volunteers, Activities, Profile, and Import/Export', () => {
  it('adds_volunteer_with_special_xss_characters_safely_and_displays_arabic_ui', async () => {
    const user = userEvent.setup();
    renderAuthenticatedRoute('/volunteers');

    await screen.findByText('أحمد محمد علي');
    expect(document.body.textContent).not.toMatch(/[A-Za-z]/);

    await user.click(screen.getByRole('button', { name: AR.volunteers.addVolunteerBtn }));

    const dialog = screen.getByRole('dialog');
    const maliciousName = "سارة ' <script>alert(1)</script>";
    await user.type(within(dialog).getByLabelText(AR.volunteerModal.idLabel), '20260099');
    await user.type(within(dialog).getByLabelText(AR.volunteerModal.nameLabel), maliciousName);
    await user.selectOptions(
      within(dialog).getByLabelText(AR.volunteerModal.facultyLabel),
      'كلية الهندسة'
    );
    await user.click(within(dialog).getByRole('button', { name: AR.common.save }));

    expect(await screen.findByText(maliciousName)).toBeInTheDocument();
  });

  it('looks_up_volunteer_read_only_in_activity_modal_and_rejects_unknown_id', async () => {
    const user = userEvent.setup();
    renderAuthenticatedRoute('/volunteers');
    await screen.findByText('أحمد محمد علي');

    await user.click(screen.getByRole('button', { name: AR.volunteers.addActivityBtn }));
    const dialog = screen.getByRole('dialog');
    const idInput = within(dialog).getByLabelText(AR.activityModal.volunteerIdLabel);

    await user.type(idInput, '99999999');
    expect(await within(dialog).findByText('المتطوع غير موجود')).toBeInTheDocument();

    await user.clear(idInput);
    await user.type(idInput, '20260001');
    expect(
      await within(dialog).findByText(AR.activityModal.volunteerFoundNotice)
    ).toBeInTheDocument();
    expect(within(dialog).getByText('أحمد محمد علي')).toBeInTheDocument();
    expect(within(dialog).getByText('كلية الطب البشري')).toBeInTheDocument();
  });

  it.each([
    ['title', '', '5', '2026-10-10', 'د. علي', AR.activityModal.titleMin],
    ['zero-hours', 'نشاط توعية', '0', '2026-10-10', 'د. علي', AR.activityModal.hoursPositive],
    ['future-date', 'نشاط توعية', '4', '2099-01-01', 'د. علي', AR.activityModal.dateFuture],
  ])(
    'rejects_invalid_activity_form_input(%s)_with_arabic_message',
    async (_case, title, hours, dateVal, supervisor, expectedError) => {
      const user = userEvent.setup();
      renderAuthenticatedRoute('/volunteers');
      await screen.findByText('أحمد محمد علي');

      await user.click(screen.getByRole('button', { name: AR.volunteers.addActivityBtn }));
      const dialog = screen.getByRole('dialog');

      await user.type(within(dialog).getByLabelText(AR.activityModal.volunteerIdLabel), '20260001');
      await within(dialog).findByText(AR.activityModal.volunteerFoundNotice);

      if (title) {
        await user.type(within(dialog).getByLabelText(AR.activityModal.titleLabel), title);
      }
      if (hours) {
        await user.type(within(dialog).getByLabelText(AR.activityModal.hoursLabel), hours);
      }
      const dateInput = within(dialog).getByLabelText(AR.activityModal.dateLabel);
      await user.clear(dateInput);
      await user.type(dateInput, dateVal);
      await user.type(within(dialog).getByLabelText(AR.activityModal.supervisorLabel), supervisor);

      await user.click(within(dialog).getByRole('button', { name: AR.common.save }));
      expect(within(dialog).getByText(expectedError)).toBeInTheDocument();
    }
  );

  it('sends_separate_eligibility_and_activity_status_filters_individually_and_combined', async () => {
    const user = userEvent.setup();
    renderAuthenticatedRoute('/volunteers');
    await screen.findByText('أحمد محمد علي');

    await user.selectOptions(
      screen.getByLabelText(AR.volunteers.eligibilityFilterLabel),
      'in_progress'
    );
    expect(capturedVolunteerQueries.at(-1).eligibility).toBe('in_progress');

    await user.selectOptions(
      screen.getByLabelText(AR.volunteers.activityStatusFilterLabel),
      'pending'
    );
    expect(capturedVolunteerQueries.at(-1)).toMatchObject({
      eligibility: 'in_progress',
      activityStatus: 'pending',
    });

    await user.selectOptions(
      screen.getByLabelText(AR.volunteers.facultyFilterLabel),
      'كلية التمريض'
    );
    expect(await screen.findByText('نور طاهر حسين')).toBeInTheDocument();
    expect(screen.queryByText('أحمد محمد علي')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: AR.common.resetFilters }));
    expect(await screen.findByText('أحمد محمد علي')).toBeInTheDocument();
  });

  it('updates_eligibility_badge_and_totals_when_activity_status_changes_on_profile', async () => {
    const user = userEvent.setup();
    renderAuthenticatedRoute('/volunteers/20260001');

    await screen.findByRole('heading', { name: 'أحمد محمد علي' });
    expect(screen.getByText('متبقي ٥ ساعة')).toBeInTheDocument();

    const statusSelect = screen.getByLabelText(`${AR.activityModal.statusLabel} قافلة طبية`);
    await user.selectOptions(statusSelect, 'approved');

    expect(await screen.findByText('مؤهل لإصدار الشهادة 🎓')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: AR.volunteers.issueCertificate })).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText(`${AR.activityModal.statusLabel} قافلة طبية`),
      'rejected'
    );
    expect(await screen.findByText('متبقي ٥ ساعة')).toBeInTheDocument();
    expect(screen.getAllByText(AR.statuses.rejected).length).toBeGreaterThanOrEqual(1);
  });

  it('requires_arabic_confirmation_before_deleting_activity', async () => {
    const user = userEvent.setup();
    renderAuthenticatedRoute('/volunteers/20260001');

    await screen.findByRole('heading', { name: 'أحمد محمد علي' });
    await user.click(screen.getByRole('button', { name: `${AR.common.delete} قافلة طبية` }));

    const confirmDialog = screen.getByRole('dialog');
    expect(within(confirmDialog).getByText(AR.profile.deleteActivityTitle)).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole('button', { name: AR.common.cancel }));
    expect(deleteCallCount).toBe(0);

    await user.click(screen.getByRole('button', { name: `${AR.common.delete} قافلة طبية` }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: AR.common.delete })
    );

    expect(deleteCallCount).toBe(1);
    expect(screen.queryByText('قافلة طبية')).not.toBeInTheDocument();
  });

  it('exports_and_round_trips_excel_import_preview_and_commit', async () => {
    const user = userEvent.setup();
    const createObjectUrlSpy = URL.createObjectURL;
    const revokeObjectUrlSpy = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:mock-xlsx';
    URL.revokeObjectURL = () => {};

    try {
      renderAuthenticatedRoute('/import-export');
      await screen.findByRole('heading', { name: AR.importExport.pageTitle });
      expect(document.body.textContent).not.toMatch(/[A-Za-z]/);

      await user.click(screen.getByRole('button', { name: AR.importExport.exportButton }));
      expect(await screen.findByText(AR.importExport.exportSuccess)).toBeInTheDocument();

      const fileInput = screen.getByLabelText(AR.importExport.chooseFileLabel);
      const xlsxFile = new File(['mock-bytes'], 'volunteer-hours-report.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await user.upload(fileInput, xlsxFile);

      await user.click(screen.getByRole('button', { name: AR.importExport.previewButton }));
      expect(await screen.findByText(AR.importExport.previewReportTitle)).toBeInTheDocument();
      expect(screen.getByText(/تعارض في الكلية للمتطوع سارة محمود حسن/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: AR.importExport.commitButton }));
      expect(await screen.findByText(AR.importExport.commitSuccessTitle)).toBeInTheDocument();
      expect(screen.getByText(`${AR.importExport.volunteersCreated}: ٠`)).toBeInTheDocument();
      expect(screen.getByText(`${AR.importExport.activitiesCreated}: ٠`)).toBeInTheDocument();
    } finally {
      URL.createObjectURL = createObjectUrlSpy;
      URL.revokeObjectURL = revokeObjectUrlSpy;
    }
  });
});
