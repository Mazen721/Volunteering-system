import { createHash } from 'node:crypto';
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
  defaultCoverPreset,
} from '../constants/enums.js';
import { Application } from '../models/Application.js';
import type { ApplicationLean, ApplicationWithVolunteerLean } from '../models/Application.js';
import { User } from '../models/User.js';
import type { CategoryCounts, OpportunityLean } from '../models/Opportunity.js';
import { Opportunity, createEmptyCategoryCounts, hasPositiveSlot } from '../models/Opportunity.js';
import type { PublicUser } from './auth.service.js';
import type { OpportunityInput, OpportunityUpdateInput } from '../validators/opportunity.schema.js';
import { applicationListQuerySchema } from '../validators/application.schema.js';
import { evaluateOpportunityPhase, isCheckInWindowOpen } from '../utils/cairoTime.js';
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
  page?: string;
  limit?: string;
}

/** Hard ceiling for one list page; clients page through with limit=200. */
export const OPPORTUNITY_LIST_MAX_LIMIT = 500;

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
  total: number;
  page: number;
  pages: number;
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
    checkInOpen: opportunity.status === 'published' && isCheckInWindowOpen(opportunity),
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
        {
          $or: [{ status: { $ne: 'draft' } }, { createdBy: new mongoose.Types.ObjectId(user.id) }],
        },
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
 * Translates a phase filter into the equivalent date-range predicates so
 * MongoDB does the filtering (the old code fetched every visible
 * opportunity and dropped the wrong phases in JS). The boundaries mirror
 * evaluateOpportunityPhase exactly.
 */
function buildPhaseDateFilter(phase: OpportunityPhase, now: Date): Record<string, unknown> {
  switch (phase) {
    case 'upcoming':
      return { registrationDeadline: { $gt: now } };
    case 'registration_closed':
      return { registrationDeadline: { $lte: now }, startAt: { $gt: now } };
    case 'in_progress':
      return { startAt: { $lte: now }, endAt: { $gte: now } };
    case 'ended':
      return { endAt: { $lt: now } };
  }
}

/**
 * Replaces the full custom-cover data URLs on a page of list DTOs with the
 * cover route path (`/opportunities/<id>/cover`) for the opportunities that
 * have one, and '' for the rest. List payloads used to inline every cover
 * (~1 MB of base64 each); the bytes are now served once, cacheably, by the
 * cover route. Detail responses keep the full data URL (the edit form
 * round-trips it), so this mapping applies to LIST DTOs only.
 */
export async function applyCoverPathsToListDtos(dtos: OpportunityDTO[]): Promise<void> {
  if (dtos.length === 0) {
    return;
  }
  const withCover = await Opportunity.find({
    _id: { $in: dtos.map((dto) => dto._id) },
    customCover: { $nin: [null, ''] },
  })
    .select('_id')
    .lean<{ _id: mongoose.Types.ObjectId }[]>();
  const coverIds = new Set(withCover.map((row) => row._id.toString()));
  for (const dto of dtos) {
    dto.customCover = coverIds.has(dto._id.toString())
      ? `/opportunities/${dto._id.toString()}/cover`
      : '';
  }
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
  const field = assertQueryValue<InterestKey>(query.field, INTEREST_KEYS, 'مجال الاهتمام غير صالح');
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

  const now = new Date();
  const extraConditions: Record<string, unknown>[] = [];
  if (phase) {
    extraConditions.push(buildPhaseDateFilter(phase, now));
  }
  // Students discover only opportunities that have not ended; ended ones
  // live in their history («طلباتي»), which does not use this endpoint.
  // Pushing the predicate into the query keeps finished events' bytes off
  // the wire entirely (previously they were transferred, decorated, then
  // dropped by the client's own ended filter).
  if (user.role === 'student' && phase !== 'ended') {
    extraConditions.push({ endAt: { $gt: now } });
  }
  if (extraConditions.length > 0) {
    filter.$and = [...((filter.$and as Record<string, unknown>[] | undefined) ?? []), ...extraConditions];
  }

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(
    Math.max(Number(query.limit) || OPPORTUNITY_LIST_MAX_LIMIT, 1),
    OPPORTUNITY_LIST_MAX_LIMIT
  );
  const paginate = <T,>(rows: T[]): { pageRows: T[]; total: number; pages: number } => ({
    pageRows: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
    pages: Math.ceil(rows.length / limit) || 1,
  });

  // The cover bytes never travel in list payloads.
  if (user.role !== 'student') {
    const [total, opportunities] = await Promise.all([
      Opportunity.countDocuments(filter),
      Opportunity.find(filter)
        .select('-customCover')
        .sort({ startAt: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<OpportunityLean[]>(),
    ]);
    const decorated = opportunities.map((opportunity) => decorateOpportunity(opportunity));
    await applyCoverPathsToListDtos(decorated);
    return { opportunities: decorated, total, page, pages: Math.ceil(total / limit) || 1 };
  }

  const opportunities = await Opportunity.find(filter)
    .select('-customCover')
    .sort({ startAt: 1, createdAt: 1 })
    .lean<OpportunityLean[]>();

  const applications = await Application.find({
    user: new mongoose.Types.ObjectId(user.id),
    opportunity: { $in: opportunities.map((opportunity) => opportunity._id) },
  }).lean<ApplicationLean[]>();
  const applicationsByOpportunity = new Map(
    applications.map((application) => [application.opportunity.toString(), application])
  );

  if (query.sort === 'recommended') {
    const ranked = await buildRecommendedOpportunities(
      opportunities,
      applicationsByOpportunity,
      user
    );
    const { pageRows, total, pages } = paginate(ranked);
    await applyCoverPathsToListDtos(pageRows);
    return { opportunities: pageRows, total, page, pages };
  }

  const { pageRows, total, pages } = paginate(opportunities);
  const decorated = pageRows.map((opportunity) =>
    decorateOpportunity(opportunity, applicationsByOpportunity.get(opportunity._id.toString()))
  );
  await applyCoverPathsToListDtos(decorated);
  return { opportunities: decorated, total, page, pages };
}

export interface OpportunityCoverImage {
  contentType: string;
  body: Buffer;
  etag: string;
}

/**
 * Decodes an opportunity's stored custom cover for the public cover route.
 * The image is a display asset the organizer uploaded to be shown on the
 * board — the same exposure as the public CDN photo URLs the sister
 * projects use — addressed by an unguessable ObjectId. Returns null when
 * the opportunity does not exist or has no usable custom cover.
 */
export async function getOpportunityCoverImage(
  id: string
): Promise<OpportunityCoverImage | null> {
  if (!mongoose.isValidObjectId(id)) {
    return null;
  }
  const opportunity = await Opportunity.findById(id)
    .select('customCover')
    .lean<{ customCover?: string | null }>();
  const dataUrl = opportunity?.customCover;
  if (!dataUrl) {
    return null;
  }
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) {
    return null;
  }
  const body = Buffer.from(match[2] ?? '', 'base64');
  if (body.length === 0) {
    return null;
  }
  const etag = `"${createHash('sha256').update(dataUrl).digest('hex').slice(0, 32)}"`;
  return { contentType: match[1] ?? 'application/octet-stream', body, etag };
}

/**
 * Loads a single opportunity visible to the authenticated role.
 */
export async function getOpportunityById(id: string, user: PublicUser): Promise<OpportunityDTO> {
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
      ? ((await Application.findOne({
          opportunity: opportunity._id,
          user: new mongoose.Types.ObjectId(user.id),
        }).lean<ApplicationLean>()) ?? undefined)
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
    coverPreset: payload.coverPreset ?? defaultCoverPreset(payload.fields),
    customCover: payload.customCover ?? '',
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

/**
 * Mongo filter equivalent of {@link assertCanManageOpportunity}: admins manage every
 * opportunity, while a dean manages only opportunities of his own faculty that he
 * created himself. Used by list queries that must surface exactly the items the
 * caller is authorized to act on (completion, application decisions).
 */
export function buildManageScopeFilter(user: PublicUser): Record<string, unknown> {
  if (user.role === 'admin') {
    return {};
  }
  if (user.role === 'dean' && user.faculty) {
    return {
      faculty: user.faculty,
      createdBy: new mongoose.Types.ObjectId(user.id),
    };
  }
  return { _id: { $in: [] as mongoose.Types.ObjectId[] } };
}

function assertOpportunityReadable(opportunity: OpportunityLean, user: PublicUser): void {
  if (user.role === 'admin') {
    return;
  }
  if (
    user.role === 'dean' &&
    (opportunity.faculty === null || opportunity.faculty === user.faculty)
  ) {
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

/** True when the caller is the student appointed as attendance deputy for this opportunity. */
export function isAttendanceDeputy(opportunity: OpportunityLean, user: PublicUser): boolean {
  return (
    user.role === 'student' &&
    Boolean(opportunity.attendanceDeputy) &&
    opportunity.attendanceDeputy?.toString() === user.id
  );
}

/**
 * Loads an opportunity for the live attendance screen: managers (admin / owning dean)
 * always pass; a student passes only when appointed as this opportunity's attendance deputy.
 */
export async function findLiveOpportunity(
  id: string,
  user: PublicUser
): Promise<OpportunityLean> {
  assertValidOpportunityId(id);
  const opportunity = await Opportunity.findById(id).lean<OpportunityLean>();
  if (!opportunity) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  if (user.role === 'student') {
    if (!isAttendanceDeputy(opportunity, user)) {
      throw new AppError(404, 'الفرصة التطوعية غير موجودة');
    }
    return opportunity;
  }
  assertCanManageOpportunity(opportunity, user);
  return opportunity;
}

/**
 * Appoints (or clears) the attendance deputy for an opportunity. Only the opportunity's
 * manager can appoint, and the deputy must be an active student with an accepted
 * application for this opportunity — so the deputy is someone already attending it.
 */
export async function assignAttendanceDeputy(
  id: string,
  deputyUserId: string | null,
  user: PublicUser
): Promise<OpportunityDTO> {
  const opportunity = await findManagedOpportunity(id, user);
  if (opportunity.status === 'completed' || opportunity.status === 'cancelled') {
    throw new AppError(409, 'لا يمكن تعيين مسؤول حضور لفرصة مكتملة أو ملغاة');
  }

  if (deputyUserId !== null) {
    if (!mongoose.isValidObjectId(deputyUserId)) {
      throw new AppError(400, 'مسؤول الحضور غير صالح');
    }
    const deputy = await User.findById(deputyUserId).lean();
    if (!deputy || deputy.role !== 'student' || deputy.status !== 'active') {
      throw new AppError(400, 'مسؤول الحضور يجب أن يكون طالباً نشطاً');
    }
    const accepted = await Application.findOne({
      opportunity: opportunity._id,
      user: deputy._id,
      status: 'accepted',
    }).lean();
    if (!accepted) {
      throw new AppError(400, 'مسؤول الحضور يجب أن يكون من المقبولين في هذه الفرصة');
    }
  }

  const updated = await Opportunity.findByIdAndUpdate(
    opportunity._id,
    {
      $set: {
        attendanceDeputy: deputyUserId
          ? new mongoose.Types.ObjectId(deputyUserId)
          : null,
      },
    },
    { returnDocument: 'after', runValidators: true }
  ).lean<OpportunityLean>();
  if (!updated) {
    throw new AppError(404, 'الفرصة التطوعية غير موجودة');
  }
  return decorateOpportunity(updated);
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
      throw new AppError(409, `لا يمكن تقليل مقاعد ${category} إلى أقل من عدد المقبولين الحالي`);
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
export async function publishOpportunity(id: string, user: PublicUser): Promise<OpportunityDTO> {
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
export async function cancelOpportunity(id: string, user: PublicUser): Promise<OpportunityDTO> {
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
