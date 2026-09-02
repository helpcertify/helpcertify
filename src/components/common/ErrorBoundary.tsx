import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  // Shown as the boundary's title. Defaults to a generic app-level message.
  title?: string;
}

interface State {
  error: Error | null;
}

// Catches render/lifecycle errors anywhere below it so a single broken
// component shows a recoverable panel instead of a blank white screen.
// Wrap the whole router once at the top, and optionally smaller regions
// (e.g. an admin section) for finer-grained recovery.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No remote logging wired up; console is what an admin/dev has.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">HelpCertify</p>
        <h1 className="mt-2 text-xl font-bold text-ink">{this.props.title ?? 'Something went wrong on this page'}</h1>
        <p className="mt-2 text-sm text-ink-faint">
          The page hit an unexpected error. Your data is safe - try reloading, and if it keeps happening let support know.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white hover:bg-[#004EEB]"
          >
            Reload page
          </button>
        </div>
        {import.meta.env.DEV && (
          <pre className="mt-6 overflow-x-auto rounded-lg bg-surface-raised p-3 text-left text-xs text-ink-faint">
            {this.state.error.message}
          </pre>
        )}
      </div>
    );
  }
}
