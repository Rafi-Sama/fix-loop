/** Thin fetch wrapper for the Fastify API. Every failure becomes an ApiError with the server's { error: { code, message, details } }. */

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** The machine code a service put in `details.code` (e.g. compliance_override_required), if any. */
  get detailCode(): string | undefined {
    const d = this.details as { code?: unknown } | undefined;
    return typeof d?.code === 'string' ? d.code : undefined;
  }
}

export type Query = Record<string, string | number | boolean | null | undefined | readonly string[]>;

export function qs(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) for (const x of v) p.append(k, x);
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const apiUrl = (path: string, query?: Query) => `${BASE}${path}${qs(query)}`;

interface Opts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

export async function api<T = void>(path: string, { method = 'GET', body, query, signal }: Opts = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path, query), {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Can’t reach the server. Check your connection and try again.');
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
    throw new ApiError(res.status, err?.code ?? 'error', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return (data ?? text) as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Human message for any thrown value, with validation details folded in. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'validation_failed' && Array.isArray(e.details)) {
      const first = e.details[0] as { path?: string; message?: string } | undefined;
      if (first?.message) return `${prettyPath(first.path)}${first.message}`;
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}

const prettyPath = (p?: string) => {
  const last = p?.split('/').filter(Boolean).at(-1);
  return last ? `${last.replace(/([A-Z])/g, ' $1').toLowerCase()}: ` : '';
};
