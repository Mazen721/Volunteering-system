import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, CheckCircle2, ClipboardEdit, ClipboardPlus } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../../api/client';
import { AR } from '../../constants/ar';
import { ACTIVITY_STATUSES, ACTIVITY_TYPES } from '../../constants/enums';
import type { ActivityStatus, ActivityType } from '../../constants/enums';
import { useToast } from '../../context/toastContext';
import type {
  Activity,
  ActivityFieldErrors,
  ActivityFormState,
  VolunteerBase,
} from '../../types';
import { triggerCelebration } from '../../utils/confetti';
import { toInputDateValue } from '../../utils/format';
import { ModalFrame } from '../ModalFrame';

const INPUT_CLASS =
  'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-mnu-500/40';

interface FieldErrorProps {
  message?: string;
}

function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;
  return <p className="text-[11px] font-bold text-rose-600 mt-1">{message}</p>;
}

function getActivityVolunteer(activity?: Activity | null): VolunteerBase | null {
  if (activity?.volunteer && typeof activity.volunteer !== 'string') {
    return activity.volunteer;
  }
  return null;
}

function buildInitialActivityForm(
  activity?: Activity | null,
  presetVolunteer?: VolunteerBase | null
): ActivityFormState {
  if (activity) {
    return {
      volunteerId:
        getActivityVolunteer(activity)?.volunteerId || presetVolunteer?.volunteerId || '',
      title: activity.title,
      type: activity.type,
      hours: String(activity.hours),
      date: toInputDateValue(activity.date),
      supervisor: activity.supervisor,
      status: activity.status,
    };
  }
  return {
    volunteerId: presetVolunteer?.volunteerId || '',
    title: '',
    type: ACTIVITY_TYPES[0],
    hours: '',
    date: new Date().toISOString().slice(0, 10),
    supervisor: '',
    status: 'pending',
  };
}

function validateActivityForm(form: ActivityFormState): ActivityFieldErrors {
  const errors: ActivityFieldErrors = {};
  if (!form.volunteerId.trim()) {
    errors.volunteerId = AR.volunteerModal.idRequired;
  }
  if (form.title.trim().length < 2) {
    errors.title = AR.activityModal.titleMin;
  }
  const numericHours = Number(form.hours);
  if (!String(form.hours).trim() || !Number.isFinite(numericHours) || numericHours <= 0) {
    errors.hours = AR.activityModal.hoursPositive;
  }
  const parsedDate = form.date ? new Date(form.date) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    errors.date = AR.activityModal.dateRequired;
  } else {
    const endOfTodayUtc = new Date();
    endOfTodayUtc.setUTCHours(23, 59, 59, 999);
    if (parsedDate.getTime() > endOfTodayUtc.getTime()) {
      errors.date = AR.activityModal.dateFuture;
    }
  }
  if (form.supervisor.trim().length < 2) {
    errors.supervisor = AR.activityModal.supervisorMin;
  }
  return errors;
}

interface ReadOnlyVolunteerCardProps {
  volunteer: VolunteerBase;
}

function ReadOnlyVolunteerCard({ volunteer }: ReadOnlyVolunteerCardProps) {
  return (
    <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs">
      <div className="flex items-center gap-2 font-bold text-emerald-800">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>{AR.activityModal.volunteerFoundNotice}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
        <div>
          <span className="text-slate-500 block">{AR.activityModal.readOnlyNameLabel}</span>
          <span className="font-bold text-slate-800">{volunteer.fullName}</span>
        </div>
        <div>
          <span className="text-slate-500 block">{AR.activityModal.readOnlyCategoryLabel}</span>
          <span className="font-bold text-slate-800">
            {volunteer.categoryLabel || AR.categories[volunteer.category]}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">{AR.activityModal.readOnlyFacultyLabel}</span>
          <span className="font-bold text-slate-800">{volunteer.faculty}</span>
        </div>
      </div>
    </div>
  );
}

interface ActivityModalContentProps {
  activity?: Activity | null;
  presetVolunteer?: VolunteerBase | null;
  onClose: () => void;
  onSaved: () => void;
}

function ActivityModalContent({
  activity,
  presetVolunteer,
  onClose,
  onSaved,
}: ActivityModalContentProps) {
  const isEditMode = Boolean(activity);
  const isVolunteerLocked = isEditMode || Boolean(presetVolunteer);
  const { showToast } = useToast();

  const [form, setForm] = useState<ActivityFormState>(() =>
    buildInitialActivityForm(activity, presetVolunteer)
  );
  const [resolvedVolunteer, setResolvedVolunteer] = useState<VolunteerBase | null>(
    () => presetVolunteer || getActivityVolunteer(activity)
  );
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ActivityFieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const lookupReqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const lookupVolunteerById = useCallback(async (rawId: string) => {
    const trimmed = rawId.trim();
    if (!trimmed) {
      setResolvedVolunteer(null);
      setLookupError('');
      return null;
    }

    const reqId = ++lookupReqRef.current;
    setLookingUp(true);
    setLookupError('');
    try {
      const response = await apiClient.get<{ volunteer: VolunteerBase }>(
        `/volunteers/${encodeURIComponent(trimmed)}`
      );
      if (reqId !== lookupReqRef.current) return null;
      setResolvedVolunteer(response.data.volunteer);
      return response.data.volunteer;
    } catch (error) {
      if (reqId === lookupReqRef.current) {
        setResolvedVolunteer(null);
        setLookupError(extractApiErrorMessage(error));
      }
      return null;
    } finally {
      if (reqId === lookupReqRef.current) {
        setLookingUp(false);
      }
    }
  }, []);

  function handleVolunteerIdChange(nextId: string) {
    setForm((prev) => ({ ...prev, volunteerId: nextId }));
    setResolvedVolunteer(null);
    setLookupError('');

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const trimmed = nextId.trim();
    if (!trimmed) {
      return;
    }
    debounceRef.current = setTimeout(() => {
      lookupVolunteerById(trimmed);
    }, 250);
  }

  function updateField<K extends keyof ActivityFormState>(field: K, value: ActivityFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError('');

    const errors = validateActivityForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    let targetVolunteer = resolvedVolunteer;
    if (!activity && !targetVolunteer) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      targetVolunteer = await lookupVolunteerById(form.volunteerId);
      if (!targetVolunteer) {
        setSubmitError(AR.activityModal.volunteerLookupRequired);
        return;
      }
    }

    setSubmitting(true);
    try {
      const basePayload = {
        title: form.title.trim(),
        type: form.type,
        hours: Number(form.hours),
        date: form.date,
        supervisor: form.supervisor.trim(),
        status: form.status,
      };

      if (activity) {
        await apiClient.put(`/activities/${activity._id}`, basePayload);
        showToast({ type: 'success', message: AR.activityModal.editSuccess });
      } else {
        if (!targetVolunteer) {
          setSubmitError(AR.activityModal.volunteerLookupRequired);
          return;
        }
        const response = await apiClient.post<{ activity: Activity | null; warning?: string }>(
          '/activities',
          {
            volunteerId: targetVolunteer.volunteerId,
            ...basePayload,
          }
        );
        showToast({ type: 'success', message: AR.activityModal.createSuccess });
        if (response.data.warning) {
          showToast({ type: 'warning', message: response.data.warning });
        }
      }

      triggerCelebration();
      onSaved();
      onClose();
    } catch (error) {
      setSubmitError(extractApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {submitError && (
        <div
          role="alert"
          className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4 text-xs">
        <div>
          <label htmlFor="act-volunteer-id" className="block font-bold text-slate-700 mb-1">
            {AR.activityModal.volunteerIdLabel}
          </label>
          <input
            id="act-volunteer-id"
            type="text"
            value={form.volunteerId}
            disabled={isVolunteerLocked}
            onChange={(event) => handleVolunteerIdChange(event.target.value)}
            placeholder={AR.activityModal.volunteerIdPlaceholder}
            className={`${INPUT_CLASS} disabled:bg-slate-100 disabled:text-slate-500`}
          />
          <FieldError message={fieldErrors.volunteerId} />
          {lookingUp && (
            <p className="text-[11px] font-bold text-mnu-500 mt-1">
              {AR.activityModal.lookingUpVolunteer}
            </p>
          )}
          {lookupError && (
            <p role="alert" className="text-[11px] font-bold text-rose-600 mt-1">
              {lookupError}
            </p>
          )}
        </div>

        {resolvedVolunteer && <ReadOnlyVolunteerCard volunteer={resolvedVolunteer} />}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="act-title" className="block font-bold text-slate-700 mb-1">
              {AR.activityModal.titleLabel}
            </label>
            <input
              id="act-title"
              type="text"
              value={form.title}
              onChange={(event) => updateField('title', event.target.value)}
              placeholder={AR.activityModal.titlePlaceholder}
              className={INPUT_CLASS}
            />
            <FieldError message={fieldErrors.title} />
          </div>

          <div>
            <label htmlFor="act-type" className="block font-bold text-slate-700 mb-1">
              {AR.activityModal.typeLabel}
            </label>
            <select
              id="act-type"
              value={form.type}
              onChange={(event) => updateField('type', event.target.value as ActivityType)}
              className={INPUT_CLASS}
            >
              {ACTIVITY_TYPES.map((typeOption) => (
                <option key={typeOption} value={typeOption}>
                  {typeOption}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="act-hours" className="block font-bold text-slate-700 mb-1">
              {AR.activityModal.hoursLabel}
            </label>
            <input
              id="act-hours"
              type="number"
              min="1"
              value={form.hours}
              onChange={(event) => updateField('hours', event.target.value)}
              placeholder={AR.activityModal.hoursPlaceholder}
              className={INPUT_CLASS}
            />
            <FieldError message={fieldErrors.hours} />
          </div>

          <div>
            <label htmlFor="act-date" className="block font-bold text-slate-700 mb-1">
              {AR.activityModal.dateLabel}
            </label>
            <input
              id="act-date"
              type="date"
              value={form.date}
              onChange={(event) => updateField('date', event.target.value)}
              className={INPUT_CLASS}
            />
            <FieldError message={fieldErrors.date} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="act-supervisor" className="block font-bold text-slate-700 mb-1">
              {AR.activityModal.supervisorLabel}
            </label>
            <input
              id="act-supervisor"
              type="text"
              value={form.supervisor}
              onChange={(event) => updateField('supervisor', event.target.value)}
              placeholder={AR.activityModal.supervisorPlaceholder}
              className={INPUT_CLASS}
            />
            <FieldError message={fieldErrors.supervisor} />
          </div>

          <div>
            <label htmlFor="act-status" className="block font-bold text-slate-700 mb-1">
              {AR.activityModal.statusLabel}
            </label>
            <select
              id="act-status"
              value={form.status}
              onChange={(event) => updateField('status', event.target.value as ActivityStatus)}
              className={INPUT_CLASS}
            >
              {ACTIVITY_STATUSES.map((statusKey) => (
                <option key={statusKey} value={statusKey}>
                  {AR.statuses[statusKey]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
          >
            {AR.common.cancel}
          </button>
          <button
            type="submit"
            disabled={submitting || lookingUp}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold transition shadow-md cursor-pointer"
          >
            {submitting ? AR.common.saving : AR.common.save}
          </button>
        </div>
      </form>
    </>
  );
}

interface ActivityModalProps {
  isOpen: boolean;
  activity?: Activity | null;
  presetVolunteer?: VolunteerBase | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Modal for registering a new activity (with read-only volunteer ID lookup) or editing an existing one.
 */
export function ActivityModal({
  isOpen,
  activity,
  presetVolunteer,
  onClose,
  onSaved,
}: ActivityModalProps) {
  const isEditMode = Boolean(activity);

  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? AR.activityModal.editTitle : AR.activityModal.createTitle}
      subtitle={isEditMode ? AR.activityModal.editSubtitle : AR.activityModal.createSubtitle}
      icon={
        <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
          {isEditMode ? (
            <ClipboardEdit className="w-6 h-6" />
          ) : (
            <ClipboardPlus className="w-6 h-6" />
          )}
        </div>
      }
    >
      {isOpen && (
        <ActivityModalContent
          key={activity?._id || presetVolunteer?.volunteerId || 'new-activity'}
          activity={activity}
          presetVolunteer={presetVolunteer}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </ModalFrame>
  );
}
