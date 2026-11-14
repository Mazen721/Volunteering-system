import mongoose from 'mongoose';
import { Activity } from '../models/Activity.js';
import { Volunteer } from '../models/Volunteer.js';
import { AppError } from '../utils/errors.js';
import { escapeRegex } from '../utils/volunteerLookup.js';

function buildActivityFilter(query) {
  const match = {};
  if (query.status) {
    match.status = query.status;
  }
  if (query.type) {
    match.type = query.type;
  }
  if (query.volunteerId) {
    match['volunteer.volunteerId'] = query.volunteerId;
  }
  if (query.category) {
    match['volunteer.category'] = query.category;
  }
  if (query.faculty) {
    match['volunteer.faculty'] = query.faculty;
  }
  if (query.search?.trim()) {
    const pattern = new RegExp(escapeRegex(query.search.trim()), 'i');
    match.$or = [
      { title: pattern },
      { supervisor: pattern },
      { 'volunteer.fullName': pattern },
      { 'volunteer.volunteerId': pattern },
    ];
  }
  return match;
}

export async function listActivities(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const matchStage = buildActivityFilter(query);

  const pipeline = [
    {
      $lookup: {
        from: 'volunteers',
        localField: 'volunteer',
        foreignField: '_id',
        as: 'volunteer',
      },
    },
    { $unwind: '$volunteer' },
  ];

  if (Object.keys(matchStage).length > 0) {
    pipeline.push({ $match: matchStage });
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

  const [aggregated] = await Activity.aggregate(pipeline);
  const total = aggregated.meta[0]?.total || 0;

  return {
    activities: aggregated.items,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function createActivity(payload) {
  const volunteer = await Volunteer.findOne({ volunteerId: payload.volunteerId }).lean();
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

  const activity = await Activity.findById(created._id).populate('volunteer').lean();
  return {
    activity,
    ...(duplicate ? { warning: 'تنبيه: يوجد نشاط مسجل بنفس العنوان والتاريخ لهذا المتطوع' } : {}),
  };
}

function assertValidObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(400, 'معرف النشاط غير صالح');
  }
}

export async function updateActivity(id, payload) {
  assertValidObjectId(id);
  const updated = await Activity.findByIdAndUpdate(
    id,
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  )
    .populate('volunteer')
    .lean();

  if (!updated) {
    throw new AppError(404, 'النشاط غير موجود');
  }
  return updated;
}

export async function updateActivityStatus(id, status) {
  return updateActivity(id, { status });
}

export async function deleteActivity(id) {
  assertValidObjectId(id);
  const deleted = await Activity.findByIdAndDelete(id).lean();
  if (!deleted) {
    throw new AppError(404, 'النشاط غير موجود');
  }
  return { message: 'تم حذف النشاط بنجاح' };
}
