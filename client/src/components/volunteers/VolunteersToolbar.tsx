import { RotateCcw, Search } from 'lucide-react';
import { AR } from '../../constants/ar';
import { ACTIVITY_STATUSES, CATEGORIES, FACULTIES } from '../../constants/enums';
import type { VolunteerFilters } from '../../types';

interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterSelectProps<T extends string> {
  id: string;
  label: string;
  value: T | '';
  onChange: (value: T | '') => void;
  defaultLabel: string;
  options: FilterOption<T>[];
}

function FilterSelect<T extends string>({
  id,
  label,
  value,
  onChange,
  defaultLabel,
  options,
}: FilterSelectProps<T>) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T | '')}
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

interface VolunteersToolbarProps {
  filters: VolunteerFilters;
  hasActiveFilters: boolean;
  hideFacultyFilter?: boolean;
  onFilterChange: <K extends keyof VolunteerFilters>(
    field: K,
    value: VolunteerFilters[K]
  ) => void;
  onReset: () => void;
}

/**
 * Search box and separate filters (category, optional faculty, eligibility, activity status).
 */
export function VolunteersToolbar({
  filters,
  hasActiveFilters,
  hideFacultyFilter = false,
  onFilterChange,
  onReset,
}: VolunteersToolbarProps) {
  const categoryOptions: FilterOption<(typeof CATEGORIES)[number]>[] = CATEGORIES.map((key) => ({
    value: key,
    label: AR.categories[key],
  }));
  const facultyOptions: FilterOption<(typeof FACULTIES)[number]>[] = FACULTIES.map((name) => ({
    value: name,
    label: name,
  }));
  const eligibilityOptions: FilterOption<'eligible' | 'in_progress'>[] = [
    { value: 'eligible', label: AR.volunteers.eligibleOnly },
    { value: 'in_progress', label: AR.volunteers.inProgressOnly },
  ];
  const activityStatusOptions: FilterOption<(typeof ACTIVITY_STATUSES)[number]>[] =
    ACTIVITY_STATUSES.map((key) => ({
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

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          hideFacultyFilter ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
        } gap-3`}
      >
        <FilterSelect
          id="filter-category"
          label={AR.volunteers.categoryFilterLabel}
          value={filters.category}
          onChange={(val) => onFilterChange('category', val)}
          defaultLabel={AR.volunteers.allCategories}
          options={categoryOptions}
        />
        {!hideFacultyFilter && (
          <FilterSelect
            id="filter-faculty"
            label={AR.volunteers.facultyFilterLabel}
            value={filters.faculty}
            onChange={(val) => onFilterChange('faculty', val)}
            defaultLabel={AR.volunteers.allFaculties}
            options={facultyOptions}
          />
        )}
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
