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
