import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

/** Filters live in the URL so lists are shareable and survive back/forward. Empty values are dropped. */
export function useFilters<K extends string>(names: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(names.map((n) => [n, params.get(n) ?? ''])) as Record<K, string>;
  const set = (patch: Partial<Record<K, string>>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch) as [string, string | undefined][]) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
  return [values, set] as const;
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Search box state that writes to the URL after a pause, so typing doesn't fire a request per key.
 * Follows the URL too: back/forward or "Clear filters" updates the box instead of being overwritten by it.
 */
export function useSearchFilter(urlValue: string, commit: (v: string) => void) {
  const [text, setText] = useState(urlValue);
  const seen = useRef(urlValue);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    if (urlValue !== seen.current) {
      seen.current = urlValue;
      setText(urlValue);
    }
  }, [urlValue]);
  const debounced = useDebounced(text.trim());
  useEffect(() => {
    if (debounced !== seen.current) {
      seen.current = debounced;
      commitRef.current(debounced);
    }
  }, [debounced]);
  return [text, setText] as const;
}

/** J/K (and arrows with Alt) step through a list of ids, e.g. the triage queue on a detail page. */
export function useStepKeys(onPrev: (() => void) | null, onNext: (() => void) | null) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable], dialog[open]') || e.metaKey || e.ctrlKey) return;
      if (e.key === 'j' && onNext) onNext();
      if (e.key === 'k' && onPrev) onPrev();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onPrev, onNext]);
}
