import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error caught by ErrorBoundary:', error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Dicka shkoi gabim
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Aplikacioni hasi nje gabim te papritur. Provo te rifreskosh faqen.
          </p>
          {this.state.error?.message && (
            <p className="text-xs text-gray-400 mb-6 break-words font-mono bg-gray-50 rounded-lg p-3">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleReload}
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-teal-600 text-white font-medium text-sm hover:bg-teal-700 active:bg-teal-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Rifresko faqen
          </button>
        </div>
      </div>
    );
  }
}
