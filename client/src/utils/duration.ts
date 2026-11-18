import { AR } from '../constants/ar';
import { formatNumber } from './format';

const HOME = AR.studentPortal.home;

/**
 * Renders a duration in milliseconds as a short Arabic phrase such as
 * «٣ أيام و٥ ساعات» or «٤ ساعات و٢٠ دقيقة», keeping at most two units.
 */
export function formatDurationAr(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${formatNumber(days)} ${days > 2 ? HOME.daysUnit : HOME.dayUnit}`);
  }
  if (hours > 0) {
    parts.push(`${formatNumber(hours)} ${hours > 2 ? HOME.hoursUnit : HOME.hourUnit}`);
  }
  if (days === 0 && minutes > 0) {
    parts.push(`${formatNumber(minutes)} ${minutes > 2 ? HOME.minutesUnit : HOME.minuteUnit}`);
  }
  if (parts.length === 0) {
    return HOME.lessThanMinute;
  }
  return parts.slice(0, 2).join(` ${HOME.andWord} `);
}
