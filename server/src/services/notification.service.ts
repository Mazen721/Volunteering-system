import { Application } from '../models/Application.js';
import { Notification } from '../models/Notification.js';
import type { NotificationLean } from '../models/Notification.js';
import type { PublicUser } from './auth.service.js';
import { findManagedOpportunity } from './opportunity.service.js';

export interface NotificationsResult {
  notifications: NotificationLean[];
  unreadCount: number;
}

export interface WarnAbsentResult {
  sent: number;
}

/** The signed-in user's own notifications, newest first, with the unread total. */
export async function listNotifications(user: PublicUser): Promise<NotificationsResult> {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ user: user.id }).sort({ createdAt: -1 }).limit(50).lean<NotificationLean[]>(),
    Notification.countDocuments({ user: user.id, read: false }),
  ]);
  return { notifications, unreadCount };
}

/** Marks every unread notification of the signed-in user as read. */
export async function markAllNotificationsRead(user: PublicUser): Promise<{ updated: number }> {
  const result = await Notification.updateMany(
    { user: user.id, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  return { updated: result.modifiedCount };
}

/**
 * Sends an in-app absence warning to every volunteer who was ACCEPTED for the
 * opportunity but never checked in. Authorization mirrors opportunity
 * completion exactly (findManagedOpportunity): admins manage everything,
 * deans only their own faculty's opportunities that they created, and
 * out-of-scope targets answer 404. No other application state is notified.
 */
export async function warnAbsentVolunteers(
  opportunityId: string,
  user: PublicUser
): Promise<WarnAbsentResult> {
  const opportunity = await findManagedOpportunity(opportunityId, user);

  const absentApplications = await Application.find({
    opportunity: opportunity._id,
    status: 'accepted',
    attended: false,
  }).lean();

  if (absentApplications.length === 0) {
    return { sent: 0 };
  }

  await Notification.insertMany(
    absentApplications.map((application) => ({
      user: application.user,
      type: 'absence_warning' as const,
      title: 'إنذار غياب',
      body:
        `تم قبولك في فرصة «${opportunity.title}» لكنك لم تحضر ولم تسجّل حضورك فيها. ` +
        'نرجو الالتزام بالحضور في الفرص التي يتم قبولك فيها، فالغياب المتكرر دون اعتذار قد يؤثر على قبول طلباتك في الفرص القادمة.',
      link: `/opportunities/${opportunity._id.toString()}`,
      opportunity: opportunity._id,
    }))
  );

  return { sent: absentApplications.length };
}
