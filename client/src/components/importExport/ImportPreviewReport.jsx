import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { AR } from '../../constants/ar.js';
import { formatNumber } from '../../utils/format.js';

function ReportIssueList({ title, items, containerClasses, Icon, getText }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={`p-4 rounded-2xl border space-y-2 ${containerClasses}`}>
      <h4 className="text-xs font-extrabold flex items-center gap-2">
        <Icon className="w-4 h-4 shrink-0" />
        <span>
          {title} ({formatNumber(items.length)})
        </span>
      </h4>
      <ul className="space-y-1 text-xs list-disc list-inside">
        {items.map((entry, index) => (
          <li key={index}>{getText(entry)}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Displays Excel import preview counts, errors, faculty/category conflicts, and duplicate alerts.
 */
export function ImportPreviewReport({ preview, committing, onCommit }) {
  const hasErrors = preview.errors.length > 0;
  const hasNoIssues =
    !hasErrors && preview.conflicts.length === 0 && preview.duplicates.length === 0;

  return (
    <div className="space-y-4 pt-2 border-t border-slate-100">
      <h4 className="text-sm font-extrabold text-slate-800">
        {AR.importExport.previewReportTitle}
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
          <span className="text-[11px] font-bold text-slate-500 block">
            {AR.importExport.volunteersInFile}
          </span>
          <span className="text-xl font-black text-mnu-500">
            {formatNumber(preview.volunteersCount)}
          </span>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
          <span className="text-[11px] font-bold text-slate-500 block">
            {AR.importExport.activitiesInFile}
          </span>
          <span className="text-xl font-black text-emerald-600">
            {formatNumber(preview.activitiesCount)}
          </span>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
          <span className="text-[11px] font-bold text-slate-500 block">
            {AR.importExport.skippedDuplicates}
          </span>
          <span className="text-xl font-black text-amber-600">
            {formatNumber(preview.skippedExactDuplicates)}
          </span>
        </div>
      </div>

      {hasNoIssues && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{AR.importExport.noIssuesNotice}</span>
        </div>
      )}

      <ReportIssueList
        title={AR.importExport.errorsHeading}
        items={preview.errors}
        containerClasses="bg-rose-50 border-rose-200 text-rose-800"
        Icon={AlertCircle}
        getText={(err) =>
          err.rowNumber
            ? `${AR.importExport.rowLabel} ${formatNumber(err.rowNumber)}: ${err.message}`
            : err.message
        }
      />

      <ReportIssueList
        title={AR.importExport.conflictsHeading}
        items={preview.conflicts}
        containerClasses="bg-amber-50 border-amber-200 text-amber-800"
        Icon={AlertTriangle}
        getText={(conflict) =>
          `${AR.importExport.rowLabel} ${formatNumber(conflict.rowNumber)}: ${conflict.message}`
        }
      />

      <ReportIssueList
        title={AR.importExport.duplicatesHeading}
        items={preview.duplicates}
        containerClasses="bg-blue-50 border-blue-200 text-blue-800"
        Icon={Info}
        getText={(dup) =>
          `${AR.importExport.rowLabel} ${formatNumber(dup.rowNumber)}: ${dup.message}`
        }
      />

      {hasErrors && (
        <p className="text-xs font-bold text-rose-600">{AR.importExport.commitBlockedNotice}</p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={hasErrors || committing}
          onClick={onCommit}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-md cursor-pointer"
        >
          {committing ? AR.importExport.committing : AR.importExport.commitButton}
        </button>
      </div>
    </div>
  );
}
