import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Lock, Printer, RefreshCw, Users } from 'lucide-react';
import { Navbar } from '../components/Navbar.jsx';
import { CertificateSheet } from '../components/certificate/CertificateSheet.jsx';
import { AR } from '../constants/ar.js';
import { useVolunteerProfile } from '../hooks/useVolunteerProfile.js';
import { triggerCelebration } from '../utils/confetti.js';
import { formatNumber } from '../utils/format.js';

function CertificateSkeleton() {
  return (
    <div className="space-y-4 max-w-4xl mx-auto" aria-label={AR.common.loading}>
      <div className="h-10 w-48 rounded-xl shimmer" />
      <div className="h-96 rounded-3xl shimmer" />
    </div>
  );
}

function CertificateErrorCard({ message, onRetry }) {
  return (
    <section
      role="alert"
      className="glass-card rounded-3xl p-8 max-w-lg mx-auto text-center space-y-4"
    >
      <AlertTriangle className="w-9 h-9 text-rose-600 mx-auto" />
      <h2 className="text-lg font-black text-slate-800">{AR.certificate.notFoundTitle}</h2>
      <p className="text-xs text-slate-600">{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{AR.common.retry}</span>
        </button>
        <Link
          to="/volunteers"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
        >
          <Users className="w-4 h-4" />
          <span>{AR.certificate.backToVolunteers}</span>
        </Link>
      </div>
    </section>
  );
}

function BlockedCertificateNotice({ volunteer, certificateHours }) {
  const metrics = [
    {
      label: AR.certificate.approvedHoursLabel,
      value: `${formatNumber(volunteer.approvedHours)} ${AR.common.hourUnit}`,
      containerClass: 'bg-slate-50 border-slate-200',
      labelClass: 'text-slate-500',
      valueClass: 'text-mnu-500',
    },
    {
      label: AR.certificate.requiredHoursLabel,
      value: `${formatNumber(certificateHours)} ${AR.common.hourUnit}`,
      containerClass: 'bg-slate-50 border-slate-200',
      labelClass: 'text-slate-500',
      valueClass: 'text-slate-800',
    },
    {
      label: AR.certificate.remainingHoursLabel,
      value: `${formatNumber(volunteer.remainingHours)} ${AR.common.hourUnit}`,
      containerClass: 'bg-amber-50 border-amber-200',
      labelClass: 'text-amber-700',
      valueClass: 'text-amber-700',
    },
  ];

  return (
    <section
      role="alert"
      className="glass-card rounded-3xl p-6 sm:p-8 max-w-2xl mx-auto text-center space-y-5 border border-amber-200"
    >
      <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
        <Lock className="w-7 h-7" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-black text-slate-800">{AR.certificate.blockedTitle}</h2>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          {AR.certificate.blockedMessagePrefix}{' '}
          <span className="font-black text-slate-800">{volunteer.fullName}</span>{' '}
          {AR.certificate.blockedMessageSuffix}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
        {metrics.map((metric) => (
          <div key={metric.label} className={`rounded-2xl border p-3 ${metric.containerClass}`}>
            <span className={`block text-[11px] font-bold ${metric.labelClass}`}>
              {metric.label}
            </span>
            <span className={`text-lg font-black ${metric.valueClass}`}>{metric.value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
        <Link
          to={`/volunteers/${encodeURIComponent(volunteer.volunteerId)}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition"
        >
          <ArrowRight className="w-4 h-4" />
          <span>{AR.certificate.backToProfile}</span>
        </Link>
        <Link
          to="/volunteers"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
        >
          <Users className="w-4 h-4" />
          <span>{AR.certificate.backToVolunteers}</span>
        </Link>
      </div>
    </section>
  );
}

/**
 * Dedicated printable certificate route gated on volunteer eligibility.
 */
export function CertificatePage() {
  const { volunteerId } = useParams();
  const { profile, loading, error, reload } = useVolunteerProfile(volunteerId);
  const celebratedIdRef = useRef('');

  const volunteer = profile?.volunteer;
  const certificateHours = profile?.certificateHours ?? 30;

  useEffect(() => {
    if (volunteer?.eligible && celebratedIdRef.current !== volunteer.volunteerId) {
      celebratedIdRef.current = volunteer.volunteerId;
      triggerCelebration();
    }
  }, [volunteer]);

  return (
    <div className="min-h-screen flex flex-col print:min-h-0 print:block">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 print:max-w-none print:p-0 print:m-0">
        {loading && !profile ? (
          <CertificateSkeleton />
        ) : (error && !profile) || !volunteer ? (
          <CertificateErrorCard message={error || AR.errors.unexpected} onRetry={reload} />
        ) : !volunteer.eligible ? (
          <BlockedCertificateNotice volunteer={volunteer} certificateHours={certificateHours} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to={`/volunteers/${encodeURIComponent(volunteer.volunteerId)}`}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-mnu-500 transition"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>{AR.certificate.backToProfile}</span>
                </Link>
                <Link
                  to="/volunteers"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 transition"
                >
                  <Users className="w-4 h-4" />
                  <span>{AR.certificate.backToVolunteers}</span>
                </Link>
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 text-white text-xs font-bold transition shadow-lg shadow-mnu-500/20 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{AR.certificate.printButton}</span>
              </button>
            </div>

            <CertificateSheet volunteer={volunteer} />
          </>
        )}
      </main>
    </div>
  );
}
