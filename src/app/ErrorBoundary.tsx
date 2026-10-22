import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error?: Error;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your data is still stored in this browser. Reload the page; if the problem stays, export a backup
          from Settings before changing anything.
        </p>
        <pre className="mt-4 overflow-auto rounded-md bg-surface-2 p-3 text-xs">
          {this.state.error.message}
        </pre>
        <button
          className="mt-4 rounded-md border px-3 py-1.5 text-sm"
          onClick={() => this.setState({ error: undefined })}
        >
          Try again
        </button>
      </div>
    );
  }
}
