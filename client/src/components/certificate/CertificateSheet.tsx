import { AR } from '../../constants/ar';
import type { Volunteer } from '../../types';
import { formatDateAr, formatNumber } from '../../utils/format';
import cornerBottomLeft from '../../assets/plates/corner-bottom-left.png';
import cornerBottomRight from '../../assets/plates/corner-bottom-right.png';
import cornerTopLeft from '../../assets/plates/corner-top-left.png';
import cornerTopRight from '../../assets/plates/corner-top-right.png';
import mnuCrest from '../../assets/plates/mnu-crest.png';
import officialSeal from '../../assets/plates/official-seal.png';

const CORNER_PLATES = [
  {
    id: 'corner-top-left',
    src: cornerTopLeft,
    style: { left: '0.320%', top: '0.710%', width: '12.970%', height: '20.280%' },
  },
  {
    id: 'corner-top-right',
    src: cornerTopRight,
    style: { left: '86.710%', top: '0.710%', width: '12.970%', height: '20.280%' },
  },
  {
    id: 'corner-bottom-left',
    src: cornerBottomLeft,
    style: { left: '0.320%', top: '79.010%', width: '12.970%', height: '20.280%' },
  },
  {
    id: 'corner-bottom-right',
    src: cornerBottomRight,
    style: { left: '86.710%', top: '79.010%', width: '12.970%', height: '20.280%' },
  },
];

const CARTOUCHE_NOTCHES = [
  { key: 'tr', className: 'cert-cartouche-notch--tr' },
  { key: 'tl', className: 'cert-cartouche-notch--tl' },
  { key: 'br', className: 'cert-cartouche-notch--br' },
  { key: 'bl', className: 'cert-cartouche-notch--bl' },
];

const HORIZONTAL_FRAME_BARS = [
  { key: 'outer-navy', offset: '1.85%', height: '0.88%', color: '#091b3f' },
  { key: 'inner-navy', offset: '3.22%', height: '0.78%', color: '#091b3f' },
  { key: 'gold-trim', offset: '4.04%', height: '0.36%', color: '#92845c' },
];

const VERTICAL_FRAME_BARS = [
  { key: 'outer-navy', offset: '0.95%', width: '0.60%', color: '#091b3f' },
  { key: 'inner-navy', offset: '1.90%', width: '0.56%', color: '#091b3f' },
  { key: 'gold-trim', offset: '2.50%', width: '0.26%', color: '#92845c' },
];

const CORNER_BEVEL_CAPS = [
  // Horizontal edge transitions where corner diagonal bevel meets horizontal frame rules
  {
    key: 'tl-h',
    style: {
      left: '13.15%',
      top: '3.22%',
      width: '3.6%',
      height: '5.31%',
      background:
        'linear-gradient(to top left, transparent 47%, #92845c 47%, #92845c 52%, #ffffff 52%, #ffffff 67%, #92845c 67%, #92845c 72%, #091b3f 72%)',
    },
  },
  {
    key: 'tr-h',
    style: {
      right: '13.15%',
      top: '3.22%',
      width: '3.6%',
      height: '5.31%',
      background:
        'linear-gradient(to top right, transparent 47%, #92845c 47%, #92845c 52%, #ffffff 52%, #ffffff 67%, #92845c 67%, #92845c 72%, #091b3f 72%)',
    },
  },
  {
    key: 'bl-h',
    style: {
      left: '13.15%',
      bottom: '3.22%',
      width: '3.6%',
      height: '5.31%',
      background:
        'linear-gradient(to bottom left, transparent 47%, #92845c 47%, #92845c 52%, #ffffff 52%, #ffffff 67%, #92845c 67%, #92845c 72%, #091b3f 72%)',
    },
  },
  {
    key: 'br-h',
    style: {
      right: '13.15%',
      bottom: '3.22%',
      width: '3.6%',
      height: '5.31%',
      background:
        'linear-gradient(to bottom right, transparent 47%, #92845c 47%, #92845c 52%, #ffffff 52%, #ffffff 67%, #92845c 67%, #92845c 72%, #091b3f 72%)',
    },
  },
  // Vertical edge transitions where corner diagonal bevel meets vertical frame rules
  {
    key: 'tl-v',
    style: {
      left: '1.90%',
      top: '20.80%',
      width: '2.98%',
      height: '4.4%',
      background:
        'linear-gradient(to top left, transparent 47%, #92845c 47%, #92845c 52%, #ffffff 52%, #ffffff 67%, #92845c 67%, #92845c 72%, #091b3f 72%)',
    },
  },
  {
    key: 'tr-v',
    style: {
      right: '1.90%',
      top: '20.80%',
      width: '2.98%',
      height: '4.4%',
      background:
        'linear-gradient(to top right, transparent 47%, #92845c 47%, #92845c 52%, #ffffff 52%, #ffffff 67%, #92845c 67%, #92845c 72%, #091b3f 72%)',
    },
  },
  {
    key: 'bl-v',
    style: {
      left: '1.90%',
      bottom: '20.80%',
      width: '2.98%',
      height: '4.4%',
      background:
        'linear-gradient(to bottom left, transparent 47%, #92845c 47%, #92845c 52%, #ffffff 52%, #ffffff 67%, #92845c 67%, #92845c 72%, #091b3f 72%)',
    },
  },
  {
    key: 'br-v',
    style: {
      right: '1.90%',
      bottom: '20.80%',
      width: '2.98%',
      height: '4.4%',
      background:
        'linear-gradient(to bottom right, transparent 47%, #92845c 47%, #92845c 52%, #ffffff 52%, #ffffff 67%, #92845c 67%, #92845c 72%, #091b3f 72%)',
    },
  },
];

interface CertificateSheetProps {
  volunteer: Volunteer;
  issueDate?: Date | string;
}

/**
 * Renders an official Mansoura National University academic volunteer completion certificate.
 */
export function CertificateSheet({ volunteer, issueDate = new Date() }: CertificateSheetProps) {
  const formattedHours = formatNumber(volunteer.approvedHours);
  const formattedActivities = formatNumber(volunteer.approvedActivities);
  const activityWord =
    volunteer.approvedActivities === 1
      ? AR.certificate.activitySingular
      : AR.certificate.activityPlural;
  const formattedDate = formatDateAr(issueDate);
  const nameLength = (volunteer.fullName || '').trim().length;
  const facultyLength = (volunteer.faculty || '').trim().length;
  const nameFontSize = nameLength > 34 ? '2.80cqw' : nameLength > 24 ? '3.35cqw' : '4.05cqw';
  const attestation = `${AR.certificate.attestationPrefix} ${AR.certificate.authority} ${AR.certificate.attestationConnector}`;

  return (
    <article
      dir="rtl"
      aria-label={AR.certificate.heading}
      className="certificate-print-shell certificate-folio shadow-xl print:shadow-none select-text"
    >
      {/* Top & bottom triple-rule perimeter borders joining the corner plates */}
      {HORIZONTAL_FRAME_BARS.map((bar) => (
        <span
          key={`top-${bar.key}`}
          aria-hidden="true"
          className="absolute pointer-events-none z-[5]"
          style={{
            left: '12.6%',
            width: '74.8%',
            top: bar.offset,
            height: bar.height,
            backgroundColor: bar.color,
          }}
        />
      ))}
      {HORIZONTAL_FRAME_BARS.map((bar) => (
        <span
          key={`bottom-${bar.key}`}
          aria-hidden="true"
          className="absolute pointer-events-none z-[5]"
          style={{
            left: '12.6%',
            width: '74.8%',
            bottom: bar.offset,
            height: bar.height,
            backgroundColor: bar.color,
          }}
        />
      ))}

      {/* Left & right triple-rule perimeter borders joining the corner plates */}
      {VERTICAL_FRAME_BARS.map((bar) => (
        <span
          key={`left-${bar.key}`}
          aria-hidden="true"
          className="absolute pointer-events-none z-[5]"
          style={{
            top: '19.8%',
            height: '60.4%',
            left: bar.offset,
            width: bar.width,
            backgroundColor: bar.color,
          }}
        />
      ))}
      {VERTICAL_FRAME_BARS.map((bar) => (
        <span
          key={`right-${bar.key}`}
          aria-hidden="true"
          className="absolute pointer-events-none z-[5]"
          style={{
            top: '19.8%',
            height: '60.4%',
            right: bar.offset,
            width: bar.width,
            backgroundColor: bar.color,
          }}
        />
      ))}

      {/* Four illuminated navy-and-gold corner rosette plates */}
      {CORNER_PLATES.map((corner) => (
        <figure
          key={corner.id}
          aria-hidden="true"
          className="absolute m-0 pointer-events-none select-none z-10"
          style={corner.style}
        >
          <img src={corner.src} alt="" className="w-full h-full object-contain" />
        </figure>
      ))}

      {/* Seamless diagonal bevel caps joining corner spandrels to straight rules */}
      {CORNER_BEVEL_CAPS.map((cap) => (
        <span
          key={cap.key}
          aria-hidden="true"
          className="absolute pointer-events-none z-[6]"
          style={cap.style}
        />
      ))}

      {/* Subtle centered MNU crest watermark behind body copy */}
      <div
        aria-hidden="true"
        className="absolute pointer-events-none select-none opacity-[0.06] flex items-center justify-center z-[1]"
        style={{ left: '34.5%', top: '29.5%', width: '31%', height: '46%' }}
      >
        <img src={mnuCrest} alt="" className="w-full h-full object-contain" />
      </div>

      {/* Header row: University title (right), MNU crest (center), Authority title (left) */}
      <p
        className="absolute m-0 flex items-center justify-center text-center font-bold text-[#0e0e0e] z-10 whitespace-nowrap"
        style={{
          left: '61.5%',
          top: '13.560%',
          width: '25%',
          height: '7.080%',
          fontFamily: 'var(--font-cert-body)',
          fontSize: '3.05cqw',
          lineHeight: 1.1,
        }}
      >
        {AR.brand.university}
      </p>

      <figure
        className="absolute m-0 pointer-events-none select-none z-10"
        style={{ left: '43.040%', top: '6.370%', width: '13.920%', height: '20.750%' }}
      >
        <img src={mnuCrest} alt={AR.brand.logoAlt} className="w-full h-full object-contain" />
      </figure>

      <h2
        className="absolute m-0 flex items-center justify-center text-center font-bold text-[#0e0e0e] z-10 whitespace-nowrap"
        style={{
          left: '13%',
          top: '13.560%',
          width: '28%',
          height: '7.080%',
          fontFamily: 'var(--font-cert-body)',
          fontSize: '2.90cqw',
          lineHeight: 1.1,
        }}
      >
        {AR.certificate.authority}
      </h2>

      {/* Tapered antique-gold header divider */}
      <div
        aria-hidden="true"
        className="absolute z-10 flex items-center"
        style={{ left: '11.870%', top: '28.5%', width: '76.270%', height: '1.2%' }}
      >
        <span className="cert-divider-gold" />
      </div>

      {/* Main calligraphic certificate title */}
      <h1
        className="absolute m-0 flex items-center justify-center text-center font-normal text-[#091b3f] z-10 whitespace-nowrap"
        style={{
          left: '14%',
          top: '29.2%',
          width: '72%',
          height: '10.2%',
          fontFamily: 'var(--font-cert-display)',
          fontSize: '5.20cqw',
          lineHeight: 1.15,
        }}
      >
        {AR.certificate.heading}
      </h1>

      {/* Formal attestation line */}
      <p
        className="absolute m-0 flex items-center justify-center text-center font-semibold text-[#0e0e0e] z-10 whitespace-nowrap"
        style={{
          left: '12%',
          top: '40.330%',
          width: '76%',
          height: '5.190%',
          fontFamily: 'var(--font-cert-body)',
          fontSize: '2.05cqw',
          lineHeight: 1.15,
        }}
      >
        {attestation}
      </p>

      {/* Octagonal-notched double-hairline gold cartouche framing volunteer name */}
      <div
        className="absolute inset-x-0 flex justify-center z-10"
        style={{ top: '45.800%', height: '11.400%' }}
      >
        <div
          className="cert-name-cartouche h-full flex items-center justify-center"
          style={{
            minWidth: '38.610%',
            maxWidth: '72%',
            paddingInline: '3.2cqw',
          }}
        >
          {CARTOUCHE_NOTCHES.map((notch) => (
            <span
              key={notch.key}
              aria-hidden="true"
              className={`cert-cartouche-notch ${notch.className}`}
            />
          ))}
          <p
            className="relative m-0 text-center font-bold text-[#0e0e0e] whitespace-nowrap z-[3]"
            style={{
              fontFamily: 'var(--font-cert-body)',
              fontSize: nameFontSize,
              lineHeight: 1.45,
            }}
          >
            {volunteer.fullName}
          </p>
        </div>
      </div>

      {/* Three-column hairline-ruled credential table */}
      <div
        className="absolute z-10 grid grid-cols-[29fr_42fr_29fr] border-[1.5px] border-[#091b3f] bg-white/80"
        style={{
          left: '13.840%',
          top: '58.730%',
          width: '72.310%',
          height: '7.310%',
        }}
      >
        <div className="flex items-center justify-center px-[0.8cqw] text-center border-l-[1.5px] border-[#091b3f]">
          <span
            className="font-bold text-[#0e0e0e] whitespace-nowrap"
            style={{ fontSize: '1.92cqw', lineHeight: 1.15 }}
          >
            {AR.certificate.categoryPrefix}: <span>{volunteer.categoryLabel}</span>
          </span>
        </div>
        <div className="flex items-center justify-center px-[0.8cqw] text-center border-l-[1.5px] border-[#091b3f]">
          <span
            className="font-bold text-[#0e0e0e] whitespace-nowrap"
            style={{
              fontSize: facultyLength > 24 ? '1.55cqw' : '1.90cqw',
              lineHeight: 1.15,
            }}
          >
            {AR.certificate.facultyPrefix}: <span>{volunteer.faculty}</span>
          </span>
        </div>
        <div className="flex items-center justify-center px-[0.8cqw] text-center">
          <span
            className="font-bold text-[#0e0e0e] whitespace-nowrap"
            style={{ fontSize: '1.92cqw', lineHeight: 1.15 }}
          >
            {AR.certificate.idPrefix}: <span>{volunteer.volunteerId}</span>
          </span>
        </div>
      </div>

      {/* Formal completion citation naming approved activities and volunteer hours */}
      <p
        className="absolute m-0 text-center font-semibold text-[#0e0e0e] z-10"
        style={{
          left: '14%',
          top: '67.2%',
          width: '72%',
          fontFamily: 'var(--font-cert-body)',
          fontSize: '2.35cqw',
          lineHeight: 1.4,
        }}
      >
        {AR.certificate.participationPrefix}{' '}
        <strong className="font-bold">{formattedActivities}</strong> {activityWord}{' '}
        {AR.certificate.participationMiddle} <strong className="font-bold">{formattedHours}</strong>{' '}
        {AR.certificate.hoursSuffix}
      </p>

      {/* Footer: issue date (right) and concentric embossed university seal (left) */}
      <p
        className="absolute m-0 flex items-center justify-center gap-[0.4cqw] text-center font-bold text-[#0e0e0e] z-10 whitespace-nowrap"
        style={{
          left: '60%',
          top: '84.430%',
          width: '26%',
          height: '5.660%',
          fontFamily: 'var(--font-cert-body)',
          fontSize: '2.15cqw',
          lineHeight: 1.15,
        }}
      >
        <span>{AR.certificate.dateLabel}</span> <span>{formattedDate}</span>
      </p>

      <figure
        className="absolute m-0 pointer-events-none select-none z-10"
        style={{ left: '18.990%', top: '76.420%', width: '13.450%', height: '18.870%' }}
      >
        <img
          src={officialSeal}
          alt={AR.certificate.approvedSeal}
          className="w-full h-full object-contain"
        />
      </figure>
    </article>
  );
}
