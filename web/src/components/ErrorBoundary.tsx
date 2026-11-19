import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Component, type ReactNode } from 'react';

const FLAG = 'fixloop.reloaded';
function store(op: 'get' | 'set' | 'remove'): boolean {
  try {
    if (op === 'get') return sessionStorage.getItem(FLAG) !== null;
    if (op === 'set') sessionStorage.setItem(FLAG, '1');
    else sessionStorage.removeItem(FLAG);
  } catch {
    // Storage blocked: never auto-reload rather than risk a loop.
    return true;
  }
  return false;
}

/** A render crash shows a recoverable screen instead of a blank page. A missing lazy chunk (new deploy) reloads once. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidMount() {
    // A healthy load re-arms the one-time reload for the next deploy.
    setTimeout(() => store('remove'), 5000);
  }

  componentDidCatch(error: Error) {
    const chunk = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message);
    if (chunk && !store('get')) {
      store('set');
      window.location.reload();
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="box lift">
          <div className="empty">
            <TriangleAlert size={36} strokeWidth={1.4} />
            <h1 style={{ fontSize: 20 }}>Something went wrong on this page</h1>
            <p>Your data is safe. Reload to try again; if it keeps happening, tell us what you clicked.</p>
            <button type="button" className="btn primary" onClick={() => window.location.reload()}>
              <RefreshCw size={15} /> Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
