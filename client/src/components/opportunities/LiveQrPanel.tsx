import { Copy, QrCode, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AR } from '../../constants/ar';
import type { Opportunity } from '../../types';
import { formatDateTimeAr } from '../../utils/format';

interface LiveQrPanelProps {
  opportunity: Opportunity;
  token: string;
  expiresAt: string;
  loadingToken: boolean;
  onRefreshToken: () => void;
  onCopyToken: () => void;
}

/**
 * Displays the rotating 45s QR check-in code and token controls for live events.
 */
export function LiveQrPanel({
  opportunity,
  token,
  expiresAt,
  loadingToken,
  onRefreshToken,
  onCopyToken,
}: LiveQrPanelProps) {
  const isPublished = opportunity.status === 'published';

  return (
    <section className="glass-card rounded-3xl p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-mnu-500/10 text-mnu-500 flex items-center justify-center shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-800">
              {AR.opportunities.live.qrSectionTitle}
            </h2>
            <p className="text-[11px] text-slate-500">{AR.opportunities.live.qrSubtitle}</p>
          </div>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-[11px] font-bold border ${
            opportunity.checkInOpen
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          {opportunity.checkInOpen
            ? AR.opportunities.live.windowOpenBadge
            : AR.opportunities.live.windowClosedBadge}
        </span>
      </div>

      {!isPublished ? (
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs font-bold text-slate-600">
          {AR.opportunities.live.qrClosedNotice}
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div
            data-testid="live-qr-wrapper"
            className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center min-w-[220px] min-h-[220px]"
          >
            {token ? (
              <QRCodeSVG
                value={token}
                size={196}
                level="M"
                title={AR.opportunities.live.qrSectionTitle}
              />
            ) : (
              <span className="text-xs font-bold text-slate-500">
                {AR.opportunities.live.qrLoading}
              </span>
            )}
          </div>

          <div className="flex-1 w-full space-y-3">
            {token && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <p className="text-[11px] font-bold text-slate-500">
                  {AR.opportunities.live.expiresAtLabel}{' '}
                  {expiresAt ? formatDateTimeAr(expiresAt) : ''}
                </p>
                <p
                  data-testid="live-checkin-token"
                  dir="ltr"
                  className="text-[11px] font-mono text-slate-700 break-all select-all"
                >
                  {token}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRefreshToken}
                disabled={loadingToken}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white text-xs font-bold transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingToken ? 'animate-spin' : ''}`} />
                <span>{AR.opportunities.live.qrRefreshBtn}</span>
              </button>
              {token && (
                <button
                  type="button"
                  onClick={onCopyToken}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{AR.opportunities.live.qrCopyBtn}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
