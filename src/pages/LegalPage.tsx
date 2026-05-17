import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Package, Shield, Scale, FileText, Cookie, Lock, Users, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from '../i18n';
import LanguageSwitcher from '../components/LanguageSwitcher';
import type { LegalDocumentKey } from '../i18n/legal';

const iconMap: Record<string, typeof Shield> = {
  impressum: Scale,
  terms: FileText,
  cookies: Cookie,
  privacy: Shield,
  dpa: Lock,
  subprocessors: Users,
  aup: AlertTriangle,
  refund: RefreshCw,
};

const validKeys = ['impressum', 'terms', 'cookies', 'privacy', 'dpa', 'subprocessors', 'aup', 'refund'];

interface LegalPageProps {
  documentKey?: LegalDocumentKey;
}

export default function LegalPage({ documentKey }: LegalPageProps) {
  const { slug } = useParams<{ slug: string }>();
  const { t, tRaw } = useTranslation();

  const key = (documentKey ?? slug ?? 'impressum') as LegalDocumentKey;
  const isValid = validKeys.includes(key);

  const legal = tRaw('legal') as {
    documents: Record<string, {
      title?: string;
      subtitle?: string;
      intro?: string;
      lastUpdated?: string;
      version?: string;
      [k: string]: unknown;
    }>;
    nav: Record<string, string>;
  } | undefined;

  const doc = legal?.documents?.[key];
  const nav = legal?.nav;
  const Icon = iconMap[key] ?? FileText;

  const sections: { title: string; body: string }[] = [];
  if (doc) {
    for (let i = 1; i <= 20; i++) {
      const section = doc[`section${i}`] as { title?: string; body?: string } | undefined;
      if (!section?.title) break;
      sections.push({ title: section.title, body: section.body ?? '' });
    }
  }

  if (!isValid || !doc) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-800 mb-2">Dokumenti nuk u gjet</h1>
          <p className="text-slate-500 mb-6">Faqja ligjore e kerkuar nuk ekziston.</p>
          <Link to="/" className="text-teal-600 hover:text-teal-700 font-medium">
            Kthehu ne faqen kryesore
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="p-2 bg-teal-600 rounded-xl">
                <Package className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-slate-800">MM Logistic</span>
            </Link>
            <div className="flex items-center gap-4">
              <LanguageSwitcher />
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Kthehu
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar navigation */}
          <aside className="lg:w-56 flex-shrink-0">
            <div className="lg:sticky lg:top-24">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Dokumentet Ligjore
              </h3>
              <nav className="space-y-1">
                {nav && validKeys.map((k) => {
                  const NavIcon = iconMap[k] ?? FileText;
                  const isActive = k === key;
                  return (
                    <Link
                      key={k}
                      to={k === 'impressum' ? '/legal' : `/legal/${k}`}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-teal-50 text-teal-700'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      <NavIcon className="h-4 w-4 flex-shrink-0" />
                      {nav[k] ?? k}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-sm font-medium mb-4">
                <Icon className="h-4 w-4" />
                Dokument Ligjor
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
                {doc.title}
              </h1>
              {doc.subtitle && (
                <p className="mt-2 text-slate-600">{doc.subtitle}</p>
              )}
              <div className="mt-3 flex items-center gap-4 text-sm text-slate-400">
                {doc.lastUpdated && <span>Perditesuar: {doc.lastUpdated}</span>}
                {doc.version && <span>{doc.version}</span>}
              </div>
            </div>

            {doc.intro && (
              <div className="bg-teal-50 border border-teal-100 rounded-xl p-5 mb-8">
                <p className="text-sm text-teal-800 leading-relaxed">{doc.intro}</p>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 sm:p-8 lg:p-10 space-y-10">
                {sections.map((section, idx) => (
                  <div key={idx}>
                    <h2 className="text-lg font-bold text-slate-800 mb-3">
                      {idx + 1}. {section.title}
                    </h2>
                    <div className="text-slate-600 leading-relaxed whitespace-pre-line text-sm">
                      {section.body}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-slate-500 text-sm">
              &copy; {new Date().getFullYear()} MM Logistic. Te gjitha te drejtat e rezervuara.
            </p>
            <Link to="/" className="text-slate-500 hover:text-teal-600 text-sm transition-colors">
              Kthehu ne faqen kryesore
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
