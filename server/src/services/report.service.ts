import type { Faculty, InterestKey, OpportunityStatus, UserRole } from '../constants/enums.js';
import { INTEREST_KEYS, INTEREST_LABELS, OPPORTUNITY_STATUSES } from '../constants/enums.js';
import type { ScopeFilter } from '../middleware/auth.js';
import { Application } from '../models/Application.js';
import type { OpportunityLean } from '../models/Opportunity.js';
import { Opportunity } from '../models/Opportunity.js';
import type { PublicUser } from './auth.service.js';
import type {
  CategoryStatsResponse,
  FacultyStatsResponse,
  LeaderboardResponse,
  MonthlyHoursResponse,
  OverviewStats,
  ParticipationStatsResponse,
} from './stats.service.js';
import {
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
  generatedAt: string;
  generatedBy: {
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
  };
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

async function buildOpportunityRows(
  scope: ScopeFilter
): Promise<{ rows: ReportOpportunityRow[]; totalOpportunities: number }> {
  const opportunityFilter = scope.faculty ? { faculty: scope.faculty } : {};
  const opportunities = await Opportunity.find(opportunityFilter)
    .sort({ startAt: -1, createdAt: -1 })
    .lean<OpportunityLean[]>();

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

/**
 * Builds the complete printable-report payload for the caller's server-enforced
 * scope. A dean's scope is already forced to his own faculty by the route's
 * scope resolver before this service is called, so every section — KPIs,
 * charts, leaderboards and opportunity rows — is limited to that faculty.
 * An admin without a faculty filter receives the whole university.
 */
export async function getVolunteeringReport(
  scope: ScopeFilter,
  user: PublicUser
): Promise<VolunteeringReport> {
  const [
    overview,
    faculties,
    categories,
    participation,
    monthlyHours,
    leaderboard,
    opportunityData,
  ] = await Promise.all([
    getOverviewStats(scope),
    getFacultyStats(scope),
    getCategoryStats(scope),
    getParticipationStats(scope),
    getMonthlyHoursStats(scope),
    getLeaderboard({ limit: 10 }, scope),
    buildOpportunityRows(scope),
  ]);

  const { funnel } = participation;

  return {
    meta: {
      scope: scope.faculty ? 'faculty' : 'university',
      faculty: scope.faculty ?? null,
      generatedAt: new Date().toISOString(),
      generatedBy: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    },
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
