import mongoose from 'mongoose';
import type { ApplicationStatus, VolunteerCategory } from '../constants/enums.js';
import { Application } from '../models/Application.js';
import type { ApplicationLean } from '../models/Application.js';
import { Opportunity } from '../models/Opportunity.js';
import type { OpportunityLean } from '../models/Opportunity.js';
import { Volunteer } from '../models/Volunteer.js';
import type { VolunteerLean } from '../models/Volunteer.js';
import type {
  ApplicationApplyInput,
  ApplicationDecisionStatus,
} from '../validators/application.schema.js';
import { AppError, isDuplicateKeyError } from '../utils/errors.js';
import type { PublicUser } from './auth.service.js';
import type { OpportunityDTO } from './opportunity.service.js';
import { assertCanManageOpportunity, decorateOpportunity } from './opportunity.service.js';

export const ACTIVE_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'pending',
  'accepted',
  'waitlisted',
];

function assertValidApplicationId(id: string): void {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(404, 'طلب التطوع غير موجود');
  }
}

export interface ApplicationWithOpportunityLean extends Omit<ApplicationLean, 'opportunity'> {
  opportunity: OpportunityLean;
}

export interface StudentApplicationDTO extends Omit<ApplicationLean, 'opportunity'> {
  opportunity: OpportunityDTO;
}

/**
 * Finds the volunteer record linked to the authenticated student account, or null when
 * none exists yet. A pending registration has no record by design: it is created and
 * linked only when the registration is approved.
 */
export async function findStudentVolunteer(user: PublicUser): Promise<VolunteerLean | null> {
  if (!user.volunteer || !mongoose.isValidObjectId(user.volunteer)) {
    return null;
  }
  return Volunteer.findById(user.volunteer).lean<VolunteerLean>();
}

/**
 * Resolves the volunteer record linked to the authenticated student account.
 */
export async function resolveStudentVolunteer(user: PublicUser): Promise<VolunteerLean> {
  const volunteer = await findStudentVolunteer(user);
  if (!volunteer) {
    throw new AppError(409, 'حسابك غير مرتبط بسجل متطوع، يرجى التواصل مع عميد الكلية');
  }
  return volunteer;
}

/**
 * Atomically claims one category slot on a published opportunity.
 */
async function tryClaimSlot(
  opportunityId: mongoose.Types.ObjectId,
  category: VolunteerCategory
): Promise<boolean> {
  const claimed = await Opportunity.findOneAndUpdate(
    {
      _id: opportunityId,
      status: 'published',
      $expr: { $lt: [`$acceptedCounts.${category}`, `$slots.${category}`] },
    },
    { $inc: { [`acceptedCounts.${category}`]: 1 } },
    { returnDocument: 'after' }
  ).lean<OpportunityLean>();

  return Boolean(claimed);
}

/**
 * Releases one accepted category slot without ever allowing a negative counter.
 */
async function releaseSlot(
  opportunityId: mongoose.Types.ObjectId,
  category: VolunteerCategory
): Promise<void> {
  await Opportunity.updateOne(
    { _id: opportunityId, [`acceptedCounts.${category}`]: { $gt: 0 } },
    { $inc: { [`acceptedCounts.${category}`]: -1 } }
  );
}

/**
 * Promotes the earliest waitlisted applicant of a category into an available slot.
 */
async function promoteNextWaitlisted(
  opportunityId: mongoose.Types.ObjectId,
  category: VolunteerCategory
): Promise<ApplicationLean | null> {
  const claimed = await tryClaimSlot(opportunityId, category);
  if (!claimed) {
    return null;
  }

  const promoted = await Application.findOneAndUpdate(
    { opportunity: opportunityId, category, status: 'waitlisted' },
    { $set: { status: 'accepted', decidedBy: null, decidedAt: new Date() } },
    { sort: { appliedAt: 1, createdAt: 1 }, returnDocument: 'after' }
  ).lean<ApplicationLean>();

  if (!promoted) {
    await releaseSlot(opportunityId, category);
  }
  return promoted ?? null;
}

function buildApplicationState(targetStatus: ApplicationStatus, note: string) {
  return {
    status: targetStatus,
    note,
    appliedAt: new Date(),
    decidedBy: null,
    decidedAt: null,
    attended: false,
    checkedInAt: null,
    hoursGranted: 0,
  };
}

/**
 * Applies an active student to a published opportunity with atomic capacity handling.
 */
export async function applyToOpportunity(
  opportunityId: string,
  payload: ApplicationApplyInput,
  user: PublicUser
): Promise<ApplicationLean> {
  if (user.status !== 'active') {
    throw new AppError(403, 'المشاركة متاحة بعد اعتماد حسابك من إدارة النظام أو عميد كليتك');
  }
  if (!mongoose.isValidObjectId(opportunityId)) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  const volunteer = await resolveStudentVolunteer(user);
  const opportunity = await Opportunity.findOne({
    _id: new mongoose.Types.ObjectId(opportunityId),
    status: 'published',
    $or: [{ faculty: null }, { faculty: volunteer.faculty }],
  }).lean<OpportunityLean>();

  if (!opportunity) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }

  const now = new Date();
  if (now.getTime() >= opportunity.registrationDeadline.getTime()) {
    throw new AppError(409, 'انتهت فترة التسجيل على هذه الفرصة');
  }
  if (opportunity.slots[volunteer.category] <= 0) {
    throw new AppError(409, 'لا توجد مقاعد متاحة لفئتك في هذه الفرصة');
  }

  const existing = await Application.findOne({
    opportunity: opportunity._id,
    volunteer: volunteer._id,
  }).lean<ApplicationLean>();

  if (existing && ACTIVE_APPLICATION_STATUSES.includes(existing.status)) {
    throw new AppError(409, 'لديك طلب قائم بالفعل على هذه الفرصة');
  }
  if (existing && existing.status === 'rejected') {
    throw new AppError(409, 'تم رفض طلبك السابق على هذه الفرصة ولا يمكن إعادة التقديم');
  }

  let targetStatus: ApplicationStatus = 'pending';
  if (opportunity.approvalMode === 'auto') {
    const claimed = await tryClaimSlot(opportunity._id, volunteer.category);
    targetStatus = claimed ? 'accepted' : 'waitlisted';
  }

  const state = buildApplicationState(targetStatus, payload.note);

  if (existing) {
    const reactivated = await Application.findOneAndUpdate(
      { _id: existing._id, status: 'cancelled' },
      { $set: state },
      { returnDocument: 'after', runValidators: true }
    ).lean<ApplicationLean>();

    if (!reactivated) {
      if (targetStatus === 'accepted') {
        await releaseSlot(opportunity._id, volunteer.category);
      }
      throw new AppError(409, 'لديك طلب قائم بالفعل على هذه الفرصة');
    }
    return reactivated;
  }

  try {
    const created = await Application.create({
      opportunity: opportunity._id,
      volunteer: volunteer._id,
      user: new mongoose.Types.ObjectId(user.id),
      faculty: volunteer.faculty,
      category: volunteer.category,
      ...state,
    });
    return created.toObject<ApplicationLean>();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      if (targetStatus === 'accepted') {
        await releaseSlot(opportunity._id, volunteer.category);
      }
      throw new AppError(409, 'لديك طلب قائم بالفعل على هذه الفرصة');
    }
    throw error;
  }
}

/**
 * Withdraws a student's application before the event start, releasing and promoting slots.
 */
export async function withdrawApplication(
  opportunityId: string,
  user: PublicUser
): Promise<ApplicationLean> {
  if (!mongoose.isValidObjectId(opportunityId)) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  const opportunityObjectId = new mongoose.Types.ObjectId(opportunityId);

  const opportunity = await Opportunity.findById(opportunityObjectId).lean<OpportunityLean>();
  if (!opportunity) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }

  const application = await Application.findOne({
    opportunity: opportunityObjectId,
    user: new mongoose.Types.ObjectId(user.id),
  }).lean<ApplicationLean>();
  if (!application) {
    throw new AppError(404, 'لا يوجد طلب تطوع على هذه الفرصة');
  }
  if (application.status === 'cancelled') {
    throw new AppError(409, 'تم سحب هذا الطلب مسبقاً');
  }

  const now = new Date();
  if (now.getTime() >= opportunity.startAt.getTime()) {
    throw new AppError(409, 'لا يمكن سحب الطلب بعد بدء الفرصة');
  }

  const updated = await Application.findOneAndUpdate(
    { _id: application._id, status: application.status },
    { $set: { status: 'cancelled', decidedAt: now } },
    { returnDocument: 'after', runValidators: true }
  ).lean<ApplicationLean>();

  if (!updated) {
    throw new AppError(409, 'تم سحب هذا الطلب مسبقاً');
  }

  const wasAccepted = application.status === 'accepted';
  if (wasAccepted) {
    await releaseSlot(opportunity._id, application.category);
    if (opportunity.approvalMode === 'auto' && now.getTime() < opportunity.startAt.getTime()) {
      await promoteNextWaitlisted(opportunity._id, application.category);
    }
  }

  return updated;
}

/**
 * Accepts, rejects, or waitlists an applicant while keeping accepted counters consistent.
 */
export async function updateApplicationStatus(
  applicationId: string,
  nextStatus: ApplicationDecisionStatus,
  user: PublicUser
): Promise<ApplicationLean> {
  assertValidApplicationId(applicationId);
  const application = await Application.findById(applicationId).lean<ApplicationLean>();
  if (!application) {
    throw new AppError(404, 'طلب التطوع غير موجود');
  }

  const opportunity = await Opportunity.findById(application.opportunity).lean<OpportunityLean>();
  if (!opportunity) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  assertCanManageOpportunity(opportunity, user);

  if (opportunity.status === 'completed' || opportunity.status === 'cancelled') {
    throw new AppError(409, 'لا يمكن تعديل طلبات فرصة مكتملة أو ملغاة');
  }
  if (application.status === 'cancelled') {
    throw new AppError(409, 'لا يمكن تعديل طلب تم سحبه');
  }
  if (application.status === nextStatus) {
    return application;
  }

  const wasAccepted = application.status === 'accepted';
  const willBeAccepted = nextStatus === 'accepted';

  if (willBeAccepted) {
    const claimed = await tryClaimSlot(opportunity._id, application.category);
    if (!claimed) {
      throw new AppError(409, 'اكتمل العدد المخصص لفئة المتطوع في هذه الفرصة');
    }
  }

  const updated = await Application.findOneAndUpdate(
    { _id: application._id, status: application.status },
    {
      $set: {
        status: nextStatus,
        decidedBy: new mongoose.Types.ObjectId(user.id),
        decidedAt: new Date(),
      },
    },
    { returnDocument: 'after', runValidators: true }
  ).lean<ApplicationLean>();

  if (!updated) {
    if (willBeAccepted) {
      await releaseSlot(opportunity._id, application.category);
    }
    throw new AppError(409, 'تم تحديث حالة الطلب بالفعل، يرجى إعادة تحميل القائمة');
  }

  if (wasAccepted && !willBeAccepted) {
    await releaseSlot(opportunity._id, application.category);
  }

  return updated;
}

/**
 * Lists every application submitted by the authenticated student with its decorated opportunity.
 */
export async function listStudentApplications(user: PublicUser): Promise<StudentApplicationDTO[]> {
  const applications = await Application.find({
    user: new mongoose.Types.ObjectId(user.id),
  })
    .sort({ appliedAt: -1, createdAt: -1 })
    .populate('opportunity')
    .lean<ApplicationWithOpportunityLean[]>();

  return applications.map((application) => ({
    ...application,
    opportunity: decorateOpportunity(application.opportunity),
  }));
}
