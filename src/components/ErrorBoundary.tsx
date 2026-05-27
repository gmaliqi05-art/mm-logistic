import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logger } from '../utils/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Inlined translations: ErrorBoundary cannot depend on the i18n React context
// because the provider itself may be the source of the error it has to catch.
const COPY = {
  sq: { title: 'Dicka shkoi gabim', message: 'Aplikacioni hasi nje gabim te papritur. Provo te rifreskosh faqen.', reload: 'Rifresko faqen' },
  en: { title: 'Something went wrong', message: 'The application encountered an unexpected error. Try refreshing the page.', reload: 'Reload page' },
  de: { title: 'Etwas ist schiefgelaufen', message: 'Die Anwendung ist auf einen unerwarteten Fehler gestoßen. Bitte aktualisieren Sie die Seite.', reload: 'Seite neu laden' },
  fr: { title: 'Une erreur est survenue', message: "L'application a rencontré une erreur inattendue. Veuillez actualiser la page.", reload: 'Recharger la page' },
} as const;

function pickCopy(): (typeof COPY)[keyof typeof COPY] {
  try {
    const saved = localStorage.getItem('ep_language');
    if (saved && saved in COPY) return COPY[saved as keyof typeof COPY];
  } catch {
    // localStorage may throw in private mode or sandboxed iframes
  }
  return COPY.sq;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('Unhandled error caught by ErrorBoundary', { error, componentStack: info.componentStack });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const copy = pickCopy();

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            {copy.title}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {copy.message}
          </p>
          {import.meta.env.DEV && this.state.error?.message && (
            <p className="text-xs text-gray-400 mb-6 break-words font-mono bg-gray-50 rounded-lg p-3">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleReload}
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-teal-600 text-white font-medium text-sm hover:bg-teal-700 active:bg-teal-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {copy.reload}
          </button>
        </div>
      </div>
    );
  }
}
