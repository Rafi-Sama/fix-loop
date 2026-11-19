import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors.js';
import { transition, waitingOn, WO_STATUSES, type WoAction, type WoState } from '../../src/modules/work-orders/state-machine.js';

const base: WoState = { status: 'draft', priority: 'normal', quoteRequired: false, resumeStatus: null };
const s = (patch: Partial<WoState>): WoState => ({ ...base, ...patch });

describe('work order state machine', () => {
  it('runs the 12-step happy path with a quote', () => {
    let st = s({ quoteRequired: true });
    const steps: WoAction[] = [
      { type: 'assign' },
      { type: 'accept' },
      { type: 'submit_quote' },
      { type: 'approve_quote' },
      { type: 'schedule' },
      { type: 'start' },
      { type: 'complete' },
      { type: 'close' },
    ];
    const seen = steps.map((a) => {
      const r = transition(st, a);
      st = { ...st, status: r.status, resumeStatus: r.resumeStatus };
      return r.status;
    });
    expect(seen).toEqual([
      'awaiting_acceptance',
      'awaiting_quote',
      'awaiting_approval',
      'awaiting_scheduling',
      'scheduled',
      'in_progress',
      'completed',
      'closed',
    ]);
  });

  it('skips the quote when not required', () => {
    expect(transition(s({ status: 'awaiting_acceptance' }), { type: 'accept' }).status).toBe('awaiting_scheduling');
  });

  it('the vendor can be released at any point before work starts, never after', () => {
    for (const status of ['awaiting_acceptance', 'awaiting_quote', 'awaiting_approval', 'awaiting_scheduling', 'scheduled'] as const) {
      expect(transition(s({ status }), { type: 'decline' }).status).toBe('draft');
      expect(transition(s({ status, resumeStatus: 'scheduled' }), { type: 'unassign' }).resumeStatus).toBeNull();
    }
    for (const status of ['draft', 'in_progress', 'completed', 'closed'] as const) {
      expect(() => transition(s({ status }), { type: 'unassign' })).toThrow(AppError);
    }
  });

  it('a pending quote can be revised, keeping the on-site resume point', () => {
    expect(transition(s({ status: 'awaiting_approval', resumeStatus: 'in_progress' }), { type: 'submit_quote' })).toEqual({
      status: 'awaiting_approval',
      resumeStatus: 'in_progress',
    });
  });

  it('asking for a new quote keeps the resume point; reassigning drops it', () => {
    const st = s({ status: 'awaiting_approval', resumeStatus: 'in_progress' });
    expect(transition(st, { type: 'reject_quote', next: 'awaiting_quote' }).resumeStatus).toBe('in_progress');
    expect(transition(st, { type: 'reject_quote', next: 'draft' }).resumeStatus).toBeNull();
    const back = transition(s({ status: 'awaiting_quote', resumeStatus: 'in_progress' }), { type: 'submit_quote' });
    expect(back.resumeStatus).toBe('in_progress');
  });

  it('diagnose-then-quote resumes where the vendor was', () => {
    const onSite = transition(s({ status: 'in_progress' }), { type: 'submit_quote' });
    expect(onSite).toEqual({ status: 'awaiting_approval', resumeStatus: 'in_progress' });
    const approved = transition(s({ status: 'awaiting_approval', resumeStatus: 'in_progress' }), { type: 'approve_quote' });
    expect(approved.status).toBe('in_progress');
    expect(approved.resumeStatus).toBeNull();
  });

  it('emergency skips the quote and can start straight after acceptance', () => {
    const em = s({ priority: 'emergency', quoteRequired: true, status: 'awaiting_acceptance' });
    expect(transition(em, { type: 'accept' }).status).toBe('awaiting_scheduling');
    expect(transition(em, { type: 'start' }).status).toBe('in_progress');
    expect(() => transition(s({ status: 'awaiting_acceptance' }), { type: 'start' })).toThrow(AppError);
  });

  it('no access sends the job back to scheduling', () => {
    expect(transition(s({ status: 'scheduled' }), { type: 'no_access' }).status).toBe('awaiting_scheduling');
  });

  it('PM can send completed work back', () => {
    expect(transition(s({ status: 'completed' }), { type: 'request_more_work' }).status).toBe('in_progress');
  });

  it('rejected quote can go back to quote, reassignment or cancel', () => {
    for (const next of ['awaiting_quote', 'draft', 'cancelled'] as const) {
      expect(transition(s({ status: 'awaiting_approval' }), { type: 'reject_quote', next }).status).toBe(next);
    }
  });

  it('cancel works from every open state and never from terminal states', () => {
    for (const status of WO_STATUSES) {
      const run = () => transition(s({ status }), { type: 'cancel' });
      if (status === 'closed' || status === 'cancelled') expect(run).toThrow(/Cannot cancel/);
      else expect(run().status).toBe('cancelled');
    }
  });

  it('rejects illegal transitions with a 409', () => {
    try {
      transition(s({ status: 'draft' }), { type: 'close' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).statusCode).toBe(409);
    }
  });

  it('every status has a waiting-on owner, terminal states have none', () => {
    expect(waitingOn('awaiting_acceptance')).toBe('vendor');
    expect(waitingOn('completed')).toBe('pm');
    expect(waitingOn('closed')).toBeNull();
  });
});
