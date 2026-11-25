import { AR } from '../../constants/ar';
import type { ApplicationStatus, OpportunityPhase } from '../../constants/enums';

const PHASE_CHIP_CLASSES: Record<OpportunityPhase, string> = {
  upcoming: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  registration_closed: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-rose-50 text-rose-700 border-rose-200',
  ended: 'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_CHIP_CLASSES: Record<ApplicationStatus, string> = {
  pending: 'bg-sky-50 text-sky-800 border-sky-200',
  accepted: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  waitlisted: 'bg-violet-50 text-violet-800 border-violet-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

type ChipSize = 'sm' | 'lg';

const CHIP_SIZE_CLASSES: Record<ChipSize, string> = {
  sm: 'px-2.5 py-1 text-[11px] font-bold',
  lg: 'px-4 py-2 text-xs font-black',
};

interface PhaseChipProps {
  phase: OpportunityPhase;
  size?: ChipSize;
}

/**
 * Lifecycle chip shown wherever an opportunity is listed, so a student can
 * always tell whether registration is open, closed, live, or over.
 */
export function PhaseChip({ phase, size = 'sm' }: PhaseChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border ${CHIP_SIZE_CLASSES[size]} ${PHASE_CHIP_CLASSES[phase]}`}
    >
      {AR.studentPortal.board.phaseLabels[phase]}
    </span>
  );
}

interface MyApplicationChipProps {
  status: ApplicationStatus;
  size?: ChipSize;
}

/**
 * Honest "you already applied here" chip: wherever an opportunity the student
 * applied to appears, it says so with the application's real status instead
 * of looking like fresh, unapplied work.
 */
export function MyApplicationChip({ status, size = 'sm' }: MyApplicationChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border ${CHIP_SIZE_CLASSES[size]} ${STATUS_CHIP_CLASSES[status]}`}
    >
      {AR.studentPortal.board.myStatusChips[status]}
    </span>
  );
}
