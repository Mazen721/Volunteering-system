import { AppError } from './errors.js';

const MS_PER_DAY = 86_400_000;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const EXCEL_PRE_LEAP_EPOCH_UTC = Date.UTC(1899, 11, 31);
const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseSerialDate(serial) {
  if (!Number.isFinite(serial) || serial <= 0) {
    throw new AppError(400, 'تاريخ النشاط غير صالح');
  }
  // Excel erroneously treats 1900 as a leap year; serials below 60 use Dec 31, 1899.
  const baseEpoch = serial < 60 ? EXCEL_PRE_LEAP_EPOCH_UTC : EXCEL_EPOCH_UTC;
  return new Date(baseEpoch + Math.round(serial * MS_PER_DAY));
}

function parseStringDate(rawText) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new AppError(400, 'تاريخ النشاط مطلوب');
  }
  if (ISO_DATE_ONLY_PATTERN.test(trimmed)) {
    const parsedUtc = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(parsedUtc.getTime())) {
      throw new AppError(400, 'تاريخ النشاط غير صالح');
    }
    return parsedUtc;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, 'تاريخ النشاط غير صالح');
  }
  return parsed;
}

/**
 * Normalizes a Date, Excel serial number, or date string into a valid UTC Date.
 * Cases covered: null/undefined, Date (valid/invalid), number (serial <=0, <60, >=60), string (empty, YYYY-MM-DD, ISO, invalid).
 * @param {Date | number | string} rawDate
 * @returns {Date}
 */
export function parseExcelDate(rawDate) {
  if (rawDate instanceof Date) {
    if (Number.isNaN(rawDate.getTime())) {
      throw new AppError(400, 'تاريخ النشاط غير صالح');
    }
    return rawDate;
  }
  if (typeof rawDate === 'number') {
    return parseSerialDate(rawDate);
  }
  if (typeof rawDate === 'string') {
    return parseStringDate(rawDate);
  }
  throw new AppError(400, 'تاريخ النشاط غير صالح');
}
