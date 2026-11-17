import type { ComponentType } from 'react';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  GraduationCap,
  Hourglass,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { AR } from '../../constants/ar';
import type { ActivityStatus, VolunteerCategory } from '../../constants/enums';
import { formatNumber } from '../../utils/format';

interface BadgeIconProps {
  className?: string;
}

interface BadgeStyle {
  classes: string;
  Icon: ComponentType<BadgeIconProps>;
}

const CATEGORY_STYLE_MAP: Record<VolunteerCategory, BadgeStyle> = {
  student: { classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: GraduationCap },
  academic: { classes: 'bg-purple-50 text-purple-700 border-purple-200', Icon: UserCheck },
  admin: { classes: 'bg-blue-50 text-blue-700 border-blue-200', Icon: Briefcase },
};

const ACTIVITY_STATUS_MAP: Record<ActivityStatus, BadgeStyle & { label: string }> = {
  approved: {
    label: AR.statuses.approved,
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Icon: CheckCircle2,
  },
  pending: {
    label: AR.statuses.pending,
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: Clock,
  },
  rejected: {
    label: AR.statuses.rejected,
    classes: 'bg-rose-50 text-rose-700 border-rose-200',
    Icon: XCircle,
  },
};

interface CategoryBadgeProps {
  category: VolunteerCategory;
  label?: string;
}

/**
 * Displays a colored volunteer category pill.
 */
export function CategoryBadge({ category, label }: CategoryBadgeProps) {
  const config = CATEGORY_STYLE_MAP[category] || CATEGORY_STYLE_MAP.student;
  const Icon = config.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1 rounded-full text-[11px] font-bold ${config.classes}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label || AR.categories[category]}</span>
    </span>
  );
}

interface ActivityStatusBadgeProps {
  status: ActivityStatus;
}

/**
 * Displays one of the three activity approval status badges (approved / pending / rejected).
 */
export function ActivityStatusBadge({ status }: ActivityStatusBadgeProps) {
  const config = ACTIVITY_STATUS_MAP[status] || ACTIVITY_STATUS_MAP.pending;
  const Icon = config.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1 rounded-full text-[11px] font-bold ${config.classes}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{config.label}</span>
    </span>
  );
}

interface EligibilityBadgeProps {
  eligible: boolean;
  remainingHours: number;
}

/**
 * Displays certificate eligibility badge or remaining hours indicator.
 */
export function EligibilityBadge({ eligible, remainingHours }: EligibilityBadgeProps) {
  if (eligible) {
    return (
      <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1 rounded-full text-[11px] font-black shadow-sm">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        <span>{AR.volunteers.eligibleBadge}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full text-[11px] font-bold">
      <Hourglass className="w-3.5 h-3.5 text-amber-500" />
      <span>
        {AR.volunteers.remainingPrefix} {formatNumber(remainingHours)} {AR.common.hourUnit}
      </span>
    </span>
  );
}
