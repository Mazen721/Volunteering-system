import { RotateCcw, Search } from 'lucide-react';
import { AR } from '../../constants/ar.js';
import { ACTIVITY_STATUSES, CATEGORIES, FACULTIES } from '../../constants/enums.js';

function FilterSelect({ id, label, value, onChange, defaultLabel, options }) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="bg-white/80 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
    >
      <option value="">{defaultLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Search box and 4 separate filters (category, faculty, eligibility, activity status).
 */
export function VolunteersToolbar({ filters, hasActiveFilters, onFilterChange, onReset }) {
  const categoryOptions = CATEGORIES.map((key) => ({ value: key, label: AR.categories[key] }));
  const facultyOptions = FACULTIES.map((name) => ({ value: name, label: name }));
  const eligibilityOptions = [
    { value: 'eligible', label: AR.volunteers.eligibleOnly },
    { value: 'in_progress', label: AR.volunteers.inProgressOnly },
  ];
  const activityStatusOptions = ACTIVITY_STATUSES.map((key) => ({
    value: key,
    label: AR.statuses[key],
  }));

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          aria-label={AR.volunteers.searchPlaceholder}
          value={filters.search}
          onChange={(event) => onFilterChange('search', event.target.value)}
          placeholder={AR.volunteers.searchPlaceholder}
          className="w-full pl-4 pr-11 py-3 bg-white/80 border border-slate-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-mnu-500/40"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <FilterSelect
          id="filter-category"
          label={AR.volunteers.categoryFilterLabel}
          value={filters.category}
          onChange={(val) => onFilterChange('category', val)}
          defaultLabel={AR.volunteers.allCategories}
          options={categoryOptions}
        />
        <FilterSelect
          id="filter-faculty"
          label={AR.volunteers.facultyFilterLabel}
          value={filters.faculty}
          onChange={(val) => onFilterChange('faculty', val)}
          defaultLabel={AR.volunteers.allFaculties}
          options={facultyOptions}
        />
        <FilterSelect
          id="filter-eligibility"
          label={AR.volunteers.eligibilityFilterLabel}
          value={filters.eligibility}
          onChange={(val) => onFilterChange('eligibility', val)}
          defaultLabel={AR.volunteers.allEligibility}
          options={eligibilityOptions}
        />
        <FilterSelect
          id="filter-activity-status"
          label={AR.volunteers.activityStatusFilterLabel}
          value={filters.activityStatus}
          onChange={(val) => onFilterChange('activityStatus', val)}
          defaultLabel={AR.volunteers.allActivityStatuses}
          options={activityStatusOptions}
        />
      </div>

      {hasActiveFilters && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{AR.common.resetFilters}</span>
          </button>
        </div>
      )}
    </div>
  );
}
