/** Defaults from docs/prd.md §5.4 (SLAs) and §8.5 (reminders). Every value is overridable per org. */
import type { ReminderConfig, SlaConfig } from '../../db/schema/index.js';
import type { Priority, WoStatus } from './state-machine.js';

const HOUR = 3_600_000;

export const DEFAULT_SLA: Required<SlaConfig> = {
  emergency: { assignHours: 1, completeHours: 24 },
  high: { assignHours: 4, completeHours: 72 },
  normal: { assignHours: 24, completeHours: 120 },
  low: { assignHours: 72, completeHours: 336 },
};

export const DEFAULT_REMINDERS = {
  'wo.acceptance_nudge': 4,
  'wo.acceptance_escalate': 24,
  'wo.acceptance_nudge.emergency': 0.5,
  'wo.acceptance_escalate.emergency': 1,
  'wo.quote_nudge': 48,
  'wo.approval_resend': 24,
  'wo.approval_escalate': 48,
  'wo.appointment_tomorrow': 24,
  'wo.review_nudge': 24,
  'wo.overdue_repeat': 24,
  'request.needs_info_nudge': 48,
} as const satisfies Record<string, number>;
export type ReminderType = keyof typeof DEFAULT_REMINDERS | 'wo.overdue' | 'doc.expiring';

export function slaFor(priority: Priority, cfg: SlaConfig) {
  return cfg[priority] ?? DEFAULT_SLA[priority];
}

export function expectedCompletion(priority: Priority, cfg: SlaConfig, from: Date): Date {
  return new Date(from.getTime() + slaFor(priority, cfg).completeHours * HOUR);
}

function hours(type: keyof typeof DEFAULT_REMINDERS, cfg: ReminderConfig): number {
  const v = cfg[type];
  return typeof v === 'number' && v > 0 ? v : DEFAULT_REMINDERS[type];
}

export interface PlannedReminder {
  type: ReminderType;
  dueAt: Date;
  expectedStatus: WoStatus;
}

/**
 * Reminders to schedule after a work order enters `status`.
 * The service cancels every pending reminder on each transition, then inserts these.
 */
export function planWorkOrderReminders(input: {
  status: WoStatus;
  priority: Priority;
  now: Date;
  cfg: ReminderConfig;
  expectedCompletionAt: Date | null;
  appointmentStartsAt?: Date | null;
}): PlannedReminder[] {
  const { status, priority, now, cfg } = input;
  const at = (h: number) => new Date(now.getTime() + h * HOUR);
  const out: PlannedReminder[] = [];
  const add = (type: ReminderType, dueAt: Date) => out.push({ type, dueAt, expectedStatus: status });
  const emergency = priority === 'emergency';

  switch (status) {
    case 'awaiting_acceptance':
      add('wo.acceptance_nudge', at(hours(emergency ? 'wo.acceptance_nudge.emergency' : 'wo.acceptance_nudge', cfg)));
      add('wo.acceptance_escalate', at(hours(emergency ? 'wo.acceptance_escalate.emergency' : 'wo.acceptance_escalate', cfg)));
      break;
    case 'awaiting_quote':
      add('wo.quote_nudge', at(hours('wo.quote_nudge', cfg)));
      break;
    case 'awaiting_approval':
      add('wo.approval_resend', at(hours('wo.approval_resend', cfg)));
      add('wo.approval_escalate', at(hours('wo.approval_escalate', cfg)));
      break;
    case 'scheduled':
      if (input.appointmentStartsAt) {
        const due = new Date(input.appointmentStartsAt.getTime() - hours('wo.appointment_tomorrow', cfg) * HOUR);
        // Skip if the appointment is sooner than the lead time; the scheduling notice already went out.
        if (due > now) add('wo.appointment_tomorrow', due);
      }
      break;
    case 'completed':
      add('wo.review_nudge', at(hours('wo.review_nudge', cfg)));
      break;
    default:
      break;
  }

  // Overdue applies to any open state except PM review (the job is done, just not closed).
  const open = status !== 'closed' && status !== 'cancelled' && status !== 'completed';
  if (open && input.expectedCompletionAt) {
    // Already overdue: the first alert went out when it crossed the line, so wait for the next daily repeat
    // instead of re-alerting on every status change.
    add('wo.overdue', input.expectedCompletionAt > now ? input.expectedCompletionAt : at(hours('wo.overdue_repeat', cfg)));
  }
  return out;
}

export const overdueRepeatHours = (cfg: ReminderConfig) => hours('wo.overdue_repeat', cfg);
export const needsInfoNudgeHours = (cfg: ReminderConfig) => hours('request.needs_info_nudge', cfg);
