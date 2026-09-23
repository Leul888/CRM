import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled application error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
          <div className="w-full max-w-md rounded-3xl border border-ink-200 bg-white p-8 text-center shadow-card">
            <h1 className="font-display text-xl font-bold text-ink-950">Something went wrong</h1>
            <p className="mt-2 text-sm text-ink-500">An unexpected error occurred. Reloading usually fixes it — your data is saved in this browser.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element to mount to');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
