import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import App from '../App';
import { setStoredToken } from '../api/client';
import { AR } from '../constants/ar';
import type { AuthUser } from '../types';
import { COVER_PRESETS, coverUrlForKey } from '../utils/covers';

const API_BASE = 'http://localhost:5000/api';

let activeUser: AuthUser | null = null;

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

const mswServer = setupServer(
  http.get(`${API_BASE}/registrations`, () => {
    return HttpResponse.json({ registrations: [] });
  }),
  http.get(`${API_BASE}/auth/me`, () => {
    if (!activeUser) {
      return HttpResponse.json({ message: 'جلسة الدخول غير صالحة أو منتهية' }, { status: 401 });
    }
    return HttpResponse.json({ user: activeUser });
  }),
  http.get(`${API_BASE}/opportunities`, () => {
    return HttpResponse.json({ opportunities: [] });
  })
);

function renderAppAt(route: string, user: AuthUser) {
  activeUser = user;
  setStoredToken('phase18-token');
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
  window.history.pushState({}, '', '/');
});

afterAll(() => {
  mswServer.close();
});

function buttonImgSrc(button: HTMLElement): string {
  return button.querySelector('img')?.getAttribute('src') ?? '';
}

function compactButtons(): HTMLElement[] {
  return within(screen.getByTestId('cover-compact-grid')).getAllByRole('button');
}

function previewSrc(): string {
  const preview = screen.getByTestId('cover-selected-preview');
  return preview.querySelector('img')?.getAttribute('src') ?? '';
}

describe('Phase 18 cover picker (compact grid + gallery overlay)', () => {
  it('renders_a_compact_picker_with_at_most_8_thumbnails_and_a_selected_preview', async () => {
    renderAppAt('/opportunities/new', buildUser());

    expect(await screen.findByText(AR.opportunities.form.createTitle)).toBeInTheDocument();

    const buttons = compactButtons();
    expect(buttons.length).toBeLessThanOrEqual(8);
    expect(buttons.length).toBe(8);
    // No field chosen yet: the generic default is selected, visible in the
    // compact row and shown in the large preview.
    expect(previewSrc()).toBe(coverUrlForKey('helping-hands'));
    const pressed = buttons.filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(buttonImgSrc(pressed[0])).toBe(coverUrlForKey('helping-hands'));
    expect(
      screen.getByRole('button', { name: new RegExp(AR.opportunities.form.coverShowMore) })
    ).toBeInTheDocument();
  });

  it('shows_field_relevant_presets_once_a_field_is_chosen', async () => {
    const user = userEvent.setup();
    renderAppAt('/opportunities/new', buildUser());

    expect(await screen.findByText(AR.opportunities.form.createTitle)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: AR.interests.education }));

    const buttons = compactButtons();
    expect(buttons.length).toBe(8);
    // Education default (classroom) becomes the selected preview.
    expect(previewSrc()).toBe(coverUrlForKey('classroom'));
    const srcs = buttons.map(buttonImgSrc);
    expect(srcs).toContain(coverUrlForKey('classroom'));
    expect(srcs).toContain(coverUrlForKey('library-hall'));
    expect(srcs).not.toContain(coverUrlForKey('robotics'));
  });

  it('gallery_overlay_lists_all_50_unique_presets_and_selecting_one_updates_the_form', async () => {
    const user = userEvent.setup();
    renderAppAt('/opportunities/new', buildUser());

    expect(await screen.findByText(AR.opportunities.form.createTitle)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: new RegExp(AR.opportunities.form.coverShowMore) })
    );

    expect(await screen.findByText(AR.opportunities.form.coverGalleryTitle)).toBeInTheDocument();
    const galleryButtons = within(screen.getByTestId('cover-gallery-grid')).getAllByRole(
      'button'
    );
    expect(galleryButtons).toHaveLength(COVER_PRESETS.length);
    expect(COVER_PRESETS).toHaveLength(50);
    const gallerySrcs = galleryButtons.map(buttonImgSrc);
    // Every preset rendered exactly once — no duplicate keys or files.
    expect(new Set(gallerySrcs).size).toBe(50);
    expect(new Set(COVER_PRESETS.map((preset) => preset.key)).size).toBe(50);
    expect(new Set(COVER_PRESETS.map((preset) => preset.file)).size).toBe(50);

    const roboticsButton = galleryButtons.find(
      (button) => buttonImgSrc(button) === coverUrlForKey('robotics')
    );
    expect(roboticsButton).toBeDefined();
    await user.click(roboticsButton!);

    // Overlay closed, preview + form selection updated to the picked preset.
    expect(screen.queryByText(AR.opportunities.form.coverGalleryTitle)).not.toBeInTheDocument();
    expect(previewSrc()).toBe(coverUrlForKey('robotics'));
    const pressed = compactButtons().filter(
      (button) => button.getAttribute('aria-pressed') === 'true'
    );
    expect(pressed).toHaveLength(1);
    expect(buttonImgSrc(pressed[0])).toBe(coverUrlForKey('robotics'));
  });

  it('closing_the_gallery_without_selecting_changes_nothing', async () => {
    const user = userEvent.setup();
    renderAppAt('/opportunities/new', buildUser());

    expect(await screen.findByText(AR.opportunities.form.createTitle)).toBeInTheDocument();
    const before = previewSrc();
    await user.click(
      screen.getByRole('button', { name: new RegExp(AR.opportunities.form.coverShowMore) })
    );
    expect(await screen.findByText(AR.opportunities.form.coverGalleryTitle)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: AR.common.close }));

    expect(screen.queryByText(AR.opportunities.form.coverGalleryTitle)).not.toBeInTheDocument();
    expect(previewSrc()).toBe(before);
  });
});
