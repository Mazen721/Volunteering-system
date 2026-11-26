import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type { Application, AuthUser, LiveCounters, Opportunity } from '../types';
import { formatNumber } from '../utils/format';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];

function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'admin-user',
    email: 'admin@mnu.edu.eg',
    fullName: 'مسؤول النظام',
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

function buildOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    _id: 'opp-ended',
    title: 'حملة منتهية بانتظار الإتمام',
    description: 'وصف تفصيلي لفرصة تطوعية تخدم المجتمع المحيط بالجامعة',
    requirements: '',
    fields: ['medical'],
    activityType: 'قافلة',
    location: { name: 'مركز خدمة المجتمع', address: 'جامعة المنصورة الأهلية' },
    startAt: '2026-11-20T07:00:00.000Z',
    endAt: '2026-11-20T11:00:00.000Z',
    registrationDeadline: '2026-11-19T07:00:00.000Z',
    hours: 4,
    contactName: 'د. مسؤول الفرصة',
    contactPhone: '01000000000',
    contactEmail: 'opportunity@mnu.edu.eg',
    faculty: FACULTY_A,
    slots: { student: 20, academic: 0, admin: 0 },
    acceptedCounts: { student: 9, academic: 0, admin: 0 },
    approvalMode: 'manual',
    status: 'published',
    createdBy: 'admin-user',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    phase: 'ended',
    checkInOpen: false,
    remainingSlots: { student: 11, academic: 0, admin: 0 },
    ...overrides,
  };
}

function buildApplication(overrides: Partial<Application> = {}): Application {
  return {
    _id: 'app-1',
    opportunity: 'opp-ended',
    volunteer: {
      volunteerId: 'V-1001',
      fullName: 'متطوع حاضر أول',
      category: 'student',
      faculty: FACULTY_A,
    },
    user: 'student-user-1',
    faculty: FACULTY_A,
    category: 'student',
    status: 'accepted',
    note: '',
    decidedBy: 'admin-user',
    decidedAt: '2026-11-19T07:00:00.000Z',
    attended: true,
    checkedInAt: '2026-11-20T07:05:00.000Z',
    hoursGranted: 0,
    appliedAt: '2026-11-18T07:00:00.000Z',
    createdAt: '2026-11-18T07:00:00.000Z',
    updatedAt: '2026-11-20T07:05:00.000Z',
    ...overrides,
  };
}

function absentApplication(id: string, name: string, absenceCount: number): Application {
  return buildApplication({
    _id: id,
    attended: false,
    checkedInAt: null,
    absenceCount,
    user: `user-${id}`,
    volunteer: {
      volunteerId: `V-${id}`,
      fullName: name,
      category: 'student',
      faculty: FACULTY_A,
    },
  });
}

let activeUser: AuthUser | null = null;
let opportunitiesList: Opportunity[] = [];
let liveCounters: LiveCounters = { accepted: 0, checkedIn: 0, notArrived: 0 };
let liveAttendees: Application[] = [];
let warnCalls: string[] = [];

const mswServer = setupServer(
  http.get(`${API_BASE}/registrations`, () => {
    return HttpResponse.json({ registrations: [] });
  }),
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'غير مصرح' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/stats/action-items`, () => {
    return HttpResponse.json({ awaitingCompletion: [], pendingUrgent: [] });
  }),
  http.get(`${API_BASE}/opportunities`, () => {
    return HttpResponse.json({ opportunities: opportunitiesList });
  }),
  http.get(`${API_BASE}/opportunities/:id/live`, ({ params }) => {
    const opportunity = opportunitiesList.find((entry) => entry._id === params.id);
    if (!opportunity) {
      return HttpResponse.json({ message: 'غير موجودة' }, { status: 404 });
    }
    return HttpResponse.json({ opportunity, counters: liveCounters, attendees: liveAttendees });
  }),
  http.post(`${API_BASE}/opportunities/:id/complete`, ({ params }) => {
    const opportunity = opportunitiesList.find((entry) => entry._id === params.id);
    return HttpResponse.json({
      opportunity: { ...opportunity, status: 'completed' },
      creditedCount: liveCounters.checkedIn,
      noShowCount: liveCounters.notArrived,
    });
  }),
  http.post(`${API_BASE}/opportunities/:id/warn-absent`, ({ params }) => {
    warnCalls.push(String(params.id));
    return HttpResponse.json({ sent: liveCounters.notArrived });
  }),
  http.get(`${API_BASE}/opportunities/:id/applications`, () => {
    return HttpResponse.json({ applications: [], readOnly: false });
  }),
  http.get(`${API_BASE}/notifications`, () => {
    return HttpResponse.json({ notifications: [], unreadCount: 0 });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('phase19-token');
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
  opportunitiesList = [];
  liveAttendees = [];
  liveCounters = { accepted: 0, checkedIn: 0, notArrived: 0 };
  warnCalls = [];
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

async function openDialog() {
  opportunitiesList = [buildOpportunity()];
  renderAppAt('/opportunities/manage?complete=opp-ended', buildUser());
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText(new RegExp(AR.opportunities.completeAttendeesTitle));
  return dialog;
}

describe('Phase 19 completion dialog: absent names, absence badges, warn flow', () => {
  it('absent_section_lists_names_sorted_by_absence_count_with_tiered_badges', async () => {
    liveCounters = { accepted: 4, checkedIn: 1, notArrived: 3 };
    liveAttendees = [
      buildApplication({ _id: 'app-attended' }),
      absentApplication('app-absent-1', 'غائب مرة', 1),
      absentApplication('app-absent-5', 'غائب متكرر', 5),
      absentApplication('app-absent-2', 'غائب مرتين', 2),
    ];
    const dialog = await openDialog();

    const absentList = within(dialog).getByTestId('complete-absent-list');
    const rows = absentList.querySelectorAll('li');
    expect(rows).toHaveLength(3);
    // Worst offender first, then descending counts.
    expect(rows[0].textContent).toContain('غائب متكرر');
    expect(rows[1].textContent).toContain('غائب مرتين');
    expect(rows[2].textContent).toContain('غائب مرة');

    const badges = within(absentList).getAllByTestId('absence-badge');
    expect(badges.map((badge) => badge.getAttribute('data-count'))).toEqual(['5', '2', '1']);
    expect(badges[0].textContent).toBe(
      AR.opportunities.absenceMany.replace('{count}', formatNumber(5))
    );
    expect(badges[0].className).toContain('rose');
    expect(badges[1].textContent).toBe(AR.opportunities.absenceTwice);
    expect(badges[1].className).toContain('amber');
    expect(badges[2].textContent).toBe(AR.opportunities.absenceOnce);
    expect(badges[2].className).toContain('slate');

    expect(
      within(dialog).getByText(
        new RegExp(`${AR.opportunities.completeAbsentLabel} \\(${formatNumber(3)}\\)`)
      )
    ).toBeInTheDocument();
  });

  it('name_lists_show_first_4_then_expand_and_collapse', async () => {
    const user = userEvent.setup();
    liveCounters = { accepted: 11, checkedIn: 6, notArrived: 5 };
    liveAttendees = [
      ...Array.from({ length: 6 }, (_, index) =>
        buildApplication({
          _id: `app-attended-${index}`,
          checkedInAt: `2026-11-20T07:${String(10 + index).padStart(2, '0')}:00.000Z`,
          volunteer: {
            volunteerId: `V-2${index}`,
            fullName: `حاضر رقم ${index + 1}`,
            category: 'student',
            faculty: FACULTY_A,
          },
        })
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        absentApplication(`app-absent-${index}`, `غائب رقم ${index + 1}`, 1)
      ),
    ];
    const dialog = await openDialog();

    const attendeesList = within(dialog).getByTestId('complete-attendees-list');
    const absentList = within(dialog).getByTestId('complete-absent-list');
    expect(attendeesList.querySelectorAll('li')).toHaveLength(4);
    expect(absentList.querySelectorAll('li')).toHaveLength(4);

    const showMoreButtons = within(dialog).getAllByRole('button', {
      name: AR.opportunities.showMore,
    });
    expect(showMoreButtons).toHaveLength(2);

    // Expand the attendees list (first toggle in DOM order).
    await user.click(showMoreButtons[0]);
    expect(attendeesList.querySelectorAll('li')).toHaveLength(6);
    expect(absentList.querySelectorAll('li')).toHaveLength(4);

    // Expand the absent list too, then collapse the attendees list again.
    const remainingShowMore = within(dialog).getAllByRole('button', {
      name: AR.opportunities.showMore,
    });
    await user.click(remainingShowMore[0]);
    expect(absentList.querySelectorAll('li')).toHaveLength(5);

    const showLessButtons = within(dialog).getAllByRole('button', {
      name: AR.opportunities.showLess,
    });
    expect(showLessButtons).toHaveLength(2);
    await user.click(showLessButtons[0]);
    expect(attendeesList.querySelectorAll('li')).toHaveLength(4);
  });

  it('warn_flow_confirms_sends_and_then_shows_success_without_the_button', async () => {
    const user = userEvent.setup();
    liveCounters = { accepted: 3, checkedIn: 1, notArrived: 2 };
    liveAttendees = [
      buildApplication({ _id: 'app-attended' }),
      absentApplication('app-absent-a', 'غائب أول', 3),
      absentApplication('app-absent-b', 'غائب ثان', 1),
    ];
    const dialog = await openDialog();

    await user.click(
      within(dialog).getByRole('button', { name: new RegExp(AR.opportunities.warnAbsentButton) })
    );
    expect(
      within(dialog).getByText(
        AR.opportunities.warnAbsentConfirmMessage.replace('{count}', formatNumber(2))
      )
    ).toBeInTheDocument();
    expect(warnCalls).toEqual([]);

    await user.click(
      within(dialog).getByRole('button', { name: AR.opportunities.warnAbsentConfirmButton })
    );
    await waitFor(() => {
      expect(warnCalls).toEqual(['opp-ended']);
    });
    expect(
      await within(dialog).findByText(
        AR.opportunities.warnAbsentSuccess.replace('{count}', formatNumber(2))
      )
    ).toBeInTheDocument();
    // No way to send twice from the same dialog session.
    expect(
      within(dialog).queryByRole('button', {
        name: new RegExp(AR.opportunities.warnAbsentButton),
      })
    ).not.toBeInTheDocument();
  });

  it('warn_flow_cancel_returns_to_the_button_without_sending', async () => {
    const user = userEvent.setup();
    liveCounters = { accepted: 2, checkedIn: 1, notArrived: 1 };
    liveAttendees = [
      buildApplication({ _id: 'app-attended' }),
      absentApplication('app-absent-a', 'غائب وحيد', 1),
    ];
    const dialog = await openDialog();

    await user.click(
      within(dialog).getByRole('button', { name: new RegExp(AR.opportunities.warnAbsentButton) })
    );
    // The first «إلغاء» in DOM order is the warn-confirm cancel (the dialog
    // footer's own cancel button comes after it).
    const cancelButtons = within(dialog).getAllByRole('button', { name: AR.common.cancel });
    await user.click(cancelButtons[0]);

    expect(warnCalls).toEqual([]);
    expect(
      within(dialog).getByRole('button', { name: new RegExp(AR.opportunities.warnAbsentButton) })
    ).toBeInTheDocument();
  });
});
