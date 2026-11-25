import { useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { Navbar } from '../components/Navbar';
import { ImportPreviewReport } from '../components/importExport/ImportPreviewReport';
import { AR } from '../constants/ar';
import { FACULTIES } from '../constants/enums';
import { useAuth } from '../context/authContext';
import { useToast } from '../context/toastContext';
import type { ImportPreview, ImportResult, ImportSummary } from '../types';
import { triggerCelebration } from '../utils/confetti';
import { formatNumber } from '../utils/format';
import {
  matchReportPeriodPreset,
  REPORT_PERIOD_PRESET_KEYS,
  resolveReportPeriodPreset,
} from '../utils/reportPeriodPresets';
import type { ReportPeriodPresetKey } from '../utils/reportPeriodPresets';

function triggerFileDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Excel import/export page supporting 3-sheet .xlsx download and preview-then-commit upload.
 */
export function ImportExportPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isDean = user?.role === 'dean';

  const [exporting, setExporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [commitSummary, setCommitSummary] = useState<ImportSummary | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [reportFaculty, setReportFaculty] = useState('');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');

  const reportParams = new URLSearchParams({ autoprint: '1' });
  if (!isDean && reportFaculty) {
    reportParams.set('faculty', reportFaculty);
  }
  if (reportFrom) {
    reportParams.set('from', reportFrom);
  }
  if (reportTo) {
    reportParams.set('to', reportTo);
  }
  const reportHref = `/reports/print?${reportParams.toString()}`;

  const presetLabels: Record<ReportPeriodPresetKey, string> = {
    all: AR.report.allPeriods,
    last7: AR.report.panel.presets.last7,
    last30: AR.report.panel.presets.last30,
    last3Months: AR.report.panel.presets.last3Months,
    thisMonth: AR.report.panel.presets.thisMonth,
    lastMonth: AR.report.panel.presets.lastMonth,
  };
  // The active chip is derived from the input values themselves: a preset is
  // highlighted only while from/to still match its resolved range, so any
  // manual edit naturally clears the highlight.
  const activePreset = matchReportPeriodPreset(reportFrom, reportTo);

  function applyReportPreset(key: ReportPeriodPresetKey) {
    const range = resolveReportPeriodPreset(key);
    setReportFrom(range.from);
    setReportTo(range.to);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const response = await apiClient.get<Blob>('/excel/export', { responseType: 'blob' });
      triggerFileDownload(response.data, 'volunteer-hours-report.xlsx');
      showToast({ type: 'success', message: AR.importExport.exportSuccess });
      triggerCelebration();
    } catch (error) {
      showToast({ type: 'error', message: extractApiErrorMessage(error) });
    } finally {
      setExporting(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setPreview(null);
    setCommitSummary(null);
    setFileError('');

    if (file && !file.name.toLowerCase().endsWith('.xlsx')) {
      setSelectedFile(null);
      setFileError(AR.importExport.invalidFileType);
      return;
    }
    setSelectedFile(file);
  }

  async function uploadImportRequest(commit: boolean) {
    if (!selectedFile) {
      setFileError(AR.importExport.fileRequired);
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    const setBusy = commit ? setCommitting : setPreviewing;
    setBusy(true);
    setFileError('');

    try {
      const endpoint = commit ? '/excel/import?commit=true' : '/excel/import';
      const response = await apiClient.post<ImportResult>(endpoint, formData);
      setPreview(response.data.preview);
      if (commit && response.data.committed) {
        setCommitSummary(response.data.summary);
        showToast({ type: 'success', message: AR.importExport.commitSuccessToast });
        triggerCelebration();
      }
    } catch (error) {
      const message = extractApiErrorMessage(error);
      setFileError(message);
      showToast({ type: 'error', message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-2">
          <h2 className="text-xl sm:text-2xl font-black text-slate-800">
            {isDean ? AR.importExport.deanPageTitle : AR.importExport.pageTitle}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            {isDean && user?.faculty
              ? `${AR.importExport.deanPageSubtitle} (${user.faculty})`
              : AR.importExport.pageSubtitle}
          </p>
        </section>

        <section className="glass-card rounded-3xl p-6 space-y-4" data-testid="report-export-panel">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#c9a227]/15 text-[#8a6d1d] flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-800">{AR.report.panel.title}</h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                {AR.report.panel.description}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-bold text-slate-700">
              {AR.report.panel.presetsLabel}
            </span>
            <div className="flex flex-wrap gap-1.5" data-testid="report-preset-row">
              {REPORT_PERIOD_PRESET_KEYS.map((key) => {
                const isActive = activePreset === key;
                return (
                  <button
                    key={key}
                    type="button"
                    data-testid={`report-preset-${key}`}
                    aria-pressed={isActive}
                    onClick={() => applyReportPreset(key)}
                    className={
                      isActive
                        ? 'px-3 py-1.5 rounded-full bg-[#c9a227] text-[#122f4a] text-[11px] font-black shadow-sm transition cursor-pointer'
                        : 'px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-[#c9a227]/70 hover:text-slate-800 text-[11px] font-bold transition cursor-pointer'
                    }
                  >
                    {presetLabels[key]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="report-faculty-select"
                className="block text-xs font-bold text-slate-700"
              >
                {AR.report.panel.facultyLabel}
              </label>
              {isDean ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600">
                  <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>{user?.faculty ?? ''}</span>
                </div>
              ) : (
                <select
                  id="report-faculty-select"
                  data-testid="report-faculty-select"
                  value={reportFaculty}
                  onChange={(event) => setReportFaculty(event.target.value)}
                  className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2.5 cursor-pointer"
                >
                  <option value="">{AR.report.allFaculties}</option>
                  {FACULTIES.map((faculty) => (
                    <option key={faculty} value={faculty}>
                      {faculty}
                    </option>
                  ))}
                </select>
              )}
              {isDean && (
                <p className="text-[11px] font-bold text-slate-400">
                  {AR.report.panel.deanFacultyNote}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="report-from-input" className="block text-xs font-bold text-slate-700">
                {AR.report.panel.fromLabel}
              </label>
              <input
                id="report-from-input"
                data-testid="report-from-input"
                type="date"
                value={reportFrom}
                onChange={(event) => setReportFrom(event.target.value)}
                className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2.5"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="report-to-input" className="block text-xs font-bold text-slate-700">
                {AR.report.panel.toLabel}
              </label>
              <input
                id="report-to-input"
                data-testid="report-to-input"
                type="date"
                value={reportTo}
                onChange={(event) => setReportTo(event.target.value)}
                className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2.5"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-bold text-slate-400">{AR.report.panel.allTimeHint}</p>
            <Link
              to={reportHref}
              data-testid="report-export-link"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#c9a227] hover:bg-[#b28e1f] text-[#122f4a] text-xs font-black transition shadow-md"
            >
              <FileText className="w-4 h-4" />
              <span>{AR.report.exportButton}</span>
            </Link>
          </div>
        </section>

        <div className={`grid grid-cols-1 ${isDean ? '' : 'lg:grid-cols-3'} gap-6`}>
          <section className="glass-card rounded-3xl p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-slate-800">
                {AR.importExport.exportTitle}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {AR.importExport.exportDescription}
              </p>
              {isDean && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-600">
                  <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>{AR.importExport.deanImportRestrictedNotice}</span>
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={exporting}
                onClick={handleExport}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white text-xs font-bold transition shadow-md cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{exporting ? AR.importExport.exporting : AR.importExport.exportButton}</span>
              </button>
            </div>
          </section>

          {!isDean && (
            <section className="lg:col-span-2 glass-card rounded-3xl p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-800">
                  {AR.importExport.importTitle}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{AR.importExport.importDescription}</p>
              </div>
            </div>

            <div className="space-y-3">
              <label
                htmlFor="excel-upload-input"
                className="block text-xs font-bold text-slate-700"
              >
                {AR.importExport.chooseFileLabel}
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  id="excel-upload-input"
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileChange}
                  className="flex-1 text-xs text-slate-600 file:ml-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 bg-white border border-slate-200 rounded-xl p-2"
                />
                <button
                  type="button"
                  disabled={previewing || committing}
                  onClick={() => uploadImportRequest(false)}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-bold transition shadow-md shrink-0 cursor-pointer"
                >
                  {previewing ? AR.importExport.previewing : AR.importExport.previewButton}
                </button>
              </div>
            </div>

            {fileError && (
              <div
                role="alert"
                className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{fileError}</span>
              </div>
            )}

            {commitSummary && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 space-y-2 text-xs">
                <div className="font-extrabold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{AR.importExport.commitSuccessTitle}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-bold">
                  <div>
                    {AR.importExport.volunteersCreated}:{' '}
                    {formatNumber(commitSummary.volunteersCreated)}
                  </div>
                  <div>
                    {AR.importExport.volunteersUpdated}:{' '}
                    {formatNumber(commitSummary.volunteersUpdated)}
                  </div>
                  <div>
                    {AR.importExport.activitiesCreated}:{' '}
                    {formatNumber(commitSummary.activitiesCreated)}
                  </div>
                  <div>
                    {AR.importExport.skippedDuplicates}:{' '}
                    {formatNumber(commitSummary.skippedDuplicates)}
                  </div>
                </div>
              </div>
            )}

            {preview && (
              <ImportPreviewReport
                preview={preview}
                committing={committing}
                onCommit={() => uploadImportRequest(true)}
              />
            )}
          </section>
          )}
        </div>
      </main>
    </div>
  );
}
