import { useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, RefreshCw, Save, UserRound } from 'lucide-react';
import { extractApiErrorMessage } from '../api/client';
import { Navbar } from '../components/Navbar';
import { AR, INTEREST_LABELS } from '../constants/ar';
import type { InterestKey } from '../constants/enums';
import { INTEREST_KEYS } from '../constants/enums';
import { useAuth } from '../context/authContext';
import { useToast } from '../context/toastContext';

interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const EMPTY_PASSWORD_FORM: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

/**
 * Student profile page for editing recommendation interests and changing the account password.
 */
export function StudentProfilePage() {
  const { user, updateProfile } = useAuth();
  const { showToast } = useToast();
  const [interests, setInterests] = useState<InterestKey[]>(user?.interests ?? []);
  const [interestsError, setInterestsError] = useState('');
  const [savingInterests, setSavingInterests] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(EMPTY_PASSWORD_FORM);
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  function toggleInterest(key: InterestKey) {
    setInterests((current) =>
      current.includes(key) ? current.filter((interest) => interest !== key) : [...current, key]
    );
    setInterestsError('');
  }

  async function handleSaveInterests() {
    if (interests.length === 0) {
      setInterestsError(AR.studentPortal.profile.interestsMin);
      return;
    }

    setSavingInterests(true);
    try {
      await updateProfile({ interests });
      showToast({ type: 'success', message: AR.studentPortal.profile.interestsSaved });
    } catch (requestError: unknown) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
    } finally {
      setSavingInterests(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordForm.currentPassword) {
      setPasswordError(AR.studentPortal.profile.currentPasswordRequired);
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError(AR.studentPortal.profile.passwordMin);
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError(AR.studentPortal.profile.passwordMismatch);
      return;
    }

    setPasswordError('');
    setSavingPassword(true);
    try {
      await updateProfile({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm(EMPTY_PASSWORD_FORM);
      showToast({ type: 'success', message: AR.studentPortal.profile.passwordChanged });
    } catch (requestError: unknown) {
      showToast({ type: 'error', message: extractApiErrorMessage(requestError) });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="min-h-screen pb-16">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-black text-slate-800">
            <UserRound className="w-6 h-6 text-mnu-gold" />
            {AR.studentPortal.profile.pageTitle}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            {AR.studentPortal.profile.pageSubtitle}
          </p>
        </header>

        <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-3">
          <h2 className="text-sm font-black text-slate-800">
            {AR.studentPortal.profile.accountTitle}
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <dt className="font-bold text-slate-500">{AR.studentPortal.profile.fullNameLabel}</dt>
              <dd className="font-black text-slate-800">{user?.fullName}</dd>
            </div>
            <div className="space-y-1">
              <dt className="font-bold text-slate-500">{AR.studentPortal.profile.emailLabel}</dt>
              <dd className="font-semibold text-slate-700 break-all">{user?.email}</dd>
            </div>
            <div className="space-y-1">
              <dt className="font-bold text-slate-500">{AR.studentPortal.profile.facultyLabel}</dt>
              <dd className="font-semibold text-slate-700">
                {user?.faculty ?? AR.studentPortal.board.allFaculties}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="font-bold text-slate-500">
                {AR.studentPortal.profile.volunteerIdLabel}
              </dt>
              <dd className="font-semibold text-slate-700">
                {user?.registration?.volunteerId ?? '—'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-black text-slate-800">
              {AR.studentPortal.profile.interestsTitle}
            </h2>
            <p className="text-[11px] text-slate-500">
              {AR.studentPortal.profile.interestsHint}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {INTEREST_KEYS.map((key) => {
              const checked = interests.includes(key);
              return (
                <label
                  key={key}
                  htmlFor={`interest-${key}`}
                  className={`flex items-center gap-2 p-3 rounded-2xl border cursor-pointer transition text-xs font-bold ${
                    checked
                      ? 'bg-mnu-500/10 border-mnu-300 text-mnu-700'
                      : 'bg-white/70 border-slate-200 text-slate-600 hover:border-mnu-200'
                  }`}
                >
                  <input
                    id={`interest-${key}`}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleInterest(key)}
                    className="w-4 h-4 accent-mnu-500"
                  />
                  {INTEREST_LABELS[key]}
                </label>
              );
            })}
          </div>

          {interestsError && (
            <p role="alert" className="text-[11px] font-bold text-rose-600">
              {interestsError}
            </p>
          )}

          <button
            type="button"
            onClick={handleSaveInterests}
            disabled={savingInterests}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-mnu-500 hover:bg-mnu-600 disabled:opacity-60 text-white text-xs font-bold transition active:scale-95"
          >
            {savingInterests ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {savingInterests
              ? AR.studentPortal.profile.saving
              : AR.studentPortal.profile.saveInterestsButton}
          </button>
        </section>

        <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-800">
            <KeyRound className="w-4 h-4 text-mnu-500" />
            {AR.studentPortal.profile.passwordTitle}
          </h2>

          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="current-password"
                  className="block text-xs font-bold text-slate-700"
                >
                  {AR.studentPortal.profile.currentPasswordLabel}
                </label>
                <input
                  id="current-password"
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      currentPassword: event.target.value,
                    }))
                  }
                  className="w-full px-4 py-2.5 bg-white/80 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="block text-xs font-bold text-slate-700">
                  {AR.studentPortal.profile.newPasswordLabel}
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      newPassword: event.target.value,
                    }))
                  }
                  className="w-full px-4 py-2.5 bg-white/80 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="confirm-password"
                  className="block text-xs font-bold text-slate-700"
                >
                  {AR.studentPortal.profile.confirmPasswordLabel}
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                  className="w-full px-4 py-2.5 bg-white/80 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
                />
              </div>
            </div>

            {passwordError && (
              <p role="alert" className="text-[11px] font-bold text-rose-600">
                {passwordError}
              </p>
            )}

            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-xs font-bold transition active:scale-95"
            >
              {savingPassword ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              {savingPassword
                ? AR.studentPortal.profile.saving
                : AR.studentPortal.profile.savePasswordButton}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
