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
import { useAuth } from '../context/authContext';
import { useToast } from '../context/toastContext';
import type { ImportPreview, ImportResult, ImportSummary } from '../types';
import { triggerCelebration } from '../utils/confetti';
import { formatNumber } from '../utils/format';

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

              <Link
                to="/reports/print?autoprint=1"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#c9a227] hover:bg-[#b28e1f] text-[#122f4a] text-xs font-black transition shadow-md"
              >
                <FileText className="w-4 h-4" />
                <span>{AR.report.exportButton}</span>
              </Link>
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
