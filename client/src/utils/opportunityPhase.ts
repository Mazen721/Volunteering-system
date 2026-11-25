import type { OpportunityPhase } from '../constants/enums';

/**
 * Display priority for opportunity phases: work the student can still apply
 * to comes first, then what is live now, then closed, then ended. Mirrors the
 * server phase computation (cairoTime) — the phase itself always comes from
 * the API payload, never recalculated here.
 */
const PHASE_PRIORITY: Record<OpportunityPhase, number> = {
  upcoming: 0,
  in_progress: 1,
  registration_closed: 2,
  ended: 3,
};

export interface PhaseSortable {
  phase: OpportunityPhase;
  startAt: string;
}

/**
 * Returns a copy of the list ordered by phase priority, keeping the
 * chronological (startAt) order inside each phase.
 */
export function sortByPhasePriority<T extends PhaseSortable>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const byPhase = PHASE_PRIORITY[a.phase] - PHASE_PRIORITY[b.phase];
    if (byPhase !== 0) {
      return byPhase;
    }
    return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
  });
}

/**
 * Whether the opportunity's lifecycle is over (its end time has passed).
 */
export function isOpportunityEnded(opportunity: PhaseSortable): boolean {
  return opportunity.phase === 'ended';
}
