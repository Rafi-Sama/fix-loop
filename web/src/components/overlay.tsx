import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '../lib/api';
import { Button } from './ui';

// ---------------------------------------------------------------- toasts

interface ToastItem {
  id: number;
  tone: 'ok' | 'bad';
  text: string;
  leaving?: boolean;
}
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'bad') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-3), { id, tone, text }]);
    const ttl = tone === 'bad' ? 7000 : 4000;
    // Mark first so the CSS exit can play, then drop it.
    setTimeout(() => setItems((xs) => xs.map((t) => (t.id === id ? { ...t, leaving: true } : t))), ttl - 180);
    setTimeout(() => setItems((xs) => xs.filter((t) => t.id !== id)), ttl);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}${t.leaving ? ' leaving' : ''}`} role={t.tone === 'bad' ? 'alert' : 'status'}>
            {t.tone === 'ok' ? <CheckCircle2 size={16} className="ic" /> : <CircleAlert size={16} className="ic" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- dialog

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  /** When set, the body is a form: Enter submits, the primary button shows progress and errors render inline. */
  onSubmit?: () => unknown;
  submitLabel?: string;
  danger?: boolean;
  submitDisabled?: boolean;
}

/** Native <dialog>: focus trap, Esc and backdrop come from the platform. */
export function Dialog({ open, onClose, title, children, wide, onSubmit, submitLabel = 'Save', danger, submitDisabled }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setError(null);
      d.showModal();
      // Start on the first field, not the close button in the header.
      d.querySelector<HTMLElement>('.dlg-body :is(input, select, textarea):not([disabled], [type=hidden])')?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!onSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click only; Esc is handled natively by <dialog> (onCancel).
    <dialog
      ref={ref}
      className={wide ? 'dlg wide' : 'dlg'}
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
      aria-labelledby="dlg-title"
    >
      {open && (
        <form onSubmit={submit} noValidate={false}>
          <div className="dlg-head">
            <h2 id="dlg-title">{title}</h2>
            <button type="button" className="icon-btn dark" onClick={onClose} aria-label="Close" disabled={busy}>
              <X size={18} />
            </button>
          </div>
          <div className="dlg-body">
            {children}
            {error && (
              <div className="notice bad" role="alert">
                <CircleAlert size={16} />
                <div>{error}</div>
              </div>
            )}
          </div>
          {onSubmit && (
            <div className="dlg-foot">
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                {/* "Cancel" next to "Cancel work order" reads as the same action. */}
                {submitLabel.startsWith('Cancel') ? 'Go back' : 'Cancel'}
              </Button>
              <Button type="submit" variant={danger ? 'danger solid' : 'primary'} loading={busy} disabled={submitDisabled}>
                {submitLabel}
              </Button>
            </div>
          )}
        </form>
      )}
    </dialog>
  );
}

/** Open/close state for a dialog, keyed so one page can host several. */
export function useDialog<K extends string>() {
  const [open, setOpen] = useState<K | null>(null);
  return { open, show: setOpen, close: () => setOpen(null), is: (k: K) => open === k };
}
