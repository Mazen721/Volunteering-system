import ExcelJS from 'exceljs';
import type { ActivityStatus, ActivityType, Faculty, VolunteerCategory } from '../constants/enums.js';
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
] as const;

export const ACTIVITY_HEADERS = [
  'الرقم التعريفي',
  'عنوان النشاط التطوعي',
  'نوع النشاط',
  'عدد الساعات',
  'تاريخ النشاط',
  'حالة الاعتماد',
  'مشرف النشاط',
] as const;

export interface ParsedVolunteer {
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  faculty: Faculty;
}

export interface ParsedActivity {
  volunteerId: string;
  title: string;
  type: ActivityType;
  hours: number;
  date: Date;
  status: ActivityStatus;
  supervisor: string;
}

export interface HeaderRow {
  headerRowNumber: number;
  columnIndexByName: Map<string, number>;
}

export function readCellText(rawCell: ExcelJS.CellValue): string {
  if (rawCell === null || rawCell === undefined) {
    return '';
  }
  if (typeof rawCell === 'object' && !(rawCell instanceof Date)) {
    if ('richText' in rawCell && Array.isArray(rawCell.richText)) {
      return rawCell.richText
        .map((part) => part.text)
        .join('')
        .trim();
    }
    if ('result' in rawCell) {
      return readCellText(rawCell.result as ExcelJS.CellValue);
    }
    if ('text' in rawCell) {
      return String(rawCell.text).trim();
    }
  }
  return String(rawCell).trim();
}

export function findHeaderRow(
  worksheet: ExcelJS.Worksheet,
  requiredHeaders: readonly string[]
): HeaderRow {
  const maxHeaderScanRows = Math.min(worksheet.rowCount, 10);

  for (let rowIndex = 1; rowIndex <= maxHeaderScanRows; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    const columnIndexByName = new Map<string, number>();

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

export function parseVolunteerRow(
  row: ExcelJS.Row,
  cols: Map<string, number>
): ParsedVolunteer | null {
  const volunteerId = readCellText(row.getCell(cols.get('الرقم التعريفي (ID)')!).value);
  const fullName = readCellText(row.getCell(cols.get('الاسم الرباعي')!).value);
  const categoryLabel = readCellText(row.getCell(cols.get('الفئة')!).value);
  const faculty = readCellText(row.getCell(cols.get('الكلية / الجهة')!).value);

  if (!volunteerId && !fullName) {
    return null;
  }

  const category = CATEGORY_FROM_AR[categoryLabel];
  if (!category) {
    throw new AppError(400, `فئة متطوع غير صالحة: ${categoryLabel}`);
  }
  if (!(FACULTIES as readonly string[]).includes(faculty)) {
    throw new AppError(400, `كلية غير صالحة في بيانات المتطوعين: ${faculty}`);
  }

  return { volunteerId, fullName, category, faculty: faculty as Faculty };
}

function parseVolunteersSheet(worksheet: ExcelJS.Worksheet): ParsedVolunteer[] {
  const { headerRowNumber, columnIndexByName } = findHeaderRow(worksheet, VOLUNTEER_HEADERS);
  const volunteers: ParsedVolunteer[] = [];

  for (let rowIndex = headerRowNumber + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const parsed = parseVolunteerRow(worksheet.getRow(rowIndex), columnIndexByName);
    if (parsed) {
      volunteers.push(parsed);
    }
  }

  return volunteers;
}

function parsePositiveHours(rawCellValue: ExcelJS.CellValue, title: string): number {
  const numericValue =
    typeof rawCellValue === 'object' && rawCellValue !== null && 'result' in rawCellValue
      ? rawCellValue.result
      : rawCellValue;
  const hours = Number(numericValue);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new AppError(400, `عدد ساعات غير صالح للنشاط "${title}"`);
  }
  return hours;
}

export function parseActivityRow(
  row: ExcelJS.Row,
  cols: Map<string, number>,
  knownVolunteerIds: ReadonlySet<string>
): ParsedActivity | null {
  const volunteerId = readCellText(row.getCell(cols.get('الرقم التعريفي')!).value);
  const title = readCellText(row.getCell(cols.get('عنوان النشاط التطوعي')!).value);
  if (!volunteerId && !title) {
    return null;
  }
  if (!knownVolunteerIds.has(volunteerId)) {
    throw new AppError(400, `المتطوع رقم ${volunteerId} غير موجود في ورقة بيانات المتطوعين`);
  }

  const type = readCellText(row.getCell(cols.get('نوع النشاط')!).value);
  if (!(ACTIVITY_TYPES as readonly string[]).includes(type)) {
    throw new AppError(400, `نوع نشاط غير صالح: ${type}`);
  }

  const statusLabel = readCellText(row.getCell(cols.get('حالة الاعتماد')!).value);
  const status = STATUS_FROM_AR[statusLabel];
  if (!status) {
    throw new AppError(400, `حالة اعتماد غير صالحة: ${statusLabel}`);
  }

  const hours = parsePositiveHours(row.getCell(cols.get('عدد الساعات')!).value, title);
  const date = parseExcelDate(row.getCell(cols.get('تاريخ النشاط')!).value as Date | number | string);
  const supervisor = readCellText(row.getCell(cols.get('مشرف النشاط')!).value);

  return { volunteerId, title, type: type as ActivityType, hours, date, status, supervisor };
}

function parseActivitiesSheet(
  worksheet: ExcelJS.Worksheet,
  knownVolunteerIds: ReadonlySet<string>
): ParsedActivity[] {
  const { headerRowNumber, columnIndexByName } = findHeaderRow(worksheet, ACTIVITY_HEADERS);
  const activities: ParsedActivity[] = [];

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
 */
export async function parseSeedWorkbook(
  filePath: string
): Promise<{ volunteers: ParsedVolunteer[]; activities: ParsedActivity[] }> {
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
