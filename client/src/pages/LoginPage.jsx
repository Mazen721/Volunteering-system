import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, GraduationCap, Lock, Mail } from 'lucide-react';
import { extractApiErrorMessage } from '../api/client.js';
import { AR } from '../constants/ar.js';
import { useAuth } from '../context/authContext.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials(email, password) {
  const trimmedEmail = email.trim();
  const fieldErrors = {};

  if (!trimmedEmail) {
    fieldErrors.email = AR.auth.emailRequired;
  } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
    fieldErrors.email = AR.auth.emailInvalid;
  }

  if (!password) {
    fieldErrors.password = AR.auth.passwordRequired;
  }

  return fieldErrors;
}

function LoginField({ id, label, type, autoComplete, value, onChange, placeholder, error, Icon }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold text-slate-700">
        {label}
      </label>
      <div className="relative">
        <Icon className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          className="w-full pr-10 pl-4 py-3 bg-white/80 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
        />
      </div>
      {error && <p className="text-[11px] font-bold text-rose-600">{error}</p>}
    </div>
  );
}

/**
 * Admin login page with Arabic client validation and JWT authentication.
 */
export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTarget = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to={redirectTarget} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError('');

    const validationErrors = validateCredentials(email, password);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      navigate(redirectTarget, { replace: true });
    } catch (error) {
      setSubmitError(extractApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-md rounded-3xl p-6 sm:p-8 space-y-6 relative overflow-hidden">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-mnu-500 text-mnu-gold flex items-center justify-center mx-auto shadow-lg shadow-mnu-500/20">
            <GraduationCap className="w-9 h-9" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-mnu-500">{AR.brand.university}</h1>
            <p className="text-xs text-slate-500 mt-1">{AR.brand.subtitle}</p>
          </div>
          <div className="pt-2 border-t border-slate-200/70">
            <h2 className="text-base font-extrabold text-slate-800">{AR.auth.loginTitle}</h2>
            <p className="text-xs text-slate-500 mt-1">{AR.auth.loginSubtitle}</p>
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
          <LoginField
            id="login-email"
            label={AR.auth.emailLabel}
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            placeholder={AR.auth.emailPlaceholder}
            error={fieldErrors.email}
            Icon={Mail}
          />

          <LoginField
            id="login-password"
            label={AR.auth.passwordLabel}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            placeholder={AR.auth.passwordPlaceholder}
            error={fieldErrors.password}
            Icon={Lock}
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-2xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white text-xs font-extrabold transition shadow-lg shadow-mnu-500/25 cursor-pointer"
          >
            {submitting ? AR.auth.loggingIn : AR.auth.submitLogin}
          </button>
        </form>
      </div>
    </div>
  );
}
