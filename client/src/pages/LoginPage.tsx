import { useState } from 'react';
import type { ComponentType, FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Lock, Mail } from 'lucide-react';
import { extractApiErrorMessage } from '../api/client';
import { UniversityLogo } from '../components/UniversityLogo';
import { AR } from '../constants/ar';
import { getHomePathForUser, useAuth } from '../context/authContext';
import type { AuthUser } from '../types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

function validateCredentials(email: string, password: string): LoginFieldErrors {
  const trimmedEmail = email.trim();
  const fieldErrors: LoginFieldErrors = {};

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

interface LoginFieldIconProps {
  className?: string;
}

interface LoginFieldProps {
  id: string;
  label: string;
  type: 'email' | 'password';
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
  Icon: ComponentType<LoginFieldIconProps>;
}

function LoginField({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
  placeholder,
  error,
  Icon,
}: LoginFieldProps) {
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

function resolvePostLoginPath(user: AuthUser, fromPath?: string): string {
  const defaultHome = getHomePathForUser(user);
  if (user.status === 'pending' || user.status === 'rejected') {
    return '/pending';
  }
  if (!fromPath || fromPath === '/login' || fromPath === '/register' || fromPath === '/pending') {
    return defaultHome;
  }
  if (user.role === 'student' && !fromPath.startsWith('/me') && !fromPath.startsWith('/opportunities') && !fromPath.startsWith('/checkin')) {
    return '/me';
  }
  return fromPath;
}

/**
 * Login page with Arabic client validation and role-aware redirect after JWT authentication.
 */
export function LoginPage() {
  const { user, status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { from?: { pathname?: string } } | null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated' && user) {
    return <Navigate to={resolvePostLoginPath(user, routeState?.from?.pathname)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError('');

    const validationErrors = validateCredentials(email, password);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const authenticatedUser = await login({ email: email.trim(), password });
      navigate(resolvePostLoginPath(authenticatedUser, routeState?.from?.pathname), {
        replace: true,
      });
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
          <UniversityLogo className="w-20 h-20 mx-auto bg-white shadow-lg shadow-mnu-500/20 ring-2 ring-mnu-500/15" />
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

        <p className="text-center text-xs text-slate-600 pt-2 border-t border-slate-200/70">
          {AR.auth.noAccountPrompt}{' '}
          <Link to="/register" className="font-extrabold text-mnu-500 hover:underline">
            {AR.auth.goToRegister}
          </Link>
        </p>
      </div>
    </div>
  );
}
