import { describe, expect, it } from 'vitest';
import { expectedCompletion, planWorkOrderReminders } from '../../src/modules/work-orders/policy.js';

const now = new Date('2026-11-07T12:00:00Z');
const H = 3_600_000;

describe('reminder planning', () => {
  it('nudges vendor at 4h and escalates at 24h', () => {
    const r = planWorkOrderReminders({ status: 'awaiting_acceptance', priority: 'normal', now, cfg: {}, expectedCompletionAt: null });
    expect(r.map((x) => [x.type, (x.dueAt.getTime() - now.getTime()) / H])).toEqual([
      ['wo.acceptance_nudge', 4],
      ['wo.acceptance_escalate', 24],
    ]);
  });

  it('uses the faster emergency clock and honours org overrides', () => {
    const r = planWorkOrderReminders({
      status: 'awaiting_acceptance',
      priority: 'emergency',
      now,
      cfg: { 'wo.acceptance_escalate.emergency': 2 },
      expectedCompletionAt: null,
    });
    expect(r.map((x) => (x.dueAt.getTime() - now.getTime()) / H)).toEqual([0.5, 2]);
  });

  it('adds an overdue reminder at the expected completion time', () => {
    const due = new Date(now.getTime() + 10 * H);
    const r = planWorkOrderReminders({ status: 'in_progress', priority: 'normal', now, cfg: {}, expectedCompletionAt: due });
    expect(r).toEqual([{ type: 'wo.overdue', dueAt: due, expectedStatus: 'in_progress' }]);
  });

  it('does not re-alert immediately when a job is already overdue', () => {
    const past = new Date(now.getTime() - H);
    const [r] = planWorkOrderReminders({ status: 'scheduled', priority: 'normal', now, cfg: {}, expectedCompletionAt: past });
    expect(r?.type).toBe('wo.overdue');
    expect(r!.dueAt.getTime() - now.getTime()).toBe(24 * H);
  });

  it('skips the day-before reminder when the appointment is too soon', () => {
    const soon = new Date(now.getTime() + 3 * H);
    const r = planWorkOrderReminders({ status: 'scheduled', priority: 'normal', now, cfg: {}, expectedCompletionAt: null, appointmentStartsAt: soon });
    expect(r).toEqual([]);
  });

  it('nothing is planned for terminal states', () => {
    expect(planWorkOrderReminders({ status: 'closed', priority: 'normal', now, cfg: {}, expectedCompletionAt: now })).toEqual([]);
  });

  it('normal SLA is 5 days', () => {
    expect(expectedCompletion('normal', {}, now).getTime() - now.getTime()).toBe(120 * H);
  });
});
