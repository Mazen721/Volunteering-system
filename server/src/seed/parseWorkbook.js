import ExcelJS from 'exceljs';
import { ACTIVITY_TYPES, CATEGORY_FROM_AR, FACULTIES, STATUS_FROM_AR } from '../constants/enums.js';
import { AppError } from '../utils/errors.js';
import { parseExcelDate } from '../utils/excelDate.js';

export const VOLUNTEERS_SHEET = 'بيانات المتطوعين';
export const ACTIVITIES_SHEET = 'سجل الأنشطة والساعات';

export const VOLUNTEER_HEADERS = [
  'الرقم التعريفي (ID)',
  'الاسم الرباعي',
  'الفئة',
  'الكلية / الجهة',
];
export const ACTIVITY_HEADERS = [
  'الرقم التعريفي',
  'عنوان النشاط التطوعي',
  'نوع النشاط',
  'عدد الساعات',
  'تاريخ النشاط',
  'حالة الاعتماد',
  'مشرف النشاط',
];

export function readCellText(rawCell) {
  if (rawCell === null || rawCell === undefined) {
    return '';
  }
  if (typeof rawCell === 'object' && !(rawCell instanceof Date)) {
    if (Array.isArray(rawCell.richText)) {
      return rawCell.richText
        .map((part) => part.text)
        .join('')
        .trim();
    }
    if ('result' in rawCell) {
      return readCellText(rawCell.result);
    }
    if ('text' in rawCell) {
      return String(rawCell.text).trim();
    }
  }
  return String(rawCell).trim();
}

export function findHeaderRow(worksheet, requiredHeaders) {
  const maxHeaderScanRows = Math.min(worksheet.rowCount, 10);

  for (let rowIndex = 1; rowIndex <= maxHeaderScanRows; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const columnIndexByName = new Map();

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const headerText = readCellText(cell.value);
      if (headerText) {
        columnIndexByName.set(headerText, colNumber);
      }
    });

    if (requiredHeaders.every((header) => columnIndexByName.has(header))) {
      return { headerRowNumber: rowIndex, columnIndexByName };
    }
  }

  throw new AppError(400, `تعذر العثور على الأعمدة المطلوبة في الورقة "${worksheet.name}"`);
}

export function parseVolunteerRow(row, cols) {
  const volunteerId = readCellText(row.getCell(cols.get('الرقم التعريفي (ID)')).value);
  const fullName = readCellText(row.getCell(cols.get('الاسم الرباعي')).value);
  const categoryLabel = readCellText(row.getCell(cols.get('الفئة')).value);
  const faculty = readCellText(row.getCell(cols.get('الكلية / الجهة')).value);

  if (!volunteerId && !fullName) {
    return null;
  }

  const category = CATEGORY_FROM_AR[categoryLabel];
  if (!category) {
    throw new AppError(400, `فئة متطوع غير صالحة: ${categoryLabel}`);
  }
  if (!FACULTIES.includes(faculty)) {
    throw new AppError(400, `كلية غير صالحة في بيانات المتطوعين: ${faculty}`);
  }

  return { volunteerId, fullName, category, faculty };
}

function parseVolunteersSheet(worksheet) {
  const { headerRowNumber, columnIndexByName } = findHeaderRow(worksheet, VOLUNTEER_HEADERS);
  const volunteers = [];

  for (let rowIndex = headerRowNumber + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const parsed = parseVolunteerRow(worksheet.getRow(rowIndex), columnIndexByName);
    if (parsed) {
      volunteers.push(parsed);
    }
  }

  return volunteers;
}

function parsePositiveHours(rawCellValue, title) {
  const numericValue =
    typeof rawCellValue === 'object' && rawCellValue !== null ? rawCellValue.result : rawCellValue;
  const hours = Number(numericValue);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new AppError(400, `عدد ساعات غير صالح للنشاط "${title}"`);
  }
  return hours;
}

export function parseActivityRow(row, cols, knownVolunteerIds) {
  const volunteerId = readCellText(row.getCell(cols.get('الرقم التعريفي')).value);
  const title = readCellText(row.getCell(cols.get('عنوان النشاط التطوعي')).value);
  if (!volunteerId && !title) {
    return null;
  }
  if (!knownVolunteerIds.has(volunteerId)) {
    throw new AppError(400, `المتطوع رقم ${volunteerId} غير موجود في ورقة بيانات المتطوعين`);
  }

  const type = readCellText(row.getCell(cols.get('نوع النشاط')).value);
  if (!ACTIVITY_TYPES.includes(type)) {
    throw new AppError(400, `نوع نشاط غير صالح: ${type}`);
  }

  const statusLabel = readCellText(row.getCell(cols.get('حالة الاعتماد')).value);
  const status = STATUS_FROM_AR[statusLabel];
  if (!status) {
    throw new AppError(400, `حالة اعتماد غير صالحة: ${statusLabel}`);
  }

  const hours = parsePositiveHours(row.getCell(cols.get('عدد الساعات')).value, title);
  const date = parseExcelDate(row.getCell(cols.get('تاريخ النشاط')).value);
  const supervisor = readCellText(row.getCell(cols.get('مشرف النشاط')).value);

  return { volunteerId, title, type, hours, date, status, supervisor };
}

function parseActivitiesSheet(worksheet, knownVolunteerIds) {
  const { headerRowNumber, columnIndexByName } = findHeaderRow(worksheet, ACTIVITY_HEADERS);
  const activities = [];

  for (let rowIndex = headerRowNumber + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const parsed = parseActivityRow(
      worksheet.getRow(rowIndex),
      columnIndexByName,
      knownVolunteerIds
    );
    if (parsed) {
      activities.push(parsed);
    }
  }

  return activities;
}

/**
 * Parses the doctor's Excel workbook using the volunteers sheet as source of truth for faculty (fixes E3/E7).
 * @param {string} filePath
 */
export async function parseSeedWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const volunteersSheet = workbook.getWorksheet(VOLUNTEERS_SHEET);
  const activitiesSheet = workbook.getWorksheet(ACTIVITIES_SHEET);
  if (!volunteersSheet || !activitiesSheet) {
    throw new AppError(400, 'ملف الإكسل لا يحتوي على الأوراق المطلوبة');
  }

  const volunteers = parseVolunteersSheet(volunteersSheet);
  const knownVolunteerIds = new Set(volunteers.map((volunteer) => volunteer.volunteerId));
  const activities = parseActivitiesSheet(activitiesSheet, knownVolunteerIds);

  return { volunteers, activities };
}
