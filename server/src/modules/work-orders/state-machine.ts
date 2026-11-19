/**
 * Work order state machine (docs/prd.md §6.5). Pure: no I/O, so every transition is unit-tested.
 * Side effects (events, reminders, notifications) are planned by the service from the result.
 */
import { conflict } from '../../lib/errors.js';

export const WO_STATUSES = [
  'draft',
  'awaiting_acceptance',
  'awaiting_quote',
  'awaiting_approval',
  'awaiting_scheduling',
  'scheduled',
  'in_progress',
  'completed',
  'closed',
  'cancelled',
] as const;
export type WoStatus = (typeof WO_STATUSES)[number];
export type Priority = 'emergency' | 'high' | 'normal' | 'low';
export type WaitingOn = 'pm' | 'vendor' | 'tenant' | 'owner' | null;

export type WoAction =
  | { type: 'assign' }
  | { type: 'unassign' }
  | { type: 'decline' }
  | { type: 'accept' }
  | { type: 'submit_quote' }
  | { type: 'approve_quote' }
  | { type: 'reject_quote'; next: 'awaiting_quote' | 'draft' | 'cancelled' }
  | { type: 'schedule' }
  | { type: 'no_access' }
  | { type: 'start' }
  | { type: 'complete' }
  | { type: 'request_more_work' }
  | { type: 'close' }
  | { type: 'cancel' };

export interface WoState {
  status: WoStatus;
  priority: Priority;
  quoteRequired: boolean;
  resumeStatus: WoStatus | null;
}

export interface TransitionResult {
  status: WoStatus;
  resumeStatus: WoStatus | null;
}

/** States in which the vendor can still be swapped out (no work has started). */
export const RELEASABLE: readonly WoStatus[] = ['awaiting_acceptance', 'awaiting_quote', 'awaiting_approval', 'awaiting_scheduling', 'scheduled'];

export const OPEN_STATUSES: readonly WoStatus[] = WO_STATUSES.filter((s) => s !== 'closed' && s !== 'cancelled');
export const isOpen = (s: WoStatus): boolean => OPEN_STATUSES.includes(s);

export function transition(state: WoState, action: WoAction): TransitionResult {
  const { status } = state;
  const to = (next: WoStatus, resumeStatus: WoStatus | null = null): TransitionResult => ({ status: next, resumeStatus });
  const emergency = state.priority === 'emergency';

  switch (action.type) {
    case 'assign':
      if (status === 'draft') return to('awaiting_acceptance');
      break;
    case 'unassign':
    case 'decline':
      // The PM can pull a job back, or the vendor can withdraw, at any point before work starts.
      if (RELEASABLE.includes(status)) return to('draft');
      break;
    case 'accept':
      // Emergencies skip the quote: approval is covered by the emergency spend limit.
      if (status === 'awaiting_acceptance') return to(state.quoteRequired && !emergency ? 'awaiting_quote' : 'awaiting_scheduling');
      break;
    case 'submit_quote':
      // awaiting_approval → awaiting_approval is a revised quote; the resume point survives revisions.
      if (status === 'awaiting_quote' || status === 'awaiting_approval') return to('awaiting_approval', state.resumeStatus);
      // Diagnose, then quote: remember where to resume once approved.
      if (status === 'scheduled' || status === 'in_progress') return to('awaiting_approval', status);
      break;
    case 'approve_quote':
      if (status === 'awaiting_approval') return to(state.resumeStatus ?? 'awaiting_scheduling');
      break;
    case 'reject_quote':
      // Asking for a new quote keeps the on-site resume point; reassigning or cancelling drops it.
      if (status === 'awaiting_approval') return to(action.next, action.next === 'awaiting_quote' ? state.resumeStatus : null);
      break;
    case 'schedule':
      if (status === 'awaiting_scheduling' || status === 'scheduled') return to('scheduled');
      break;
    case 'no_access':
      if (status === 'scheduled') return to('awaiting_scheduling');
      break;
    case 'start':
      if (status === 'scheduled') return to('in_progress');
      if (emergency && (status === 'awaiting_acceptance' || status === 'awaiting_scheduling')) return to('in_progress');
      break;
    case 'complete':
      if (status === 'in_progress') return to('completed');
      break;
    case 'request_more_work':
      if (status === 'completed') return to('in_progress');
      break;
    case 'close':
      if (status === 'completed') return to('closed');
      break;
    case 'cancel':
      if (isOpen(status)) return to('cancelled');
      break;
  }
  throw conflict(`Cannot ${action.type.replaceAll('_', ' ')} a work order that is ${status.replaceAll('_', ' ')}`, {
    status,
    action: action.type,
  });
}

/** Who the job is waiting on: drives the dashboard queue and reminder targets. */
export function waitingOn(status: WoStatus): WaitingOn {
  switch (status) {
    case 'draft':
    case 'completed':
      return 'pm';
    case 'awaiting_acceptance':
    case 'awaiting_quote':
    case 'awaiting_scheduling':
    case 'scheduled':
    case 'in_progress':
      return 'vendor';
    case 'awaiting_approval':
      // Refined to 'owner' by the service when an owner approval link is outstanding.
      return 'pm';
    case 'closed':
    case 'cancelled':
      return null;
  }
}
