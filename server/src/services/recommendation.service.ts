import mongoose from 'mongoose';
import type { InterestKey, VolunteerCategory } from '../constants/enums.js';
import { Application } from '../models/Application.js';
import type { ApplicationLean } from '../models/Application.js';
import type { OpportunityLean } from '../models/Opportunity.js';
import { Opportunity } from '../models/Opportunity.js';
import { Volunteer } from '../models/Volunteer.js';
import type { VolunteerLean } from '../models/Volunteer.js';
import type { PublicUser } from './auth.service.js';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const RECOMMENDATION_POINTS = {
  interestMatch: 10,
  facultyTarget: 3,
  deadlineSoon: 2,
  scarceSlots: 1,
  pastAttendance: 1,
} as const;

export const DEADLINE_SOON_WINDOW_MS = 3 * DAY_IN_MS;

export const SCARCE_SLOT_RATIO = 0.25;

export const PAST_ATTENDANCE_BONUS_CAP = 3;

export interface RecommendationContext {
  user: PublicUser;
  volunteerCategory: VolunteerCategory;
  pastAttendanceByField: Map<InterestKey, number>;
  now: Date;
}

export interface ScoredOpportunity {
  opportunity: OpportunityLean;
  recommendationScore: number;
  matchedFields: InterestKey[];
  remainingSlots: number;
  isFull: boolean;
}

interface OpportunityFieldsRow {
  fields: InterestKey[];
}

/**
 * Resolves the volunteer affiliation category that decides which opportunity slot counter applies.
 */
async function resolveVolunteerCategory(user: PublicUser): Promise<VolunteerCategory> {
  // Before approval links a volunteer record, the registration snapshot is the
  // only source of the student's category.
  const registrationCategory = user.registration?.category ?? 'student';
  if (!user.volunteer || !mongoose.isValidObjectId(user.volunteer)) {
    return registrationCategory;
  }

  const volunteer = await Volunteer.findById(user.volunteer)
    .select('category')
    .lean<VolunteerLean>();
  return volunteer?.category ?? registrationCategory;
}

/**
 * Counts past attended events per interest field for the authenticated student.
 */
async function buildPastAttendanceByField(userId: string): Promise<Map<InterestKey, number>> {
  const attendanceByField = new Map<InterestKey, number>();
  const applications = await Application.find({
    user: new mongoose.Types.ObjectId(userId),
    attended: true,
  })
    .select('opportunity')
    .lean<ApplicationLean[]>();

  if (applications.length === 0) {
    return attendanceByField;
  }

  const attendedOpportunities = await Opportunity.find({
    _id: { $in: applications.map((application) => application.opportunity) },
  })
    .select('fields')
    .lean<OpportunityFieldsRow[]>();

  for (const opportunity of attendedOpportunities) {
    for (const field of opportunity.fields) {
      attendanceByField.set(field, (attendanceByField.get(field) ?? 0) + 1);
    }
  }

  return attendanceByField;
}

/**
 * Builds the one-time context needed to score every opportunity for a student.
 */
export async function buildRecommendationContext(
  user: PublicUser,
  now: Date = new Date()
): Promise<RecommendationContext> {
  const [volunteerCategory, pastAttendanceByField] = await Promise.all([
    resolveVolunteerCategory(user),
    buildPastAttendanceByField(user.id),
  ]);

  return { user, volunteerCategory, pastAttendanceByField, now };
}

/**
 * Applies the deterministic recommendation formula from FR-020 to a single opportunity.
 */
export function scoreOpportunity(
  opportunity: OpportunityLean,
  context: RecommendationContext
): ScoredOpportunity {
  const matchedFields = opportunity.fields.filter((field) =>
    context.user.interests.includes(field)
  );

  let recommendationScore = matchedFields.length * RECOMMENDATION_POINTS.interestMatch;

  if (opportunity.faculty !== null && opportunity.faculty === context.user.faculty) {
    recommendationScore += RECOMMENDATION_POINTS.facultyTarget;
  }

  const millisecondsToDeadline = opportunity.registrationDeadline.getTime() - context.now.getTime();
  if (millisecondsToDeadline > 0 && millisecondsToDeadline <= DEADLINE_SOON_WINDOW_MS) {
    recommendationScore += RECOMMENDATION_POINTS.deadlineSoon;
  }

  const totalCategorySlots = opportunity.slots[context.volunteerCategory];
  const remainingSlots = Math.max(
    0,
    totalCategorySlots - opportunity.acceptedCounts[context.volunteerCategory]
  );

  if (totalCategorySlots > 0 && remainingSlots / totalCategorySlots <= SCARCE_SLOT_RATIO) {
    recommendationScore += RECOMMENDATION_POINTS.scarceSlots;
  }

  const pastAttendanceBonus = Math.min(
    PAST_ATTENDANCE_BONUS_CAP,
    opportunity.fields.reduce(
      (total, field) => total + (context.pastAttendanceByField.get(field) ?? 0),
      0
    )
  );
  recommendationScore += pastAttendanceBonus * RECOMMENDATION_POINTS.pastAttendance;

  return {
    opportunity,
    recommendationScore,
    matchedFields,
    remainingSlots,
    isFull: remainingSlots <= 0,
  };
}

/**
 * Orders scored opportunities by score and earliest start, always placing full events last.
 */
export function rankRecommendedOpportunities(
  opportunities: OpportunityLean[],
  context: RecommendationContext
): ScoredOpportunity[] {
  const scored = opportunities.map((opportunity) => scoreOpportunity(opportunity, context));

  const compare = (left: ScoredOpportunity, right: ScoredOpportunity): number => {
    if (right.recommendationScore !== left.recommendationScore) {
      return right.recommendationScore - left.recommendationScore;
    }
    if (left.opportunity.startAt.getTime() !== right.opportunity.startAt.getTime()) {
      return left.opportunity.startAt.getTime() - right.opportunity.startAt.getTime();
    }
    return left.opportunity._id.toString().localeCompare(right.opportunity._id.toString());
  };

  const available = scored.filter((entry) => !entry.isFull).sort(compare);
  const full = scored.filter((entry) => entry.isFull).sort(compare);

  return [...available, ...full];
}
