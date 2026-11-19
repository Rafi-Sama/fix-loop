import { useState } from 'react';
import { Check, MoneyField, SelectField, TextArea, TextField } from '../../components/ui';
import { BILL_TO_LABEL, centsToInput, money, parseMoney, PRIORITIES, PRIORITY_LABEL, type Priority } from '../../lib/format';

export interface WoFormValue {
  description: string;
  requiredWork: string;
  priority: Priority;
  expectedCompletionAt: string; // yyyy-mm-dd or ''
  estimated: string;
  quoteRequired: boolean;
  billTo: 'owner' | 'tenant' | 'warranty';
}

export const woFormFrom = (w: { description: string; requiredWork?: string | null; priority: Priority; expectedCompletionAt?: string | null; estimatedCostCents?: number | null; quoteRequired?: boolean; billTo?: WoFormValue['billTo'] }): WoFormValue => ({
  description: w.description,
  requiredWork: w.requiredWork ?? '',
  priority: w.priority,
  expectedCompletionAt: w.expectedCompletionAt ? w.expectedCompletionAt.slice(0, 10) : '',
  estimated: centsToInput(w.estimatedCostCents),
  quoteRequired: w.quoteRequired ?? false,
  billTo: w.billTo ?? 'owner',
});

/** API body; '' fields become null/omitted. Returns an error string when a value is invalid. */
export function woBody(v: WoFormValue, mode: 'create' | 'patch'): Record<string, unknown> | string {
  const cents = v.estimated.trim() ? parseMoney(v.estimated) : null;
  if (v.estimated.trim() && cents === null) return 'Estimated cost must be an amount like 250 or 250.00';
  const due = v.expectedCompletionAt ? new Date(`${v.expectedCompletionAt}T17:00:00`).toISOString() : null;
  return {
    description: v.description.trim(),
    requiredWork: v.requiredWork.trim() || null,
    priority: v.priority,
    ...(due ? { expectedCompletionAt: due } : mode === 'patch' ? { expectedCompletionAt: null } : {}),
    estimatedCostCents: cents,
    quoteRequired: v.quoteRequired,
    billTo: v.billTo,
  };
}

/** Work order fields (PRD §6.1). `thresholdCents` drives the quote-required suggestion. */
export function WoForm({ value, onChange, thresholdCents }: { value: WoFormValue; onChange: (v: WoFormValue) => void; thresholdCents?: number }) {
  const [touchedQuote, setTouchedQuote] = useState(false);
  const set = <K extends keyof WoFormValue>(k: K, v: WoFormValue[K]) => onChange({ ...value, [k]: v });
  const cents = parseMoney(value.estimated);
  const overThreshold = thresholdCents !== undefined && cents !== null && cents >= thresholdCents;

  return (
    <div className="form-grid">
      <TextField className="full" label="Repair description" required maxLength={5000} value={value.description} onChange={(e) => set('description', e.target.value)} />
      <TextArea className="full" label="Scope of work" optional hint="Shown to the vendor on their job link." value={value.requiredWork} onChange={(e) => set('requiredWork', e.target.value)} maxLength={5000} />
      <SelectField label="Priority" value={value.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </SelectField>
      <TextField label="Expected completion" type="date" optional hint="Blank uses the priority’s SLA." value={value.expectedCompletionAt} onChange={(e) => set('expectedCompletionAt', e.target.value)} />
      <MoneyField
        label="Estimated cost"
        optional
        value={value.estimated}
        onChange={(e) => {
          const next = { ...value, estimated: e.target.value };
          const c = parseMoney(e.target.value);
          // Default quote-required on when the estimate reaches the owner's threshold (PRD §6.1), until the PM decides.
          if (!touchedQuote && thresholdCents !== undefined && c !== null) next.quoteRequired = c >= thresholdCents;
          onChange(next);
        }}
        error={value.estimated.trim() && cents === null ? 'Enter an amount like 250 or 250.00' : null}
        hint={thresholdCents !== undefined ? `Owner approval above ${money(thresholdCents, true)}` : undefined}
      />
      <SelectField label="Bill to" value={value.billTo} onChange={(e) => set('billTo', e.target.value as WoFormValue['billTo'])}>
        {Object.entries(BILL_TO_LABEL).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </SelectField>
      <div className="full">
        <Check
          label="Vendor must quote before starting"
          hint={overThreshold ? 'Suggested: the estimate is at or above the owner’s approval threshold.' : 'The job waits for a quote and approval after the vendor accepts.'}
          checked={value.quoteRequired}
          onChange={(e) => { setTouchedQuote(true); set('quoteRequired', e.target.checked); }}
        />
      </div>
    </div>
  );
}
