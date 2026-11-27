import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Activity } from '../models/Activity.js';
import { Application } from '../models/Application.js';
import type { ApplicationLean, ApplicationWithVolunteerLean } from '../models/Application.js';
import { Opportunity } from '../models/Opportunity.js';
import type { OpportunityLean } from '../models/Opportunity.js';
import { isCheckInWindowOpen } from '../utils/cairoTime.js';
import { AppError, isDuplicateKeyError } from '../utils/errors.js';
import type { PublicUser } from './auth.service.js';
import type { OpportunityDTO } from './opportunity.service.js';
import {
  decorateOpportunity,
  findLiveOpportunity,
  findManagedOpportunity,
} from './opportunity.service.js';

export const CHECK_IN_TOKEN_TTL_SECONDS = 45;

export interface CheckInTokenResult {
  token: string;
  expiresAt: string;
}

export interface LiveCounters {
  accepted: number;
  checkedIn: number;
  notArrived: number;
}

/** An accepted application in the live payload, enriched with the volunteer's absence total. */
export interface LiveAttendee extends ApplicationWithVolunteerLean {
  /**
   * How many times this volunteer has been absent overall: applications with
   * status accepted and attended=false on opportunities that already ended
   * (endAt in the past). Computed server-side so the client never guesses.
   */
  absenceCount: number;
}

export interface LiveOpportunityState {
  opportunity: OpportunityDTO;
  counters: LiveCounters;
  attendees: LiveAttendee[];
}

export interface CompleteOpportunityResult {
  opportunity: OpportunityDTO;
  creditedCount: number;
  noShowCount: number;
}

interface CheckInJwtPayload {
  opportunityId?: unknown;
  type?: unknown;
}

function verifyCheckInJwt(token: string, expectedOpportunityId: string, jwtSecret: string): void {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(400, 'انتهت صلاحية رمز الحضور، يرجى مسح الرمز المحدث');
    }
    throw new AppError(400, 'رمز الحضور غير صالح');
  }

  const candidate = typeof payload === 'string' ? null : (payload as CheckInJwtPayload);
  if (!candidate || candidate.type !== 'checkin' || typeof candidate.opportunityId !== 'string') {
    throw new AppError(400, 'رمز الحضور غير صالح');
  }
  if (candidate.opportunityId !== expectedOpportunityId) {
    throw new AppError(400, 'رمز الحضور لا يخص هذه الفرصة التطوعية');
  }
}

async function findCheckInEligibleOpportunity(
  opportunityId: string,
  user: PublicUser
): Promise<OpportunityLean> {
  if (!mongoose.isValidObjectId(opportunityId)) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }

  const opportunity = await Opportunity.findOne({
    _id: new mongoose.Types.ObjectId(opportunityId),
    $or: [{ faculty: null }, { faculty: user.faculty }],
  }).lean<OpportunityLean>();

  if (!opportunity) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  if (opportunity.status === 'completed') {
    throw new AppError(409, 'تم إغلاق تسجيل الحضور بعد اكتمال الفرصة');
  }
  if (opportunity.status !== 'published') {
    throw new AppError(409, 'تسجيل الحضور متاح للفرص المنشورة فقط');
  }
  if (!isCheckInWindowOpen(opportunity)) {
    throw new AppError(
      409,
      'تسجيل الحضور غير متاح خارج نافذة الحضور المحددة (قبل البدء بـ ٣٠ دقيقة وحتى الانتهاء)'
    );
  }
  return opportunity;
}

async function recordStudentAttendance(application: ApplicationLean): Promise<ApplicationLean> {
  if (application.attended) {
    return application;
  }

  const updated = await Application.findOneAndUpdate(
    { _id: application._id, status: 'accepted', attended: false },
    { $set: { attended: true, checkedInAt: new Date() } },
    { returnDocument: 'after' }
  ).lean<ApplicationLean>();

  if (updated) {
    return updated;
  }

  const current = await Application.findById(application._id).lean<ApplicationLean>();
  if (!current) {
    throw new AppError(404, 'طلب التطوع غير موجود');
  }
  return current;
}

/**
 * A bulkWrite failure counts as the known idempotency race only when every
 * failed operation failed on the duplicate-key index (a concurrent
 * completion inserted the same activity first); anything else is real.
 */
function isOnlyDuplicateKeyBulkError(error: unknown): boolean {
  if (isDuplicateKeyError(error)) {
    return true;
  }
  if (typeof error !== 'object' || error === null || !('writeErrors' in error)) {
    return false;
  }
  const writeErrors = (error as { writeErrors?: { code?: unknown }[] }).writeErrors;
  return (
    Array.isArray(writeErrors) &&
    writeErrors.length > 0 &&
    writeErrors.every((writeError) => writeError.code === 11000)
  );
}

function buildApprovedActivityInsert(
  opportunity: OpportunityLean,
  application: ApplicationLean
): Record<string, unknown> {
  return {
    volunteer: application.volunteer,
    title: opportunity.title,
    type: opportunity.activityType,
    hours: opportunity.hours,
    date: opportunity.startAt,
    status: 'approved' as const,
    supervisor: opportunity.contactName,
    opportunity: opportunity._id,
    application: application._id,
  };
}

async function creditCompletedEventApplications(
  opportunity: OpportunityLean,
  attendedApps: ApplicationLean[],
  noShowApps: ApplicationLean[]
): Promise<void> {
  if (attendedApps.length > 0) {
    // One bulkWrite for every attendee instead of N parallel upserts (300
    // attendees used to mean ~300 concurrent round-trips against the
    // partial unique index). ordered:false lets the batch finish every
    // insert; a duplicate key from a concurrent completion is the known
    // idempotency race and is swallowed exactly as before.
    try {
      await Activity.bulkWrite(
        attendedApps.map((app) => ({
          updateOne: {
            filter: { application: app._id },
            update: { $setOnInsert: buildApprovedActivityInsert(opportunity, app) },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    } catch (error) {
      if (!isOnlyDuplicateKeyBulkError(error)) {
        throw error;
      }
    }
  }

  if (attendedApps.length > 0) {
    await Application.updateMany(
      { _id: { $in: attendedApps.map((app) => app._id) } },
      { $set: { hoursGranted: opportunity.hours } }
    );
  }
  if (noShowApps.length > 0) {
    await Application.updateMany(
      { _id: { $in: noShowApps.map((app) => app._id) } },
      { $set: { hoursGranted: 0 } }
    );
  }
}

async function countCompletionTotals(
  opportunityId: mongoose.Types.ObjectId
): Promise<{ creditedCount: number; noShowCount: number }> {
  const [creditedCount, noShowCount] = await Promise.all([
    Application.countDocuments({
      opportunity: opportunityId,
      status: 'accepted',
      attended: true,
    }),
    Application.countDocuments({
      opportunity: opportunityId,
      status: 'accepted',
      attended: false,
    }),
  ]);
  return { creditedCount, noShowCount };
}

/**
 * Generates a short-lived (45s) signed QR check-in JWT for a published opportunity.
 */
export async function generateCheckInToken(
  opportunityId: string,
  user: PublicUser,
  jwtSecret: string
): Promise<CheckInTokenResult> {
  const opportunity = await findLiveOpportunity(opportunityId, user);
  if (opportunity.status !== 'published') {
    throw new AppError(409, 'لا يمكن إنشاء رمز حضور لفرصة غير منشورة أو منتهية');
  }

  const token = jwt.sign(
    { opportunityId: opportunity._id.toString(), type: 'checkin' },
    jwtSecret,
    { expiresIn: CHECK_IN_TOKEN_TTL_SECONDS }
  );
  const expiresAt = new Date(Date.now() + CHECK_IN_TOKEN_TTL_SECONDS * 1000).toISOString();
  return { token, expiresAt };
}

/**
 * Verifies a rotating QR check-in token against Cairo time window and accepted status,
 * then records the student's attendance.
 */
export async function verifyAndCheckIn(
  opportunityId: string,
  token: string,
  user: PublicUser,
  jwtSecret: string
): Promise<ApplicationLean> {
  if (user.status !== 'active') {
    throw new AppError(403, 'تسجيل الحضور متاح بعد اعتماد حسابك');
  }
  const opportunity = await findCheckInEligibleOpportunity(opportunityId, user);
  verifyCheckInJwt(token, opportunity._id.toString(), jwtSecret);

  const application = await Application.findOne({
    opportunity: opportunity._id,
    user: new mongoose.Types.ObjectId(user.id),
  }).lean<ApplicationLean>();

  if (!application || application.status !== 'accepted') {
    throw new AppError(403, 'تسجيل الحضور متاح للمتطوعين المقبولين فقط');
  }
  return recordStudentAttendance(application);
}

/**
 * Toggles an accepted applicant's attendance manually before event completion.
 */
export async function toggleManualCheckIn(
  opportunityId: string,
  applicationId: string,
  attended: boolean,
  user: PublicUser
): Promise<ApplicationWithVolunteerLean> {
  const opportunity = await findLiveOpportunity(opportunityId, user);
  if (opportunity.status === 'completed' || opportunity.status === 'cancelled') {
    throw new AppError(409, 'لا يمكن تعديل الحضور لفرصة مكتملة أو ملغاة');
  }
  if (opportunity.status !== 'published') {
    throw new AppError(409, 'تسجيل الحضور متاح للفرص المنشورة فقط');
  }
  if (!mongoose.isValidObjectId(applicationId)) {
    throw new AppError(404, 'طلب التطوع غير موجود');
  }

  const application = await Application.findOne({
    _id: new mongoose.Types.ObjectId(applicationId),
    opportunity: opportunity._id,
  }).lean<ApplicationLean>();

  if (!application) {
    throw new AppError(404, 'طلب التطوع غير موجود');
  }
  if (application.status !== 'accepted') {
    throw new AppError(409, 'يمكن تسجيل الحضور للمتطوعين المقبولين فقط');
  }

  const nextCheckedInAt = attended ? (application.checkedInAt ?? new Date()) : null;
  const updated = await Application.findByIdAndUpdate(
    application._id,
    { $set: { attended, checkedInAt: nextCheckedInAt } },
    { returnDocument: 'after' }
  )
    .populate('volunteer')
    .lean<ApplicationWithVolunteerLean>();

  if (!updated) {
    throw new AppError(404, 'طلب التطوع غير موجود');
  }
  return updated;
}

/**
 * Loads live event attendance counters and accepted attendees for the organizer live screen.
 */
export async function getLiveOpportunityState(
  opportunityId: string,
  user: PublicUser
): Promise<LiveOpportunityState> {
  const opportunity = await findLiveOpportunity(opportunityId, user);
  const accepted = await Application.find({
    opportunity: opportunity._id,
    status: 'accepted',
  })
    .sort({ appliedAt: 1, createdAt: 1 })
    .populate('volunteer')
    .lean<ApplicationWithVolunteerLean[]>();

  // Per-volunteer absence totals across every opportunity that already
  // ended: accepted but never attended. Attended applications never count,
  // and neither do absences on opportunities that have not taken place yet.
  // The ended-opportunity ids are resolved first (status/endAt index) so
  // the aggregation matches on them directly — no $lookup+$unwind per
  // application just to test endAt.
  const absenceByVolunteer = new Map<string, number>();
  if (accepted.length > 0) {
    const volunteerIds = [...new Set(accepted.map((attendee) => attendee.volunteer._id))];
    const endedOpportunities = await Opportunity.find({ endAt: { $lt: new Date() } })
      .select('_id')
      .lean<{ _id: mongoose.Types.ObjectId }[]>();
    if (endedOpportunities.length > 0) {
      const rows = await Application.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
        {
          $match: {
            volunteer: { $in: volunteerIds },
            status: 'accepted',
            attended: false,
            opportunity: { $in: endedOpportunities.map((opportunity) => opportunity._id) },
          },
        },
        { $group: { _id: '$volunteer', count: { $sum: 1 } } },
      ]);
      for (const row of rows) {
        absenceByVolunteer.set(row._id.toString(), row.count);
      }
    }
  }
  const attendees: LiveAttendee[] = accepted.map((attendee) => ({
    ...attendee,
    absenceCount: absenceByVolunteer.get(attendee.volunteer._id.toString()) ?? 0,
  }));

  const checkedIn = attendees.filter((attendee) => attendee.attended).length;
  return {
    opportunity: decorateOpportunity(opportunity),
    counters: {
      accepted: attendees.length,
      checkedIn,
      notArrived: attendees.length - checkedIn,
    },
    attendees,
  };
}

/**
 * Completes a published opportunity after endAt and idempotently credits approved Activity hours
 * only for attended applicants while recording no-shows with 0 hours.
 */
export async function completeOpportunity(
  opportunityId: string,
  user: PublicUser
): Promise<CompleteOpportunityResult> {
  const opportunity = await findManagedOpportunity(opportunityId, user);
  if (opportunity.status === 'draft' || opportunity.status === 'cancelled') {
    throw new AppError(409, 'لا يمكن إتمام فرصة في حالة مسودة أو ملغاة');
  }
  if (opportunity.status === 'completed') {
    return {
      opportunity: decorateOpportunity(opportunity),
      ...(await countCompletionTotals(opportunity._id)),
    };
  }
  if (Date.now() <= opportunity.endAt.getTime()) {
    throw new AppError(409, 'لا يمكن إتمام الفرصة قبل انتهاء موعدها المحدد');
  }

  const acceptedApplications = await Application.find({
    opportunity: opportunity._id,
    status: 'accepted',
  }).lean<ApplicationLean[]>();
  const attendedApps = acceptedApplications.filter((app) => app.attended);
  const noShowApps = acceptedApplications.filter((app) => !app.attended);

  await creditCompletedEventApplications(opportunity, attendedApps, noShowApps);

  const updatedOpportunity = await Opportunity.findByIdAndUpdate(
    opportunity._id,
    { $set: { status: 'completed' } },
    { returnDocument: 'after' }
  ).lean<OpportunityLean>();

  return {
    opportunity: decorateOpportunity(updatedOpportunity ?? { ...opportunity, status: 'completed' }),
    creditedCount: attendedApps.length,
    noShowCount: noShowApps.length,
  };
}
