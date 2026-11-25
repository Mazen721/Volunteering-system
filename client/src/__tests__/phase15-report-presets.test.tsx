import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import type { AuthUser } from '../types';
import {
  getCairoDay,
  matchReportPeriodPreset,
  resolveReportPeriodPreset,
} from '../utils/reportPeriodPresets';

const API_BASE = 'http://localhost:5000/api';
const FACULTY_A = FACULTIES[0];

// 10:00 UTC = 12:00 in Cairo (UTC+2 in March) on 2026-03-31.
const FIXED_NOW = new Date('2026-03-31T10:00:00.000Z');

function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-admin',
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

let activeUser: AuthUser | null = null;

const mswServer = setupServer(
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'غير مصرح' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/registrations`, () => {
    return HttpResponse.json({ registrations: [] });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('phase15-token');
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
  vi.useRealTimers();
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

describe('report period presets — Cairo date math', () => {
  it('reads_today_in_africa_cairo_not_utc_or_local', () => {
    // 21:59 UTC is still 23:59 on Mar 31 in Cairo (UTC+2); 22:30 UTC is Apr 1.
    expect(getCairoDay(new Date('2026-03-31T21:59:00.000Z'))).toEqual({
      year: 2026,
      month: 3,
      day: 31,
    });
    expect(getCairoDay(new Date('2026-03-31T22:30:00.000Z'))).toEqual({
      year: 2026,
      month: 4,
      day: 1,
    });
    // Summer DST (UTC+3): 21:00 UTC is already midnight of the next Cairo day.
    expect(getCairoDay(new Date('2026-07-01T20:59:00.000Z'))).toEqual({
      year: 2026,
      month: 7,
      day: 1,
    });
    expect(getCairoDay(new Date('2026-07-01T21:00:00.000Z'))).toEqual({
      year: 2026,
      month: 7,
      day: 2,
    });
  });

  it('resolves_every_preset_for_a_fixed_today', () => {
    expect(resolveReportPeriodPreset('all', FIXED_NOW)).toEqual({ from: '', to: '' });
    expect(resolveReportPeriodPreset('last7', FIXED_NOW)).toEqual({
      from: '2026-03-25',
      to: '2026-03-31',
    });
    expect(resolveReportPeriodPreset('last30', FIXED_NOW)).toEqual({
      from: '2026-03-02',
      to: '2026-03-31',
    });
    expect(resolveReportPeriodPreset('last3Months', FIXED_NOW)).toEqual({
      from: '2025-12-31',
      to: '2026-03-31',
    });
    expect(resolveReportPeriodPreset('thisMonth', FIXED_NOW)).toEqual({
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(resolveReportPeriodPreset('lastMonth', FIXED_NOW)).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('clamps_last_3_months_to_the_target_month_length', () => {
    // May 31 minus 3 calendar months lands on Feb 31, which clamps to Feb 28.
    const may31 = new Date('2026-05-31T10:00:00.000Z');
    expect(resolveReportPeriodPreset('last3Months', may31)).toEqual({
      from: '2026-02-28',
      to: '2026-05-31',
    });
    // Leap year: May 31 2028 minus 3 months clamps to Feb 29.
    const may31Leap = new Date('2028-05-31T10:00:00.000Z');
    expect(resolveReportPeriodPreset('last3Months', may31Leap).from).toBe('2028-02-29');
  });

  it('resolves_last_month_across_the_year_boundary', () => {
    const january = new Date('2026-01-15T10:00:00.000Z');
    expect(resolveReportPeriodPreset('lastMonth', january)).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(resolveReportPeriodPreset('thisMonth', january)).toEqual({
      from: '2026-01-01',
      to: '2026-01-15',
    });
  });

  it('matches_the_active_preset_by_value_and_rejects_custom_ranges', () => {
    expect(matchReportPeriodPreset('', '', FIXED_NOW)).toBe('all');
    expect(matchReportPeriodPreset('2026-03-25', '2026-03-31', FIXED_NOW)).toBe('last7');
    expect(matchReportPeriodPreset('2026-02-01', '2026-02-28', FIXED_NOW)).toBe('lastMonth');
    expect(matchReportPeriodPreset('2026-03-20', '2026-03-31', FIXED_NOW)).toBeNull();
    expect(matchReportPeriodPreset('2026-03-25', '', FIXED_NOW)).toBeNull();
  });
});

describe('Phase 15 Report Period Presets (panel)', () => {
  it('fills_the_inputs_and_the_export_url_when_a_preset_is_clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
    renderAppAt('/import-export', buildUser());

    const allChip = await screen.findByTestId('report-preset-all');
    // Empty from/to is exactly the «كل الفترات» preset, so it starts active.
    expect(allChip.getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByTestId('report-from-input') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('report-to-input') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByTestId('report-preset-last3Months'));

    expect((screen.getByTestId('report-from-input') as HTMLInputElement).value).toBe('2025-12-31');
    expect((screen.getByTestId('report-to-input') as HTMLInputElement).value).toBe('2026-03-31');
    expect(screen.getByTestId('report-preset-last3Months').getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(allChip.getAttribute('aria-pressed')).toBe('false');

    const href = screen.getByTestId('report-export-link').getAttribute('href') ?? '';
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('from')).toBe('2025-12-31');
    expect(params.get('to')).toBe('2026-03-31');
  });

  it('clears_the_active_highlight_when_a_date_is_edited_manually', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
    renderAppAt('/import-export', buildUser());

    fireEvent.click(await screen.findByTestId('report-preset-last7'));
    expect(screen.getByTestId('report-preset-last7').getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByTestId('report-from-input') as HTMLInputElement).value).toBe('2026-03-25');

    fireEvent.change(screen.getByTestId('report-from-input'), {
      target: { value: '2026-03-20' },
    });

    for (const key of ['all', 'last7', 'last30', 'last3Months', 'thisMonth', 'lastMonth']) {
      expect(screen.getByTestId(`report-preset-${key}`).getAttribute('aria-pressed')).toBe('false');
    }
    // The custom values still flow into the export URL untouched.
    const href = screen.getByTestId('report-export-link').getAttribute('href') ?? '';
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('from')).toBe('2026-03-20');
    expect(params.get('to')).toBe('2026-03-31');
  });

  it('clears_both_dates_when_all_periods_is_clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
    renderAppAt('/import-export', buildUser());

    fireEvent.click(await screen.findByTestId('report-preset-last30'));
    expect((screen.getByTestId('report-from-input') as HTMLInputElement).value).toBe('2026-03-02');

    fireEvent.click(screen.getByTestId('report-preset-all'));
    expect((screen.getByTestId('report-from-input') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('report-to-input') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('report-preset-all').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('report-export-link').getAttribute('href')).toBe(
      '/reports/print?autoprint=1'
    );
  });

  it('offers_the_same_presets_to_a_dean_without_a_faculty_param', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
    renderAppAt(
      '/import-export',
      buildUser({
        id: 'dean-1',
        email: 'medicine.dean@mnu.edu.eg',
        fullName: 'عميد كلية الطب البشري',
        role: 'dean',
        faculty: FACULTY_A,
      })
    );

    fireEvent.click(await screen.findByTestId('report-preset-thisMonth'));
    expect((screen.getByTestId('report-from-input') as HTMLInputElement).value).toBe('2026-03-01');
    expect((screen.getByTestId('report-to-input') as HTMLInputElement).value).toBe('2026-03-31');
    expect(screen.getByText(AR.report.panel.presets.thisMonth)).toBeInTheDocument();

    const href = screen.getByTestId('report-export-link').getAttribute('href') ?? '';
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('faculty')).toBeNull();
    expect(params.get('from')).toBe('2026-03-01');
    expect(params.get('to')).toBe('2026-03-31');
  });
});
