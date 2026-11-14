import { useState } from 'react';
import { AlertCircle, UserPen, UserPlus } from 'lucide-react';
import { apiClient, extractApiErrorMessage } from '../../api/client.js';
import { AR } from '../../constants/ar.js';
import { CATEGORIES, FACULTIES } from '../../constants/enums.js';
import { useToast } from '../../context/toastContext.js';
import { triggerCelebration } from '../../utils/confetti.js';
import { ModalFrame } from '../ModalFrame.jsx';

function buildInitialVolunteerForm(volunteer) {
  if (volunteer) {
    return {
      volunteerId: volunteer.volunteerId,
      fullName: volunteer.fullName,
      category: volunteer.category,
      faculty: volunteer.faculty,
    };
  }
  return {
    volunteerId: '',
    fullName: '',
    category: 'student',
    faculty: '',
  };
}

function validateVolunteerForm(form, isEditMode) {
  const errors = {};
  if (!isEditMode && !form.volunteerId.trim()) {
    errors.volunteerId = AR.volunteerModal.idRequired;
  }
  if (form.fullName.trim().length < 2) {
    errors.fullName = AR.volunteerModal.nameMin;
  }
  if (!form.faculty) {
    errors.faculty = AR.volunteerModal.facultyRequired;
  }
  return errors;
}

function VolunteerModalContent({ volunteer, onClose, onSaved }) {
  const isEditMode = Boolean(volunteer);
  const { showToast } = useToast();

  const [form, setForm] = useState(() => buildInitialVolunteerForm(volunteer));
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError('');

    const errors = validateVolunteerForm(form, isEditMode);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        category: form.category,
        faculty: form.faculty,
      };
      if (isEditMode) {
        await apiClient.put(`/volunteers/${encodeURIComponent(volunteer.volunteerId)}`, payload);
        showToast({ type: 'success', message: AR.volunteerModal.editSuccess });
      } else {
        await apiClient.post('/volunteers', {
          volunteerId: form.volunteerId.trim(),
          ...payload,
        });
        showToast({ type: 'success', message: AR.volunteerModal.createSuccess });
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
          <label htmlFor="vol-id" className="block font-bold text-slate-700 mb-1">
            {AR.volunteerModal.idLabel}
          </label>
          <input
            id="vol-id"
            type="text"
            value={form.volunteerId}
            disabled={isEditMode}
            onChange={(event) => updateField('volunteerId', event.target.value)}
            placeholder={AR.volunteerModal.idPlaceholder}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
          />
          {fieldErrors.volunteerId && (
            <p className="text-[11px] font-bold text-rose-600 mt-1">{fieldErrors.volunteerId}</p>
          )}
        </div>

        <div>
          <label htmlFor="vol-name" className="block font-bold text-slate-700 mb-1">
            {AR.volunteerModal.nameLabel}
          </label>
          <input
            id="vol-name"
            type="text"
            value={form.fullName}
            onChange={(event) => updateField('fullName', event.target.value)}
            placeholder={AR.volunteerModal.namePlaceholder}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
          />
          {fieldErrors.fullName && (
            <p className="text-[11px] font-bold text-rose-600 mt-1">{fieldErrors.fullName}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="vol-category" className="block font-bold text-slate-700 mb-1">
              {AR.volunteerModal.categoryLabel}
            </label>
            <select
              id="vol-category"
              value={form.category}
              onChange={(event) => updateField('category', event.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
            >
              {CATEGORIES.map((categoryKey) => (
                <option key={categoryKey} value={categoryKey}>
                  {AR.categories[categoryKey]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="vol-faculty" className="block font-bold text-slate-700 mb-1">
              {AR.volunteerModal.facultyLabel}
            </label>
            <select
              id="vol-faculty"
              value={form.faculty}
              onChange={(event) => updateField('faculty', event.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
            >
              <option value="">{AR.volunteerModal.selectFaculty}</option>
              {FACULTIES.map((facultyName) => (
                <option key={facultyName} value={facultyName}>
                  {facultyName}
                </option>
              ))}
            </select>
            {fieldErrors.faculty && (
              <p className="text-[11px] font-bold text-rose-600 mt-1">{fieldErrors.faculty}</p>
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
            {submitting ? AR.common.saving : AR.common.save}
          </button>
        </div>
      </form>
    </>
  );
}

/**
 * Modal form for creating a new volunteer or editing an existing volunteer's profile fields.
 */
export function VolunteerModal({ isOpen, volunteer, onClose, onSaved }) {
  const isEditMode = Boolean(volunteer);

  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? AR.volunteerModal.editTitle : AR.volunteerModal.createTitle}
      subtitle={isEditMode ? AR.volunteerModal.editSubtitle : AR.volunteerModal.createSubtitle}
      icon={
        <div className="w-11 h-11 rounded-2xl bg-mnu-500/10 text-mnu-500 flex items-center justify-center shrink-0">
          {isEditMode ? <UserPen className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
        </div>
      }
    >
      {isOpen && (
        <VolunteerModalContent
          key={volunteer?.volunteerId || 'new-volunteer'}
          volunteer={volunteer}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </ModalFrame>
  );
}
