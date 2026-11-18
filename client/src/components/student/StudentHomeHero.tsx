import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, QrCode, Sparkles } from 'lucide-react';
import { AR } from '../../constants/ar';
import type { Opportunity, StudentDashboardSummary } from '../../types';
import { formatDurationAr } from '../../utils/duration';
import { formatDateAr, formatNumber, formatPercent, formatTimeAr } from '../../utils/format';

const HOME = AR.studentPortal.home;

function HeroShell({ badge, badgeClass, children }: { badge: string; badgeClass: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-gradient-to-l from-[#122f4a] to-[#1f4e79] text-white shadow-xl p-6 sm:p-8 space-y-4 overflow-hidden">
      <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black ${badgeClass}`}>
        <span className="w-2 h-2 rounded-full bg-current" />
        {badge}
      </span>
      {children}
    </section>
  );
}

function HeroPlace({ opportunity }: { opportunity: Opportunity }) {
  return (
    <p className="flex items-start gap-2 text-amber-300 font-black text-sm sm:text-base">
      <MapPin className="w-5 h-5 shrink-0 mt-0.5" />
      <span>
        {opportunity.location.name}
        <small className="block text-blue-200 font-semibold text-xs mt-0.5">
          {opportunity.location.address}
        </small>
      </span>
    </p>
  );
}

function TimeBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 border border-white/15 px-4 py-3 text-center space-y-0.5">
      <span className="block text-[11px] font-bold text-blue-200">{label}</span>
      <b className="block text-sm sm:text-base font-black">{value}</b>
    </div>
  );
}

function LiveHero({ opportunity, now }: { opportunity: Opportunity; now: number }) {
  const start = new Date(opportunity.startAt).getTime();
  const end = new Date(opportunity.endAt).getTime();
  const progress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));

  return (
    <HeroShell badge={HOME.liveBadge} badgeClass="bg-rose-600 text-white">
      <h2 className="text-2xl sm:text-3xl font-black leading-snug">{opportunity.title}</h2>
      <HeroPlace opportunity={opportunity} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <TimeBox label={HOME.startedLabel} value={formatTimeAr(opportunity.startAt)} />
        <TimeBox label={HOME.endsLabel} value={formatTimeAr(opportunity.endAt)} />
        <TimeBox
          label={HOME.durationLabel}
          value={`${formatNumber(opportunity.hours)} ${AR.studentPortal.common.hours}`}
        />
        <TimeBox label={HOME.elapsedLabel} value={formatDurationAr(now - start)} />
      </div>
      <div
        role="progressbar"
        aria-label={HOME.elapsedLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="h-2.5 rounded-full bg-white/15 overflow-hidden"
      >
        <div className="h-full rounded-full bg-mnu-gold transition-all" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-[11px] font-bold text-blue-200">{formatPercent(progress)}</p>
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <Link
          to={`/checkin/${encodeURIComponent(opportunity._id)}`}
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-mnu-gold text-[#231a00] text-sm font-black transition hover:brightness-105 active:scale-95"
        >
          <QrCode className="w-5 h-5" />
          {AR.studentPortal.dashboard.happeningNowCta}
        </Link>
        <Link
          to={`/opportunities/${opportunity._id}`}
          className="px-5 py-3.5 rounded-2xl border border-white/35 text-white text-sm font-bold transition hover:bg-white/10"
        >
          {HOME.detailsButton}
        </Link>
      </div>
    </HeroShell>
  );
}

function NextHero({ opportunity, now }: { opportunity: Opportunity; now: number }) {
  return (
    <HeroShell badge={HOME.nextBadge} badgeClass="bg-mnu-gold text-[#231a00]">
      <h2 className="text-2xl sm:text-3xl font-black leading-snug">{opportunity.title}</h2>
      <HeroPlace opportunity={opportunity} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <TimeBox
          label={HOME.startsInLabel}
          value={formatDurationAr(new Date(opportunity.startAt).getTime() - now)}
        />
        <TimeBox label={HOME.dateLabel} value={formatDateAr(opportunity.startAt)} />
        <TimeBox label={HOME.timeLabel} value={formatTimeAr(opportunity.startAt)} />
        <TimeBox
          label={HOME.durationLabel}
          value={`${formatNumber(opportunity.hours)} ${AR.studentPortal.common.hours}`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <Link
          to={`/opportunities/${opportunity._id}`}
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-mnu-gold text-[#231a00] text-sm font-black transition hover:brightness-105 active:scale-95"
        >
          <CalendarDays className="w-5 h-5" />
          {HOME.detailsButton}
        </Link>
        <span className="px-5 py-3.5 rounded-2xl border border-white/25 text-blue-100 text-xs font-bold">
          {HOME.checkInOpensNote}
        </span>
      </div>
    </HeroShell>
  );
}

function WelcomeHero() {
  return (
    <HeroShell badge={HOME.welcomeBadge} badgeClass="bg-mnu-gold text-[#231a00]">
      <h2 className="text-2xl sm:text-3xl font-black leading-snug">{HOME.welcomeTitle}</h2>
      <p className="text-sm text-blue-100 font-semibold leading-relaxed max-w-2xl">{HOME.welcomeText}</p>
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <a
          href="#home-suggested"
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-mnu-gold text-[#231a00] text-sm font-black transition hover:brightness-105 active:scale-95"
        >
          <Sparkles className="w-5 h-5" />
          {HOME.welcomeSuggestedCta}
        </a>
        <Link
          to="/opportunities"
          className="px-5 py-3.5 rounded-2xl border border-white/35 text-white text-sm font-bold transition hover:bg-white/10"
        >
          {HOME.welcomeAllCta}
        </Link>
      </div>
    </HeroShell>
  );
}

/**
 * The big block at the top of the student home page. It shows, in order of
 * importance: the activity happening now, the student's next accepted
 * activity, or a welcome block for a student who has not registered in any
 * work yet. A student who only has applications under review gets no hero.
 */
export function StudentHomeHero({ summary }: { summary: StudentDashboardSummary }) {
  // Read the clock once per mount so hero times stay stable across re-renders.
  const [now] = useState(() => Date.now());
  const live = summary.happeningNow[0];
  if (live) {
    return <LiveHero opportunity={live} now={now} />;
  }
  const next = summary.upcomingAccepted[0];
  if (next) {
    return <NextHero opportunity={next} now={now} />;
  }
  if (summary.activeApplications.length === 0) {
    return <WelcomeHero />;
  }
  return null;
}
