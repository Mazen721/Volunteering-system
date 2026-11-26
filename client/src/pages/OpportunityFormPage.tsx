import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  ImagePlus,
  Images,
  Lock,
  RefreshCw,
  Save,
  X,
} from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../api/client';
import { ModalFrame } from '../components/ModalFrame';
import { Navbar } from '../components/Navbar';
import { AR } from '../constants/ar';
import type { ActivityType, Faculty, InterestKey } from '../constants/enums';
import { ACTIVITY_TYPES, APPROVAL_MODES, FACULTIES, INTEREST_KEYS } from '../constants/enums';
import { useAuth } from '../context/authContext';
import { useToast } from '../context/toastContext';
import type {
  CategoryCounts,
  Opportunity,
  OpportunityFieldErrors,
  OpportunityFormState,
  OpportunityResponse,
} from '../types';
import {
  COVER_PRESETS,
  coverPresetsForFields,
  coverUrlForKey,
  defaultCoverKeyForFields,
} from '../utils/covers';
import { downscaleImageFileToDataUrl } from '../utils/imageFile';
import { toCairoInputDateTime } from '../utils/format';

const INITIAL_FORM: OpportunityFormState = {
  title: '',
  description: '',
  requirements: '',
  coverPreset: '',
  customCover: '',
  fields: [],
  activityType: ACTIVITY_TYPES[0],
  locationName: '',
  locationAddress: '',
  locationMapUrl: '',
  startAt: '',
  endAt: '',
  registrationDeadline: '',
  hours: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  faculty: '',
  studentSlots: '0',
  academicSlots: '0',
  adminSlots: '0',
  approvalMode: APPROVAL_MODES[0],
};

function buildFormFromOpportunity(opportunity: Opportunity): OpportunityFormState {
  return {
    title: opportunity.title,
    description: opportunity.description,
    requirements: opportunity.requirements,
    coverPreset: opportunity.coverPreset ?? '',
    customCover: opportunity.customCover ?? '',
    fields: opportunity.fields,
    activityType: opportunity.activityType,
    locationName: opportunity.location.name,
    locationAddress: opportunity.location.address,
    locationMapUrl: opportunity.location.mapUrl ?? '',
    startAt: toCairoInputDateTime(opportunity.startAt),
    endAt: toCairoInputDateTime(opportunity.endAt),
    registrationDeadline: toCairoInputDateTime(opportunity.registrationDeadline),
    hours: String(opportunity.hours),
    contactName: opportunity.contactName,
    contactPhone: opportunity.contactPhone,
    contactEmail: opportunity.contactEmail,
    faculty: opportunity.faculty ?? '',
    studentSlots: String(opportunity.slots.student),
    academicSlots: String(opportunity.slots.academic),
    adminSlots: String(opportunity.slots.admin),
    approvalMode: opportunity.approvalMode,
  };
}

function parseSlotValue(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return Number(trimmed);
}

function isValidSlot(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && /^\d+$/.test(trimmed);
}

function validateBasicDetails(
  form: OpportunityFormState,
  errors: OpportunityFieldErrors
): void {
  if (form.title.trim().length < 3) {
    errors.title = AR.opportunities.form.titleMin;
  }
  if (form.description.trim().length < 10) {
    errors.description = AR.opportunities.form.descriptionMin;
  }
  if (form.fields.length === 0) {
    errors.fields = AR.opportunities.form.fieldsRequired;
  }
  if (form.locationName.trim().length < 2) {
    errors.locationName = AR.opportunities.form.locationNameMin;
  }
  if (form.locationAddress.trim().length < 3) {
    errors.locationAddress = AR.opportunities.form.locationAddressMin;
  }
}

function validateSchedule(form: OpportunityFormState, errors: OpportunityFieldErrors): void {
  if (!form.startAt || !form.endAt || !form.registrationDeadline) {
    errors.startAt = AR.opportunities.form.scheduleRequired;
    return;
  }
  if (new Date(form.endAt).getTime() <= new Date(form.startAt).getTime()) {
    errors.endAt = AR.opportunities.form.endAfterStart;
  }
  if (new Date(form.registrationDeadline).getTime() > new Date(form.startAt).getTime()) {
    errors.registrationDeadline = AR.opportunities.form.deadlineBeforeStart;
  }
  const hours = Number(form.hours);
  if (!form.hours.trim() || !Number.isFinite(hours) || hours <= 0) {
    errors.hours = AR.opportunities.form.hoursPositive;
  }
}

function validateSlots(
  form: OpportunityFormState,
  errors: OpportunityFieldErrors,
  acceptedCounts?: CategoryCounts
): void {
  const slotValues = [form.studentSlots, form.academicSlots, form.adminSlots];
  if (!slotValues.every(isValidSlot)) {
    errors.slots = AR.opportunities.form.slotsInteger;
    return;
  }
  if (
    acceptedCounts &&
    (parseSlotValue(form.studentSlots) < acceptedCounts.student ||
      parseSlotValue(form.academicSlots) < acceptedCounts.academic ||
      parseSlotValue(form.adminSlots) < acceptedCounts.admin)
  ) {
    errors.slots = AR.opportunities.form.slotsBelowAccepted;
    return;
  }
  if (slotValues.every((value) => parseSlotValue(value) === 0)) {
    errors.slots = AR.opportunities.form.slotsPositive;
  }
}

function validateContact(form: OpportunityFormState, errors: OpportunityFieldErrors): void {
  if (form.contactName.trim().length < 2) {
    errors.contactName = AR.opportunities.form.contactNameMin;
  }
  if (form.contactPhone.trim().length < 5) {
    errors.contactPhone = AR.opportunities.form.contactPhoneMin;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
    errors.contactEmail = AR.opportunities.form.contactEmailInvalid;
  }
}

function validateOpportunityForm(
  form: OpportunityFormState,
  acceptedCounts?: CategoryCounts
): OpportunityFieldErrors {
  const errors: OpportunityFieldErrors = {};
  validateBasicDetails(form, errors);
  validateSchedule(form, errors);
  validateSlots(form, errors, acceptedCounts);
  validateContact(form, errors);
  return errors;
}

interface FieldShellProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

function FieldShell({ id, label, error, hint, children }: FieldShellProps) {
  return (
    <div>
      <label htmlFor={id} className="block font-bold text-slate-700 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] font-semibold text-amber-700 mt-1">{hint}</p>}
      {error && <p className="text-[11px] font-bold text-rose-600 mt-1">{error}</p>}
    </div>
  );
}

const INPUT_CLASS =
  'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-mnu-500/40 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed';

interface TextInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'tel' | 'number' | 'url' | 'datetime-local' | 'search';
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  min?: number;
  step?: string;
}

function TextInput({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  hint,
  disabled,
  min,
  step,
}: TextInputProps) {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_CLASS}
      />
    </FieldShell>
  );
}

/**
 * Create/edit page for volunteering opportunities with post-acceptance lock indicators.
 */
export function OpportunityFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState<OpportunityFormState>(INITIAL_FORM);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<OpportunityFieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [coverGalleryOpen, setCoverGalleryOpen] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState('');
  const [coverProcessing, setCoverProcessing] = useState(false);
  const effectiveCoverKey = form.coverPreset || defaultCoverKeyForFields(form.fields);
  // Compact picker: at most 8 field-relevant thumbnails inline (the first 8
  // catalogue presets when no field is chosen yet). The selected preset is
  // always among them so the current choice never hides behind the gallery.
  const compactCoverPresets = (() => {
    const relevant = coverPresetsForFields(form.fields).slice(0, 8);
    if (relevant.some((preset) => preset.key === effectiveCoverKey)) {
      return relevant;
    }
    const selectedPreset = COVER_PRESETS.find((preset) => preset.key === effectiveCoverKey);
    return selectedPreset ? [selectedPreset, ...relevant.slice(0, 7)] : relevant;
  })();

  const isDean = user?.role === 'dean';

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;

    apiClient
      .get<OpportunityResponse>(`/opportunities/${encodeURIComponent(id)}`)
      .then((response) => {
        if (cancelled) return;
        setOpportunity(response.data.opportunity);
        setForm(buildFormFromOpportunity(response.data.opportunity));
        setLoadError('');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(extractApiErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const acceptedTotal = useMemo(() => {
    if (!opportunity) return 0;
    return (
      opportunity.acceptedCounts.student +
      opportunity.acceptedCounts.academic +
      opportunity.acceptedCounts.admin
    );
  }, [opportunity]);

  const hasAcceptedApplicants = acceptedTotal > 0;
  const statusLocked =
    opportunity?.status === 'completed' || opportunity?.status === 'cancelled';
  const formDisabled = statusLocked;
  const scheduleLocked = hasAcceptedApplicants;

  function updateField<K extends keyof OpportunityFormState>(
    field: K,
    value: OpportunityFormState[K]
  ) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleCoverFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setCoverUploadError('');
    setCoverProcessing(true);
    try {
      const dataUrl = await downscaleImageFileToDataUrl(file);
      updateField('customCover', dataUrl);
    } catch (error) {
      setCoverUploadError(
        error instanceof Error && error.message === 'image-too-large'
          ? AR.opportunities.form.coverUploadTooLarge
          : AR.opportunities.form.coverUploadInvalid
      );
    } finally {
      setCoverProcessing(false);
    }
  }

  function toggleField(field: InterestKey) {
    setForm((previous) => ({
      ...previous,
      fields: previous.fields.includes(field)
        ? previous.fields.filter((entry) => entry !== field)
        : [...previous.fields, field],
    }));
  }

  function buildPayload() {
    return {
      title: form.title.trim(),
      description: form.description.trim(),
      requirements: form.requirements.trim(),
      coverPreset: form.coverPreset || defaultCoverKeyForFields(form.fields),
      customCover: form.customCover,
      fields: form.fields,
      activityType: form.activityType,
      location: {
        name: form.locationName.trim(),
        address: form.locationAddress.trim(),
        ...(form.locationMapUrl.trim() ? { mapUrl: form.locationMapUrl.trim() } : {}),
      },
      startAt: form.startAt,
      endAt: form.endAt,
      registrationDeadline: form.registrationDeadline,
      hours: Number(form.hours),
      contactName: form.contactName.trim(),
      contactPhone: form.contactPhone.trim(),
      contactEmail: form.contactEmail.trim(),
      ...(isDean ? {} : { faculty: form.faculty || null }),
      slots: {
        student: parseSlotValue(form.studentSlots),
        academic: parseSlotValue(form.academicSlots),
        admin: parseSlotValue(form.adminSlots),
      },
      approvalMode: form.approvalMode,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError('');

    const errors = validateOpportunityForm(form, opportunity?.acceptedCounts);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && id) {
        await apiClient.patch(`/opportunities/${encodeURIComponent(id)}`, buildPayload());
        showToast({ type: 'success', message: AR.opportunities.editSuccess });
      } else {
        await apiClient.post('/opportunities', buildPayload());
        showToast({ type: 'success', message: AR.opportunities.createSuccess });
      }
      navigate('/opportunities/manage');
    } catch (error) {
      setSubmitError(extractApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="glass-card rounded-3xl px-8 py-6 flex items-center gap-3 text-mnu-500 font-bold text-sm">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>{AR.common.loading}</span>
          </div>
        </main>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
          <div
            role="alert"
            className="p-8 rounded-3xl bg-rose-50 border border-rose-200 text-center space-y-4"
          >
            <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
            <p className="text-sm font-bold text-rose-800">
              {AR.opportunities.form.loadErrorTitle}
            </p>
            <p className="text-xs text-rose-700">{loadError}</p>
            <Link
              to="/opportunities/manage"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{AR.opportunities.form.backToManage}</span>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        <section className="glass-card rounded-3xl p-6 sm:p-8 space-y-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-mnu-500/10 text-mnu-500 flex items-center justify-center shrink-0">
                <CalendarClock className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-800">
                  {isEdit ? AR.opportunities.form.editTitle : AR.opportunities.form.createTitle}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  {isEdit
                    ? AR.opportunities.form.editSubtitle
                    : AR.opportunities.form.createSubtitle}
                </p>
              </div>
            </div>

            <Link
              to="/opportunities/manage"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{AR.opportunities.form.backToManage}</span>
            </Link>
          </div>

          {statusLocked && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
              <Lock className="w-4 h-4 shrink-0" />
              <span>{AR.opportunities.form.statusLockedNotice}</span>
            </div>
          )}

          {!statusLocked && hasAcceptedApplicants && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
              <Lock className="w-4 h-4 shrink-0" />
              <span>{AR.opportunities.form.lockedNotice}</span>
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-8 text-xs">
            <section className="space-y-4">
              <h2 className="text-sm font-black text-mnu-600 border-b border-slate-100 pb-2">
                {AR.opportunities.form.sectionBasic}
              </h2>

              <TextInput
                id="opportunity-title"
                label={AR.opportunities.form.titleLabel}
                value={form.title}
                onChange={(value) => updateField('title', value)}
                placeholder={AR.opportunities.form.titlePlaceholder}
                error={fieldErrors.title}
                disabled={formDisabled}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="opportunity-description"
                    className="block font-bold text-slate-700 mb-1"
                  >
                    {AR.opportunities.form.descriptionLabel}
                  </label>
                  <textarea
                    id="opportunity-description"
                    rows={4}
                    value={form.description}
                    disabled={formDisabled}
                    onChange={(event) => updateField('description', event.target.value)}
                    placeholder={AR.opportunities.form.descriptionPlaceholder}
                    className={INPUT_CLASS}
                  />
                  {fieldErrors.description && (
                    <p className="text-[11px] font-bold text-rose-600 mt-1">
                      {fieldErrors.description}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="opportunity-requirements"
                    className="block font-bold text-slate-700 mb-1"
                  >
                    {AR.opportunities.form.requirementsLabel}
                  </label>
                  <textarea
                    id="opportunity-requirements"
                    rows={4}
                    value={form.requirements}
                    disabled={formDisabled}
                    onChange={(event) => updateField('requirements', event.target.value)}
                    placeholder={AR.opportunities.form.requirementsPlaceholder}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="block font-bold text-slate-700 mb-2">
                    {AR.opportunities.form.fieldsLabel}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {INTEREST_KEYS.map((field) => {
                      const checked = form.fields.includes(field);
                      return (
                        <label
                          key={field}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold cursor-pointer transition ${
                            checked
                              ? 'bg-mnu-500 text-white border-mnu-500'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-mnu-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={formDisabled}
                            onChange={() => toggleField(field)}
                            className="sr-only"
                          />
                          <span>{AR.interests[field]}</span>
                        </label>
                      );
                    })}
                  </div>
                  {fieldErrors.fields && (
                    <p className="text-[11px] font-bold text-rose-600 mt-1">{fieldErrors.fields}</p>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="opportunity-activity-type"
                      className="block font-bold text-slate-700 mb-1"
                    >
                      {AR.opportunities.form.activityTypeLabel}
                    </label>
                    <select
                      id="opportunity-activity-type"
                      value={form.activityType}
                      disabled={formDisabled}
                      onChange={(event) =>
                        updateField('activityType', event.target.value as ActivityType)
                      }
                      className={INPUT_CLASS}
                    >
                      {ACTIVITY_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="opportunity-faculty"
                      className="block font-bold text-slate-700 mb-1"
                    >
                      {AR.opportunities.form.facultyLabel}
                    </label>
                    {isDean ? (
                      <div
                        id="opportunity-faculty"
                        className="px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600"
                      >
                        {user?.faculty ?? ''}
                      </div>
                    ) : (
                      <select
                        id="opportunity-faculty"
                        value={form.faculty}
                        disabled={formDisabled || scheduleLocked}
                        onChange={(event) =>
                          updateField('faculty', event.target.value as Faculty | '')
                        }
                        className={INPUT_CLASS}
                      >
                        <option value="">{AR.opportunities.form.allFacultiesOption}</option>
                        {FACULTIES.map((faculty) => (
                          <option key={faculty} value={faculty}>
                            {faculty}
                          </option>
                        ))}
                      </select>
                    )}
                    {isDean && (
                      <p className="text-[11px] font-semibold text-slate-500 mt-1">
                        {AR.opportunities.form.deanFacultyLockedNote}
                      </p>
                    )}
                    {!isDean && scheduleLocked && (
                      <p className="text-[11px] font-semibold text-amber-700 mt-1">
                        {AR.opportunities.form.lockedFieldHint}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <span className="block font-bold text-slate-700 mb-1">
                  {AR.opportunities.form.coverLabel}
                </span>
                <p className="text-[11px] font-semibold text-slate-500 mb-2">
                  {AR.opportunities.form.coverHint}
                </p>
                <div
                  data-testid="cover-selected-preview"
                  className="relative rounded-2xl overflow-hidden border-2 border-mnu-gold ring-2 ring-mnu-gold/40 max-w-md mb-3"
                >
                  <img
                    src={coverUrlForKey(effectiveCoverKey)}
                    alt=""
                    className="w-full h-44 object-cover"
                  />
                  <span className="absolute top-2 inset-inline-start-2 px-2 py-0.5 rounded-full bg-mnu-gold text-[#231a00] text-[10px] font-black">
                    ✓
                  </span>
                </div>
                <div
                  data-testid="cover-compact-grid"
                  className="grid grid-cols-4 md:grid-cols-8 gap-2 max-w-2xl"
                >
                  {compactCoverPresets.map((preset) => {
                    const selected = effectiveCoverKey === preset.key;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        disabled={formDisabled}
                        onClick={() => updateField('coverPreset', preset.key)}
                        aria-pressed={selected}
                        className={`relative rounded-2xl overflow-hidden border-2 transition ${
                          selected
                            ? 'border-mnu-gold ring-2 ring-mnu-gold/40'
                            : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={coverUrlForKey(preset.key)}
                          alt=""
                          className="w-full h-16 object-cover"
                          loading="lazy"
                        />
                        {selected && (
                          <span className="absolute top-1.5 inset-inline-start-1.5 px-2 py-0.5 rounded-full bg-mnu-gold text-[#231a00] text-[10px] font-black">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={formDisabled}
                  onClick={() => setCoverGalleryOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] font-bold hover:border-mnu-300 hover:text-mnu-600 transition disabled:opacity-60"
                >
                  <Images className="w-4 h-4" />
                  <span>{AR.opportunities.form.coverShowMore}</span>
                </button>

                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
                  <span className="block font-bold text-slate-700">
                    {AR.opportunities.form.coverUploadLabel}
                  </span>
                  <p className="text-[11px] font-semibold text-slate-500 mt-0.5 mb-3">
                    {AR.opportunities.form.coverUploadHint}
                  </p>
                  {form.customCover ? (
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="relative rounded-2xl overflow-hidden border-2 border-mnu-gold ring-2 ring-mnu-gold/40 w-44 shrink-0">
                        <img
                          src={form.customCover}
                          alt=""
                          className="w-full h-24 object-cover"
                        />
                        <span className="absolute top-1.5 inset-inline-start-1.5 px-2 py-0.5 rounded-full bg-mnu-gold text-[#231a00] text-[10px] font-black">
                          ✓
                        </span>
                      </div>
                      <div className="space-y-2">
                        <p className="font-black text-slate-700">
                          {AR.opportunities.form.coverUploadedBadge}
                        </p>
                        <button
                          type="button"
                          disabled={formDisabled}
                          onClick={() => updateField('customCover', '')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-rose-200 text-rose-600 text-[11px] font-bold hover:bg-rose-50 transition"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>{AR.opportunities.form.coverRemoveUpload}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label
                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold transition ${
                        formDisabled || coverProcessing
                          ? 'opacity-60 cursor-not-allowed'
                          : 'hover:border-mnu-300 hover:text-mnu-600 cursor-pointer'
                      }`}
                    >
                      {coverProcessing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <ImagePlus className="w-4 h-4" />
                      )}
                      <span>{AR.opportunities.form.coverUploadButton}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={formDisabled || coverProcessing}
                        onChange={(event) => {
                          void handleCoverFile(event.target.files?.[0]);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  )}
                  {coverUploadError && (
                    <p className="text-[11px] font-bold text-rose-600 mt-2">{coverUploadError}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TextInput
                  id="opportunity-location-name"
                  label={AR.opportunities.form.locationNameLabel}
                  value={form.locationName}
                  onChange={(value) => updateField('locationName', value)}
                  placeholder={AR.opportunities.form.locationNamePlaceholder}
                  error={fieldErrors.locationName}
                  disabled={formDisabled}
                />
                <TextInput
                  id="opportunity-location-address"
                  label={AR.opportunities.form.locationAddressLabel}
                  value={form.locationAddress}
                  onChange={(value) => updateField('locationAddress', value)}
                  placeholder={AR.opportunities.form.locationAddressPlaceholder}
                  error={fieldErrors.locationAddress}
                  disabled={formDisabled}
                />
                <TextInput
                  id="opportunity-location-map"
                  label={AR.opportunities.form.locationMapUrlLabel}
                  value={form.locationMapUrl}
                  onChange={(value) => updateField('locationMapUrl', value)}
                  type="url"
                  disabled={formDisabled}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-black text-mnu-600 border-b border-slate-100 pb-2">
                {AR.opportunities.form.sectionSchedule}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TextInput
                  id="opportunity-start-at"
                  label={AR.opportunities.form.startAtLabel}
                  value={form.startAt}
                  onChange={(value) => updateField('startAt', value)}
                  type="datetime-local"
                  error={fieldErrors.startAt}
                  hint={scheduleLocked ? AR.opportunities.form.lockedFieldHint : undefined}
                  disabled={formDisabled || scheduleLocked}
                />
                <TextInput
                  id="opportunity-end-at"
                  label={AR.opportunities.form.endAtLabel}
                  value={form.endAt}
                  onChange={(value) => updateField('endAt', value)}
                  type="datetime-local"
                  error={fieldErrors.endAt}
                  hint={scheduleLocked ? AR.opportunities.form.lockedFieldHint : undefined}
                  disabled={formDisabled || scheduleLocked}
                />
                <TextInput
                  id="opportunity-registration-deadline"
                  label={AR.opportunities.form.registrationDeadlineLabel}
                  value={form.registrationDeadline}
                  onChange={(value) => updateField('registrationDeadline', value)}
                  type="datetime-local"
                  error={fieldErrors.registrationDeadline}
                  disabled={formDisabled}
                />
              </div>

              <TextInput
                id="opportunity-hours"
                label={AR.opportunities.form.hoursLabel}
                value={form.hours}
                onChange={(value) => updateField('hours', value)}
                type="number"
                min={0.5}
                step="0.5"
                error={fieldErrors.hours}
                hint={scheduleLocked ? AR.opportunities.form.lockedFieldHint : undefined}
                disabled={formDisabled || scheduleLocked}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TextInput
                  id="opportunity-student-slots"
                  label={AR.opportunities.form.studentSlotsLabel}
                  value={form.studentSlots}
                  onChange={(value) => updateField('studentSlots', value)}
                  type="number"
                  min={0}
                  step="1"
                  disabled={formDisabled}
                />
                <TextInput
                  id="opportunity-academic-slots"
                  label={AR.opportunities.form.academicSlotsLabel}
                  value={form.academicSlots}
                  onChange={(value) => updateField('academicSlots', value)}
                  type="number"
                  min={0}
                  step="1"
                  disabled={formDisabled}
                />
                <TextInput
                  id="opportunity-admin-slots"
                  label={AR.opportunities.form.adminSlotsLabel}
                  value={form.adminSlots}
                  onChange={(value) => updateField('adminSlots', value)}
                  type="number"
                  min={0}
                  step="1"
                  disabled={formDisabled}
                />
              </div>
              <p className="text-[11px] font-semibold text-slate-500">
                {AR.opportunities.form.slotsHint}
              </p>
              {fieldErrors.slots && (
                <p className="text-[11px] font-bold text-rose-600">{fieldErrors.slots}</p>
              )}

              <div>
                <span className="block font-bold text-slate-700 mb-2">
                  {AR.opportunities.form.approvalModeLabel}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {APPROVAL_MODES.map((mode) => (
                    <label
                      key={mode}
                      className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition ${
                        form.approvalMode === mode
                          ? 'border-mnu-500 bg-mnu-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="approvalMode"
                        value={mode}
                        checked={form.approvalMode === mode}
                        disabled={formDisabled}
                        onChange={() => updateField('approvalMode', mode)}
                        className="mt-0.5 accent-mnu-500"
                      />
                      <span>
                        <span className="block font-black text-slate-800">
                          {AR.opportunities.approvalModes[mode]}
                        </span>
                        <span className="block text-[11px] font-semibold text-slate-500 mt-0.5">
                          {mode === 'auto'
                            ? AR.opportunities.form.approvalModeAutoHint
                            : AR.opportunities.form.approvalModeManualHint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-black text-mnu-600 border-b border-slate-100 pb-2">
                {AR.opportunities.form.sectionContact}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TextInput
                  id="opportunity-contact-name"
                  label={AR.opportunities.form.contactNameLabel}
                  value={form.contactName}
                  onChange={(value) => updateField('contactName', value)}
                  error={fieldErrors.contactName}
                  disabled={formDisabled}
                />
                <TextInput
                  id="opportunity-contact-phone"
                  label={AR.opportunities.form.contactPhoneLabel}
                  value={form.contactPhone}
                  onChange={(value) => updateField('contactPhone', value)}
                  type="tel"
                  error={fieldErrors.contactPhone}
                  disabled={formDisabled}
                />
                <TextInput
                  id="opportunity-contact-email"
                  label={AR.opportunities.form.contactEmailLabel}
                  value={form.contactEmail}
                  onChange={(value) => updateField('contactEmail', value)}
                  type="email"
                  error={fieldErrors.contactEmail}
                  disabled={formDisabled}
                />
              </div>
            </section>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <Link
                to="/opportunities/manage"
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
              >
                {AR.common.cancel}
              </Link>
              <button
                type="submit"
                disabled={submitting || formDisabled}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white font-bold transition shadow-md cursor-pointer"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{AR.opportunities.form.savingDraft}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{AR.opportunities.form.saveDraftButton}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      </main>

      <ModalFrame
        isOpen={coverGalleryOpen}
        onClose={() => setCoverGalleryOpen(false)}
        title={AR.opportunities.form.coverGalleryTitle}
        maxWidthClass="max-w-3xl"
        icon={
          <div className="w-11 h-11 rounded-2xl bg-[#c9a227]/15 text-[#b28e1f] flex items-center justify-center shrink-0">
            <Images className="w-6 h-6" />
          </div>
        }
      >
        <div className="max-h-[62vh] overflow-y-auto">
          <div data-testid="cover-gallery-grid" className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {COVER_PRESETS.map((preset) => {
              const selected = effectiveCoverKey === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  disabled={formDisabled}
                  onClick={() => {
                    updateField('coverPreset', preset.key);
                    setCoverGalleryOpen(false);
                  }}
                  aria-pressed={selected}
                  className={`relative rounded-2xl overflow-hidden border-2 transition ${
                    selected
                      ? 'border-mnu-gold ring-2 ring-mnu-gold/40'
                      : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                >
                  <img
                    src={coverUrlForKey(preset.key)}
                    alt=""
                    className="w-full h-20 object-cover"
                    loading="lazy"
                  />
                  {selected && (
                    <span className="absolute top-1.5 inset-inline-start-1.5 px-2 py-0.5 rounded-full bg-mnu-gold text-[#231a00] text-[10px] font-black">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </ModalFrame>
    </div>
  );
}
