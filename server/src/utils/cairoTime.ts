import type { OpportunityPhase } from '../constants/enums.js';

export const CAIRO_TIME_ZONE = 'Africa/Cairo';

export const CHECK_IN_WINDOW_MINUTES_BEFORE_START = 30;

export interface CairoDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface OpportunitySchedule {
  startAt: Date;
  endAt: Date;
  registrationDeadline: Date;
}

export interface CheckInWindow {
  opensAt: Date;
  closesAt: Date;
}

const cairoFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAIRO_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const cairoOffsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAIRO_TIME_ZONE,
  timeZoneName: 'longOffset',
});

/**
 * Returns the wall-clock date and time components observed in Africa/Cairo for a UTC instant.
 */
export function getCairoDateTimeParts(date: Date): CairoDateTimeParts {
  const parts = cairoFormatter.formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0';
    return Number(value);
  };

  return {
    year: readPart('year'),
    month: readPart('month'),
    day: readPart('day'),
    hour: readPart('hour') % 24,
    minute: readPart('minute'),
    second: readPart('second'),
  };
}

/**
 * Resolves the Africa/Cairo UTC offset in minutes for a given instant (e.g. +120 or +180).
 */
export function getCairoOffsetMinutes(date: Date): number {
  const offsetLabel =
    cairoOffsetFormatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ??
    'GMT';
  const match = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(offsetLabel);
  if (!match || !match[1]) {
    return 0;
  }
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * Converts an Africa/Cairo wall-clock date/time into the equivalent UTC instant.
 */
export function cairoLocalToUtc(parts: CairoDateTimeParts): Date {
  const naiveUtcMillis = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  const firstOffset = getCairoOffsetMinutes(new Date(naiveUtcMillis));
  let utcMillis = naiveUtcMillis - firstOffset * 60_000;

  // DST transitions can shift the offset at the computed instant; re-check once.
  const settledOffset = getCairoOffsetMinutes(new Date(utcMillis));
  if (settledOffset !== firstOffset) {
    utcMillis = naiveUtcMillis - settledOffset * 60_000;
  }
  return new Date(utcMillis);
}

const CAIRO_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Parses a date value, treating timezone-less strings as Africa/Cairo wall-clock time.
 */
export function parseCairoDateTime(value: Date | string): Date {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  const trimmed = value.trim();
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  if (hasExplicitZone) {
    return new Date(trimmed);
  }

  const match = CAIRO_LOCAL_PATTERN.exec(trimmed);
  if (!match) {
    return new Date(trimmed);
  }

  return cairoLocalToUtc({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
    second: Number(match[6] ?? 0),
  });
}

/**
 * Evaluates the opportunity lifecycle phase using Africa/Cairo wall-clock rules.
 */
export function evaluateOpportunityPhase(
  opportunity: OpportunitySchedule,
  now: Date = new Date()
): OpportunityPhase {
  if (now.getTime() < opportunity.registrationDeadline.getTime()) {
    return 'upcoming';
  }
  if (now.getTime() < opportunity.startAt.getTime()) {
    return 'registration_closed';
  }
  if (now.getTime() <= opportunity.endAt.getTime()) {
    return 'in_progress';
  }
  return 'ended';
}

/**
 * Returns the check-in window bounds for an opportunity (30 minutes before start until the end).
 */
export function getCheckInWindow(opportunity: Pick<OpportunitySchedule, 'startAt' | 'endAt'>): CheckInWindow {
  return {
    opensAt: new Date(
      opportunity.startAt.getTime() - CHECK_IN_WINDOW_MINUTES_BEFORE_START * 60_000
    ),
    closesAt: new Date(opportunity.endAt.getTime()),
  };
}

/**
 * Indicates whether the current instant falls inside the Cairo check-in window.
 */
export function isCheckInWindowOpen(
  opportunity: Pick<OpportunitySchedule, 'startAt' | 'endAt'>,
  now: Date = new Date()
): boolean {
  const { opensAt, closesAt } = getCheckInWindow(opportunity);
  return now.getTime() >= opensAt.getTime() && now.getTime() <= closesAt.getTime();
}
