import type { Types } from 'mongoose';
import type {
  Faculty,
  InterestKey,
  OpportunityStatus,
  UserRole,
  VolunteerCategory,
} from '../constants/enums.js';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  FACULTIES,
  INTEREST_KEYS,
  INTEREST_LABELS,
  OPPORTUNITY_STATUSES,
} from '../constants/enums.js';
import type { ScopeFilter } from '../middleware/auth.js';
import { Activity } from '../models/Activity.js';
import { Application } from '../models/Application.js';
import type { OpportunityLean } from '../models/Opportunity.js';
import { Opportunity } from '../models/Opportunity.js';
import { User } from '../models/User.js';
import { Volunteer } from '../models/Volunteer.js';
import { CAIRO_TIME_ZONE, cairoLocalToUtc, getCairoDateTimeParts } from '../utils/cairoTime.js';
import { getCertificateHours } from '../utils/volunteerLookup.js';
import { scopeActivities } from './activity.service.js';
import type { PublicUser } from './auth.service.js';
import type {
  CategoryStatsResponse,
  FacultyStatsResponse,
  GroupMetrics,
  GroupTotals,
  LeaderboardResponse,
  MonthlyHoursResponse,
  OverviewStats,
  ParticipationStatsResponse,
  VolunteerStatsRow,
  ZeroHourVolunteerRow,
} from './stats.service.js';
import {
  aggregateApplicationFunnelCounts,
  aggregateCompletedNoShowCount,
  formatCairoMonthLabel,
  getCategoryStats,
  getFacultyStats,
  getLeaderboard,
  getMonthlyHoursStats,
  getOverviewStats,
  getParticipationStats,
  roundMetric,
} from './stats.service.js';

export interface ReportMeta {
  scope: 'university' | 'faculty';
  faculty: Faculty | null;
  facultyName: string | null;
  /** Applied period bounds as date-only 'YYYY-MM-DD' (Africa/Cairo); null = unbounded. */
  from: string | null;
  to: string | null;
  generatedAt: string;
  generatedBy: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
  };
}

/**
 * Optional report period. `from`/`to` are date-only 'YYYY-MM-DD' strings
 * interpreted as Africa/Cairo calendar days — the same timezone the rest of
 * the codebase uses for dates (monthly stats group in Cairo time, activity
 * dates are opportunity start dates). An opportunity belongs to the period
 * when its startAt falls inside [from 00:00 Cairo, to 23:59:59.999 Cairo];
 * either bound may be null (unbounded on that side).
 */
export interface ReportRange {
  from: string | null;
  to: string | null;
  fromUtc: Date | null;
  toExclusiveUtc: Date | null;
}

export interface ReportOpportunityRow {
  _id: string;
  title: string;
  faculty: Faculty | null;
  status: OpportunityStatus;
  fields: InterestKey[];
  startAt: string;
  endAt: string;
  hours: number;
  totalSlots: number;
  applicationsCount: number;
  pendingCount: number;
  acceptedCount: number;
  attendedCount: number;
  rejectedCount: number;
  fillRate: number;
  attendanceRate: number;
}

export interface InterestDistributionRow {
  field: InterestKey;
  label: string;
  opportunitiesCount: number;
  totalHours: number;
  percentage: number;
}

export interface OpportunityStatusRow {
  status: OpportunityStatus;
  count: number;
  percentage: number;
}

export interface ReportSummary {
  totalOpportunities: number;
  totalApplications: number;
  approvalRate: number;
  attendanceRate: number;
  totalAttended: number;
}

export interface VolunteeringReport {
  meta: ReportMeta;
  overview: OverviewStats;
  faculties: FacultyStatsResponse;
  categories: CategoryStatsResponse;
  participation: ParticipationStatsResponse;
  monthlyHours: MonthlyHoursResponse;
  leaderboard: LeaderboardResponse;
  interests: InterestDistributionRow[];
  opportunityStatuses: OpportunityStatusRow[];
  opportunities: ReportOpportunityRow[];
  summary: ReportSummary;
}

interface OpportunityApplicationCounts {
  _id: import('mongoose').Types.ObjectId;
  applicationsCount: number;
  pendingCount: number;
  acceptedCount: number;
  attendedCount: number;
  rejectedCount: number;
}

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? roundMetric((numerator / denominator) * 100, 1) : 0;
}

async function fetchScopedOpportunities(scope: ScopeFilter): Promise<OpportunityLean[]> {
  const opportunityFilter = scope.faculty ? { faculty: scope.faculty } : {};
  return Opportunity.find(opportunityFilter)
    .sort({ startAt: -1, createdAt: -1 })
    .lean<OpportunityLean[]>();
}

async function buildOpportunityRows(
  scope: ScopeFilter,
  opportunities: OpportunityLean[]
): Promise<{ rows: ReportOpportunityRow[]; totalOpportunities: number }> {
  if (opportunities.length === 0) {
    return { rows: [], totalOpportunities: 0 };
  }

  const applicationFilter: Record<string, unknown> = {
    opportunity: { $in: opportunities.map((opportunity) => opportunity._id) },
  };
  if (scope.faculty) {
    applicationFilter.faculty = scope.faculty;
  }

  const counts = await Application.aggregate<OpportunityApplicationCounts>([
    { $match: applicationFilter },
    {
      $group: {
        _id: '$opportunity',
        applicationsCount: { $sum: 1 },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
        },
        acceptedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] },
        },
        attendedCount: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$status', 'accepted'] }, { $eq: ['$attended', true] }] },
              1,
              0,
            ],
          },
        },
        rejectedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
        },
      },
    },
  ]);
  const countsByOpportunity = new Map(counts.map((row) => [row._id.toString(), row]));

  const rows = opportunities.map((opportunity) => {
    const rowCounts = countsByOpportunity.get(opportunity._id.toString());
    const totalSlots =
      opportunity.slots.student + opportunity.slots.academic + opportunity.slots.admin;
    const acceptedCount = rowCounts?.acceptedCount ?? 0;
    const attendedCount = rowCounts?.attendedCount ?? 0;

    return {
      _id: opportunity._id.toString(),
      title: opportunity.title,
      faculty: opportunity.faculty,
      status: opportunity.status,
      fields: opportunity.fields,
      startAt: opportunity.startAt.toISOString(),
      endAt: opportunity.endAt.toISOString(),
      hours: opportunity.hours,
      totalSlots,
      applicationsCount: rowCounts?.applicationsCount ?? 0,
      pendingCount: rowCounts?.pendingCount ?? 0,
      acceptedCount,
      attendedCount,
      rejectedCount: rowCounts?.rejectedCount ?? 0,
      fillRate: percentage(acceptedCount, totalSlots),
      attendanceRate: percentage(attendedCount, acceptedCount),
    };
  });

  return { rows, totalOpportunities: opportunities.length };
}

function buildInterestDistribution(
  opportunities: ReportOpportunityRow[]
): InterestDistributionRow[] {
  return INTEREST_KEYS.map((field) => {
    const matching = opportunities.filter((opportunity) => opportunity.fields.includes(field));
    return {
      field,
      label: INTEREST_LABELS[field],
      opportunitiesCount: matching.length,
      totalHours: matching.reduce((sum, opportunity) => sum + opportunity.hours, 0),
      percentage: percentage(matching.length, opportunities.length),
    };
  }).sort((left, right) => right.opportunitiesCount - left.opportunitiesCount);
}

function buildOpportunityStatuses(opportunities: ReportOpportunityRow[]): OpportunityStatusRow[] {
  return OPPORTUNITY_STATUSES.map((status) => {
    const count = opportunities.filter((opportunity) => opportunity.status === status).length;
    return {
      status,
      count,
      percentage: percentage(count, opportunities.length),
    };
  });
}

function buildReportMeta(
  scope: ScopeFilter,
  user: PublicUser,
  range: ReportRange | null
): ReportMeta {
  return {
    scope: scope.faculty ? 'faculty' : 'university',
    faculty: scope.faculty ?? null,
    facultyName: scope.faculty ?? null,
    from: range?.from ?? null,
    to: range?.to ?? null,
    generatedAt: new Date().toISOString(),
    generatedBy: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Builds the complete printable-report payload for the caller's server-enforced
 * scope. A dean's scope is already forced to his own faculty by the route's
 * scope resolver before this service is called, so every section — KPIs,
 * charts, leaderboards and opportunity rows — is limited to that faculty.
 * An admin without a faculty filter receives the whole university.
 *
 * When a period `range` is supplied, every section is instead derived from
 * the period's opportunity set (see buildRangedReport); without one the
 * payload is exactly the all-time report built from the shared stats getters.
 */
export async function getVolunteeringReport(
  scope: ScopeFilter,
  user: PublicUser,
  range?: ReportRange
): Promise<VolunteeringReport> {
  if (range) {
    return buildRangedReport(scope, user, range);
  }

  const [
    overview,
    faculties,
    categories,
    participation,
    monthlyHours,
    leaderboard,
    opportunityList,
  ] = await Promise.all([
    getOverviewStats(scope),
    getFacultyStats(scope),
    getCategoryStats(scope),
    getParticipationStats(scope),
    getMonthlyHoursStats(scope),
    getLeaderboard({ limit: 10 }, scope),
    fetchScopedOpportunities(scope),
  ]);
  const opportunityData = await buildOpportunityRows(scope, opportunityList);

  const { funnel } = participation;

  return {
    meta: buildReportMeta(scope, user, null),
    overview,
    faculties,
    categories,
    participation,
    monthlyHours,
    leaderboard,
    interests: buildInterestDistribution(opportunityData.rows),
    opportunityStatuses: buildOpportunityStatuses(opportunityData.rows),
    opportunities: opportunityData.rows,
    summary: {
      totalOpportunities: opportunityData.totalOpportunities,
      totalApplications: funnel.applied,
      approvalRate: percentage(funnel.accepted, funnel.applied),
      attendanceRate: percentage(funnel.attended, funnel.accepted),
      totalAttended: funnel.attended,
    },
  };
}

interface VolunteerPeriodMetrics extends GroupMetrics {
  volunteerId: Types.ObjectId;
  faculty: string;
  category: VolunteerCategory;
}

function summarizeMetrics(rows: GroupMetrics[]): GroupTotals {
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

/**
 * Period variant of the report. ONE definition drives every section: the
 * report covers the opportunities whose startAt falls inside the period
 * (within the caller's faculty scope), and everything else — hours,
 * applications, attendance, top volunteers, categories, the funnel and the
 * register — is derived from that opportunity set:
 *  - register / interests / statuses come from the period's opportunities;
 *  - the funnel counts applications on those opportunities (keeping the
 *    scope's applicant-faculty rule, exactly like the all-time report);
 *  - hours-based sections count activities credited by those opportunities
 *    (activity.opportunity ∈ set), additionally restricted to the scope's
 *    volunteers when a faculty scope applies — so a dean's period report
 *    leaks no other faculty's people, just like his all-time report;
 *  - people counts are the distinct volunteers with at least one activity
 *    credited by a period opportunity, and certificate eligibility is
 *    computed from in-period approved hours only.
 * Manually recorded activities (no opportunity link) belong to no period and
 * are excluded here; they remain part of the all-time report.
 */
async function buildRangedReport(
  scope: ScopeFilter,
  user: PublicUser,
  range: ReportRange
): Promise<VolunteeringReport> {
  const certificateHours = await getCertificateHours();

  const startAtFilter: Record<string, unknown> = {};
  if (range.fromUtc) {
    startAtFilter.$gte = range.fromUtc;
  }
  if (range.toExclusiveUtc) {
    startAtFilter.$lt = range.toExclusiveUtc;
  }
  const opportunities = await Opportunity.find({
    ...(scope.faculty ? { faculty: scope.faculty } : {}),
    startAt: startAtFilter,
  })
    .sort({ startAt: -1, createdAt: -1 })
    .lean<OpportunityLean[]>();
  const opportunityIds = opportunities.map((opportunity) => opportunity._id);

  const activityScopeFilter = await scopeActivities(scope);
  const activityMatch: Record<string, unknown> = {
    opportunity: { $in: opportunityIds },
    ...activityScopeFilter,
  };
  const applicationFilter: Record<string, unknown> = {
    opportunity: { $in: opportunityIds },
    ...(scope.faculty ? { faculty: scope.faculty } : {}),
  };

  const [
    opportunityData,
    funnelCounts,
    noShow,
    perVolunteerActivityRows,
    pendingApplications,
    pendingRegistrations,
    monthlyRows,
    leaderboardRows,
  ] = await Promise.all([
    buildOpportunityRows(scope, opportunities),
    aggregateApplicationFunnelCounts(applicationFilter),
    aggregateCompletedNoShowCount(applicationFilter),
    Activity.aggregate<{
      _id: Types.ObjectId;
      totalActivities: number;
      approvedActivities: number;
      approvedHours: number;
    }>([
      { $match: activityMatch },
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
    Application.countDocuments({ ...applicationFilter, status: 'pending' }),
    User.countDocuments({
      role: 'student',
      status: 'pending',
      ...(scope.faculty ? { 'registration.faculty': scope.faculty } : {}),
    }),
    Activity.aggregate<{ _id: string; approvedHours: number; approvedActivities: number }>([
      { $match: { status: 'approved', ...activityMatch } },
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
    ]),
    Volunteer.aggregate<VolunteerStatsRow>([
      ...(scope.faculty ? [{ $match: { faculty: scope.faculty } }] : []),
      {
        $lookup: {
          from: 'activities',
          let: { periodVolunteerId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$volunteer', '$$periodVolunteerId'] },
                opportunity: { $in: opportunityIds },
              },
            },
          ],
          as: 'activities',
        },
      },
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
          remainingHours: {
            $max: [0, { $subtract: [certificateHours, '$approvedHours'] }],
          },
          eligible: { $gte: ['$approvedHours', certificateHours] },
        },
      },
      { $project: { activities: 0, approvedActivitiesList: 0, __v: 0 } },
      { $match: { approvedActivities: { $gt: 0 } } },
      { $sort: { approvedHours: -1, approvedActivities: -1, volunteerId: 1 } },
      { $limit: 10 },
    ]),
  ]);

  // Period population: volunteers with at least one activity credited by a
  // period opportunity, joined with their faculty/category for the rollups.
  const periodVolunteerIds = perVolunteerActivityRows.map((row) => row._id);
  const periodVolunteerDocs =
    periodVolunteerIds.length > 0
      ? await Volunteer.find({ _id: { $in: periodVolunteerIds } })
          .select('faculty category')
          .lean<{ _id: Types.ObjectId; faculty: Faculty; category: VolunteerCategory }[]>()
      : [];
  const docByVolunteerId = new Map(
    periodVolunteerDocs.map((doc) => [doc._id.toString(), doc] as const)
  );
  const periodMetrics: VolunteerPeriodMetrics[] = [];
  for (const row of perVolunteerActivityRows) {
    const doc = docByVolunteerId.get(row._id.toString());
    if (!doc) {
      continue;
    }
    periodMetrics.push({
      volunteerId: row._id,
      faculty: doc.faculty,
      category: doc.category,
      volunteerCount: 1,
      totalActivities: row.totalActivities,
      approvedActivities: row.approvedActivities,
      approvedHours: row.approvedHours,
    });
  }

  const totalApprovedHours = periodMetrics.reduce((sum, row) => sum + row.approvedHours, 0);
  const totalActivities = periodMetrics.reduce((sum, row) => sum + row.totalActivities, 0);
  const approvedActivities = periodMetrics.reduce((sum, row) => sum + row.approvedActivities, 0);
  const registeredVolunteers = periodMetrics.length;
  const activeVolunteers = periodMetrics.filter((row) => row.approvedActivities > 0).length;

  const nearThreshold = (certificateHours * 2) / 3;
  let eligibleVolunteers = 0;
  let nearEligible = 0;
  let inProgress = 0;
  for (const row of periodMetrics) {
    if (row.approvedActivities === 0) {
      continue;
    }
    if (row.approvedHours >= certificateHours) {
      eligibleVolunteers += 1;
    } else if (row.approvedHours >= nearThreshold) {
      nearEligible += 1;
    } else {
      inProgress += 1;
    }
  }

  const approvedVolunteerIds = new Set(
    periodMetrics
      .filter((row) => row.approvedActivities > 0)
      .map((row) => row.volunteerId.toString())
  );
  const zeroHourCandidates = await Volunteer.find(scope.faculty ? { faculty: scope.faculty } : {})
    .sort({ createdAt: -1, volunteerId: 1 })
    .select({ volunteerId: 1, fullName: 1, category: 1, faculty: 1 })
    .lean<ZeroHourVolunteerRow[]>();
  const zeroHourVolunteers = zeroHourCandidates
    .filter((volunteer) => !approvedVolunteerIds.has(volunteer._id.toString()))
    .slice(0, 20);

  const { startUtc, endUtc } = getCurrentCairoMonthRange();
  const eventsThisMonth = opportunities.filter(
    (opportunity) =>
      (opportunity.status === 'published' || opportunity.status === 'completed') &&
      opportunity.startAt >= startUtc &&
      opportunity.startAt < endUtc
  ).length;

  const overview: OverviewStats = {
    totalApprovedHours,
    totalActivities,
    approvedActivities,
    registeredVolunteers,
    activeVolunteers,
    eligibleVolunteers,
    activeFaculties: new Set(periodMetrics.map((row) => row.faculty)).size,
    avgHoursPerRegistered:
      registeredVolunteers > 0 ? roundMetric(totalApprovedHours / registeredVolunteers) : 0,
    avgHoursPerActive:
      activeVolunteers > 0 ? roundMetric(totalApprovedHours / activeVolunteers) : 0,
    certificateHours,
    eventsThisMonth,
    pendingRegistrations,
    pendingApplications,
    certificateBuckets: {
      eligible: eligibleVolunteers,
      nearEligible,
      inProgress,
      zeroHours: Math.max(0, registeredVolunteers - activeVolunteers),
    },
    zeroHourVolunteers,
  };

  function rollupBy<K extends string>(
    keyOf: (row: VolunteerPeriodMetrics) => K
  ): Map<K, GroupMetrics & { activeVolunteers: number }> {
    const groups = new Map<K, GroupMetrics & { activeVolunteers: number }>();
    for (const row of periodMetrics) {
      const key = keyOf(row);
      const existing = groups.get(key) ?? {
        volunteerCount: 0,
        totalActivities: 0,
        approvedActivities: 0,
        approvedHours: 0,
        activeVolunteers: 0,
      };
      existing.volunteerCount += 1;
      existing.totalActivities += row.totalActivities;
      existing.approvedActivities += row.approvedActivities;
      existing.approvedHours += row.approvedHours;
      if (row.approvedActivities > 0) {
        existing.activeVolunteers += 1;
      }
      groups.set(key, existing);
    }
    return groups;
  }

  const byFaculty = rollupBy((row) => row.faculty);
  const targetFaculties: readonly Faculty[] = scope.faculty ? [scope.faculty] : FACULTIES;
  const facultyTotals = summarizeMetrics(
    targetFaculties.map((faculty) => {
      const metrics = byFaculty.get(faculty);
      return {
        volunteerCount: metrics?.volunteerCount ?? 0,
        totalActivities: metrics?.totalActivities ?? 0,
        approvedActivities: metrics?.approvedActivities ?? 0,
        approvedHours: metrics?.approvedHours ?? 0,
      };
    })
  );
  const faculties: FacultyStatsResponse = {
    faculties: targetFaculties
      .map((faculty) => {
        const metrics = byFaculty.get(faculty);
        const volunteerCount = metrics?.volunteerCount ?? 0;
        const approvedHours = metrics?.approvedHours ?? 0;
        const activeCount = metrics?.activeVolunteers ?? 0;
        return {
          faculty,
          volunteerCount,
          totalActivities: metrics?.totalActivities ?? 0,
          approvedActivities: metrics?.approvedActivities ?? 0,
          approvedHours,
          avgHours: volunteerCount > 0 ? roundMetric(approvedHours / volunteerCount) : 0,
          percentage:
            facultyTotals.approvedHours > 0
              ? roundMetric((approvedHours / facultyTotals.approvedHours) * 100, 1)
              : 0,
          activeVolunteers: activeCount,
          participationRate:
            volunteerCount > 0 ? roundMetric((activeCount / volunteerCount) * 100, 1) : 0,
        };
      })
      .sort((left, right) => right.approvedHours - left.approvedHours),
    totals: facultyTotals,
  };

  const byCategory = rollupBy((row) => row.category);
  const categoryRows = CATEGORIES.map((category) => {
    const metrics = byCategory.get(category);
    const volunteerCount = metrics?.volunteerCount ?? 0;
    const approvedHours = metrics?.approvedHours ?? 0;
    return {
      category,
      label: CATEGORY_LABELS[category],
      volunteerCount,
      totalActivities: metrics?.totalActivities ?? 0,
      approvedActivities: metrics?.approvedActivities ?? 0,
      approvedHours,
      avgHours: volunteerCount > 0 ? roundMetric(approvedHours / volunteerCount) : 0,
    };
  });
  const categories: CategoryStatsResponse = {
    categories: categoryRows,
    totals: summarizeMetrics(categoryRows),
  };

  const fromMonth = range.from ? range.from.slice(0, 7) : null;
  const toMonth = range.to ? range.to.slice(0, 7) : null;
  const monthlyHours: MonthlyHoursResponse = {
    months: monthlyRows
      .filter((row) => (!fromMonth || row._id >= fromMonth) && (!toMonth || row._id <= toMonth))
      .map((row) => ({
        month: row._id,
        label: formatCairoMonthLabel(row._id),
        approvedHours: row.approvedHours,
        approvedActivities: row.approvedActivities,
      })),
  };

  const funnel = { ...funnelCounts, noShow };
  const participation: ParticipationStatsResponse = {
    funnel,
    engagement: {
      joined: activeVolunteers,
      zeroHours: Math.max(0, registeredVolunteers - activeVolunteers),
    },
  };

  const leaderboard: LeaderboardResponse = {
    leaderboard: leaderboardRows.map((row) => ({
      ...row,
      categoryLabel: CATEGORY_LABELS[row.category],
    })),
    certificateHours,
  };

  return {
    meta: buildReportMeta(scope, user, range),
    overview,
    faculties,
    categories,
    participation,
    monthlyHours,
    leaderboard,
    interests: buildInterestDistribution(opportunityData.rows),
    opportunityStatuses: buildOpportunityStatuses(opportunityData.rows),
    opportunities: opportunityData.rows,
    summary: {
      totalOpportunities: opportunityData.totalOpportunities,
      totalApplications: funnel.applied,
      approvalRate: percentage(funnel.accepted, funnel.applied),
      attendanceRate: percentage(funnel.attended, funnel.accepted),
      totalAttended: funnel.attended,
    },
  };
}
