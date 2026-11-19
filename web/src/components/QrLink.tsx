import { Copy, Printer } from 'lucide-react';
import { useMemo } from 'react';
import { renderSVG } from 'uqr';
import { useToast } from './overlay';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A shareable link with its QR code, for tenant request links (firm-wide or per property). */
export function QrLink({ url, title }: { url: string; title: string }) {
  const toast = useToast();
  const svg = useMemo(() => renderSVG(url, { border: 1 }), [url]);
  function print() {
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) return toast('Allow pop-ups to print the QR code', 'bad');
    w.document.write(`<title>${esc(title)}</title><body style="font-family:system-ui;text-align:center;padding:48px"><h1 style="font-size:28px">${esc(title)}</h1><p style="font-size:18px">Scan to report a maintenance issue</p><div style="width:360px;margin:24px auto">${svg}</div><p style="font-size:14px;word-break:break-all">${esc(url)}</p><p style="font-size:13px;color:#555">In an emergency call 911 first.</p></body>`);
    w.document.close();
    w.focus();
    w.print();
  }
  return (
    <div className="hstack" style={{ gap: 16, alignItems: 'flex-start' }}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: SVG is generated locally by uqr from our own URL; no user HTML. */}
      <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label={`QR code for ${url}`} />
      <div className="stack-sm" style={{ flex: 1, minWidth: 200 }}>
        <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Request link" />
        <div className="btn-row">
          <button className="btn sm" type="button" onClick={() => navigator.clipboard.writeText(url).then(() => toast('Link copied'))}>
            <Copy size={14} /> Copy link
          </button>
          <button className="btn sm" type="button" onClick={print}>
            <Printer size={14} /> Print poster
          </button>
        </div>
      </div>
    </div>
  );
}
