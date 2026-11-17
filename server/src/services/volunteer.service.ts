import type { PipelineStage, Types } from 'mongoose';
import type { ActivityStatus, Faculty, VolunteerCategory } from '../constants/enums.js';
import { ACTIVITY_STATUSES, CATEGORY_LABELS } from '../constants/enums.js';
import type { ScopeFilter } from '../middleware/auth.js';
import { Activity } from '../models/Activity.js';
import type { ActivityLean } from '../models/Activity.js';
import { User } from '../models/User.js';
import type { VolunteerFilter, VolunteerLean } from '../models/Volunteer.js';
import { Volunteer } from '../models/Volunteer.js';
import type { VolunteerInput, VolunteerUpdateInput } from '../validators/volunteer.schema.js';
import { AppError } from '../utils/errors.js';
import {
  buildVolunteerFilter,
  escapeRegex,
  findVolunteerOrThrow,
  getCertificateHours,
} from '../utils/volunteerLookup.js';
import type { VolunteerStatsRow } from './stats.service.js';
import { buildVolunteerStatsStages } from './stats.service.js';

export interface VolunteerListQuery {
  search?: string;
  category?: string;
  faculty?: string;
  eligibility?: string;
  activityStatus?: string;
  page?: string | number;
  limit?: string | number;
}

export interface VolunteerWithLabel extends VolunteerStatsRow {
  categoryLabel: string;
  linkedUserId?: string | null;
}

export interface VolunteerListResult {
  volunteers: VolunteerWithLabel[];
  total: number;
  page: number;
  pages: number;
  certificateHours: number;
}

export interface VolunteerProfileResult {
  volunteer: VolunteerWithLabel;
  activities: ActivityLean[];
  certificateHours: number;
}

function buildVolunteerMatchFilter(
  { search, category, faculty }: Pick<VolunteerListQuery, 'search' | 'category' | 'faculty'>,
  scope: ScopeFilter = {}
): VolunteerFilter {
  const filter: VolunteerFilter = {};
  if (category) {
    filter.category = category as VolunteerCategory;
  }
  const effectiveFaculty = scope.faculty ?? (faculty as Faculty | undefined);
  if (effectiveFaculty) {
    filter.faculty = effectiveFaculty;
  }
  if (search?.trim()) {
    const pattern = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ volunteerId: pattern }, { fullName: pattern }, { faculty: pattern }];
  }
  return filter;
}

function attachCategoryLabels(volunteers: VolunteerStatsRow[]): VolunteerWithLabel[] {
  return volunteers.map((volunteer) => ({
    ...volunteer,
    categoryLabel: CATEGORY_LABELS[volunteer.category],
  }));
}

async function fetchLinkedStudentUserIds(
  volunteerIds: Types.ObjectId[]
): Promise<Map<string, string>> {
  if (volunteerIds.length === 0) {
    return new Map();
  }
  const users = await User.find({ volunteer: { $in: volunteerIds }, role: 'student' })
    .select('_id volunteer')
    .lean<{ _id: Types.ObjectId; volunteer: Types.ObjectId | null }[]>();

  const userByVolunteerId = new Map<string, string>();
  for (const user of users) {
    if (user.volunteer) {
      userByVolunteerId.set(user.volunteer.toString(), user._id.toString());
    }
  }
  return userByVolunteerId;
}

export async function listAllVolunteersWithStats(
  scope: ScopeFilter = {}
): Promise<VolunteerWithLabel[]> {
  const certificateHours = await getCertificateHours();
  const matchFilter: VolunteerFilter = scope.faculty ? { faculty: scope.faculty } : {};
  const rows = await Volunteer.aggregate<VolunteerStatsRow>([
    ...buildVolunteerStatsStages(matchFilter, certificateHours),
    { $sort: { approvedHours: -1, volunteerId: 1 } },
  ]);
  return attachCategoryLabels(rows);
}

export async function listVolunteers(
  query: VolunteerListQuery = {},
  scope: ScopeFilter = {}
): Promise<VolunteerListResult> {
  if (
    query.activityStatus &&
    !(ACTIVITY_STATUSES as readonly string[]).includes(query.activityStatus)
  ) {
    throw new AppError(400, 'حالة الاعتماد غير صالحة');
  }

  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const certificateHours = await getCertificateHours();
  const matchStage = buildVolunteerMatchFilter(query, scope);

  const pipeline: PipelineStage[] = [
    ...buildVolunteerStatsStages(
      matchStage,
      certificateHours,
      query.activityStatus as ActivityStatus | undefined
    ),
  ];
  if (query.eligibility === 'eligible') {
    pipeline.push({ $match: { eligible: true } });
  } else if (query.eligibility === 'in_progress') {
    pipeline.push({ $match: { eligible: false } });
  }

  pipeline.push(
    { $sort: { approvedHours: -1, volunteerId: 1 } },
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        meta: [{ $count: 'total' }],
      },
    }
  );

  interface VolunteerFacetResult {
    items: VolunteerStatsRow[];
    meta: { total: number }[];
  }

  const [aggregated] = await Volunteer.aggregate<VolunteerFacetResult>(pipeline);
  const total = aggregated.meta[0]?.total || 0;
  const linkedUsers = await fetchLinkedStudentUserIds(aggregated.items.map((item) => item._id));
  const volunteers = attachCategoryLabels(aggregated.items).map((volunteer) => ({
    ...volunteer,
    linkedUserId: linkedUsers.get(volunteer._id.toString()) ?? null,
  }));

  return {
    volunteers,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    certificateHours,
  };
}

export async function getVolunteerProfile(
  identifier: string,
  scope: ScopeFilter = {}
): Promise<VolunteerProfileResult> {
  const volunteerDoc = await findVolunteerOrThrow(identifier, scope);
  const certificateHours = await getCertificateHours();

  const [[aggregated], activities, linkedUsers] = await Promise.all([
    Volunteer.aggregate<VolunteerStatsRow>(
      buildVolunteerStatsStages({ _id: volunteerDoc._id }, certificateHours)
    ),
    Activity.find({ volunteer: volunteerDoc._id })
      .sort({ date: -1, createdAt: -1 })
      .lean<ActivityLean[]>(),
    fetchLinkedStudentUserIds([volunteerDoc._id]),
  ]);

  if (!aggregated) {
    throw new AppError(404, 'المتطوع غير موجود');
  }

  return {
    volunteer: {
      ...aggregated,
      categoryLabel: CATEGORY_LABELS[aggregated.category],
      linkedUserId: linkedUsers.get(volunteerDoc._id.toString()) ?? null,
    },
    activities,
    certificateHours,
  };
}

export async function createVolunteer(
  payload: VolunteerInput,
  scope: ScopeFilter = {}
): Promise<VolunteerLean> {
  const effectivePayload: VolunteerInput = scope.faculty
    ? { ...payload, faculty: scope.faculty }
    : payload;
  const created = await Volunteer.create(effectivePayload);
  return created.toObject<VolunteerLean>();
}

export async function updateVolunteer(
  identifier: string,
  payload: VolunteerUpdateInput,
  scope: ScopeFilter = {}
): Promise<VolunteerLean> {
  const effectivePayload: VolunteerUpdateInput = scope.faculty
    ? { ...payload, faculty: scope.faculty }
    : payload;
  const updated = await Volunteer.findOneAndUpdate(
    buildVolunteerFilter(identifier, scope),
    { $set: effectivePayload },
    { returnDocument: 'after', runValidators: true }
  ).lean<VolunteerLean>();

  if (!updated) {
    throw new AppError(404, 'المتطوع غير موجود');
  }
  return updated;
}

export async function deleteVolunteer(
  identifier: string,
  scope: ScopeFilter = {}
): Promise<{ message: string }> {
  const volunteer = await findVolunteerOrThrow(identifier, scope);
  const hasActivities = await Activity.exists({ volunteer: volunteer._id });
  if (hasActivities) {
    throw new AppError(409, 'لا يمكن حذف متطوع لديه أنشطة مسجلة، يرجى حذف أنشطته أولاً');
  }

  const hasLinkedUser = await User.exists({ volunteer: volunteer._id });
  if (hasLinkedUser) {
    throw new AppError(409, 'لا يمكن حذف متطوع مرتبط بحساب مستخدم، يرجى مراجعة الحساب المرتبط أولاً');
  }

  await Volunteer.deleteOne({ _id: volunteer._id });
  return { message: 'تم حذف المتطوع بنجاح' };
}
