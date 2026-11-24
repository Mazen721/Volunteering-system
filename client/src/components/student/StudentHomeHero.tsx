import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, QrCode, Sparkles } from 'lucide-react';
import { AR } from '../../constants/ar';
import type { Opportunity } from '../../types';
import type { FeaturedHome } from '../../utils/featuredHome';
import { coverUrlForKey, resolveOpportunityCover } from '../../utils/covers';
import { formatDurationAr } from '../../utils/duration';
import { formatDateAr, formatNumber, formatPercent, formatTimeAr } from '../../utils/format';

const HOME = AR.studentPortal.home;

interface HeroProps {
  featured: FeaturedHome;
  isPending: boolean;
}

function HeroShell({
  coverUrl,
  children,
}: {
  coverUrl: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl shadow-xl min-h-[380px] sm:min-h-[430px] flex">
      <img
        src={coverUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />
      {/* Soft dark scrim concentrated under the text so white text stays readable. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      <div className="relative mt-auto w-full p-6 sm:p-8 space-y-3 text-white">{children}</div>
    </section>
  );
}

function HeroPlace({ opportunity }: { opportunity: Opportunity }) {
  return (
    <p className="flex items-start gap-2 text-amber-300 font-black text-sm sm:text-base">
      <MapPin className="w-5 h-5 shrink-0 mt-0.5" />
      <span>
        {opportunity.location.name}
        <small className="block text-white/75 font-semibold text-xs mt-0.5">
          {opportunity.location.address}
        </small>
      </span>
    </p>
  );
}

function LiveHero({ opportunity, now }: { opportunity: Opportunity; now: number }) {
  const start = new Date(opportunity.startAt).getTime();
  const end = new Date(opportunity.endAt).getTime();
  const progress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));

  return (
    <HeroShell coverUrl={resolveOpportunityCover(opportunity)}>
      <span className="inline-flex items-center gap-2 text-rose-300 text-xs font-black">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
        <span>{HOME.liveBadge}</span>
        <span className="text-white/70">— {HOME.registeredBadge}</span>
      </span>
      <h2 className="text-2xl sm:text-4xl font-black leading-snug">{opportunity.title}</h2>
      <HeroPlace opportunity={opportunity} />
      <p className="text-xs sm:text-sm font-bold text-white/85">
        {HOME.startedLabel} {formatTimeAr(opportunity.startAt)} • {HOME.endsLabel}{' '}
        {formatTimeAr(opportunity.endAt)} • {formatNumber(opportunity.hours)}{' '}
        {AR.studentPortal.common.hours}
      </p>
      <div
        role="progressbar"
        aria-label={HOME.elapsedLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="h-2 rounded-full bg-white/25 overflow-hidden max-w-xl"
      >
        <div className="h-full rounded-full bg-rose-500" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-[11px] font-bold text-white/85">
        {HOME.elapsedLabel} <bdi>{formatPercent(progress)}</bdi> — {HOME.remainingLabel}{' '}
        {formatDurationAr(Math.max(0, end - now))}
      </p>
      <div className="pt-1">
        <Link
          to={`/checkin/${encodeURIComponent(opportunity._id)}`}
          className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-mnu-gold text-[#231a00] text-sm font-black transition hover:brightness-105 active:scale-95"
        >
          <QrCode className="w-5 h-5" />
          {AR.studentPortal.dashboard.happeningNowCta}
        </Link>
      </div>
    </HeroShell>
  );
}

function NextHero({ opportunity, now, isPending }: { opportunity: Opportunity; now: number; isPending: boolean }) {
  return (
    <HeroShell coverUrl={resolveOpportunityCover(opportunity)}>
      <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-mnu-gold text-[#231a00] text-xs font-black self-start">
        <span>{HOME.nextBadge}</span>
        <span className="opacity-70">— {HOME.registeredBadge}</span>
      </span>
      <h2 className="text-2xl sm:text-4xl font-black leading-snug">{opportunity.title}</h2>
      <HeroPlace opportunity={opportunity} />
      <p className="text-xs sm:text-sm font-bold text-white/85">
        {HOME.startsInLabel} {formatDurationAr(new Date(opportunity.startAt).getTime() - now)} •{' '}
        {formatDateAr(opportunity.startAt)} • {formatTimeAr(opportunity.startAt)} •{' '}
        {formatNumber(opportunity.hours)} {AR.studentPortal.common.hours}
      </p>
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <Link
          to={`/opportunities/${opportunity._id}`}
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-mnu-gold text-[#231a00] text-sm font-black transition hover:brightness-105 active:scale-95"
        >
          <CalendarDays className="w-5 h-5" />
          {HOME.detailsButton}
        </Link>
        {!isPending && (
          <span className="text-[11px] font-bold text-white/75">{HOME.checkInOpensNote}</span>
        )}
      </div>
    </HeroShell>
  );
}

function SuggestedHero({ opportunity, isPending }: { opportunity: Opportunity; isPending: boolean }) {
  return (
    <HeroShell coverUrl={resolveOpportunityCover(opportunity)}>
      <span className="inline-flex items-center gap-2 text-amber-300 text-xs font-black">
        <Sparkles className="w-4 h-4" />
        {HOME.featuredBadge}
      </span>
      <h2 className="text-2xl sm:text-4xl font-black leading-snug">{opportunity.title}</h2>
      <HeroPlace opportunity={opportunity} />
      <p className="text-xs sm:text-sm font-bold text-white/85">
        {formatDateAr(opportunity.startAt)} • {formatTimeAr(opportunity.startAt)} •{' '}
        {formatNumber(opportunity.hours)} {AR.studentPortal.common.hours}
      </p>
      {!isPending && (
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <Link
            to={`/opportunities/${opportunity._id}`}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-mnu-gold text-[#231a00] text-sm font-black transition hover:brightness-105 active:scale-95"
          >
            {HOME.applyNowCta}
          </Link>
          <Link
            to={`/opportunities/${opportunity._id}`}
            className="px-5 py-3.5 rounded-2xl text-white text-sm font-bold underline decoration-mnu-gold decoration-2 underline-offset-8"
          >
            {HOME.detailsButton}
          </Link>
        </div>
      )}
    </HeroShell>
  );
}

function WelcomeHero({ isPending }: { isPending: boolean }) {
  return (
    <HeroShell coverUrl={coverUrlForKey(null)}>
      <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-mnu-gold text-[#231a00] text-xs font-black self-start">
        {HOME.welcomeBadge}
      </span>
      <h2 className="text-2xl sm:text-4xl font-black leading-snug">{HOME.welcomeTitle}</h2>
      <p className="text-sm text-white/85 font-semibold leading-relaxed max-w-2xl">
        {HOME.welcomeText}
      </p>
      {!isPending && (
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <Link
            to="/opportunities"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-mnu-gold text-[#231a00] text-sm font-black transition hover:brightness-105 active:scale-95"
          >
            <Sparkles className="w-5 h-5" />
            {HOME.welcomeAllCta}
          </Link>
        </div>
      )}
    </HeroShell>
  );
}

/**
 * The big photo hero at the top of the student home page (Concept I —
 * overlay): white text directly on the featured activity's cover photo over
 * a soft dark bottom scrim. It NEVER renders nothing: live work first, then
 * his next accepted work, then the top recommendation, and finally a warm
 * welcome hero when there are no opportunities at all.
 */
export function StudentHomeHero({ featured, isPending }: HeroProps) {
  // Read the clock once per mount so hero times stay stable across re-renders.
  const [now] = useState(() => Date.now());

  if (featured.kind === 'live' && featured.opportunity) {
    return <LiveHero opportunity={featured.opportunity} now={now} />;
  }
  if (featured.kind === 'next' && featured.opportunity) {
    return <NextHero opportunity={featured.opportunity} now={now} isPending={isPending} />;
  }
  if (featured.kind === 'suggested' && featured.opportunity) {
    return <SuggestedHero opportunity={featured.opportunity} isPending={isPending} />;
  }
  return <WelcomeHero isPending={isPending} />;
}
