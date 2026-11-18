import mongoose from 'mongoose';
import type {
  ApplicationStatus,
  Faculty,
  InterestKey,
  OpportunityPhase,
  OpportunityStatus,
} from '../constants/enums.js';
import {
  CATEGORIES,
  FACULTIES,
  INTEREST_KEYS,
  OPPORTUNITY_PHASES,
  OPPORTUNITY_STATUSES,
} from '../constants/enums.js';
import { Application } from '../models/Application.js';
import type { ApplicationLean, ApplicationWithVolunteerLean } from '../models/Application.js';
import type { CategoryCounts, OpportunityLean } from '../models/Opportunity.js';
import { Opportunity, createEmptyCategoryCounts, hasPositiveSlot } from '../models/Opportunity.js';
import type { PublicUser } from './auth.service.js';
import type { OpportunityInput, OpportunityUpdateInput } from '../validators/opportunity.schema.js';
import { applicationListQuerySchema } from '../validators/application.schema.js';
import {
  evaluateOpportunityPhase,
  isCheckInWindowOpen,
} from '../utils/cairoTime.js';
import { AppError } from '../utils/errors.js';
import {
  buildRecommendationContext,
  rankRecommendedOpportunities,
} from './recommendation.service.js';

export interface OpportunityListQuery {
  status?: string;
  faculty?: string;
  field?: string;
  phase?: string;
  sort?: string;
}

export interface OpportunityDTO extends OpportunityLean {
  phase: OpportunityPhase;
  checkInOpen: boolean;
  remainingSlots: CategoryCounts;
  recommendationScore?: number;
  matchedFields?: InterestKey[];
  isFull?: boolean;
  waitlistAvailable?: boolean;
  myApplication?: ApplicationLean;
}

export interface OpportunityListResult {
  opportunities: OpportunityDTO[];
}

export interface OpportunityApplicantsResult {
  applications: ApplicationWithVolunteerLean[];
  readOnly: boolean;
}

function assertValidOpportunityId(id: string): void {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
}

function normalizeCategoryCounts(counts: Partial<CategoryCounts> | undefined): CategoryCounts {
  return {
    student: counts?.student ?? 0,
    academic: counts?.academic ?? 0,
    admin: counts?.admin ?? 0,
  };
}

function buildRemainingSlots(opportunity: OpportunityLean): CategoryCounts {
  return {
    student: Math.max(0, opportunity.slots.student - opportunity.acceptedCounts.student),
    academic: Math.max(0, opportunity.slots.academic - opportunity.acceptedCounts.academic),
    admin: Math.max(0, opportunity.slots.admin - opportunity.acceptedCounts.admin),
  };
}

export function decorateOpportunity(
  opportunity: OpportunityLean,
  myApplication?: ApplicationLean
): OpportunityDTO {
  return {
    ...opportunity,
    phase: evaluateOpportunityPhase(opportunity),
    checkInOpen:
      opportunity.status === 'published' && isCheckInWindowOpen(opportunity),
    remainingSlots: buildRemainingSlots(opportunity),
    ...(myApplication ? { myApplication } : {}),
  };
}

function assertQueryValue<T extends string>(
  value: string | undefined,
  allowedValues: readonly T[],
  message: string
): T | undefined {
  if (!value) {
    return undefined;
  }
  if (!(allowedValues as readonly string[]).includes(value)) {
    throw new AppError(400, message);
  }
  return value as T;
}

async function findAppliedOpportunityIds(userId: string): Promise<mongoose.Types.ObjectId[]> {
  return (await Application.distinct('opportunity', {
    user: new mongoose.Types.ObjectId(userId),
  })) as mongoose.Types.ObjectId[];
}

function buildVisibilityFilter(
  user: PublicUser,
  appliedOpportunityIds: mongoose.Types.ObjectId[]
): Record<string, unknown> {
  if (user.role === 'admin') {
    return {};
  }

  if (user.role === 'dean') {
    return {
      $and: [
        { $or: [{ faculty: user.faculty }, { faculty: null }] },
        { $or: [{ status: { $ne: 'draft' } }, { createdBy: new mongoose.Types.ObjectId(user.id) }] },
      ],
    };
  }

  const visibility: Record<string, unknown>[] = [
    { $or: [{ faculty: null }, { faculty: user.faculty }] },
  ];
  visibility.push({
    $or: [
      { status: 'published' },
      ...(appliedOpportunityIds.length > 0 ? [{ _id: { $in: appliedOpportunityIds } }] : []),
    ],
  });
  return { $and: visibility };
}

/**
 * Ranks open opportunities for a student, excluding applied, closed, and cancelled events.
 * Full events remain visible but are always placed after events with available capacity.
 */
async function buildRecommendedOpportunities(
  opportunities: OpportunityLean[],
  applicationsByOpportunity: Map<string, ApplicationLean>,
  user: PublicUser
): Promise<OpportunityDTO[]> {
  const candidates = opportunities.filter(
    (opportunity) =>
      opportunity.status === 'published' &&
      !applicationsByOpportunity.has(opportunity._id.toString()) &&
      evaluateOpportunityPhase(opportunity) === 'upcoming'
  );

  const context = await buildRecommendationContext(user);
  return rankRecommendedOpportunities(candidates, context).map((entry) => ({
    ...decorateOpportunity(entry.opportunity),
    recommendationScore: entry.recommendationScore,
    matchedFields: entry.matchedFields,
    isFull: entry.isFull,
    waitlistAvailable: entry.isFull,
  }));
}

/**
 * Lists opportunities visible to the authenticated role, with computed Cairo phase metadata.
 */
export async function listOpportunities(
  query: OpportunityListQuery,
  user: PublicUser
): Promise<OpportunityListResult> {
  const status = assertQueryValue<OpportunityStatus>(
    query.status,
    OPPORTUNITY_STATUSES,
    'حالة الفرصة غير صالحة'
  );
  const phase = assertQueryValue<OpportunityPhase>(
    query.phase,
    OPPORTUNITY_PHASES,
    'مرحلة الفرصة غير صالحة'
  );
  const field = assertQueryValue<InterestKey>(
    query.field,
    INTEREST_KEYS,
    'مجال الاهتمام غير صالح'
  );
  const faculty = assertQueryValue<Faculty>(
    user.role === 'admin' ? query.faculty : undefined,
    FACULTIES,
    'الكلية المستهدفة غير صالحة'
  );

  const appliedOpportunityIds =
    user.role === 'student' ? await findAppliedOpportunityIds(user.id) : [];
  const filter = buildVisibilityFilter(user, appliedOpportunityIds);

  if (status) {
    filter.status = status;
  }
  if (field) {
    filter.fields = field;
  }
  if (faculty) {
    filter.faculty = faculty;
  }

  let opportunities = await Opportunity.find(filter)
    .sort({ startAt: 1, createdAt: 1 })
    .lean<OpportunityLean[]>();

  if (phase) {
    opportunities = opportunities.filter(
      (opportunity) => evaluateOpportunityPhase(opportunity) === phase
    );
  }

  if (user.role !== 'student') {
    return { opportunities: opportunities.map((opportunity) => decorateOpportunity(opportunity)) };
  }

  const applications = await Application.find({
    user: new mongoose.Types.ObjectId(user.id),
    opportunity: { $in: opportunities.map((opportunity) => opportunity._id) },
  }).lean<ApplicationLean[]>();
  const applicationsByOpportunity = new Map(
    applications.map((application) => [application.opportunity.toString(), application])
  );

  if (query.sort === 'recommended') {
    return {
      opportunities: await buildRecommendedOpportunities(
        opportunities,
        applicationsByOpportunity,
        user
      ),
    };
  }

  return {
    opportunities: opportunities.map((opportunity) =>
      decorateOpportunity(opportunity, applicationsByOpportunity.get(opportunity._id.toString()))
    ),
  };
}

/**
 * Loads a single opportunity visible to the authenticated role.
 */
export async function getOpportunityById(
  id: string,
  user: PublicUser
): Promise<OpportunityDTO> {
  assertValidOpportunityId(id);
  const appliedOpportunityIds =
    user.role === 'student' ? await findAppliedOpportunityIds(user.id) : [];
  const filter = {
    ...buildVisibilityFilter(user, appliedOpportunityIds),
    _id: new mongoose.Types.ObjectId(id),
  };

  const opportunity = await Opportunity.findOne(filter).lean<OpportunityLean>();
  if (!opportunity) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }

  const myApplication =
    user.role === 'student'
      ? (await Application.findOne({
          opportunity: opportunity._id,
          user: new mongoose.Types.ObjectId(user.id),
        }).lean<ApplicationLean>()) ?? undefined
      : undefined;

  return decorateOpportunity(opportunity, myApplication ?? undefined);
}

/**
 * Resolves the faculty targeted by an opportunity payload, forcing a dean's own faculty.
 */
function resolveTargetFaculty(
  requestedFaculty: Faculty | null | undefined,
  user: PublicUser
): Faculty | null {
  if (user.role === 'dean') {
    if (!user.faculty) {
      throw new AppError(403, 'غير مصرح لك بالوصول إلى هذا المورد');
    }
    return user.faculty;
  }
  return requestedFaculty ?? null;
}

/**
 * Creates a draft opportunity owned by the authenticated admin or dean.
 */
export async function createOpportunity(
  payload: OpportunityInput,
  user: PublicUser
): Promise<OpportunityDTO> {
  const created = await Opportunity.create({
    title: payload.title,
    description: payload.description,
    requirements: payload.requirements,
    fields: payload.fields,
    activityType: payload.activityType,
    location: payload.location,
    startAt: payload.startAt,
    endAt: payload.endAt,
    registrationDeadline: payload.registrationDeadline,
    hours: payload.hours,
    contactName: payload.contactName,
    contactPhone: payload.contactPhone,
    contactEmail: payload.contactEmail,
    faculty: resolveTargetFaculty(payload.faculty, user),
    slots: normalizeCategoryCounts(payload.slots),
    acceptedCounts: createEmptyCategoryCounts(),
    approvalMode: payload.approvalMode,
    status: 'draft',
    createdBy: new mongoose.Types.ObjectId(user.id),
  });

  const opportunity = await Opportunity.findById(created._id).lean<OpportunityLean>();
  if (!opportunity) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  return decorateOpportunity(opportunity);
}

export function assertCanManageOpportunity(opportunity: OpportunityLean, user: PublicUser): void {
  if (user.role === 'admin') {
    return;
  }
  if (
    user.role === 'dean' &&
    opportunity.faculty === user.faculty &&
    opportunity.createdBy.toString() === user.id
  ) {
    return;
  }
  throw new AppError(404, 'الفرصة التطوعية غير موجودة');
}

function assertOpportunityReadable(opportunity: OpportunityLean, user: PublicUser): void {
  if (user.role === 'admin') {
    return;
  }
  if (user.role === 'dean' && (opportunity.faculty === null || opportunity.faculty === user.faculty)) {
    return;
  }
  throw new AppError(404, 'الفرصة التطوعية غير موجودة');
}

export async function findManagedOpportunity(
  id: string,
  user: PublicUser
): Promise<OpportunityLean> {
  assertValidOpportunityId(id);
  const opportunity = await Opportunity.findById(id).lean<OpportunityLean>();
  if (!opportunity) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  assertCanManageOpportunity(opportunity, user);
  return opportunity;
}

function assertEditableStatus(opportunity: OpportunityLean): void {
  if (opportunity.status === 'completed' || opportunity.status === 'cancelled') {
    throw new AppError(409, 'لا يمكن تعديل فرصة مكتملة أو ملغاة');
  }
}

function assertFieldsUnlockedForAcceptedApplicants(
  opportunity: OpportunityLean,
  payload: OpportunityUpdateInput,
  user: PublicUser
): void {
  const acceptedTotal = CATEGORIES.reduce(
    (total, category) => total + opportunity.acceptedCounts[category],
    0
  );
  if (acceptedTotal === 0) {
    return;
  }

  if (payload.hours !== undefined && payload.hours !== opportunity.hours) {
    throw new AppError(409, 'لا يمكن تعديل عدد الساعات بعد قبول متطوعين');
  }
  if (payload.startAt && payload.startAt.getTime() !== opportunity.startAt.getTime()) {
    throw new AppError(409, 'لا يمكن تعديل وقت البدء بعد قبول متطوعين');
  }
  if (payload.endAt && payload.endAt.getTime() !== opportunity.endAt.getTime()) {
    throw new AppError(409, 'لا يمكن تعديل وقت الانتهاء بعد قبول متطوعين');
  }
  if (
    payload.faculty !== undefined &&
    user.role !== 'dean' &&
    payload.faculty !== opportunity.faculty
  ) {
    throw new AppError(409, 'لا يمكن تعديل الكلية المستهدفة بعد قبول متطوعين');
  }

  for (const category of CATEGORIES) {
    const requestedSlots = payload.slots?.[category];
    if (requestedSlots !== undefined && requestedSlots < opportunity.acceptedCounts[category]) {
      throw new AppError(
        409,
        `لا يمكن تقليل مقاعد ${category} إلى أقل من عدد المقبولين الحالي`
      );
    }
  }
}

/**
 * Updates a draft or published opportunity while enforcing post-acceptance edit locks.
 */
export async function updateOpportunity(
  id: string,
  payload: OpportunityUpdateInput,
  user: PublicUser
): Promise<OpportunityDTO> {
  const opportunity = await findManagedOpportunity(id, user);
  assertEditableStatus(opportunity);
  assertFieldsUnlockedForAcceptedApplicants(opportunity, payload, user);

  const nextStartAt = payload.startAt ?? opportunity.startAt;
  const nextEndAt = payload.endAt ?? opportunity.endAt;
  const nextDeadline = payload.registrationDeadline ?? opportunity.registrationDeadline;

  if (nextEndAt.getTime() <= nextStartAt.getTime()) {
    throw new AppError(400, 'وقت الانتهاء يجب أن يكون بعد وقت البدء');
  }
  if (nextDeadline.getTime() > nextStartAt.getTime()) {
    throw new AppError(400, 'موعد غلق التسجيل يجب أن يكون قبل أو يساوي وقت البدء');
  }

  const nextSlots = { ...opportunity.slots, ...(payload.slots ?? {}) };
  if (!hasPositiveSlot(nextSlots)) {
    throw new AppError(400, 'يجب تخصيص مقعد واحد على الأقل لإحدى الفئات');
  }

  const updateFields: Record<string, unknown> = { ...payload, slots: nextSlots };
  if (user.role === 'dean') {
    updateFields.faculty = user.faculty;
  }

  const updated = await Opportunity.findByIdAndUpdate(
    opportunity._id,
    { $set: updateFields },
    { returnDocument: 'after', runValidators: true }
  ).lean<OpportunityLean>();

  if (!updated) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  return decorateOpportunity(updated);
}

/**
 * Publishes a draft opportunity.
 */
export async function publishOpportunity(
  id: string,
  user: PublicUser
): Promise<OpportunityDTO> {
  const opportunity = await findManagedOpportunity(id, user);
  if (opportunity.status !== 'draft') {
    throw new AppError(409, 'لا يمكن نشر فرصة ليست في حالة مسودة');
  }

  const updated = await Opportunity.findByIdAndUpdate(
    opportunity._id,
    { $set: { status: 'published' } },
    { returnDocument: 'after', runValidators: true }
  ).lean<OpportunityLean>();
  if (!updated) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  return decorateOpportunity(updated);
}

/**
 * Cancels an opportunity, cancels its active applications, and resets accepted counters.
 */
export async function cancelOpportunity(
  id: string,
  user: PublicUser
): Promise<OpportunityDTO> {
  const opportunity = await findManagedOpportunity(id, user);
  if (opportunity.status === 'completed') {
    throw new AppError(409, 'لا يمكن إلغاء فرصة مكتملة');
  }
  if (opportunity.status === 'cancelled') {
    return decorateOpportunity(opportunity);
  }

  const now = new Date();
  const updated = await Opportunity.findByIdAndUpdate(
    opportunity._id,
    {
      $set: {
        status: 'cancelled',
        acceptedCounts: createEmptyCategoryCounts(),
      },
    },
    { returnDocument: 'after', runValidators: true }
  ).lean<OpportunityLean>();

  await Application.updateMany(
    {
      opportunity: opportunity._id,
      status: { $in: ['pending', 'accepted', 'waitlisted'] },
    },
    { $set: { status: 'cancelled', decidedAt: now } }
  );

  if (!updated) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  return decorateOpportunity(updated);
}

/**
 * Lists applicants for an opportunity, filtered for read-only dean views on all-faculty events.
 */
export async function listOpportunityApplicants(
  id: string,
  user: PublicUser,
  query: Record<string, unknown>
): Promise<OpportunityApplicantsResult> {
  assertValidOpportunityId(id);
  const opportunity = await Opportunity.findById(id).lean<OpportunityLean>();
  if (!opportunity) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  assertOpportunityReadable(opportunity, user);

  const parsedQuery = applicationListQuerySchema.safeParse(query);
  if (!parsedQuery.success) {
    throw new AppError(
      400,
      parsedQuery.error.issues[0]?.message ?? 'معايير تصفية الطلبات غير صالحة'
    );
  }

  const readOnly =
    user.role === 'dean' &&
    (opportunity.faculty === null || opportunity.createdBy.toString() !== user.id);

  const filter: Record<string, unknown> = { opportunity: opportunity._id };
  if (readOnly) {
    filter.faculty = user.faculty;
  }
  if (parsedQuery.data.status) {
    filter.status = parsedQuery.data.status as ApplicationStatus;
  }
  if (parsedQuery.data.category) {
    filter.category = parsedQuery.data.category;
  }

  const applications = await Application.find(filter)
    .sort({ appliedAt: 1, createdAt: 1 })
    .populate('volunteer')
    .lean<ApplicationWithVolunteerLean[]>();

  return { applications, readOnly };
}

/**
 * Finds an opportunity that a student may apply to, enforcing faculty visibility.
 */
export async function findPublishedOpportunityForApplicant(
  id: string,
  user: PublicUser
): Promise<OpportunityLean> {
  assertValidOpportunityId(id);
  const opportunity = await Opportunity.findOne({
    _id: new mongoose.Types.ObjectId(id),
    status: 'published',
    $or: [{ faculty: null }, { faculty: user.faculty }],
  }).lean<OpportunityLean>();

  if (!opportunity) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  return opportunity;
}
