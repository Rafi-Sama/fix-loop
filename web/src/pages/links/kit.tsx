
import { useState, type ReactNode } from 'react';
import { api, errorMessage } from '../../lib/api';
import type { Priority } from '../../lib/format';
import type { Presigned } from '../../lib/upload';

export type Org = { name: string; phone: string | null; emergencyPhone: string | null; timezone: string };
export type Photo = { id: string; kind: 'issue_photo' | 'completion_photo' | 'quote' | 'invoice' | 'document'; mime: string; url?: string };

export type LinkData =
  | {
      purpose: 'job';
      org: Org;
      job: { ref: string; status: string; priority: Priority; description: string; requiredWork: string | null; expectedCompletionAt: string | null; quoteRequired: boolean; approvedAmountCents: number | null };
      issue: { title: string; description: string; photos: Photo[] };
      location: { address: string; unit: string | null; city: string; state: string; zip: string };
      access: { tenantName: string | null; tenantPhone: string | null; availability: string | null; permissionToEnter: string | null; accessNotes: string | null; pets: string | null } | null;
      appointment: { startsAt: string; endsAt: string; status: string; window: string } | null;
      quote: { amountCents: number; status: string; version: number } | null;
      invoice: { amountCents: number; status: string } | null;
      actions: string[];
    }
  | {
      purpose: 'approval';
      org: Org;
      pending: boolean;
      property: { address: string; unit: string | null; city: string };
      issue: { title: string; description: string; photos: Photo[] };
      vendor: { companyName: string } | null;
      quote: { amountCents: number; description: string | null; hasFile: boolean } | null;
    }
  | {
      purpose: 'request_track' | 'needs_info' | 'confirm_fix';
      org: Org;
      request: { ref: string; title: string; status: string; createdAt: string; question: string | null; awaitingConfirmation: boolean };
      appointment: { startsAt: string; endsAt: string; status: string; window: string } | null;
    }
  | { purpose: 'my_requests'; org: Org; requests: { ref: string; title: string; status: string; createdAt: string }[] }
  | {
      purpose: 'vendor_profile';
      org: Org;
      vendor: { companyName: string; contactName: string | null; email: string | null; phone: string | null; address: string | null; availabilityText: string | null };
      documents: { id: string; type: string; label: string | null; expiresOn: string | null }[];
    }
  | { purpose: 'user_invite'; org: Pick<Org, 'name'> }
  | { purpose: 'password_reset'; org: Pick<Org, 'name'> }
  | { purpose: 'email_verify'; org: Pick<Org, 'name'> };

export type Of<P extends LinkData['purpose']> = Extract<LinkData, { purpose: P }>;
export interface ViewProps<P extends LinkData['purpose']> {
  token: string;
  d: Of<P>;
  refresh: () => void;
}

export const post = (token: string, path: string, body: unknown = {}) => api(`/links/${token}/${path}`, { method: 'POST', body });
export const linkUpload = (token: string, kind: Photo['kind']) => ({
  start: (meta: { mime: string; sizeBytes: number }) => api<Presigned>(`/links/${token}/uploads`, { method: 'POST', body: { ...meta, kind } }),
  complete: (id: string) => api(`/links/${token}/uploads/${id}/complete`, { method: 'POST' }),
});

/** Runs a link action with inline progress and error, then refreshes the page's data. */
export function useAction(refresh: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      after?.();
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run, setError };
}

export const Card = ({ title, children, tone, flush }: { title?: string; children: ReactNode; tone?: string; flush?: boolean }) => (
  <section className={`box lift ${tone ?? ''}`}>
    {title && (
      <div className="box-head">
        <h2>{title}</h2>
      </div>
    )}
    <div className={flush ? 'box-body flush' : 'box-body stack-sm'}>{children}</div>
  </section>
);
