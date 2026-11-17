import { useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, UserPlus } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../../api/client';
import { AR } from '../../constants/ar';
import type { Faculty } from '../../constants/enums';
import { FACULTIES } from '../../constants/enums';
import { useToast } from '../../context/toastContext';
import { ModalFrame } from '../ModalFrame';

interface CreateDeanFormState {
  fullName: string;
  email: string;
  faculty: Faculty | '';
  password: string;
}

type CreateDeanFieldErrors = Partial<Record<keyof CreateDeanFormState, string>>;

const INITIAL_FORM: CreateDeanFormState = {
  fullName: '',
  email: '',
  faculty: '',
  password: '',
};

function validateDeanForm(form: CreateDeanFormState): CreateDeanFieldErrors {
  const errors: CreateDeanFieldErrors = {};
  if (form.fullName.trim().length < 2) {
    errors.fullName = AR.deans.fullNameMin;
  }
  const email = form.email.trim();
  if (!email) {
    errors.email = AR.deans.emailRequired;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = AR.deans.emailInvalid;
  }
  if (!form.faculty) {
    errors.faculty = AR.deans.facultyRequired;
  }
  if (form.password.length < 8) {
    errors.password = AR.deans.passwordMin;
  }
  return errors;
}

interface CreateDeanContentProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateDeanContent({ onClose, onCreated }: CreateDeanContentProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<CreateDeanFormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<CreateDeanFieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function updateField<K extends keyof CreateDeanFormState>(
    field: K,
    value: CreateDeanFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError('');

    const errors = validateDeanForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !form.faculty) {
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/users', {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        faculty: form.faculty,
        password: form.password,
      });
      showToast({ type: 'success', message: AR.deans.createSuccess });
      onCreated();
      onClose();
    } catch (err) {
      setSubmitError(extractApiErrorMessage(err));
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
          <label htmlFor="dean-fullname" className="block font-bold text-slate-700 mb-1">
            {AR.deans.fullNameLabel}
          </label>
          <input
            id="dean-fullname"
            type="text"
            value={form.fullName}
            onChange={(event) => updateField('fullName', event.target.value)}
            placeholder={AR.deans.fullNamePlaceholder}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
          />
          {fieldErrors.fullName && (
            <p className="text-[11px] font-bold text-rose-600 mt-1">{fieldErrors.fullName}</p>
          )}
        </div>

        <div>
          <label htmlFor="dean-email" className="block font-bold text-slate-700 mb-1">
            {AR.deans.emailLabel}
          </label>
          <input
            id="dean-email"
            type="email"
            value={form.email}
            onChange={(event) => updateField('email', event.target.value)}
            placeholder={AR.deans.emailPlaceholder}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
          />
          {fieldErrors.email && (
            <p className="text-[11px] font-bold text-rose-600 mt-1">{fieldErrors.email}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="dean-faculty" className="block font-bold text-slate-700 mb-1">
              {AR.deans.facultyLabel}
            </label>
            <select
              id="dean-faculty"
              value={form.faculty}
              onChange={(event) => updateField('faculty', event.target.value as Faculty | '')}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
            >
              <option value="">{AR.deans.selectFaculty}</option>
              {FACULTIES.map((faculty) => (
                <option key={faculty} value={faculty}>
                  {faculty}
                </option>
              ))}
            </select>
            {fieldErrors.faculty && (
              <p className="text-[11px] font-bold text-rose-600 mt-1">{fieldErrors.faculty}</p>
            )}
          </div>

          <div>
            <label htmlFor="dean-password" className="block font-bold text-slate-700 mb-1">
              {AR.deans.passwordLabel}
            </label>
            <input
              id="dean-password"
              type="password"
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              placeholder={AR.deans.passwordPlaceholder}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
            />
            {fieldErrors.password && (
              <p className="text-[11px] font-bold text-rose-600 mt-1">{fieldErrors.password}</p>
            )}
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
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white font-bold transition shadow-md cursor-pointer"
          >
            {submitting ? AR.deans.creating : AR.deans.createButton}
          </button>
        </div>
      </form>
    </>
  );
}

interface CreateDeanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Modal form for creating a new faculty dean account.
 */
export function CreateDeanModal({ isOpen, onClose, onCreated }: CreateDeanModalProps) {
  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onClose}
      title={AR.deans.createModalTitle}
      subtitle={AR.deans.createModalSubtitle}
      icon={
        <div className="w-11 h-11 rounded-2xl bg-mnu-500/10 text-mnu-500 flex items-center justify-center shrink-0">
          <UserPlus className="w-6 h-6" />
        </div>
      }
    >
      {isOpen && <CreateDeanContent onClose={onClose} onCreated={onCreated} />}
    </ModalFrame>
  );
}
