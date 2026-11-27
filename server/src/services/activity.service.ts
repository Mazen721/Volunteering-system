import type { PipelineStage } from 'mongoose';
import mongoose from 'mongoose';
import type { ActivityStatus } from '../constants/enums.js';
import { ACTIVITY_STATUSES, ACTIVITY_TYPES, CATEGORIES, FACULTIES } from '../constants/enums.js';
import type { ScopeFilter } from '../middleware/auth.js';
import { Activity } from '../models/Activity.js';
import type { ActivityLean, ActivityWithVolunteerLean } from '../models/Activity.js';
import { Volunteer } from '../models/Volunteer.js';
import type { ActivityInput, ActivityUpdateInput } from '../validators/activity.schema.js';
import { AppError } from '../utils/errors.js';
import { escapeRegex } from '../utils/volunteerLookup.js';

export interface ActivityListQuery {
  status?: string;
  type?: string;
  volunteerId?: string;
  category?: string;
  faculty?: string;
  search?: string;
  page?: string | number;
  limit?: string | number;
}

export interface ActivityListResult {
  activities: ActivityWithVolunteerLean[];
  total: number;
  page: number;
  pages: number;
}

/**
 * Resolves a faculty ScopeFilter into an Activity query filter using Volunteer IDs.
 */
export async function scopeActivities(scope: ScopeFilter): Promise<Record<string, unknown>> {
  if (!scope.faculty) {
    return {};
  }
  const volunteerIds = await Volunteer.distinct('_id', { faculty: scope.faculty });
  return { volunteer: { $in: volunteerIds } };
}

/**
 * Splits the list filters into the part that can $match Activities BEFORE
 * the volunteer join (the activity's own fields, plus volunteer-side
 * equality filters resolved to volunteer ids through the small indexed
 * Volunteer collection) and the free-text search, which spans joined
 * fields and must stay after the $lookup. The old pipeline joined the
 * whole collection first and matched afterwards, so no Activity index
 * could serve any list call.
 */
function assertActivityFilterValue<T extends string>(
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

async function buildActivityFilter(
  query: ActivityListQuery,
  scope: ScopeFilter = {}
): Promise<{ preMatch: Record<string, unknown>; searchMatch: Record<string, unknown> | null }> {
  // Enum-validate the filters like the sibling list services do (W-6):
  // arbitrary strings used to flow straight into the aggregation, where a
  // crafted value could widen the match instead of failing fast with 400.
  const status = assertActivityFilterValue(query.status, ACTIVITY_STATUSES, 'حالة النشاط غير صالحة');
  const type = assertActivityFilterValue(query.type, ACTIVITY_TYPES, 'نوع النشاط غير صالح');
  const category = assertActivityFilterValue(query.category, CATEGORIES, 'فئة المتطوع غير صالحة');
  const faculty = assertActivityFilterValue(
    scope.faculty ?? query.faculty,
    FACULTIES,
    'الكلية غير صالحة'
  );

  const preMatch: Record<string, unknown> = {};
  if (status) {
    preMatch.status = status;
  }
  if (type) {
    preMatch.type = type;
  }

  const volunteerFilter: Record<string, unknown> = {};
  if (query.volunteerId) {
    volunteerFilter.volunteerId = query.volunteerId;
  }
  if (category) {
    volunteerFilter.category = category;
  }
  if (faculty) {
    volunteerFilter.faculty = faculty;
  }
  if (Object.keys(volunteerFilter).length > 0) {
    preMatch.volunteer = {
      $in: await Volunteer.distinct('_id', volunteerFilter),
    };
  }

  let searchMatch: Record<string, unknown> | null = null;
  if (query.search?.trim()) {
    const pattern = new RegExp(escapeRegex(query.search.trim()), 'i');
    searchMatch = {
      $or: [
        { title: pattern },
        { supervisor: pattern },
        { 'volunteer.fullName': pattern },
        { 'volunteer.volunteerId': pattern },
      ],
    };
  }
  return { preMatch, searchMatch };
}

export async function listActivities(
  query: ActivityListQuery = {},
  scope: ScopeFilter = {}
): Promise<ActivityListResult> {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const { preMatch, searchMatch } = await buildActivityFilter(query, scope);

  const pipeline: PipelineStage[] = [];
  if (Object.keys(preMatch).length > 0) {
    pipeline.push({ $match: preMatch });
  }
  pipeline.push(
    {
      $lookup: {
        from: 'volunteers',
        localField: 'volunteer',
        foreignField: '_id',
        as: 'volunteer',
      },
    },
    { $unwind: '$volunteer' }
  );
  if (searchMatch) {
    pipeline.push({ $match: searchMatch });
  }

  pipeline.push(
    { $sort: { date: -1, createdAt: -1 } },
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        meta: [{ $count: 'total' }],
      },
    }
  );

  interface ActivityFacetResult {
    items: ActivityWithVolunteerLean[];
    meta: { total: number }[];
  }

  const [aggregated] = await Activity.aggregate<ActivityFacetResult>(pipeline);
  const total = aggregated.meta[0]?.total || 0;

  return {
    activities: aggregated.items,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export interface CreateActivityResult {
  activity: ActivityWithVolunteerLean | null;
  warning?: string;
}

export async function createActivity(
  payload: ActivityInput,
  scope: ScopeFilter = {}
): Promise<CreateActivityResult> {
  const volunteer = await Volunteer.findOne({
    volunteerId: payload.volunteerId,
    ...(scope.faculty ? { faculty: scope.faculty } : {}),
  }).lean();
  if (!volunteer) {
    throw new AppError(404, 'المتطوع غير موجود بهذا الرقم التعريفي');
  }

  const duplicate = await Activity.exists({
    volunteer: volunteer._id,
    title: payload.title,
    date: payload.date,
  });

  const created = await Activity.create({
    volunteer: volunteer._id,
    title: payload.title,
    type: payload.type,
    hours: payload.hours,
    date: payload.date,
    status: payload.status,
    supervisor: payload.supervisor,
  });

  const activity = await Activity.findById(created._id)
    .populate('volunteer')
    .lean<ActivityWithVolunteerLean>();
  return {
    activity,
    ...(duplicate ? { warning: 'تنبيه: يوجد نشاط مسجل بنفس العنوان والتاريخ لهذا المتطوع' } : {}),
  };
}

function assertValidObjectId(id: string): void {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(400, 'معرف النشاط غير صالح');
  }
}

export async function updateActivity(
  id: string,
  payload: ActivityUpdateInput,
  scope: ScopeFilter = {}
): Promise<ActivityWithVolunteerLean> {
  assertValidObjectId(id);
  const scopeFilter = await scopeActivities(scope);
  const updated = await Activity.findOneAndUpdate(
    { _id: id, ...scopeFilter },
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  )
    .populate('volunteer')
    .lean<ActivityWithVolunteerLean>();

  if (!updated) {
    throw new AppError(404, 'النشاط غير موجود');
  }
  return updated;
}

export async function updateActivityStatus(
  id: string,
  status: ActivityStatus,
  scope: ScopeFilter = {}
): Promise<ActivityWithVolunteerLean> {
  return updateActivity(id, { status }, scope);
}

export async function deleteActivity(
  id: string,
  scope: ScopeFilter = {}
): Promise<{ message: string }> {
  assertValidObjectId(id);
  const scopeFilter = await scopeActivities(scope);
  const deleted = await Activity.findOneAndDelete({ _id: id, ...scopeFilter }).lean<ActivityLean>();
  if (!deleted) {
    throw new AppError(404, 'النشاط غير موجود');
  }
  return { message: 'تم حذف النشاط بنجاح' };
}
