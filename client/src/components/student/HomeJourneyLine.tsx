import { AR } from '../../constants/ar';
import { formatNumber } from '../../utils/format';

const HOME = AR.studentPortal.home;

interface HomeJourneyLineProps {
  approvedHours: number;
  certificateHours: number;
}

/**
 * The quiet journey line under the home hero: stations from the first
 * activity to the volunteering certificate, filled by the student's real
 * approved hours. Intermediate stations sit at fixed hour marks; the final
 * station is the (configurable) certificate threshold.
 */
export function HomeJourneyLine({ approvedHours, certificateHours }: HomeJourneyLineProps) {
  const target = certificateHours > 0 ? certificateHours : 30;
  const stations = [
    { at: 0, label: HOME.journeyStartLabel },
    { at: 5, label: `${formatNumber(5)} ${HOME.journeyHoursLabel}` },
    { at: 15, label: `${formatNumber(15)} ${HOME.journeyHoursLabel}` },
    {
      at: target,
      label: `${formatNumber(target)} ${HOME.journeyHoursLabel} = ${HOME.journeyCertificateLabel}`,
    },
  ].filter((station, index, all) => index === 0 || station.at > all[index - 1].at);
  const progress = Math.min(100, Math.max(0, (approvedHours / target) * 100));

  return (
    <section aria-label={HOME.journeyTitle} className="px-1 sm:px-2">
      <div className="flex items-center justify-between gap-2 pb-4">
        <h2 className="text-sm font-black text-slate-700">{HOME.journeyTitle}</h2>
        <span className="text-[11px] font-bold text-slate-500">
          {formatNumber(approvedHours)} / {formatNumber(target)} {HOME.journeyHoursLabel}
        </span>
      </div>
      <div className="relative">
        <div className="absolute inset-x-0 top-[7px] h-0.5 bg-slate-200" />
        <div
          className="absolute right-0 top-[7px] h-0.5 bg-mnu-gold transition-all"
          style={{ width: `${progress}%` }}
        />
        <ol className="relative flex items-start justify-between">
          {stations.map((station) => {
            const reached = approvedHours >= station.at;
            return (
              <li key={station.at} className="flex flex-col items-center gap-1.5">
                <span
                  className={`w-4 h-4 rounded-full border-2 ${
                    reached ? 'bg-mnu-gold border-mnu-gold' : 'bg-white border-slate-300'
                  }`}
                />
                <span
                  className={`text-[10px] sm:text-[11px] font-bold whitespace-nowrap ${
                    reached ? 'text-mnu-700' : 'text-slate-400'
                  }`}
                >
                  {station.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
