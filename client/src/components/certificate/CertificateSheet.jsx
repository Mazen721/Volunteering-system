import { Award, BadgeCheck } from 'lucide-react';
import { AR } from '../../constants/ar.js';
import { formatDateAr, formatNumber } from '../../utils/format.js';

function CertificateMetaCard({ label, value, valueClassName = 'text-slate-800' }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2 min-w-0">
      <span className="block text-[11px] font-bold text-slate-500">{label}</span>
      <span className={`block text-xs sm:text-sm font-black break-words mt-0.5 ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Printable A4-landscape volunteer appreciation certificate for eligible volunteers.
 */
export function CertificateSheet({ volunteer, issueDate = new Date() }) {
  const categoryText = volunteer.categoryLabel || AR.categories[volunteer.category] || '';
  const activityWord =
    volunteer.approvedActivities === 1
      ? AR.certificate.activitySingular
      : AR.certificate.activityPlural;

  return (
    <article
      aria-label={AR.certificate.heading}
      className="certificate-print-shell glass-card rounded-3xl p-4 sm:p-6 print:rounded-none print:border-0 print:bg-white print:p-0 flex flex-col"
    >
      <div className="flex-1 border-4 border-double border-mnu-500 rounded-2xl print:rounded-xl bg-white p-5 sm:p-8 print:p-7 flex flex-col justify-between gap-5 print:gap-4 text-center relative overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 print:pb-3">
          <span className="text-xs sm:text-sm font-black text-mnu-500">{AR.brand.university}</span>

          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto sm:mx-0">
            <Award className="w-7 h-7 text-amber-500" />
          </div>

          <h2 className="text-xs sm:text-sm font-black text-mnu-600 bg-mnu-50 px-3 py-1.5 rounded-xl border border-mnu-500/20">
            {AR.certificate.authority}
          </h2>
        </header>

        <div className="space-y-4 print:space-y-3 my-auto">
          <h1 className="text-xl sm:text-3xl print:text-3xl font-black text-mnu-500 tracking-wide">
            {AR.certificate.heading}
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 font-semibold">
            {AR.certificate.attestationPrefix}{' '}
            <span className="font-black text-mnu-500">{AR.certificate.authority}</span>{' '}
            {AR.certificate.attestationConnector}
          </p>

          <div className="py-1 px-2 max-w-full">
            <p className="text-2xl sm:text-3xl print:text-3xl font-black text-slate-800 break-words leading-snug max-w-2xl mx-auto">
              {volunteer.fullName}
            </p>
            <div className="w-40 sm:w-56 h-1 mx-auto mt-2 rounded-full bg-gradient-to-r from-mnu-500 via-mnu-gold to-mnu-500" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-2.5 sm:gap-3 w-full max-w-3xl mx-auto">
            <CertificateMetaCard
              label={AR.certificate.categoryPrefix}
              value={categoryText}
              valueClassName="text-amber-700"
            />
            <CertificateMetaCard
              label={AR.certificate.facultyPrefix}
              value={volunteer.faculty}
              valueClassName="text-mnu-500"
            />
            <CertificateMetaCard label={AR.certificate.idPrefix} value={volunteer.volunteerId} />
          </div>

          <p className="text-xs sm:text-base print:text-base text-slate-700 leading-relaxed max-w-2xl mx-auto font-semibold">
            {AR.certificate.participationPrefix}{' '}
            <span className="font-black text-amber-600">
              {formatNumber(volunteer.approvedActivities)}
            </span>{' '}
            {activityWord} {AR.certificate.participationMiddle}{' '}
            <span className="font-black text-emerald-700 text-base sm:text-lg">
              {formatNumber(volunteer.approvedHours)}
            </span>{' '}
            {AR.certificate.hoursSuffix}
          </p>
        </div>

        <footer className="pt-4 print:pt-3 border-t border-slate-200 flex flex-col sm:flex-row print:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="font-semibold">
            {AR.certificate.dateLabel}{' '}
            <span className="font-black text-slate-800">{formatDateAr(issueDate)}</span>
          </div>

          <div className="inline-flex items-center gap-1.5 font-black text-mnu-500 bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-full">
            <BadgeCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{AR.certificate.approvedSeal}</span>
          </div>
        </footer>
      </div>
    </article>
  );
}
