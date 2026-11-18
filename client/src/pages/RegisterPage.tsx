import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckSquare, Square, UserPlus } from 'lucide-react';
import { extractApiErrorMessage } from '../api/client';
import { UniversityLogo } from '../components/UniversityLogo';
import { AR, INTEREST_LABELS } from '../constants/ar';
import type { Faculty, InterestKey, VolunteerCategory } from '../constants/enums';
import { CATEGORIES, FACULTIES, INTEREST_KEYS } from '../constants/enums';
import { getHomePathForUser, useAuth } from '../context/authContext';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNIVERSITY_EMAIL_DOMAIN = '@mnu.edu.eg';

interface RegisterFormState {
  fullName: string;
  email: string;
  password: string;
  volunteerId: string;
  category: VolunteerCategory;
  faculty: Faculty | '';
  interests: InterestKey[];
}

type RegisterFieldErrors = Partial<Record<keyof RegisterFormState, string>>;

const INITIAL_FORM_STATE: RegisterFormState = {
  fullName: '',
  email: '',
  password: '',
  volunteerId: '',
  category: 'student',
  faculty: '',
  interests: [],
};

function validateRegisterForm(form: RegisterFormState): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {};
  if (form.fullName.trim().length < 2) {
    errors.fullName = AR.register.fullNameMin;
  }
  const trimmedEmail = form.email.trim();
  if (!trimmedEmail) {
    errors.email = AR.register.emailRequired;
  } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
    errors.email = AR.register.emailInvalid;
  } else if (!trimmedEmail.toLowerCase().endsWith(UNIVERSITY_EMAIL_DOMAIN)) {
    errors.email = AR.register.emailDomainNotAllowed;
  }
  if (form.password.length < 8) {
    errors.password = AR.register.passwordMin;
  }
  if (!form.volunteerId.trim()) {
    errors.volunteerId = AR.register.volunteerIdRequired;
  }
  if (!form.faculty) {
    errors.faculty = AR.register.facultyRequired;
  }
  if (form.interests.length === 0) {
    errors.interests = AR.register.interestsMin;
  }
  return errors;
}

interface RegisterTextFieldProps {
  id: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
}

function RegisterTextField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
}: RegisterTextFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className="w-full px-4 py-2.5 bg-white/80 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
      />
      {error && <p className="text-[11px] font-bold text-rose-600">{error}</p>}
    </div>
  );
}

/**
 * Public self-registration page for students and staff volunteers with faculty and interest selection.
 */
export function RegisterPage() {
  const { user, status, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<RegisterFormState>(INITIAL_FORM_STATE);
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated' && user) {
    return <Navigate to={getHomePathForUser(user)} replace />;
  }

  function toggleInterest(key: InterestKey) {
    setForm((prev) => {
      const exists = prev.interests.includes(key);
      const nextInterests = exists
        ? prev.interests.filter((interest) => interest !== key)
        : [...prev.interests, key];
      return { ...prev, interests: nextInterests };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError('');

    const errors = validateRegisterForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !form.faculty) {
      return;
    }

    setSubmitting(true);
    try {
      const registeredUser = await register({
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        volunteerId: form.volunteerId.trim(),
        category: form.category,
        faculty: form.faculty,
        interests: form.interests,
      });
      navigate(getHomePathForUser(registeredUser), { replace: true });
    } catch (error) {
      setSubmitError(extractApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-8">
      <div className="glass-card w-full max-w-2xl rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-3">
          <UniversityLogo className="w-16 h-16 mx-auto bg-white shadow-lg shadow-mnu-500/20 ring-2 ring-mnu-500/15" />
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-mnu-500">{AR.register.title}</h1>
            <p className="text-xs text-slate-500 mt-1">{AR.register.subtitle}</p>
          </div>
        </div>

        {submitError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <RegisterTextField
              id="register-full-name"
              label={AR.register.fullNameLabel}
              value={form.fullName}
              onChange={(fullName) => setForm((prev) => ({ ...prev, fullName }))}
              placeholder={AR.register.fullNamePlaceholder}
              error={fieldErrors.fullName}
            />

            <RegisterTextField
              id="register-volunteer-id"
              label={AR.register.volunteerIdLabel}
              value={form.volunteerId}
              onChange={(volunteerId) => setForm((prev) => ({ ...prev, volunteerId }))}
              placeholder={AR.register.volunteerIdPlaceholder}
              error={fieldErrors.volunteerId}
            />

            <RegisterTextField
              id="register-email"
              label={AR.register.emailLabel}
              type="email"
              value={form.email}
              onChange={(email) => setForm((prev) => ({ ...prev, email }))}
              placeholder={AR.register.emailPlaceholder}
              error={fieldErrors.email}
            />

            <RegisterTextField
              id="register-password"
              label={AR.register.passwordLabel}
              type="password"
              value={form.password}
              onChange={(password) => setForm((prev) => ({ ...prev, password }))}
              placeholder={AR.register.passwordPlaceholder}
              error={fieldErrors.password}
            />

            <div className="space-y-1.5">
              <label htmlFor="register-category" className="block text-xs font-bold text-slate-700">
                {AR.register.categoryLabel}
              </label>
              <select
                id="register-category"
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    category: event.target.value as VolunteerCategory,
                  }))
                }
                className="w-full px-4 py-2.5 bg-white/80 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {AR.categories[category]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="register-faculty" className="block text-xs font-bold text-slate-700">
                {AR.register.facultyLabel}
              </label>
              <select
                id="register-faculty"
                value={form.faculty}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, faculty: event.target.value as Faculty | '' }))
                }
                aria-invalid={Boolean(fieldErrors.faculty)}
                className="w-full px-4 py-2.5 bg-white/80 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
              >
                <option value="">{AR.register.selectFaculty}</option>
                {FACULTIES.map((faculty) => (
                  <option key={faculty} value={faculty}>
                    {faculty}
                  </option>
                ))}
              </select>
              {fieldErrors.faculty && (
                <p className="text-[11px] font-bold text-rose-600">{fieldErrors.faculty}</p>
              )}
            </div>
          </div>

          <fieldset className="space-y-2 pt-1">
            <legend className="text-xs font-bold text-slate-700">{AR.register.interestsLabel}</legend>
            <p className="text-[11px] text-slate-500">{AR.register.interestsHint}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {INTEREST_KEYS.map((key) => {
                const selected = form.interests.includes(key);
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-xs font-bold cursor-pointer transition ${
                      selected
                        ? 'bg-mnu-500/10 border-mnu-500 text-mnu-700'
                        : 'bg-white/70 border-slate-200 text-slate-700 hover:bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleInterest(key)}
                      className="sr-only"
                    />
                    {selected ? (
                      <CheckSquare className="w-4 h-4 text-mnu-500 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span>{INTEREST_LABELS[key]}</span>
                  </label>
                );
              })}
            </div>
            {fieldErrors.interests && (
              <p className="text-[11px] font-bold text-rose-600">{fieldErrors.interests}</p>
            )}
          </fieldset>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-2xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white text-xs font-extrabold transition shadow-lg shadow-mnu-500/25 flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>{submitting ? AR.register.submitting : AR.register.submitButton}</span>
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 pt-2 border-t border-slate-200/70">
          {AR.register.hasAccountPrompt}{' '}
          <Link to="/login" className="font-extrabold text-mnu-500 hover:underline">
            {AR.register.goToLogin}
          </Link>
        </p>
      </div>
    </div>
  );
}
