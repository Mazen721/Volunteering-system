/**
 * Formats a numeric value with Arabic-Indic digits using the ar-EG locale.
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  return Number(value).toLocaleString('ar-EG');
}

/**
 * Formats a percentage value in Arabic-Indic digits with the Arabic percent sign.
 * @param {number} value
 * @returns {string}
 */
export function formatPercent(value) {
  const formatted = Number(value).toLocaleString('ar-EG', { maximumFractionDigits: 1 });
  return `${formatted}٪`;
}

/**
 * Formats a Date or ISO date string using Arabic (Egypt) locale.
 * @param {string | Date} dateInput
 * @returns {string}
 */
export function formatDateAr(dateInput) {
  return new Date(dateInput).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Converts a Date or ISO date string to YYYY-MM-DD for HTML date inputs.
 * @param {string | Date} dateInput
 * @returns {string}
 */
export function toInputDateValue(dateInput) {
  return new Date(dateInput).toISOString().slice(0, 10);
}
