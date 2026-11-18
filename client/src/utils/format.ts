/**
 * Formats a numeric value with Arabic-Indic digits using the ar-EG locale.
 */
export function formatNumber(value: number): string {
  return Number(value).toLocaleString('ar-EG');
}

/**
 * Formats a percentage value in Arabic-Indic digits with the Arabic percent sign.
 */
export function formatPercent(value: number): string {
  const formatted = Number(value).toLocaleString('ar-EG', { maximumFractionDigits: 1 });
  return `${formatted}٪`;
}

/**
 * Formats a Date or ISO date string using Arabic (Egypt) locale.
 */
export function formatDateAr(dateInput: string | Date): string {
  return new Date(dateInput).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Converts a Date or ISO date string to YYYY-MM-DD for HTML date inputs.
 */
export function toInputDateValue(dateInput: string | Date): string {
  return new Date(dateInput).toISOString().slice(0, 10);
}

/**
 * Formats a Date or ISO string as Africa/Cairo wall-clock YYYY-MM-DDTHH:mm for datetime-local inputs.
 */
export function toCairoInputDateTime(dateInput: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(dateInput));

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00';

  const hour = Number(read('hour')) % 24;
  return `${read('year')}-${read('month')}-${read('day')}T${String(hour).padStart(2, '0')}:${read('minute')}`;
}

/**
 * Formats a Date or ISO string as an Arabic wall-clock time in Africa/Cairo.
 */
export function formatTimeAr(dateInput: string | Date): string {
  return new Date(dateInput).toLocaleTimeString('ar-EG', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Formats a Date or ISO string as an Arabic date and time in Africa/Cairo.
 */
export function formatDateTimeAr(dateInput: string | Date): string {
  return new Date(dateInput).toLocaleString('ar-EG', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
