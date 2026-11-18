import ExcelJS from 'exceljs';
import type { Types } from 'mongoose';
import { CATEGORY_LABELS } from '../constants/enums.js';
import type { VolunteerCategory } from '../constants/enums.js';
import type { ActivityWithVolunteerLean } from '../models/Activity.js';
import { Activity } from '../models/Activity.js';
import type { VolunteerLean } from '../models/Volunteer.js';
import { Volunteer } from '../models/Volunteer.js';
import type { ParsedActivity, ParsedVolunteer } from '../seed/parseWorkbook.js';
import {
  ACTIVITIES_SHEET,
  ACTIVITY_HEADERS,
  VOLUNTEERS_SHEET,
  VOLUNTEER_HEADERS,
  findHeaderRow,
  parseActivityRow,
  parseVolunteerRow,
  readCellText,
} from '../seed/parseWorkbook.js';
import { AppError } from '../utils/errors.js';

interface VolunteerIdentity {
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  faculty: string;
}

export interface ImportRowError {
  sheet: string;
  rowNumber: number;
  message: string;
}

export interface ImportConflict {
  rowNumber: number;
  volunteerId: string;
  fullName: string;
  activityFaculty?: string;
  volunteerFaculty?: string;
  activityCategory?: string;
  volunteerCategory?: string;
  message: string;
}

export interface ImportDuplicate {
  rowNumber: number;
  type: 'exact' | 'possible';
  volunteerId: string;
  title: string;
  date: string;
  source?: string;
  previousDate?: string;
  message: string;
}

export interface ImportPreview {
  volunteersCount: number;
  activitiesCount: number;
  errors: ImportRowError[];
  conflicts: ImportConflict[];
  duplicates: ImportDuplicate[];
  skippedExactDuplicates: number;
}

export interface ImportSummary {
  volunteersCreated: number;
  volunteersUpdated: number;
  activitiesCreated: number;
  skippedDuplicates: number;
}

export interface ImportPreviewResult {
  committed: false;
  preview: ImportPreview;
}

export interface ImportCommitResult {
  committed: true;
  summary: ImportSummary;
  preview: ImportPreview;
}

export type ImportResult = ImportPreviewResult | ImportCommitResult;

interface DuplicateTrackers {
  exactKeys: Map<string, string>;
  titleKeys: Map<string, string>;
}

interface DuplicateCheck {
  isExact: boolean;
  entry: ImportDuplicate | null;
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ');
}

function toIsoDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function collectVolunteers(worksheet: ExcelJS.Worksheet): {
  parsedVolunteers: ParsedVolunteer[];
  volunteersById: Map<string, ParsedVolunteer>;
  errors: ImportRowError[];
} {
  const { headerRowNumber, columnIndexByName } = findHeaderRow(worksheet, VOLUNTEER_HEADERS);
  const parsedVolunteers: ParsedVolunteer[] = [];
  const volunteersById = new Map<string, ParsedVolunteer>();
  const errors: ImportRowError[] = [];

  for (let rowIndex = headerRowNumber + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    try {
      const volunteer = parseVolunteerRow(row, columnIndexByName);
      if (!volunteer) {
        continue;
      }
      if (volunteersById.has(volunteer.volunteerId)) {
        errors.push({
          sheet: VOLUNTEERS_SHEET,
          rowNumber: rowIndex,
          message: `الرقم التعريفي ${volunteer.volunteerId} مكرر في ورقة بيانات المتطوعين`,
        });
        continue;
      }
      volunteersById.set(volunteer.volunteerId, volunteer);
      parsedVolunteers.push(volunteer);
    } catch (err) {
      if (err instanceof AppError) {
        errors.push({ sheet: VOLUNTEERS_SHEET, rowNumber: rowIndex, message: err.message });
      } else {
        throw err;
      }
    }
  }

  return { parsedVolunteers, volunteersById, errors };
}

function detectRowConflicts(
  row: ExcelJS.Row,
  cols: Map<string, number>,
  rowNumber: number,
  authoritativeVolunteer: VolunteerIdentity
): ImportConflict[] {
  const conflicts: ImportConflict[] = [];
  const rowFaculty = cols.has('الكلية / الجهة')
    ? readCellText(row.getCell(cols.get('الكلية / الجهة')!).value)
    : '';
  const rowCategory = cols.has('الفئة') ? readCellText(row.getCell(cols.get('الفئة')!).value) : '';

  if (rowFaculty && rowFaculty !== authoritativeVolunteer.faculty) {
    conflicts.push({
      rowNumber,
      volunteerId: authoritativeVolunteer.volunteerId,
      fullName: authoritativeVolunteer.fullName,
      activityFaculty: rowFaculty,
      volunteerFaculty: authoritativeVolunteer.faculty,
      message: `تعارض في الكلية للمتطوع ${authoritativeVolunteer.fullName} (${authoritativeVolunteer.volunteerId}): "${rowFaculty}" في سجل الأنشطة مقابل "${authoritativeVolunteer.faculty}" في بيانات المتطوعين`,
    });
  }

  const authoritativeCategoryLabel = CATEGORY_LABELS[authoritativeVolunteer.category];
  if (rowCategory && rowCategory !== authoritativeCategoryLabel) {
    conflicts.push({
      rowNumber,
      volunteerId: authoritativeVolunteer.volunteerId,
      fullName: authoritativeVolunteer.fullName,
      activityCategory: rowCategory,
      volunteerCategory: authoritativeCategoryLabel,
      message: `تعارض في الفئة للمتطوع ${authoritativeVolunteer.fullName} (${authoritativeVolunteer.volunteerId})`,
    });
  }

  return conflicts;
}

function buildDuplicateTrackers(
  existingActivities: ActivityWithVolunteerLean[]
): DuplicateTrackers {
  const exactKeys = new Map<string, string>();
  const titleKeys = new Map<string, string>();

  for (const activity of existingActivities) {
    const volunteerId = activity.volunteer?.volunteerId;
    if (!volunteerId) {
      continue;
    }
    const title = normalizeTitle(activity.title);
    const dateKey = toIsoDateKey(new Date(activity.date));
    exactKeys.set(`${volunteerId}|${title}|${dateKey}`, 'قاعدة البيانات');
    if (!titleKeys.has(`${volunteerId}|${title}`)) {
      titleKeys.set(`${volunteerId}|${title}`, dateKey);
    }
  }

  return { exactKeys, titleKeys };
}

function classifyDuplicate(
  activity: ParsedActivity,
  volunteer: VolunteerIdentity,
  rowNumber: number,
  trackers: DuplicateTrackers
): DuplicateCheck {
  const titleKey = `${activity.volunteerId}|${normalizeTitle(activity.title)}`;
  const dateKey = toIsoDateKey(activity.date);
  const exactKey = `${titleKey}|${dateKey}`;

  if (trackers.exactKeys.has(exactKey)) {
    return {
      isExact: true,
      entry: {
        rowNumber,
        type: 'exact',
        volunteerId: activity.volunteerId,
        title: activity.title,
        date: dateKey,
        source: trackers.exactKeys.get(exactKey),
        message: `نشاط مكرر مطابق (نفس المتطوع والعنوان والتاريخ) في الصف ${rowNumber}`,
      },
    };
  }

  const possibleEntry = trackers.titleKeys.has(titleKey)
    ? {
        rowNumber,
        type: 'possible' as const,
        volunteerId: activity.volunteerId,
        title: activity.title,
        date: dateKey,
        previousDate: trackers.titleKeys.get(titleKey),
        message: `احتمال تكرار نشاط للمتطوع ${volunteer.fullName} (${activity.volunteerId}): "${activity.title}" مسجل بتاريخ ${trackers.titleKeys.get(titleKey)} وبتاريخ ${dateKey}`,
      }
    : null;

  trackers.exactKeys.set(exactKey, `الصف ${rowNumber}`);
  if (!trackers.titleKeys.has(titleKey)) {
    trackers.titleKeys.set(titleKey, dateKey);
  }

  return { isExact: false, entry: possibleEntry };
}

function collectActivities(
  worksheet: ExcelJS.Worksheet,
  authoritativeVolunteers: Map<string, VolunteerIdentity>,
  existingActivities: ActivityWithVolunteerLean[]
): {
  validActivities: ParsedActivity[];
  errors: ImportRowError[];
  conflicts: ImportConflict[];
  duplicates: ImportDuplicate[];
} {
  const { headerRowNumber, columnIndexByName } = findHeaderRow(worksheet, ACTIVITY_HEADERS);
  const knownIds = new Set(authoritativeVolunteers.keys());
  const trackers = buildDuplicateTrackers(existingActivities);

  const validActivities: ParsedActivity[] = [];
  const errors: ImportRowError[] = [];
  const conflicts: ImportConflict[] = [];
  const duplicates: ImportDuplicate[] = [];

  for (let rowIndex = headerRowNumber + 1; rowIndex <= worksheet.rowCount; rowIndex += 1) {
    try {
      const row = worksheet.getRow(rowIndex);
      const activity = parseActivityRow(row, columnIndexByName, knownIds);
      if (!activity) {
        continue;
      }

      const volunteer = authoritativeVolunteers.get(activity.volunteerId)!;
      conflicts.push(...detectRowConflicts(row, columnIndexByName, rowIndex, volunteer));

      const duplicateCheck = classifyDuplicate(activity, volunteer, rowIndex, trackers);
      if (duplicateCheck.entry) {
        duplicates.push(duplicateCheck.entry);
      }
      if (!duplicateCheck.isExact) {
        validActivities.push(activity);
      }
    } catch (err) {
      if (err instanceof AppError) {
        errors.push({ sheet: ACTIVITIES_SHEET, rowNumber: rowIndex, message: err.message });
      } else {
        throw err;
      }
    }
  }

  return { validActivities, errors, conflicts, duplicates };
}

interface PersistImportArgs {
  parsedVolunteers: ParsedVolunteer[];
  validActivities: ParsedActivity[];
  existingVolunteersById: Map<string, VolunteerLean>;
}

interface PersistImportSummary {
  volunteersCreated: number;
  volunteersUpdated: number;
  activitiesCreated: number;
}

async function persistImport({
  parsedVolunteers,
  validActivities,
  existingVolunteersById,
}: PersistImportArgs): Promise<PersistImportSummary> {
  let volunteersCreated = 0;
  let volunteersUpdated = 0;
  const volunteerIdToObjectId = new Map<string, Types.ObjectId>();

  for (const [volunteerId, doc] of existingVolunteersById.entries()) {
    volunteerIdToObjectId.set(volunteerId, doc._id);
  }

  for (const volunteer of parsedVolunteers) {
    const existing = existingVolunteersById.get(volunteer.volunteerId);
    if (!existing) {
      const created = await Volunteer.create(volunteer);
      volunteerIdToObjectId.set(volunteer.volunteerId, created._id);
      volunteersCreated += 1;
      continue;
    }

    const changed =
      existing.fullName !== volunteer.fullName ||
      existing.category !== volunteer.category ||
      existing.faculty !== volunteer.faculty;
    if (changed) {
      await Volunteer.updateOne({ _id: existing._id }, { $set: volunteer });
      volunteersUpdated += 1;
    }
  }

  if (validActivities.length > 0) {
    await Activity.insertMany(
      validActivities.map((activity) => ({
        volunteer: volunteerIdToObjectId.get(activity.volunteerId)!,
        title: activity.title,
        type: activity.type,
        hours: activity.hours,
        date: activity.date,
        status: activity.status,
        supervisor: activity.supervisor,
      }))
    );
  }

  return {
    volunteersCreated,
    volunteersUpdated,
    activitiesCreated: validActivities.length,
  };
}

export async function importExcelWorkbook(
  buffer: Buffer,
  { commit = false }: { commit?: boolean } = {}
): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const volunteersSheet = workbook.getWorksheet(VOLUNTEERS_SHEET);
  const activitiesSheet = workbook.getWorksheet(ACTIVITIES_SHEET);
  if (!volunteersSheet || !activitiesSheet) {
    throw new AppError(400, 'ملف الإكسل لا يحتوي على الأوراق المطلوبة');
  }

  const [existingVolunteers, existingActivities] = await Promise.all([
    Volunteer.find().lean<VolunteerLean[]>(),
    Activity.find().populate('volunteer', 'volunteerId').lean<ActivityWithVolunteerLean[]>(),
  ]);

  const existingVolunteersById = new Map(
    existingVolunteers.map((volunteer) => [volunteer.volunteerId, volunteer])
  );
  const volunteerParse = collectVolunteers(volunteersSheet);
  const authoritativeVolunteers = new Map<string, VolunteerIdentity>([
    ...existingVolunteersById.entries(),
    ...volunteerParse.volunteersById.entries(),
  ]);
  const activityParse = collectActivities(
    activitiesSheet,
    authoritativeVolunteers,
    existingActivities
  );

  const errors = [...volunteerParse.errors, ...activityParse.errors];
  const exactDuplicatesCount = activityParse.duplicates.filter((d) => d.type === 'exact').length;

  const preview: ImportPreview = {
    volunteersCount: volunteerParse.parsedVolunteers.length,
    activitiesCount: activityParse.validActivities.length,
    errors,
    conflicts: activityParse.conflicts,
    duplicates: activityParse.duplicates,
    skippedExactDuplicates: exactDuplicatesCount,
  };

  if (!commit) {
    return { committed: false, preview };
  }

  if (errors.length > 0) {
    throw new AppError(400, 'يحتوي الملف على أخطاء تمنع الاستيراد، يرجى مراجعة تقرير المعاينة', {
      preview,
    });
  }

  const summary = await persistImport({
    parsedVolunteers: volunteerParse.parsedVolunteers,
    validActivities: activityParse.validActivities,
    existingVolunteersById,
  });

  return {
    committed: true,
    summary: { ...summary, skippedDuplicates: exactDuplicatesCount },
    preview,
  };
}
