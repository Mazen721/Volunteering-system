import { Link } from 'react-router-dom';
import { AlertCircle, ListChecks, Trophy } from 'lucide-react';
import { AR } from '../../constants/ar';
import type { VolunteerCategory } from '../../constants/enums';
import type { LeaderboardVolunteer } from '../../types';
import { formatNumber } from '../../utils/format';

const RANK_MEDALS = ['🥇', '🥈', '🥉', '⭐', '✨'];

const CATEGORY_BADGE_CLASSES: Record<VolunteerCategory, string> = {
  academic: 'bg-purple-100 text-purple-700 border-purple-200',
  admin: 'bg-blue-100 text-blue-700 border-blue-200',
  student: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

interface LeaderboardRowProps {
  volunteer: LeaderboardVolunteer;
  index: number;
}

function LeaderboardRow({ volunteer, index }: LeaderboardRowProps) {
  const badgeStyle = CATEGORY_BADGE_CLASSES[volunteer.category] || CATEGORY_BADGE_CLASSES.student;
  const activityWord =
    volunteer.approvedActivities === 1
      ? AR.leaderboard.activitySingular
      : AR.leaderboard.activityPlural;

  return (
    <Link
      to={`/volunteers/${encodeURIComponent(volunteer.volunteerId)}`}
      data-testid="leaderboard-row"
      className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-white/75 border border-slate-100 shadow-sm hover:border-mnu-500/30 hover:bg-white transition"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-lg shrink-0">{RANK_MEDALS[index] || '✨'}</span>
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-800 flex flex-wrap items-center gap-1.5">
            <span className="truncate">{volunteer.fullName}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeStyle}`}>
              {volunteer.categoryLabel}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 truncate">{volunteer.faculty}</div>
        </div>
      </div>

      <div className="text-left shrink-0">
        <div className="text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg">
          {formatNumber(volunteer.approvedHours)} {AR.leaderboard.hourUnit}
        </div>
        <div className="text-[10px] text-slate-500 font-bold mt-0.5 flex items-center justify-end gap-1">
          <ListChecks className="w-3 h-3 text-slate-400" />
          <span>
            {formatNumber(volunteer.approvedActivities)} {activityWord}
          </span>
        </div>
      </div>
    </Link>
  );
}

interface LeaderboardBodyProps {
  loading: boolean;
  error: string;
  volunteers: LeaderboardVolunteer[];
}

function renderLeaderboardBody({ loading, error, volunteers }: LeaderboardBodyProps) {
  if (loading) {
    return (
      <div className="space-y-2.5 mt-3" aria-label={AR.leaderboard.loading}>
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-14 rounded-2xl shimmer" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="mt-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2"
      >
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (volunteers.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-6">{AR.leaderboard.empty}</p>;
  }

  return (
    <div className="space-y-2.5 mt-3">
      {volunteers.map((volunteer, index) => (
        <LeaderboardRow
          key={volunteer._id || volunteer.volunteerId}
          volunteer={volunteer}
          index={index}
        />
      ))}
    </div>
  );
}

interface LeaderboardCardProps {
  volunteers: LeaderboardVolunteer[];
  certificateHours: number;
  activeCategory: VolunteerCategory | '';
  onSelectCategory: (category: VolunteerCategory | '') => void;
  loading: boolean;
  error: string;
}

/**
 * Top 5 volunteers widget with category filter tabs (الكل / الطلاب / أعضاء الكادر الأكاديمي / أعضاء الجهاز الإداري).
 */
export function LeaderboardCard({
  volunteers,
  certificateHours,
  activeCategory,
  onSelectCategory,
  loading,
  error,
}: LeaderboardCardProps) {
  return (
    <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3 gap-2">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <span>{AR.leaderboard.title}</span>
          </h3>
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
            {AR.leaderboard.tag}
          </span>
        </div>

        <div
          role="tablist"
          aria-label={AR.leaderboard.title}
          className="flex flex-wrap items-center gap-1.5 pb-1 text-xs font-bold"
        >
          {AR.leaderboard.tabs.map((tab) => {
            const isActive = activeCategory === tab.key;
            return (
              <button
                key={tab.key || 'all'}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectCategory(tab.key)}
                className={`px-2.5 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-mnu-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {renderLeaderboardBody({ loading, error, volunteers })}
      </div>

      <div className="pt-4 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-500">
          {AR.leaderboard.footerPrefix} {formatNumber(certificateHours)}{' '}
          {AR.leaderboard.footerSuffix}
        </p>
      </div>
    </section>
  );
}
