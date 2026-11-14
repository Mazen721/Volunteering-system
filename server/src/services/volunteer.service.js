import { CATEGORY_LABELS } from '../constants/enums.js';
import { Activity } from '../models/Activity.js';
import { Volunteer } from '../models/Volunteer.js';
import { AppError } from '../utils/errors.js';
import {
  buildVolunteerFilter,
  escapeRegex,
  findVolunteerOrThrow,
  getCertificateHours,
} from '../utils/volunteerLookup.js';
import { buildVolunteerStatsStages } from './stats.service.js';

function buildVolunteerMatchFilter({ search, category, faculty }) {
  const filter = {};
  if (category) {
    filter.category = category;
  }
  if (faculty) {
    filter.faculty = faculty;
  }
  if (search?.trim()) {
    const pattern = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ volunteerId: pattern }, { fullName: pattern }, { faculty: pattern }];
  }
  return filter;
}

export async function listVolunteers(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const certificateHours = await getCertificateHours();
  const matchStage = buildVolunteerMatchFilter(query);

  const pipeline = [...buildVolunteerStatsStages(matchStage, certificateHours)];
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

  const [aggregated] = await Volunteer.aggregate(pipeline);
  const total = aggregated.meta[0]?.total || 0;
  const volunteers = aggregated.items.map((volunteer) => ({
    ...volunteer,
    categoryLabel: CATEGORY_LABELS[volunteer.category],
  }));

  return {
    volunteers,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    certificateHours,
  };
}

export async function getVolunteerProfile(identifier) {
  const volunteerDoc = await findVolunteerOrThrow(identifier);
  const certificateHours = await getCertificateHours();

  const [aggregated] = await Volunteer.aggregate(
    buildVolunteerStatsStages({ _id: volunteerDoc._id }, certificateHours)
  );
  const activities = await Activity.find({ volunteer: volunteerDoc._id })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  return {
    volunteer: {
      ...aggregated,
      categoryLabel: CATEGORY_LABELS[aggregated.category],
    },
    activities,
    certificateHours,
  };
}

export async function createVolunteer(payload) {
  const created = await Volunteer.create(payload);
  return created.toObject();
}

export async function updateVolunteer(identifier, payload) {
  const updated = await Volunteer.findOneAndUpdate(
    buildVolunteerFilter(identifier),
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  ).lean();

  if (!updated) {
    throw new AppError(404, 'المتطوع غير موجود');
  }
  return updated;
}

export async function deleteVolunteer(identifier) {
  const volunteer = await findVolunteerOrThrow(identifier);
  const hasActivities = await Activity.exists({ volunteer: volunteer._id });
  if (hasActivities) {
    throw new AppError(409, 'لا يمكن حذف متطوع لديه أنشطة مسجلة، يرجى حذف أنشطته أولاً');
  }

  await Volunteer.deleteOne({ _id: volunteer._id });
  return { message: 'تم حذف المتطوع بنجاح' };
}
