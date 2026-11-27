import mongoose from 'mongoose';
import type { PipelineStage } from 'mongoose';
import type {
  ActivityStatus,
  Faculty,
  OpportunityPhase,
  OpportunityStatus,
  VolunteerCategory,
} from '../constants/enums.js';
import { CATEGORIES, CATEGORY_LABELS, FACULTIES } from '../constants/enums.js';
import type { ScopeFilter } from '../middleware/auth.js';
import { Activity } from '../models/Activity.js';
import type { ActivityLean } from '../models/Activity.js';
import { Application } from '../models/Application.js';
import { Opportunity } from '../models/Opportunity.js';
import type { OpportunityLean } from '../models/Opportunity.js';
import { User } from '../models/User.js';
import type { VolunteerFilter, VolunteerLean } from '../models/Volunteer.js';
import { Volunteer } from '../models/Volunteer.js';
import {
  CAIRO_TIME_ZONE,
  cairoLocalToUtc,
  evaluateOpportunityPhase,
  getCairoDateTimeParts,
} from '../utils/cairoTime.js';
import { AppError } from '../utils/errors.js';
import { getCertificateHours } from '../utils/volunteerLookup.js';
import { scopeActivities } from './activity.service.js';
import type {
  ApplicationWithOpportunityLean,
  StudentApplicationDTO,
} from './application.service.js';
import { ACTIVE_APPLICATION_STATUSES, findStudentVolunteer } from './application.service.js';
import type { OpportunityDTO } from './opportunity.service.js';
import {
  applyCoverPathsToListDtos,
  buildManageScopeFilter,
  decorateOpportunity,
} from './opportunity.service.js';
import type { PublicUser } from './auth.service.js';

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
  activeVolunteers: number;
  participationRate: number;
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

export interface VolunteerActivityTotals {
  totalActivities: number;
  approvedActivities: number;
  approvedHours: number;
  /** Activities whose status equals the requested filter status (0 when none was requested). */
  matchingStatusCount: number;
}

export const EMPTY_VOLUNTEER_TOTALS: VolunteerActivityTotals = {
  totalActivities: 0,
  approvedActivities: 0,
  approvedHours: 0,
  matchingStatusCount: 0,
};

/**
 * Group-first per-volunteer activity totals: ONE aggregation over Activities
 * grouped by volunteer (served by the {status, volunteer} / {volunteer, …}
 * indexes), instead of the old pipeline that $lookup-joined the entire
 * Activities collection onto every volunteer and matched/sorted on computed
 * fields. `activityMatch` narrows which activities count (e.g. a report
 * period's opportunity set); `activityStatus` only feeds matchingStatusCount,
 * which callers use to keep volunteers having at least one such activity.
 */
export async function aggregateVolunteerActivityTotals(
  volunteerIds: mongoose.Types.ObjectId[],
  options: {
    activityMatch?: Record<string, unknown>;
    activityStatus?: ActivityStatus;
  } = {}
): Promise<Map<string, VolunteerActivityTotals>> {
  const totals = new Map<string, VolunteerActivityTotals>();
  if (volunteerIds.length === 0) {
    return totals;
  }

  const rows = await Activity.aggregate<{
    _id: mongoose.Types.ObjectId;
    totalActivities: number;
    approvedActivities: number;
    approvedHours: number;
    matchingStatusCount: number;
  }>([
    { $match: { volunteer: { $in: volunteerIds }, ...(options.activityMatch ?? {}) } },
    {
      $group: {
        _id: '$volunteer',
        totalActivities: { $sum: 1 },
        approvedActivities: {
          $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] },
        },
        approvedHours: {
          $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$hours', 0] },
        },
        matchingStatusCount: {
          $sum: {
            $cond: [{ $eq: ['$status', options.activityStatus ?? '__no_status__'] }, 1, 0],
          },
        },
      },
    },
  ]);

  for (const row of rows) {
    totals.set(row._id.toString(), {
      totalActivities: row.totalActivities,
      approvedActivities: row.approvedActivities,
      approvedHours: row.approvedHours,
      matchingStatusCount: row.matchingStatusCount,
    });
  }
  return totals;
}

/** Assembles one stats row from a volunteer document and its activity totals. */
export function toVolunteerStatsRow(
  volunteer: VolunteerLean & { __v?: number },
  totals: VolunteerActivityTotals,
  certificateHours: number
): VolunteerStatsRow {
  const { __v: _versionKey, ...volunteerFields } = volunteer;
  void _versionKey;
  const { remainingHours, eligible } = computeEligibility(totals.approvedHours, certificateHours);
  return {
    ...volunteerFields,
    totalActivities: totals.totalActivities,
    approvedActivities: totals.approvedActivities,
    approvedHours: totals.approvedHours,
    remainingHours,
    eligible,
  };
}

/**
 * Stats rows for every volunteer matching `matchStage`, computed group-first
 * (see aggregateVolunteerActivityTotals). Output is identical to the retired
 * $lookup pipeline: volunteers with no activities appear with zeroed totals,
 * and when `activityStatus` is given only volunteers having at least one
 * activity in that status are kept (their totals still count ALL statuses).
 */
export async function computeVolunteerStatsRows(
  matchStage: VolunteerFilter,
  certificateHours: number,
  activityStatus?: ActivityStatus
): Promise<VolunteerStatsRow[]> {
  const volunteers = await Volunteer.find(matchStage).lean<VolunteerLean[]>();
  if (volunteers.length === 0) {
    return [];
  }
  const totals = await aggregateVolunteerActivityTotals(
    volunteers.map((volunteer) => volunteer._id),
    { activityStatus }
  );

  const rows: VolunteerStatsRow[] = [];
  for (const volunteer of volunteers) {
    const volunteerTotals = totals.get(volunteer._id.toString()) ?? EMPTY_VOLUNTEER_TOTALS;
    if (activityStatus && volunteerTotals.matchingStatusCount === 0) {
      continue;
    }
    rows.push(toVolunteerStatsRow(volunteer, volunteerTotals, certificateHours));
  }
  return rows;
}

interface ActivityByVolunteerRow {
  _id: mongoose.Types.ObjectId;
  totalActivities: number;
  approvedActivities: number;
  approvedHours: number;
}

/**
 * In-flight deduplication for the staff statistics getters: concurrent
 * identical computations share one promise instead of running the same
 * aggregations in parallel. Nothing is cached once a computation settles —
 * the entry is removed in `finally`, so results are never stale and a
 * rejected computation never stays stuck for the next caller.
 */
const statsInFlight = new Map<string, Promise<unknown>>();

function dedupStats<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = statsInFlight.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }
  const promise = run().finally(() => {
    statsInFlight.delete(key);
  });
  statsInFlight.set(key, promise);
  return promise;
}

function statsScopeKey(name: string, scope: ScopeFilter): string {
  return `${name}:${scope.faculty ?? 'all'}`;
}

async function aggregateGroupedStats(
  groupField: 'faculty' | 'category',
  scope: ScopeFilter = {}
): Promise<Map<string, GroupMetrics>> {
  const volunteerFilter: Record<string, unknown> = {};
  if (scope.faculty) {
    volunteerFilter.faculty = scope.faculty;
  }

  // Group activities by volunteer inside MongoDB (one indexed pass, no
  // $lookup join over the whole activities collection), then roll the
  // per-volunteer totals up to faculty/category in memory through a
  // volunteer -> group map. Results are identical to the previous
  // join-then-group pipeline: activities whose volunteer is out of scope
  // (or deleted) are excluded, exactly as $unwind dropped them. When the
  // caller is faculty-scoped the aggregation is $matched to that faculty's
  // volunteers up front instead of grouping the whole university and
  // discarding rows in JS.
  const volunteers = await Volunteer.find(volunteerFilter)
    .select(groupField)
    .lean<{ _id: mongoose.Types.ObjectId; faculty?: string; category?: string }[]>();
  const activityRows = await Activity.aggregate<ActivityByVolunteerRow>([
    ...(scope.faculty
      ? [{ $match: { volunteer: { $in: volunteers.map((volunteer) => volunteer._id) } } }]
      : []),
    {
      $group: {
        _id: '$volunteer',
        totalActivities: { $sum: 1 },
        approvedActivities: {
          $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] },
        },
        approvedHours: {
          $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$hours', 0] },
        },
      },
    },
  ]);

  const groupByVolunteerId = new Map<string, string>();
  const statsByKey = new Map<string, GroupMetrics>();
  for (const volunteer of volunteers) {
    const key = volunteer[groupField] as string;
    groupByVolunteerId.set(String(volunteer._id), key);
    const existing = statsByKey.get(key);
    if (existing) {
      existing.volunteerCount += 1;
    } else {
      statsByKey.set(key, {
        volunteerCount: 1,
        totalActivities: 0,
        approvedActivities: 0,
        approvedHours: 0,
      });
    }
  }
  for (const row of activityRows) {
    const key = groupByVolunteerId.get(String(row._id));
    if (key === undefined) {
      continue;
    }
    const existing = statsByKey.get(key);
    if (!existing) {
      continue;
    }
    existing.totalActivities += row.totalActivities;
    existing.approvedActivities += row.approvedActivities;
    existing.approvedHours += row.approvedHours;
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

export interface CertificateBuckets {
  eligible: number;
  nearEligible: number;
  inProgress: number;
  zeroHours: number;
}

export interface ZeroHourVolunteerRow {
  _id: mongoose.Types.ObjectId;
  volunteerId: string;
  fullName: string;
  category: VolunteerCategory;
  faculty: Faculty;
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
  eventsThisMonth: number;
  pendingRegistrations: number;
  pendingApplications: number;
  certificateBuckets: CertificateBuckets;
  zeroHourVolunteers: ZeroHourVolunteerRow[];
}

function getCurrentCairoMonthRange(now: Date = new Date()): { startUtc: Date; endUtc: Date } {
  const { year, month } = getCairoDateTimeParts(now);
  const startUtc = cairoLocalToUtc({ year, month, day: 1, hour: 0, minute: 0, second: 0 });
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endUtc = cairoLocalToUtc({
    year: nextYear,
    month: nextMonth,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
  });
  return { startUtc, endUtc };
}

interface BucketAggregationRow {
  _id: null;
  activeVolunteers: number;
  eligible: number;
  nearEligible: number;
  inProgress: number;
}

async function aggregateVolunteerHourBuckets(
  activityScopeFilter: Record<string, unknown>,
  certificateHours: number
): Promise<BucketAggregationRow> {
  const nearThreshold = (certificateHours * 2) / 3;
  const rows = await Activity.aggregate<BucketAggregationRow>([
    { $match: { status: 'approved', ...activityScopeFilter } },
    { $group: { _id: '$volunteer', approvedHours: { $sum: '$hours' } } },
    {
      $group: {
        _id: null,
        activeVolunteers: { $sum: 1 },
        eligible: {
          $sum: { $cond: [{ $gte: ['$approvedHours', certificateHours] }, 1, 0] },
        },
        nearEligible: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ['$approvedHours', nearThreshold] },
                  { $lt: ['$approvedHours', certificateHours] },
                ],
              },
              1,
              0,
            ],
          },
        },
        inProgress: {
          $sum: { $cond: [{ $lt: ['$approvedHours', nearThreshold] }, 1, 0] },
        },
      },
    },
  ]);

  return (
    rows[0] ?? {
      _id: null,
      activeVolunteers: 0,
      eligible: 0,
      nearEligible: 0,
      inProgress: 0,
    }
  );
}

async function fetchZeroHourVolunteers(
  volunteerFilter: VolunteerFilter,
  limit = 20
): Promise<ZeroHourVolunteerRow[]> {
  // Volunteers with no approved activity, without a $lookup subquery per
  // volunteer (that cost ~380ms at 5k volunteers): collect the ids of
  // volunteers who DO have an approved activity in one indexed group pass,
  // then exclude them. Same set, same sort, same limit, same fields. When
  // the caller is faculty-scoped, the group pass is restricted to that
  // faculty's volunteers instead of grouping the whole university.
  let scopedVolunteerIds: mongoose.Types.ObjectId[] | null = null;
  if (volunteerFilter.faculty) {
    const scopedVolunteers = await Volunteer.find({ faculty: volunteerFilter.faculty })
      .select('_id')
      .lean<{ _id: mongoose.Types.ObjectId }[]>();
    scopedVolunteerIds = scopedVolunteers.map((volunteer) => volunteer._id);
  }
  const activeRows = await Activity.aggregate<{ _id: mongoose.Types.ObjectId }>([
    {
      $match: {
        status: 'approved',
        ...(scopedVolunteerIds ? { volunteer: { $in: scopedVolunteerIds } } : {}),
      },
    },
    { $group: { _id: '$volunteer' } },
  ]);
  const activeIds = activeRows.map((row) => row._id);

  return Volunteer.find({ ...volunteerFilter, _id: { $nin: activeIds } })
    .sort({ createdAt: -1, volunteerId: 1 })
    .limit(limit)
    .select({ volunteerId: 1, fullName: 1, category: 1, faculty: 1 })
    .lean<ZeroHourVolunteerRow[]>()
    .exec();
}

interface ActivityOverviewTotals {
  _id: null;
  totalActivities: number;
  approvedActivities: number;
  totalApprovedHours: number;
}

async function aggregateActivityOverviewTotals(
  activityMatchStages: PipelineStage[]
): Promise<ActivityOverviewTotals> {
  const rows = await Activity.aggregate<ActivityOverviewTotals>([
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
  ]);

  return (
    rows[0] ?? {
      _id: null,
      totalActivities: 0,
      approvedActivities: 0,
      totalApprovedHours: 0,
    }
  );
}

export async function getOverviewStats(scope: ScopeFilter = {}): Promise<OverviewStats> {
  return dedupStats(statsScopeKey('overview', scope), () => computeOverviewStats(scope));
}

async function computeOverviewStats(scope: ScopeFilter = {}): Promise<OverviewStats> {
  const [certificateHours, activityScopeFilter] = await Promise.all([
    getCertificateHours(),
    scopeActivities(scope),
  ]);
  const volunteerFilter: VolunteerFilter = scope.faculty ? { faculty: scope.faculty } : {};
  const activityMatchStages: PipelineStage[] = scope.faculty
    ? [{ $match: activityScopeFilter }]
    : [];
  const { startUtc, endUtc } = getCurrentCairoMonthRange();

  const [
    registeredVolunteers,
    distinctFaculties,
    activityTotals,
    bucketSummary,
    eventsThisMonth,
    pendingRegistrations,
    pendingApplications,
    zeroHourVolunteers,
  ] = await Promise.all([
    Volunteer.countDocuments(volunteerFilter),
    Volunteer.distinct('faculty', volunteerFilter),
    aggregateActivityOverviewTotals(activityMatchStages),
    aggregateVolunteerHourBuckets(activityScopeFilter, certificateHours),
    Opportunity.countDocuments({
      status: { $in: ['published', 'completed'] },
      startAt: { $gte: startUtc, $lt: endUtc },
      ...(scope.faculty ? { faculty: scope.faculty } : {}),
    }),
    User.countDocuments({
      role: 'student',
      status: 'pending',
      ...(scope.faculty ? { 'registration.faculty': scope.faculty } : {}),
    }),
    Application.countDocuments({
      status: 'pending',
      ...(scope.faculty ? { faculty: scope.faculty } : {}),
    }),
    fetchZeroHourVolunteers(volunteerFilter),
  ]);

  const zeroHoursCount = Math.max(0, registeredVolunteers - bucketSummary.activeVolunteers);

  return {
    totalApprovedHours: activityTotals.totalApprovedHours,
    totalActivities: activityTotals.totalActivities,
    approvedActivities: activityTotals.approvedActivities,
    registeredVolunteers,
    activeVolunteers: bucketSummary.activeVolunteers,
    eligibleVolunteers: bucketSummary.eligible,
    activeFaculties: distinctFaculties.length,
    avgHoursPerRegistered:
      registeredVolunteers > 0
        ? roundMetric(activityTotals.totalApprovedHours / registeredVolunteers)
        : 0,
    avgHoursPerActive:
      bucketSummary.activeVolunteers > 0
        ? roundMetric(activityTotals.totalApprovedHours / bucketSummary.activeVolunteers)
        : 0,
    certificateHours,
    eventsThisMonth,
    pendingRegistrations,
    pendingApplications,
    certificateBuckets: {
      eligible: bucketSummary.eligible,
      nearEligible: bucketSummary.nearEligible,
      inProgress: bucketSummary.inProgress,
      zeroHours: zeroHoursCount,
    },
    zeroHourVolunteers,
  };
}

export interface FacultyStatsResponse {
  faculties: FacultyStatsRow[];
  totals: GroupTotals;
}

async function aggregateActiveVolunteersByFaculty(
  scope: ScopeFilter = {}
): Promise<Map<string, number>> {
  const volunteerFilter: Record<string, unknown> = {};
  if (scope.faculty) {
    volunteerFilter.faculty = scope.faculty;
  }

  // Distinct volunteers with at least one approved activity, counted per
  // faculty — computed without joining every approved activity to its
  // volunteer document: group approved activities by volunteer in MongoDB,
  // then map each volunteer to his faculty in memory. A faculty scope is
  // pushed into the aggregation's $match (the scope's volunteer ids) rather
  // than grouping every approved activity in the university.
  const volunteers = await Volunteer.find(volunteerFilter)
    .select('faculty')
    .lean<{ _id: mongoose.Types.ObjectId; faculty?: string }[]>();
  const activeRows = await Activity.aggregate<{ _id: mongoose.Types.ObjectId }>([
    {
      $match: {
        status: 'approved',
        ...(scope.faculty
          ? { volunteer: { $in: volunteers.map((volunteer) => volunteer._id) } }
          : {}),
      },
    },
    { $group: { _id: '$volunteer' } },
  ]);

  const facultyByVolunteerId = new Map<string, string>();
  for (const volunteer of volunteers) {
    facultyByVolunteerId.set(String(volunteer._id), volunteer.faculty as string);
  }
  const counts = new Map<string, number>();
  for (const row of activeRows) {
    const faculty = facultyByVolunteerId.get(String(row._id));
    if (faculty === undefined) {
      continue;
    }
    counts.set(faculty, (counts.get(faculty) ?? 0) + 1);
  }
  return counts;
}

export async function getFacultyStats(scope: ScopeFilter = {}): Promise<FacultyStatsResponse> {
  return dedupStats(statsScopeKey('faculties', scope), () => computeFacultyStats(scope));
}

async function computeFacultyStats(scope: ScopeFilter = {}): Promise<FacultyStatsResponse> {
  const [statsByFaculty, activeByFaculty] = await Promise.all([
    aggregateGroupedStats('faculty', scope),
    aggregateActiveVolunteersByFaculty(scope),
  ]);
  const targetFaculties: readonly Faculty[] = scope.faculty ? [scope.faculty] : FACULTIES;
  const rawRows = targetFaculties.map((faculty) => {
    const metrics = statsByFaculty.get(faculty) || {
      volunteerCount: 0,
      totalActivities: 0,
      approvedActivities: 0,
      approvedHours: 0,
    };
    const activeVolunteers = activeByFaculty.get(faculty) ?? 0;
    return {
      faculty,
      ...metrics,
      activeVolunteers,
      participationRate:
        metrics.volunteerCount > 0
          ? roundMetric((activeVolunteers / metrics.volunteerCount) * 100, 1)
          : 0,
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
  return dedupStats(statsScopeKey('categories', scope), () => computeCategoryStats(scope));
}

async function computeCategoryStats(scope: ScopeFilter = {}): Promise<CategoryStatsResponse> {
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
  options: LeaderboardOptions = {},
  scope: ScopeFilter = {}
): Promise<LeaderboardResponse> {
  const key = `${statsScopeKey('leaderboard', scope)}:${options.category ?? ''}:${options.limit ?? ''}`;
  return dedupStats(key, () => computeLeaderboard(options, scope));
}

async function computeLeaderboard(
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

  const rows = (await computeVolunteerStatsRows(matchStage, certificateHours))
    .sort(
      (left, right) =>
        right.approvedHours - left.approvedHours ||
        right.approvedActivities - left.approvedActivities ||
        left.volunteerId.localeCompare(right.volunteerId)
    )
    .slice(0, parsedLimit);

  const leaderboard = rows.map((row) => ({
    ...row,
    categoryLabel: CATEGORY_LABELS[row.category],
  }));

  return { leaderboard, certificateHours };
}

export interface StudentDashboardSummary {
  volunteer: VolunteerLean | null;
  approvedHours: number;
  pendingHours: number;
  certificateHours: number;
  remainingHours: number;
  eligible: boolean;
  eventsAttended: number;
  happeningNow: OpportunityDTO[];
  upcomingAccepted: OpportunityDTO[];
  activeApplications: StudentApplicationDTO[];
  recentActivities: ActivityLean[];
}

/**
 * Builds the student dashboard payload with certificate progress, live/upcoming events,
 * active applications, and recent activities.
 */
export async function getStudentDashboardSummary(
  user: PublicUser
): Promise<StudentDashboardSummary> {
  // A pending student has no volunteer record until approval creates one; his
  // dashboard is the same summary with zeroed activity data and volunteer: null.
  const volunteer = await findStudentVolunteer(user);

  const [certificateHours, activityTotals, applications, eventsAttended, recentActivities] =
    await Promise.all([
      getCertificateHours(),
      volunteer
        ? Activity.aggregate<{ _id: ActivityStatus; hours: number }>([
            { $match: { volunteer: volunteer._id } },
            { $group: { _id: '$status', hours: { $sum: '$hours' } } },
          ])
        : Promise.resolve([] as { _id: ActivityStatus; hours: number }[]),
      Application.find({ user: user.id })
        .sort({ appliedAt: -1, createdAt: -1 })
        .populate('opportunity')
        .lean<ApplicationWithOpportunityLean[]>(),
      Application.countDocuments({ user: user.id, attended: true }),
      volunteer
        ? Activity.find({ volunteer: volunteer._id })
            .sort({ date: -1, createdAt: -1 })
            .limit(5)
            .lean<ActivityLean[]>()
        : Promise.resolve([] as ActivityLean[]),
    ]);

  const approvedHours = activityTotals.find((row) => row._id === 'approved')?.hours ?? 0;
  const pendingHours = activityTotals.find((row) => row._id === 'pending')?.hours ?? 0;
  const { remainingHours, eligible } = computeEligibility(approvedHours, certificateHours);

  const decoratedApplications: StudentApplicationDTO[] = applications.map((application) => ({
    ...application,
    opportunity: decorateOpportunity(application.opportunity),
  }));
  // Dashboard payloads are list contexts: cover bytes become cover paths.
  await applyCoverPathsToListDtos(
    decoratedApplications.map((application) => application.opportunity)
  );
  const acceptedApplications = decoratedApplications.filter(
    (application) => application.status === 'accepted'
  );

  return {
    volunteer,
    approvedHours,
    pendingHours,
    certificateHours,
    remainingHours,
    eligible,
    eventsAttended,
    happeningNow: acceptedApplications
      .filter((application) => application.opportunity.checkInOpen)
      .map((application) => application.opportunity),
    upcomingAccepted: acceptedApplications
      .filter(
        (application) =>
          !application.opportunity.checkInOpen &&
          application.opportunity.status === 'published' &&
          application.opportunity.phase === 'upcoming'
      )
      .map((application) => application.opportunity),
    // "Active" means the application still concerns upcoming work: an
    // accepted or pending application on an opportunity that has already
    // ended is history (it lives in recent activities / my applications),
    // not something active, and must not drive "under review" surfaces.
    activeApplications: decoratedApplications.filter(
      (application) =>
        ACTIVE_APPLICATION_STATUSES.includes(application.status) &&
        application.opportunity.phase !== 'ended'
    ),
    recentActivities,
  };
}

export interface ParticipationFunnel {
  applied: number;
  accepted: number;
  attended: number;
  rejected: number;
  noShow: number;
}

export interface EngagementBreakdown {
  joined: number;
  zeroHours: number;
}

export interface ParticipationStatsResponse {
  funnel: ParticipationFunnel;
  engagement: EngagementBreakdown;
}

export async function aggregateApplicationFunnelCounts(
  applicationFilter: Record<string, unknown>
): Promise<Omit<ParticipationFunnel, 'noShow'>> {
  const rows = await Application.aggregate<{
    _id: null;
    applied: number;
    accepted: number;
    attended: number;
    rejected: number;
  }>([
    { $match: applicationFilter },
    {
      $group: {
        _id: null,
        applied: { $sum: 1 },
        accepted: {
          $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] },
        },
        attended: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'accepted'] }, { $eq: ['$attended', true] }] },
              1,
              0,
            ],
          },
        },
        rejected: {
          $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
        },
      },
    },
  ]);

  const counts = rows[0];
  return counts
    ? {
        applied: counts.applied,
        accepted: counts.accepted,
        attended: counts.attended,
        rejected: counts.rejected,
      }
    : { applied: 0, accepted: 0, attended: 0, rejected: 0 };
}

export async function aggregateCompletedNoShowCount(
  applicationFilter: Record<string, unknown>
): Promise<number> {
  // The old pipeline $lookup+$unwind-ed every accepted-unattended
  // application just to test its opportunity's status. Fetch the completed
  // opportunity ids once (served by the status index) and match on them
  // directly — same count, no per-application join.
  const completedOpportunities = await Opportunity.find({ status: 'completed' })
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId }[]>();
  if (completedOpportunities.length === 0) {
    return 0;
  }
  const rows = await Application.aggregate<{ _id: null; noShow: number }>([
    {
      $match: {
        ...applicationFilter,
        status: 'accepted',
        attended: false,
        opportunity: { $in: completedOpportunities.map((opportunity) => opportunity._id) },
      },
    },
    { $group: { _id: null, noShow: { $sum: 1 } } },
  ]);
  return rows[0]?.noShow ?? 0;
}

/**
 * Computes the application participation funnel and active-vs-zero-hour volunteer engagement.
 */
export async function getParticipationStats(
  scope: ScopeFilter = {}
): Promise<ParticipationStatsResponse> {
  return dedupStats(statsScopeKey('participation', scope), () => computeParticipationStats(scope));
}

async function computeParticipationStats(
  scope: ScopeFilter = {}
): Promise<ParticipationStatsResponse> {
  const [certificateHours, activityScopeFilter] = await Promise.all([
    getCertificateHours(),
    scopeActivities(scope),
  ]);
  const volunteerFilter: VolunteerFilter = scope.faculty ? { faculty: scope.faculty } : {};
  const applicationFilter = scope.faculty ? { faculty: scope.faculty } : {};

  const [registeredVolunteers, bucketSummary, funnelCounts, noShow] = await Promise.all([
    Volunteer.countDocuments(volunteerFilter),
    aggregateVolunteerHourBuckets(activityScopeFilter, certificateHours),
    aggregateApplicationFunnelCounts(applicationFilter),
    aggregateCompletedNoShowCount(applicationFilter),
  ]);

  return {
    funnel: { ...funnelCounts, noShow },
    engagement: {
      joined: bucketSummary.activeVolunteers,
      zeroHours: Math.max(0, registeredVolunteers - bucketSummary.activeVolunteers),
    },
  };
}

export interface EventEfficiencyRow {
  _id: string;
  title: string;
  faculty: Faculty | null;
  status: OpportunityStatus;
  startAt: string;
  hours: number;
  totalSlots: number;
  acceptedCount: number;
  attendedCount: number;
  noShowCount: number;
  fillRate: number;
  noShowRate: number;
}

export interface EventStatsSummary {
  totalEvents: number;
  completedCount: number;
  avgFillRate: number;
  avgNoShowRate: number;
}

export interface EventStatsResponse {
  topEvents: EventEfficiencyRow[];
  completedEvents: EventEfficiencyRow[];
  summary: EventStatsSummary;
}

interface OpportunityApplicationAgg {
  _id: mongoose.Types.ObjectId;
  acceptedCount: number;
  attendedCount: number;
  noShowCount: number;
}

function buildEventEfficiencyRow(
  opportunity: OpportunityLean,
  counts: OpportunityApplicationAgg | undefined
): EventEfficiencyRow {
  const totalSlots =
    opportunity.slots.student + opportunity.slots.academic + opportunity.slots.admin;
  const acceptedCount = counts?.acceptedCount ?? 0;
  const attendedCount = counts?.attendedCount ?? 0;
  const noShowCount = opportunity.status === 'completed' ? (counts?.noShowCount ?? 0) : 0;

  return {
    _id: opportunity._id.toString(),
    title: opportunity.title,
    faculty: opportunity.faculty,
    status: opportunity.status,
    startAt: opportunity.startAt.toISOString(),
    hours: opportunity.hours,
    totalSlots,
    acceptedCount,
    attendedCount,
    noShowCount,
    fillRate: totalSlots > 0 ? roundMetric((acceptedCount / totalSlots) * 100, 1) : 0,
    noShowRate:
      opportunity.status === 'completed' && acceptedCount > 0
        ? roundMetric((noShowCount / acceptedCount) * 100, 1)
        : 0,
  };
}

/**
 * Returns top events by attendance plus slot fill rate and no-show rate per completed opportunity.
 */
export async function getEventStats(scope: ScopeFilter = {}): Promise<EventStatsResponse> {
  return dedupStats(statsScopeKey('events', scope), () => computeEventStats(scope));
}

async function computeEventStats(scope: ScopeFilter = {}): Promise<EventStatsResponse> {
  const opportunityFilter = {
    status: { $in: ['published', 'completed'] as OpportunityStatus[] },
    ...(scope.faculty ? { faculty: scope.faculty } : {}),
  };

  const opportunities = await Opportunity.find(opportunityFilter)
    .sort({ startAt: -1 })
    .lean<OpportunityLean[]>();

  if (opportunities.length === 0) {
    return {
      topEvents: [],
      completedEvents: [],
      summary: {
        totalEvents: 0,
        completedCount: 0,
        avgFillRate: 0,
        avgNoShowRate: 0,
      },
    };
  }

  const opportunityIds = opportunities.map((opportunity) => opportunity._id);
  const applicationRows = await Application.aggregate<OpportunityApplicationAgg>([
    {
      $match: {
        opportunity: { $in: opportunityIds },
        status: 'accepted',
        ...(scope.faculty ? { faculty: scope.faculty } : {}),
      },
    },
    {
      $group: {
        _id: '$opportunity',
        acceptedCount: { $sum: 1 },
        attendedCount: {
          $sum: { $cond: [{ $eq: ['$attended', true] }, 1, 0] },
        },
        noShowCount: {
          $sum: { $cond: [{ $eq: ['$attended', false] }, 1, 0] },
        },
      },
    },
  ]);

  const countsByOpportunity = new Map(applicationRows.map((row) => [row._id.toString(), row]));
  const rows = opportunities.map((opportunity) =>
    buildEventEfficiencyRow(opportunity, countsByOpportunity.get(opportunity._id.toString()))
  );

  const topEvents = [...rows]
    .sort((left, right) => {
      if (right.attendedCount !== left.attendedCount) {
        return right.attendedCount - left.attendedCount;
      }
      if (right.acceptedCount !== left.acceptedCount) {
        return right.acceptedCount - left.acceptedCount;
      }
      return new Date(right.startAt).getTime() - new Date(left.startAt).getTime();
    })
    .slice(0, 5);

  const completedEvents = rows.filter((row) => row.status === 'completed');
  const avgFillRate =
    rows.length > 0
      ? roundMetric(rows.reduce((sum, row) => sum + row.fillRate, 0) / rows.length, 1)
      : 0;
  const avgNoShowRate =
    completedEvents.length > 0
      ? roundMetric(
          completedEvents.reduce((sum, row) => sum + row.noShowRate, 0) / completedEvents.length,
          1
        )
      : 0;

  return {
    topEvents,
    completedEvents,
    summary: {
      totalEvents: rows.length,
      completedCount: completedEvents.length,
      avgFillRate,
      avgNoShowRate,
    },
  };
}

export interface MonthlyHoursPoint {
  month: string;
  label: string;
  approvedHours: number;
  approvedActivities: number;
}

export interface MonthlyHoursResponse {
  months: MonthlyHoursPoint[];
}

export function formatCairoMonthLabel(yearMonth: string): string {
  const [yearPart, monthPart] = yearMonth.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return yearMonth;
  }
  const anchor = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
  return new Intl.DateTimeFormat('ar-EG', {
    month: 'short',
    year: 'numeric',
    timeZone: CAIRO_TIME_ZONE,
  }).format(anchor);
}

/**
 * Returns monthly approved volunteer hours grouped in Africa/Cairo time.
 */
export async function getMonthlyHoursStats(scope: ScopeFilter = {}): Promise<MonthlyHoursResponse> {
  return dedupStats(statsScopeKey('monthly-hours', scope), () => computeMonthlyHoursStats(scope));
}

async function computeMonthlyHoursStats(scope: ScopeFilter = {}): Promise<MonthlyHoursResponse> {
  const activityScopeFilter = await scopeActivities(scope);
  // Only the last 12 months are ever returned (rows.slice(-12) below), so
  // bound the grouping to the last 13 Cairo months instead of every month
  // since the first activity — the extra month keeps the slice exact.
  const { year, month } = getCairoDateTimeParts(new Date());
  const windowTotalMonths = year * 12 + (month - 1) - 12;
  const windowStartUtc = cairoLocalToUtc({
    year: Math.floor(windowTotalMonths / 12),
    month: (windowTotalMonths % 12) + 1,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0,
  });
  const rows = await Activity.aggregate<{
    _id: string;
    approvedHours: number;
    approvedActivities: number;
  }>([
    { $match: { status: 'approved', date: { $gte: windowStartUtc }, ...activityScopeFilter } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m',
            date: '$date',
            timezone: CAIRO_TIME_ZONE,
          },
        },
        approvedHours: { $sum: '$hours' },
        approvedActivities: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const recentRows = rows.slice(-12);
  return {
    months: recentRows.map((row) => ({
      month: row._id,
      label: formatCairoMonthLabel(row._id),
      approvedHours: row.approvedHours,
      approvedActivities: row.approvedActivities,
    })),
  };
}

export interface AwaitingCompletionItem {
  opportunityId: string;
  title: string;
  faculty: Faculty | null;
  startAt: Date;
  endAt: Date;
  hours: number;
  acceptedCount: number;
  attendedCount: number;
}

export interface PendingUrgentItem {
  opportunityId: string;
  title: string;
  faculty: Faculty | null;
  startAt: Date;
  phase: OpportunityPhase;
  pendingCount: number;
}

export interface ActionItemsResponse {
  awaitingCompletion: AwaitingCompletionItem[];
  pendingUrgent: PendingUrgentItem[];
}

/** Pending applications become urgent once the opportunity starts within this window. */
export const PENDING_URGENT_WINDOW_MS = 72 * 60 * 60 * 1000;

interface ApplicationCountRow {
  _id: mongoose.Types.ObjectId;
  acceptedCount: number;
  attendedCount: number;
}

interface PendingCountRow {
  _id: mongoose.Types.ObjectId;
  pendingCount: number;
}

/**
 * Lists the staff action items that must never be missed, scoped to exactly the
 * opportunities the caller may act on (the same manage rule the completion and
 * application-decision endpoints enforce via assertCanManageOpportunity):
 * published opportunities that already ended and still await «إتمام الفرصة», and
 * published opportunities with pending applications whose start is imminent
 * (registration closed, already running, or starting within 72 hours).
 */
/** The dashboard shows 5 rows per block; the server caps well above that. */
export const ACTION_ITEMS_CAP = 50;

export async function getActionItems(user: PublicUser): Promise<ActionItemsResponse> {
  const now = new Date();
  const scope = buildManageScopeFilter(user);

  const endedPublished = await Opportunity.find({
    ...scope,
    status: 'published',
    endAt: { $lt: now },
  })
    .sort({ endAt: -1 })
    .limit(ACTION_ITEMS_CAP)
    .lean<OpportunityLean[]>();

  const countRows =
    endedPublished.length > 0
      ? await Application.aggregate<ApplicationCountRow>([
          {
            $match: {
              opportunity: { $in: endedPublished.map((opportunity) => opportunity._id) },
              status: 'accepted',
            },
          },
          {
            $group: {
              _id: '$opportunity',
              acceptedCount: { $sum: 1 },
              attendedCount: {
                $sum: { $cond: [{ $eq: ['$attended', true] }, 1, 0] },
              },
            },
          },
        ])
      : [];
  const countsByOpportunity = new Map(countRows.map((row) => [row._id.toString(), row] as const));

  const awaitingCompletion: AwaitingCompletionItem[] = endedPublished.map((opportunity) => {
    const counts = countsByOpportunity.get(opportunity._id.toString());
    return {
      opportunityId: opportunity._id.toString(),
      title: opportunity.title,
      faculty: opportunity.faculty,
      startAt: opportunity.startAt,
      endAt: opportunity.endAt,
      hours: opportunity.hours,
      acceptedCount: counts?.acceptedCount ?? 0,
      attendedCount: counts?.attendedCount ?? 0,
    };
  });

  // Scope first, aggregate second: resolve the caller's manageable,
  // published, not-yet-ended opportunities and group pending applications
  // for those only — the old order grouped EVERY pending application in
  // the university and discarded other faculties' rows afterwards.
  const scopedOpenOpportunities = await Opportunity.find({
    ...scope,
    status: 'published',
    endAt: { $gte: now },
  })
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId }[]>();

  const pendingRows =
    scopedOpenOpportunities.length > 0
      ? await Application.aggregate<PendingCountRow>([
          {
            $match: {
              status: 'pending',
              opportunity: { $in: scopedOpenOpportunities.map((opportunity) => opportunity._id) },
            },
          },
          { $group: { _id: '$opportunity', pendingCount: { $sum: 1 } } },
        ])
      : [];
  const pendingByOpportunity = new Map(
    pendingRows.map((row) => [row._id.toString(), row.pendingCount] as const)
  );

  const pendingCandidates =
    pendingRows.length > 0
      ? await Opportunity.find({
          _id: { $in: pendingRows.map((row) => row._id) },
        })
          .sort({ startAt: 1 })
          .lean<OpportunityLean[]>()
      : [];

  const pendingUrgent: PendingUrgentItem[] = pendingCandidates
    .map((opportunity) => ({
      opportunity,
      phase: evaluateOpportunityPhase(opportunity, now),
    }))
    .filter(
      ({ opportunity, phase }) =>
        phase === 'registration_closed' ||
        phase === 'in_progress' ||
        opportunity.startAt.getTime() - now.getTime() <= PENDING_URGENT_WINDOW_MS
    )
    .slice(0, ACTION_ITEMS_CAP)
    .map(({ opportunity, phase }) => ({
      opportunityId: opportunity._id.toString(),
      title: opportunity.title,
      faculty: opportunity.faculty,
      startAt: opportunity.startAt,
      phase,
      pendingCount: pendingByOpportunity.get(opportunity._id.toString()) ?? 0,
    }));

  return { awaitingCompletion, pendingUrgent };
}
