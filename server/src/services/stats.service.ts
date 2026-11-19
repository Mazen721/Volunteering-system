import mongoose from 'mongoose';
import type { PipelineStage } from 'mongoose';
import type {
  ActivityStatus,
  Faculty,
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
import { CAIRO_TIME_ZONE, cairoLocalToUtc, getCairoDateTimeParts } from '../utils/cairoTime.js';
import { AppError } from '../utils/errors.js';
import { getCertificateHours } from '../utils/volunteerLookup.js';
import { scopeActivities } from './activity.service.js';
import type {
  ApplicationWithOpportunityLean,
  StudentApplicationDTO,
} from './application.service.js';
import { ACTIVE_APPLICATION_STATUSES, findStudentVolunteer } from './application.service.js';
import type { OpportunityDTO } from './opportunity.service.js';
import { decorateOpportunity } from './opportunity.service.js';
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
  // (or deleted) are excluded, exactly as $unwind dropped them.
  const [volunteers, activityRows] = await Promise.all([
    Volunteer.find(volunteerFilter)
      .select(groupField)
      .lean<{ _id: mongoose.Types.ObjectId; faculty?: string; category?: string }[]>(),
    Activity.aggregate<ActivityByVolunteerRow>([
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
    ]),
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
  return Volunteer.aggregate<ZeroHourVolunteerRow>([
    { $match: volunteerFilter },
    {
      $lookup: {
        from: 'activities',
        let: { volunteerObjectId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$volunteer', '$$volunteerObjectId'] },
                  { $eq: ['$status', 'approved'] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'approvedActivities',
      },
    },
    { $match: { approvedActivities: { $size: 0 } } },
    { $sort: { createdAt: -1, volunteerId: 1 } },
    { $limit: limit },
    { $project: { _id: 1, volunteerId: 1, fullName: 1, category: 1, faculty: 1 } },
  ]);
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
  // then map each volunteer to his faculty in memory.
  const [volunteers, activeRows] = await Promise.all([
    Volunteer.find(volunteerFilter)
      .select('faculty')
      .lean<{ _id: mongoose.Types.ObjectId; faculty?: string }[]>(),
    Activity.aggregate<{ _id: mongoose.Types.ObjectId }>([
      { $match: { status: 'approved' } },
      { $group: { _id: '$volunteer' } },
    ]),
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
    activeApplications: decoratedApplications.filter((application) =>
      ACTIVE_APPLICATION_STATUSES.includes(application.status)
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

async function aggregateApplicationFunnelCounts(
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

async function aggregateCompletedNoShowCount(
  applicationFilter: Record<string, unknown>
): Promise<number> {
  const rows = await Application.aggregate<{ _id: null; noShow: number }>([
    { $match: { ...applicationFilter, status: 'accepted', attended: false } },
    {
      $lookup: {
        from: 'opportunities',
        localField: 'opportunity',
        foreignField: '_id',
        as: 'opportunityDoc',
      },
    },
    { $unwind: '$opportunityDoc' },
    { $match: { 'opportunityDoc.status': 'completed' } },
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

function formatCairoMonthLabel(yearMonth: string): string {
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
  const rows = await Activity.aggregate<{
    _id: string;
    approvedHours: number;
    approvedActivities: number;
  }>([
    { $match: { status: 'approved', ...activityScopeFilter } },
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
