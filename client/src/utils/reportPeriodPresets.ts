/**
 * Quick period presets for the official report export panel.
 *
 * Presets resolve to the same `from`/`to` date-only strings the report
 * endpoint already accepts, computed as Africa/Cairo calendar days so they
 * line up with the server's Cairo-day range semantics. All math is done on
 * plain year/month/day parts (via Intl for the Cairo "today"), never on
 * local-time Date arithmetic, so DST and the viewer's timezone cannot shift
 * a boundary.
 */

export interface CairoDay {
  year: number;
  month: number;
  day: number;
}

export interface ReportPeriodRange {
  from: string;
  to: string;
}

export const REPORT_PERIOD_PRESET_KEYS = [
  'all',
  'last7',
  'last30',
  'last3Months',
  'thisMonth',
  'lastMonth',
] as const;

export type ReportPeriodPresetKey = (typeof REPORT_PERIOD_PRESET_KEYS)[number];

/** The Africa/Cairo calendar day containing the given instant. */
export function getCairoDay(date: Date): CairoDay {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  return { year: read('year'), month: read('month'), day: read('day') };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toYmd({ year, month, day }: CairoDay): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(day: CairoDay, delta: number): CairoDay {
  const shifted = new Date(Date.UTC(day.year, day.month - 1, day.day) + delta * 86_400_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Shifts by whole calendar months, clamping the day to the target month's length. */
function addMonths(day: CairoDay, delta: number): CairoDay {
  const totalMonths = day.year * 12 + (day.month - 1) + delta;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return { year, month, day: Math.min(day.day, daysInMonth(year, month)) };
}

/** Resolves a preset to its inclusive from/to date-only range, relative to Cairo today. */
export function resolveReportPeriodPreset(
  key: ReportPeriodPresetKey,
  now: Date = new Date()
): ReportPeriodRange {
  const today = getCairoDay(now);
  const todayYmd = toYmd(today);

  switch (key) {
    case 'all':
      return { from: '', to: '' };
    case 'last7':
      return { from: toYmd(addDays(today, -6)), to: todayYmd };
    case 'last30':
      return { from: toYmd(addDays(today, -29)), to: todayYmd };
    case 'last3Months':
      return { from: toYmd(addMonths(today, -3)), to: todayYmd };
    case 'thisMonth':
      return { from: toYmd({ ...today, day: 1 }), to: todayYmd };
    case 'lastMonth': {
      const firstOfLastMonth = addMonths({ ...today, day: 1 }, -1);
      const lastOfLastMonth: CairoDay = {
        ...firstOfLastMonth,
        day: daysInMonth(firstOfLastMonth.year, firstOfLastMonth.month),
      };
      return { from: toYmd(firstOfLastMonth), to: toYmd(lastOfLastMonth) };
    }
  }
}

/**
 * Returns the preset whose resolved range exactly matches the given values,
 * or null for a hand-typed custom range. Used to highlight the active chip
 * without tracking extra state.
 */
export function matchReportPeriodPreset(
  from: string,
  to: string,
  now: Date = new Date()
): ReportPeriodPresetKey | null {
  for (const key of REPORT_PERIOD_PRESET_KEYS) {
    const range = resolveReportPeriodPreset(key, now);
    if (range.from === from && range.to === to) {
      return key;
    }
  }
  return null;
}
