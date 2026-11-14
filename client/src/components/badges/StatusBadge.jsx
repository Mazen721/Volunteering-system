import {
  Briefcase,
  CheckCircle2,
  Clock,
  GraduationCap,
  Hourglass,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { AR } from '../../constants/ar.js';
import { formatNumber } from '../../utils/format.js';

const CATEGORY_STYLE_MAP = {
  student: { classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: GraduationCap },
  academic: { classes: 'bg-purple-50 text-purple-700 border-purple-200', Icon: UserCheck },
  admin: { classes: 'bg-blue-50 text-blue-700 border-blue-200', Icon: Briefcase },
};

const ACTIVITY_STATUS_MAP = {
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

/**
 * Displays a colored volunteer category pill.
 */
export function CategoryBadge({ category, label }) {
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

/**
 * Displays one of the three activity approval status badges (approved / pending / rejected).
 */
export function ActivityStatusBadge({ status }) {
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

/**
 * Displays certificate eligibility badge or remaining hours indicator.
 */
export function EligibilityBadge({ eligible, remainingHours }) {
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
