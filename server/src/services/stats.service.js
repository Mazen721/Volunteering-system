import { CATEGORIES, CATEGORY_LABELS, FACULTIES } from '../constants/enums.js';
import { Activity } from '../models/Activity.js';
import { Volunteer } from '../models/Volunteer.js';
import { AppError } from '../utils/errors.js';
import { getCertificateHours } from '../utils/volunteerLookup.js';

export function roundMetric(numberValue, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(numberValue * factor) / factor;
}

export function computeEligibility(approvedHours, certificateHours) {
  return {
    approvedHours,
    remainingHours: Math.max(0, certificateHours - approvedHours),
    eligible: approvedHours >= certificateHours,
  };
}

export function buildVolunteerStatsStages(matchStage, certificateHours, activityStatus) {
  const stages = [];
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

async function aggregateGroupedStats(groupField) {
  const [volunteerGroups, activityGroups] = await Promise.all([
    Volunteer.aggregate([{ $group: { _id: `$${groupField}`, volunteerCount: { $sum: 1 } } }]),
    Activity.aggregate([
      {
        $lookup: {
          from: 'volunteers',
          localField: 'volunteer',
          foreignField: '_id',
          as: 'volunteerDoc',
        },
      },
      { $unwind: '$volunteerDoc' },
      {
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
      },
    ]),
  ]);

  const statsByKey = new Map();
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

function summarizeGroupRows(rows) {
  const totals = rows.reduce(
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

export async function getOverviewStats() {
  const certificateHours = await getCertificateHours();

  const [registeredVolunteers, distinctFaculties, activitySummary, volunteerEligibility] =
    await Promise.all([
      Volunteer.countDocuments(),
      Volunteer.distinct('faculty'),
      Activity.aggregate([
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
      Activity.aggregate([
        { $match: { status: 'approved' } },
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

export async function getFacultyStats() {
  const statsByFaculty = await aggregateGroupedStats('faculty');
  const rawRows = FACULTIES.map((faculty) => {
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

export async function getCategoryStats() {
  const statsByCategory = await aggregateGroupedStats('category');
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

export async function getLeaderboard({ category, limit = 5 } = {}) {
  if (category && !CATEGORIES.includes(category)) {
    throw new AppError(400, 'فئة المتطوع غير صالحة');
  }

  const parsedLimit = Math.min(Math.max(Number(limit) || 5, 1), 50);
  const certificateHours = await getCertificateHours();
  const matchStage = category ? { category } : {};

  const rows = await Volunteer.aggregate([
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
