import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../../api/client';
import { ModalFrame } from '../ModalFrame';
import { AR } from '../../constants/ar';
import type { ApplicationStatus } from '../../constants/enums';
import { useToast } from '../../context/toastContext';
import type {
  Application,
  OpportunityApplicantsResponse,
  VolunteerBase,
} from '../../types';
import { formatDateTimeAr } from '../../utils/format';

const APPLICATION_STATUS_STYLES: Record<ApplicationStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  waitlisted: 'bg-sky-50 text-sky-700 border-sky-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

const DECISION_ACTIONS: Array<{
  status: ApplicationStatus;
  label: string;
  className: string;
  Icon: typeof CheckCircle2;
}> = [
  {
    status: 'accepted',
    label: AR.opportunities.applicants.acceptBtn,
    className:
      'bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200',
    Icon: CheckCircle2,
  },
  {
    status: 'waitlisted',
    label: AR.opportunities.applicants.waitlistBtn,
    className:
      'bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white border border-sky-200',
    Icon: Clock,
  },
  {
    status: 'rejected',
    label: AR.opportunities.applicants.rejectBtn,
    className:
      'bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200',
    Icon: XCircle,
  },
];

function getApplicant(application: Application): VolunteerBase | null {
  return application.volunteer && typeof application.volunteer !== 'string'
    ? application.volunteer
    : null;
}

async function fetchApplicants(
  opportunityId: string
): Promise<OpportunityApplicantsResponse> {
  const response = await apiClient.get<OpportunityApplicantsResponse>(
    `/opportunities/${encodeURIComponent(opportunityId)}/applications`
  );
  return response.data;
}

interface ApplicantDecisionButtonsProps {
  application: Application;
  busy: boolean;
  onDecide: (application: Application, status: ApplicationStatus) => void;
}

function ApplicantDecisionButtons({ application, busy, onDecide }: ApplicantDecisionButtonsProps) {
  const allowed = DECISION_ACTIONS.filter((action) => action.status !== application.status);

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {allowed.map(({ status, label, className, Icon }) => (
        <button
          key={status}
          type="button"
          disabled={busy}
          onClick={() => onDecide(application, status)}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer disabled:opacity-60 ${className}`}
        >
          <Icon className="w-3.5 h-3.5" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

interface ApplicantsContentProps {
  opportunityId: string;
  isClosed: boolean;
}

function ApplicantsContent({ opportunityId, isClosed }: ApplicantsContentProps) {
  const { showToast } = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchApplicants(opportunityId)
      .then((data) => {
        if (cancelled) return;
        setApplications(data.applications);
        setReadOnly(data.readOnly);
        setError('');
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(extractApiErrorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [opportunityId]);

  async function handleRetry() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchApplicants(opportunityId);
      setApplications(data.applications);
      setReadOnly(data.readOnly);
    } catch (requestError) {
      setError(extractApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(application: Application, status: ApplicationStatus) {
    setBusyId(application._id);
    try {
      const response = await apiClient.patch<{ application: Application }>(
        `/applications/${encodeURIComponent(application._id)}`,
        { status }
      );
      setApplications((previous) =>
        previous.map((entry) =>
          entry._id === application._id ? response.data.application : entry
        )
      );
      showToast({ type: 'success', message: AR.opportunities.applicants.decisionSuccess });
    } catch (requestError) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
    } finally {
      setBusyId(null);
    }
  }

  const decisionsDisabled = readOnly || isClosed;

  return (
    <>
      {readOnly && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-xs font-bold">
          <UserCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="block">{AR.opportunities.applicants.readOnlyBadge}</span>
            <span className="block font-semibold mt-1">
              {AR.opportunities.applicants.readOnlyNotice}
            </span>
          </div>
        </div>
      )}

      {isClosed && !readOnly && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{AR.opportunities.applicants.closedNotice}</span>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs font-bold text-mnu-500">
          {AR.opportunities.applicants.loading}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-3"
        >
          <AlertCircle className="w-7 h-7 text-rose-600 mx-auto" />
          <p className="text-sm font-bold text-rose-800">
            {AR.opportunities.applicants.errorTitle}
          </p>
          <p className="text-xs text-rose-700">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{AR.common.retry}</span>
          </button>
        </div>
      ) : applications.length === 0 ? (
        <div className="p-10 text-center text-xs sm:text-sm font-bold text-slate-500">
          {AR.opportunities.applicants.empty}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/50 max-h-[55vh]">
          <table className="w-full text-right border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-mnu-500 text-white text-xs font-bold">
                <th className="p-3 whitespace-nowrap">
                  {AR.opportunities.applicants.columns.volunteer}
                </th>
                <th className="p-3 whitespace-nowrap">
                  {AR.opportunities.applicants.columns.volunteerId}
                </th>
                <th className="p-3 whitespace-nowrap">
                  {AR.opportunities.applicants.columns.category}
                </th>
                <th className="p-3 whitespace-nowrap">
                  {AR.opportunities.applicants.columns.faculty}
                </th>
                <th className="p-3 whitespace-nowrap">
                  {AR.opportunities.applicants.columns.appliedAt}
                </th>
                <th className="p-3 text-center whitespace-nowrap">
                  {AR.opportunities.applicants.columns.status}
                </th>
                {!readOnly && (
                  <th className="p-3 text-center whitespace-nowrap">
                    {AR.opportunities.applicants.columns.actions}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
              {applications.map((application) => {
                const applicant = getApplicant(application);
                return (
                  <tr key={application._id} className="hover:bg-slate-50/80 transition align-top">
                    <td className="p-3 font-black text-slate-800 whitespace-nowrap">
                      {applicant?.fullName ?? AR.opportunities.applicants.unknownVolunteer}
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">
                      {applicant?.volunteerId ?? '—'}
                    </td>
                    <td className="p-3 whitespace-nowrap">{AR.categories[application.category]}</td>
                    <td className="p-3 text-slate-700 whitespace-nowrap">{application.faculty}</td>
                    <td className="p-3 text-slate-500 whitespace-nowrap">
                      {formatDateTimeAr(application.appliedAt)}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${APPLICATION_STATUS_STYLES[application.status]}`}
                      >
                        {AR.opportunities.applicationStatuses[application.status]}
                      </span>
                    </td>
                    {!readOnly && (
                      <td className="p-3">
                        {decisionsDisabled ? (
                          <span className="block text-center text-[11px] font-bold text-slate-400">
                            —
                          </span>
                        ) : (
                          <ApplicantDecisionButtons
                            application={application}
                            busy={busyId === application._id}
                            onDecide={handleDecision}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

interface ApplicantsModalProps {
  isOpen: boolean;
  opportunityId: string | null;
  opportunityTitle: string;
  isClosed: boolean;
  onClose: () => void;
}

/**
 * Organizer applicant review modal supporting manual decisions or a read-only faculty view.
 */
export function ApplicantsModal({
  isOpen,
  opportunityId,
  opportunityTitle,
  isClosed,
  onClose,
}: ApplicantsModalProps) {
  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onClose}
      title={AR.opportunities.applicants.title}
      subtitle={`${opportunityTitle} — ${AR.opportunities.applicants.subtitle}`}
      maxWidthClass="max-w-5xl"
      icon={
        <div className="w-11 h-11 rounded-2xl bg-mnu-500/10 text-mnu-500 flex items-center justify-center shrink-0">
          <Users className="w-6 h-6" />
        </div>
      }
    >
      {isOpen && opportunityId && (
        <ApplicantsContent opportunityId={opportunityId} isClosed={isClosed} />
      )}
    </ModalFrame>
  );
}
