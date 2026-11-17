import type { PipelineStage } from 'mongoose';
import type { ActivityStatus, Faculty, VolunteerCategory } from '../constants/enums.js';
import { CATEGORIES, CATEGORY_LABELS, FACULTIES } from '../constants/enums.js';
import type { ScopeFilter } from '../middleware/auth.js';
import { Activity } from '../models/Activity.js';
import type { VolunteerFilter } from '../models/Volunteer.js';
import { Volunteer } from '../models/Volunteer.js';
import { AppError } from '../utils/errors.js';
import { getCertificateHours } from '../utils/volunteerLookup.js';
import { scopeActivities } from './activity.service.js';

export interface VolunteerStatsRow {
  _id: import('mongoose').Types.ObjectId;
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  faculty: string;
  totalActivities: number;
  approvedActivities: number;
  approvedHours: number;
  remainingHours: number;
  eligible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMetrics {
  volunteerCount: number;
  totalActivities: number;
  approvedActivities: number;
  approvedHours: number;
}

export interface GroupTotals extends GroupMetrics {
  avgHours: number;
}

export interface FacultyStatsRow extends GroupMetrics {
  faculty: string;
  avgHours: number;
  percentage: number;
}

export interface CategoryStatsRow extends GroupMetrics {
  category: VolunteerCategory;
  label: string;
  avgHours: number;
}

export interface LeaderboardRow extends VolunteerStatsRow {
  categoryLabel: string;
}

export function roundMetric(numberValue: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(numberValue * factor) / factor;
}

export function computeEligibility(
  approvedHours: number,
  certificateHours: number
): { approvedHours: number; remainingHours: number; eligible: boolean } {
  return {
    approvedHours,
    remainingHours: Math.max(0, certificateHours - approvedHours),
    eligible: approvedHours >= certificateHours,
  };
}

export function buildVolunteerStatsStages(
  matchStage: VolunteerFilter,
  certificateHours: number,
  activityStatus?: ActivityStatus
): PipelineStage[] {
  const stages: PipelineStage[] = [];
  if (matchStage && Object.keys(matchStage).length > 0) {
    stages.push({ $match: matchStage });
  }

  stages.push({
    $lookup: {
      from: 'activities',
      localField: '_id',
      foreignField: 'volunteer',
      as: 'activities',
    },
  });

  if (activityStatus) {
    stages.push({ $match: { 'activities.status': activityStatus } });
  }

  stages.push(
    {
      $addFields: {
        totalActivities: { $size: '$activities' },
        approvedActivitiesList: {
          $filter: {
            input: '$activities',
            as: 'act',
            cond: { $eq: ['$$act.status', 'approved'] },
          },
        },
      },
    },
    {
      $addFields: {
        approvedActivities: { $size: '$approvedActivitiesList' },
        approvedHours: { $sum: '$approvedActivitiesList.hours' },
      },
    },
    {
      $addFields: {
        remainingHours: { $max: [0, { $subtract: [certificateHours, '$approvedHours'] }] },
        eligible: { $gte: ['$approvedHours', certificateHours] },
      },
    },
    { $project: { activities: 0, approvedActivitiesList: 0, __v: 0 } }
  );

  return stages;
}

interface VolunteerGroupRow {
  _id: string;
  volunteerCount: number;
}

interface ActivityGroupRow {
  _id: string;
  totalActivities: number;
  approvedActivities: number;
  approvedHours: number;
}

async function aggregateGroupedStats(
  groupField: 'faculty' | 'category',
  scope: ScopeFilter = {}
): Promise<Map<string, GroupMetrics>> {
  const volunteerPipeline: PipelineStage[] = [];
  if (scope.faculty) {
    volunteerPipeline.push({ $match: { faculty: scope.faculty } });
  }
  volunteerPipeline.push({ $group: { _id: `$${groupField}`, volunteerCount: { $sum: 1 } } });

  const activityPipeline: PipelineStage[] = [
    {
      $lookup: {
        from: 'volunteers',
        localField: 'volunteer',
        foreignField: '_id',
        as: 'volunteerDoc',
      },
    },
    { $unwind: '$volunteerDoc' },
  ];
  if (scope.faculty) {
    activityPipeline.push({ $match: { 'volunteerDoc.faculty': scope.faculty } });
  }
  activityPipeline.push({
    $group: {
      _id: `$volunteerDoc.${groupField}`,
      totalActivities: { $sum: 1 },
      approvedActivities: {
        $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] },
      },
      approvedHours: {
        $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$hours', 0] },
      },
    },
  });

  const [volunteerGroups, activityGroups] = await Promise.all([
    Volunteer.aggregate<VolunteerGroupRow>(volunteerPipeline),
    Activity.aggregate<ActivityGroupRow>(activityPipeline),
  ]);

  const statsByKey = new Map<string, GroupMetrics>();
  for (const row of volunteerGroups) {
    statsByKey.set(row._id, {
      volunteerCount: row.volunteerCount,
      totalActivities: 0,
      approvedActivities: 0,
      approvedHours: 0,
    });
  }
  for (const row of activityGroups) {
    const existing = statsByKey.get(row._id) || {
      volunteerCount: 0,
      totalActivities: 0,
      approvedActivities: 0,
      approvedHours: 0,
    };
    statsByKey.set(row._id, {
      ...existing,
      totalActivities: row.totalActivities,
      approvedActivities: row.approvedActivities,
      approvedHours: row.approvedHours,
    });
  }

  return statsByKey;
}

function summarizeGroupRows(rows: GroupMetrics[]): GroupTotals {
  const totals = rows.reduce<GroupMetrics>(
    (acc, row) => ({
      volunteerCount: acc.volunteerCount + row.volunteerCount,
      totalActivities: acc.totalActivities + row.totalActivities,
      approvedActivities: acc.approvedActivities + row.approvedActivities,
      approvedHours: acc.approvedHours + row.approvedHours,
    }),
    { volunteerCount: 0, totalActivities: 0, approvedActivities: 0, approvedHours: 0 }
  );

  return {
    ...totals,
    avgHours:
      totals.volunteerCount > 0 ? roundMetric(totals.approvedHours / totals.volunteerCount) : 0,
  };
}

export interface OverviewStats {
  totalApprovedHours: number;
  totalActivities: number;
  approvedActivities: number;
  registeredVolunteers: number;
  activeVolunteers: number;
  eligibleVolunteers: number;
  activeFaculties: number;
  avgHoursPerRegistered: number;
  avgHoursPerActive: number;
  certificateHours: number;
}

export async function getOverviewStats(scope: ScopeFilter = {}): Promise<OverviewStats> {
  const [certificateHours, activityScopeFilter] = await Promise.all([
    getCertificateHours(),
    scopeActivities(scope),
  ]);
  const volunteerFilter: VolunteerFilter = scope.faculty ? { faculty: scope.faculty } : {};
  const activityMatchStages: PipelineStage[] = scope.faculty
    ? [{ $match: activityScopeFilter }]
    : [];

  const [registeredVolunteers, distinctFaculties, activitySummary, volunteerEligibility] =
    await Promise.all([
      Volunteer.countDocuments(volunteerFilter),
      Volunteer.distinct('faculty', volunteerFilter),
      Activity.aggregate<{
        _id: null;
        totalActivities: number;
        approvedActivities: number;
        totalApprovedHours: number;
      }>([
        ...activityMatchStages,
        {
          $group: {
            _id: null,
            totalActivities: { $sum: 1 },
            approvedActivities: {
              $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] },
            },
            totalApprovedHours: {
              $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$hours', 0] },
            },
          },
        },
      ]),
      Activity.aggregate<{
        _id: null;
        activeVolunteers: number;
        eligibleVolunteers: number;
      }>([
        { $match: { status: 'approved', ...activityScopeFilter } },
        { $group: { _id: '$volunteer', approvedHours: { $sum: '$hours' } } },
        {
          $group: {
            _id: null,
            activeVolunteers: { $sum: 1 },
            eligibleVolunteers: {
              $sum: { $cond: [{ $gte: ['$approvedHours', certificateHours] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

  const activityTotals = activitySummary[0] || {
    totalActivities: 0,
    approvedActivities: 0,
    totalApprovedHours: 0,
  };
  const eligibilityTotals = volunteerEligibility[0] || {
    activeVolunteers: 0,
    eligibleVolunteers: 0,
  };

  return {
    totalApprovedHours: activityTotals.totalApprovedHours,
    totalActivities: activityTotals.totalActivities,
    approvedActivities: activityTotals.approvedActivities,
    registeredVolunteers,
    activeVolunteers: eligibilityTotals.activeVolunteers,
    eligibleVolunteers: eligibilityTotals.eligibleVolunteers,
    activeFaculties: distinctFaculties.length,
    avgHoursPerRegistered:
      registeredVolunteers > 0
        ? roundMetric(activityTotals.totalApprovedHours / registeredVolunteers)
        : 0,
    avgHoursPerActive:
      eligibilityTotals.activeVolunteers > 0
        ? roundMetric(activityTotals.totalApprovedHours / eligibilityTotals.activeVolunteers)
        : 0,
    certificateHours,
  };
}

export interface FacultyStatsResponse {
  faculties: FacultyStatsRow[];
  totals: GroupTotals;
}

export async function getFacultyStats(scope: ScopeFilter = {}): Promise<FacultyStatsResponse> {
  const statsByFaculty = await aggregateGroupedStats('faculty', scope);
  const targetFaculties: readonly Faculty[] = scope.faculty ? [scope.faculty] : FACULTIES;
  const rawRows = targetFaculties.map((faculty) => {
    const metrics = statsByFaculty.get(faculty) || {
      volunteerCount: 0,
      totalActivities: 0,
      approvedActivities: 0,
      approvedHours: 0,
    };
    return {
      faculty,
      ...metrics,
      avgHours:
        metrics.volunteerCount > 0
          ? roundMetric(metrics.approvedHours / metrics.volunteerCount)
          : 0,
    };
  });

  const totals = summarizeGroupRows(rawRows);
  const faculties = rawRows
    .map((row) => ({
      ...row,
      percentage:
        totals.approvedHours > 0
          ? roundMetric((row.approvedHours / totals.approvedHours) * 100, 1)
          : 0,
    }))
    .sort((left, right) => right.approvedHours - left.approvedHours);

  return { faculties, totals };
}

export interface CategoryStatsResponse {
  categories: CategoryStatsRow[];
  totals: GroupTotals;
}

export async function getCategoryStats(scope: ScopeFilter = {}): Promise<CategoryStatsResponse> {
  const statsByCategory = await aggregateGroupedStats('category', scope);
  const categories = CATEGORIES.map((category) => {
    const metrics = statsByCategory.get(category) || {
      volunteerCount: 0,
      totalActivities: 0,
      approvedActivities: 0,
      approvedHours: 0,
    };
    return {
      category,
      label: CATEGORY_LABELS[category],
      ...metrics,
      avgHours:
        metrics.volunteerCount > 0
          ? roundMetric(metrics.approvedHours / metrics.volunteerCount)
          : 0,
    };
  });

  const totals = summarizeGroupRows(categories);
  return { categories, totals };
}

export interface LeaderboardOptions {
  category?: string;
  limit?: string | number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardRow[];
  certificateHours: number;
}

export async function getLeaderboard(
  { category, limit = 5 }: LeaderboardOptions = {},
  scope: ScopeFilter = {}
): Promise<LeaderboardResponse> {
  if (category && !(CATEGORIES as readonly string[]).includes(category)) {
    throw new AppError(400, 'فئة المتطوع غير صالحة');
  }

  const parsedLimit = Math.min(Math.max(Number(limit) || 5, 1), 50);
  const certificateHours = await getCertificateHours();
  const matchStage: VolunteerFilter = {
    ...(category ? { category: category as VolunteerCategory } : {}),
    ...(scope.faculty ? { faculty: scope.faculty } : {}),
  };

  const rows = await Volunteer.aggregate<VolunteerStatsRow>([
    ...buildVolunteerStatsStages(matchStage, certificateHours),
    { $sort: { approvedHours: -1, approvedActivities: -1, volunteerId: 1 } },
    { $limit: parsedLimit },
  ]);

  const leaderboard = rows.map((row) => ({
    ...row,
    categoryLabel: CATEGORY_LABELS[row.category],
  }));

  return { leaderboard, certificateHours };
}
