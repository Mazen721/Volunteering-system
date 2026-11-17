import ExcelJS from 'exceljs';
import { CATEGORY_LABELS, STATUS_LABELS } from '../constants/enums.js';
import type { ScopeFilter } from '../middleware/auth.js';
import { Activity } from '../models/Activity.js';
import type { ActivityWithVolunteerLean } from '../models/Activity.js';
import { getCertificateHours } from '../utils/volunteerLookup.js';
import { scopeActivities } from './activity.service.js';
import type { CategoryStatsResponse, FacultyStatsResponse } from './stats.service.js';
import { getCategoryStats, getFacultyStats } from './stats.service.js';
import type { VolunteerWithLabel } from './volunteer.service.js';
import { listAllVolunteersWithStats } from './volunteer.service.js';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F4E79' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
}

function addFacultySummaryTable(sheet: ExcelJS.Worksheet, facultyStats: FacultyStatsResponse): void {
  const facultyHeader = sheet.addRow([
    'الكلية / الجهة',
    'عدد المتطوعين',
    'عدد الأنشطة',
    'إجمالي الساعات المعتمدة',
    'متوسط الساعات لكل متطوع',
  ]);
  styleHeaderRow(facultyHeader);

  for (const row of facultyStats.faculties) {
    sheet.addRow([
      row.faculty,
      row.volunteerCount,
      row.approvedActivities,
      row.approvedHours,
      row.avgHours,
    ]);
  }
  sheet.addRow([
    'إجمالي الكليات',
    facultyStats.totals.volunteerCount,
    facultyStats.totals.approvedActivities,
    facultyStats.totals.approvedHours,
    facultyStats.totals.avgHours,
  ]);
}

function addCategorySummaryTable(
  sheet: ExcelJS.Worksheet,
  categoryStats: CategoryStatsResponse
): void {
  sheet.addRow(['ملخص الإحصائيات حسب الفئة']);
  const categoryHeader = sheet.addRow([
    'الفئة',
    'عدد المتطوعين',
    'إجمالي الساعات المعتمدة',
    'متوسط الساعات',
  ]);
  styleHeaderRow(categoryHeader);

  for (const row of categoryStats.categories) {
    sheet.addRow([row.label, row.volunteerCount, row.approvedHours, row.avgHours]);
  }
  sheet.addRow([
    'الإجمالي العام للفئات',
    categoryStats.totals.volunteerCount,
    categoryStats.totals.approvedHours,
    categoryStats.totals.avgHours,
  ]);
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  facultyStats: FacultyStatsResponse,
  categoryStats: CategoryStatsResponse
): void {
  const sheet = workbook.addWorksheet('لوحة التحكم والتقارير', {
    views: [{ rightToLeft: true }],
  });

  sheet.addRow(['جامعة المنصورة الأهلية - مركز المسؤولية المجتمعية']);
  sheet.addRow(['ملخص إحصائيات العمل التطوعي']);
  sheet.addRow([]);

  addFacultySummaryTable(sheet, facultyStats);
  sheet.addRow([]);
  addCategorySummaryTable(sheet, categoryStats);

  sheet.columns = [{ width: 32 }, { width: 18 }, { width: 18 }, { width: 24 }, { width: 26 }];
}

function addVolunteersSheet(
  workbook: ExcelJS.Workbook,
  volunteers: VolunteerWithLabel[],
  certificateHours: number
): void {
  const sheet = workbook.addWorksheet('بيانات المتطوعين', {
    views: [{ rightToLeft: true }],
  });

  sheet.addRow(['سجل بيانات المتطوعين وملخص الإنجاز والشهادات']);
  sheet.addRow([]);

  const headerRow = sheet.addRow([
    'م',
    'الرقم التعريفي (ID)',
    'الاسم الرباعي',
    'الفئة',
    'الكلية / الجهة',
    'إجمالي عدد الأنشطة',
    'إجمالي الساعات المعتمدة',
    `الساعات المتبقية للشهادة (${certificateHours} ساعة)`,
    'حالة الشهادة',
  ]);
  styleHeaderRow(headerRow);

  volunteers.forEach((volunteer, index) => {
    const statusText = volunteer.eligible
      ? 'مؤهل لإصدار الشهادة 🎓'
      : `متبقي ${volunteer.remainingHours} ساعة`;
    sheet.addRow([
      index + 1,
      volunteer.volunteerId,
      volunteer.fullName,
      CATEGORY_LABELS[volunteer.category],
      volunteer.faculty,
      volunteer.totalActivities,
      volunteer.approvedHours,
      volunteer.remainingHours,
      statusText,
    ]);
  });

  sheet.columns = [
    { width: 6 },
    { width: 18 },
    { width: 26 },
    { width: 22 },
    { width: 30 },
    { width: 18 },
    { width: 22 },
    { width: 28 },
    { width: 24 },
  ];
}

function addActivitiesSheet(
  workbook: ExcelJS.Workbook,
  activities: ActivityWithVolunteerLean[]
): void {
  const sheet = workbook.addWorksheet('سجل الأنشطة والساعات', {
    views: [{ rightToLeft: true }],
  });

  sheet.addRow(['سجل الأنشطة والفعاليات التطوعية التفصيلي']);
  sheet.addRow([]);

  const headerRow = sheet.addRow([
    'م',
    'الرقم التعريفي',
    'اسم المتطوع',
    'الفئة',
    'الكلية / الجهة',
    'عنوان النشاط التطوعي',
    'نوع النشاط',
    'عدد الساعات',
    'تاريخ النشاط',
    'حالة الاعتماد',
    'مشرف النشاط',
  ]);
  styleHeaderRow(headerRow);

  activities.forEach((activity, index) => {
    const volunteer = activity.volunteer;
    sheet.addRow([
      index + 1,
      volunteer.volunteerId,
      volunteer.fullName,
      CATEGORY_LABELS[volunteer.category],
      volunteer.faculty,
      activity.title,
      activity.type,
      activity.hours,
      new Date(activity.date).toISOString().slice(0, 10),
      STATUS_LABELS[activity.status],
      activity.supervisor,
    ]);
  });

  sheet.columns = [
    { width: 6 },
    { width: 16 },
    { width: 24 },
    { width: 22 },
    { width: 28 },
    { width: 36 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 24 },
  ];
}

export async function exportWorkbookBuffer(scope: ScopeFilter = {}): Promise<ExcelJS.Buffer> {
  const activityScopeFilter = await scopeActivities(scope);
  const [facultyStats, categoryStats, volunteers, activities, certificateHours] = await Promise.all(
    [
      getFacultyStats(scope),
      getCategoryStats(scope),
      listAllVolunteersWithStats(scope),
      Activity.find(activityScopeFilter)
        .populate('volunteer')
        .sort({ date: 1, createdAt: 1 })
        .lean<ActivityWithVolunteerLean[]>(),
      getCertificateHours(),
    ]
  );

  const workbook = new ExcelJS.Workbook();
  addSummarySheet(workbook, facultyStats, categoryStats);
  addVolunteersSheet(workbook, volunteers, certificateHours);
  addActivitiesSheet(workbook, activities);

  return workbook.xlsx.writeBuffer();
}
