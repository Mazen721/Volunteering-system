import { Building2, Clock, PieChart, Users } from 'lucide-react';
import { AR } from '../../constants/ar.js';
import { formatNumber } from '../../utils/format.js';

function buildKpiCards(overview) {
  return [
    {
      key: 'totalHours',
      label: AR.kpi.totalHoursLabel,
      value: formatNumber(overview.totalApprovedHours),
      badge: `${formatNumber(overview.approvedActivities)} ${AR.kpi.approvedActivitiesSuffix}`,
      subtitle: AR.kpi.totalHoursUnit,
      borderClass: 'border-r-mnu-500',
      valueClass: 'text-mnu-500',
      iconWrapClass: 'bg-mnu-500/10 text-mnu-500',
      badgeClass: 'text-emerald-700 bg-emerald-50',
      Icon: Clock,
    },
    {
      key: 'volunteers',
      label: AR.kpi.volunteersLabel,
      value: formatNumber(overview.registeredVolunteers),
      badge: `${formatNumber(overview.activeVolunteers)} ${AR.kpi.activeSuffix}`,
      subtitle: `${AR.kpi.registeredPrefix} (${formatNumber(overview.eligibleVolunteers)} ${AR.kpi.eligibleSuffix})`,
      borderClass: 'border-r-amber-500',
      valueClass: 'text-amber-600',
      iconWrapClass: 'bg-amber-500/10 text-amber-600',
      badgeClass: 'text-amber-700 bg-amber-50',
      Icon: Users,
    },
    {
      key: 'faculties',
      label: AR.kpi.facultiesLabel,
      value: formatNumber(overview.activeFaculties),
      badge: AR.kpi.facultyUnit,
      subtitle: AR.kpi.facultiesSubtitle,
      borderClass: 'border-r-emerald-500',
      valueClass: 'text-emerald-600',
      iconWrapClass: 'bg-emerald-500/10 text-emerald-600',
      badgeClass: 'text-emerald-700 bg-emerald-50',
      Icon: Building2,
    },
    {
      key: 'avgHours',
      label: AR.kpi.avgHoursLabel,
      value: formatNumber(overview.avgHoursPerRegistered),
      badge: AR.kpi.avgUnit,
      subtitle: `${AR.kpi.avgSubtitlePrefix} (${AR.kpi.activeAvgPrefix} ${formatNumber(overview.avgHoursPerActive)})`,
      borderClass: 'border-r-purple-500',
      valueClass: 'text-purple-600',
      iconWrapClass: 'bg-purple-500/10 text-purple-600',
      badgeClass: 'text-purple-700 bg-purple-50',
      Icon: PieChart,
    },
  ];
}

/**
 * Displays the four dashboard KPI summary cards in Arabic digits.
 * @param {{ overview: object }} props
 */
export function KpiGrid({ overview }) {
  const cards = buildKpiCards(overview);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
      {cards.map(
        ({
          key,
          label,
          value,
          badge,
          subtitle,
          borderClass,
          valueClass,
          iconWrapClass,
          badgeClass,
          Icon,
        }) => (
          <article
            key={key}
            data-testid={`kpi-card-${key}`}
            className={`glass-card p-5 rounded-2xl border-r-4 ${borderClass} transition-all duration-300 hover:-translate-y-1 hover:shadow-xl`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">{label}</span>
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconWrapClass}`}
              >
                <Icon className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <span className={`text-2xl sm:text-3xl font-black ${valueClass}`}>{value}</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${badgeClass}`}>
                {badge}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">{subtitle}</p>
          </article>
        )
      )}
    </div>
  );
}
