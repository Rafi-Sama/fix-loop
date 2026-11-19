import { useQuery } from '@tanstack/react-query';
import { FileText, ImagePlus, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { label } from '../lib/format';
import { ACCEPT_DOCS, checkFile, uploadFile, type Presigned } from '../lib/upload';
import type { Attachment } from '../lib/types';

/** Short-lived signed URL for one file, cached a little under its lifetime. `token` reads through a no-login link. */
export function useFileUrl(id: string, token?: string, enabled = true) {
  return useQuery({
    queryKey: ['file-url', token ?? 'app', id],
    queryFn: () => api<{ url: string }>(token ? `/links/${token}/files/${id}` : `/files/${id}/url`).then((r) => r.url),
    staleTime: 4 * 60_000,
    gcTime: 5 * 60_000,
    enabled,
  });
}

type GalleryFile = Pick<Attachment, 'id' | 'kind' | 'mime' | 'url'>;

function Thumb({ file, token, onOpen }: { file: GalleryFile; token?: string; onOpen: (url: string) => void }) {
  // Detail payloads carry signed URLs; fetching one per thumbnail is only the fallback.
  const fetched = useFileUrl(file.id, token, !file.url);
  const url = file.url ?? fetched.data;
  const isError = fetched.isError;
  const image = file.mime.startsWith('image/');
  const name = label(file.kind);
  if (!image)
    return (
      <a className="thumb" href={url} target="_blank" rel="noreferrer" aria-label={`Open ${name} (PDF)`} style={{ cursor: 'pointer' }}>
        <FileText size={26} />
        <span className="kind">{name}</span>
      </a>
    );
  return (
    <button type="button" className="thumb" onClick={() => url && onOpen(url)} aria-label={`View ${name}`}>
      {url ? <img src={url} alt={name} loading="lazy" decoding="async" /> : isError ? <X size={20} /> : <Loader2 size={18} className="spin" />}
      <span className="kind">{name}</span>
    </button>
  );
}

export function Gallery({ files, token, empty = 'No files yet' }: { files: GalleryFile[]; token?: string; empty?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  if (files.length === 0) return <p className="muted small">{empty}</p>;
  return (
    <>
      <div className="thumbs">
        {files.map((f) => (
          <Thumb key={f.id} file={f} token={token} onOpen={setOpen} />
        ))}
      </div>
      {open && (
        <button type="button" className="lightbox" onClick={() => setOpen(null)} aria-label="Close photo">
          <img src={open} alt="" />
        </button>
      )}
    </>
  );
}

export interface PickedFile {
  key: string;
  name: string;
  preview: string | null;
  status: 'uploading' | 'done' | 'error';
  id?: string;
  error?: string;
}

/**
 * File picker that uploads as soon as files are chosen and reports the confirmed attachment ids.
 * `start`/`complete` bind it to the app, a public draft, or a no-login link.
 */
export function Uploader({
  accept,
  multiple = true,
  start,
  complete,
  onChange,
  label: text = 'Add photos',
  hint,
  capture,
}: {
  accept: string;
  multiple?: boolean;
  start: (meta: { mime: string; sizeBytes: number }) => Promise<Presigned>;
  complete: (id: string) => Promise<unknown>;
  onChange: (ids: string[], busy: boolean) => void;
  label?: string;
  hint?: string;
  capture?: boolean;
}) {
  const [items, setItems] = useState<PickedFile[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  // The parent's callback may change identity every render; report only when the items change.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current(items.filter((i) => i.status === 'done').map((i) => i.id!), items.some((i) => i.status === 'uploading'));
  }, [items]);
  // Free preview blobs when the uploader goes away.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => {
    for (const i of itemsRef.current) if (i.preview) URL.revokeObjectURL(i.preview);
  }, []);


  function add(list: FileList | null) {
    if (!list) return;
    const files = multiple ? [...list] : [...list].slice(0, 1);
    for (const file of files) {
      const key = `f${++seq.current}`;
      const problem = checkFile(file);
      const item: PickedFile = { key, name: file.name, preview: file.type.startsWith('image/') && file.type !== 'image/heic' ? URL.createObjectURL(file) : null, status: problem ? 'error' : 'uploading', error: problem ?? undefined };
      setItems((xs) => (multiple ? [...xs, item] : [item]));
      if (problem) continue;
      uploadFile(file, start, complete)
        .then((id) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, status: 'done', id } : x))))
        .catch((e) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, status: 'error', error: errorMessage(e) } : x))));
    }
  }

  const remove = (key: string) =>
    setItems((xs) => {
      const gone = xs.find((x) => x.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return xs.filter((x) => x.key !== key);
    });

  return (
    <div className="stack-sm">
      <button
        type="button"
        className={over ? 'dropzone over' : 'dropzone'}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        <ImagePlus size={22} aria-hidden />
        <strong>{text}</strong>
        <span className="small muted">{hint ?? (accept.includes('pdf') ? 'JPG, PNG, HEIC or PDF, up to 15 MB' : 'JPG, PNG or HEIC, up to 15 MB')}</span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        {...(capture ? { capture: 'environment' } : {})}
        onChange={(e) => {
          add(e.target.files);
          // Reset so picking the same file again still fires onChange.
          e.target.value = '';
        }}
      />
      {items.length > 0 && (
        <div className="thumbs">
          {items.map((i) => (
            <div key={i.key} className="thumb" style={{ cursor: 'default' }} title={i.error ?? i.name}>
              {i.preview ? <img src={i.preview} alt={i.name} style={{ opacity: i.status === 'uploading' ? 0.5 : 1 }} /> : <FileText size={24} />}
              {i.status === 'uploading' && <Loader2 size={20} className="spin" style={{ position: 'absolute' }} />}
              {i.status === 'error' && <span className="kind" style={{ background: 'var(--serial)' }}>Failed</span>}
              <button type="button" className="icon-btn" onClick={() => remove(i.key)} aria-label={`Remove ${i.name}`} style={{ position: 'absolute', top: 2, right: 2, width: 24, height: 24, background: 'rgb(34 37 42 / .7)', color: '#fff' }}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {items.filter((i) => i.error).map((i) => (
        <span key={i.key} className="small" style={{ color: 'var(--serial)' }}>
          {i.error}
        </span>
      ))}
    </div>
  );
}

/** "Add files" for the PM app: uploads straight to a request / work order / vendor, then refreshes the page's data. */
export function AddFiles({ subject, kind, onDone, accept = ACCEPT_DOCS, label: text = 'Add photos or files' }: { subject: { type: 'request' | 'work_order' | 'vendor'; id: string }; kind: Attachment['kind']; onDone: () => void; accept?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  if (!open)
    return (
      <button type="button" className="btn sm" onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start' }}>
        <ImagePlus size={14} /> {text}
      </button>
    );
  return (
    <Uploader
      key={key}
      accept={accept}
      label={text}
      start={(meta) => api<Presigned>('/files/uploads', { method: 'POST', body: { ...meta, subject, kind } })}
      complete={(id) => api(`/files/uploads/${id}/complete`, { method: 'POST', body: { subject } })}
      onChange={(ids, busy) => {
        if (ids.length && !busy) {
          onDone();
          setKey((k) => k + 1);
          setOpen(false);
        }
      }}
    />
  );
}
