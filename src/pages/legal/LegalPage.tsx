import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, FileText, ShieldCheck, ChevronRight } from 'lucide-react';
import { LEGAL_DOCUMENTS, LEGAL_NAV_ORDER } from '../../lib/legalContent';
import { LEGAL_INFO, type LegalSlug } from '../../lib/legalInfo';
import PublicFooter from '../../components/PublicFooter';

const isLegalSlug = (s: string | undefined): s is LegalSlug =>
  !!s && (LEGAL_NAV_ORDER as readonly string[]).includes(s);

export default function LegalPage() {
  const { slug } = useParams<{ slug: string }>();

  if (!isLegalSlug(slug)) {
    return <Navigate to="/legal/imprint" replace />;
  }

  const doc = LEGAL_DOCUMENTS[slug];
  const c = LEGAL_INFO.company;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            {LEGAL_INFO.platformName}
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
            Dokument ligjor zyrtar
          </span>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-16 grid lg:grid-cols-[260px_1fr] gap-10">
          <aside className="lg:sticky lg:top-8 self-start">
            <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-3">Faqet ligjore</h2>
            <nav className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
              {LEGAL_NAV_ORDER.map((s) => {
                const item = LEGAL_DOCUMENTS[s];
                const active = s === slug;
                return (
                  <Link
                    key={s}
                    to={`/legal/${s}`}
                    className={`flex items-center justify-between gap-2 px-4 py-3 text-sm border-b last:border-b-0 border-slate-100 transition-colors ${
                      active
                        ? 'bg-teal-50 text-teal-700 font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="truncate">{item.title}</span>
                    <ChevronRight className={`h-4 w-4 flex-shrink-0 ${active ? 'text-teal-600' : 'text-slate-300'}`} />
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 rounded-2xl bg-white border border-slate-200 p-4 text-xs text-slate-600 space-y-1.5">
              <div className="font-semibold text-slate-900">{c.legalName}</div>
              <div>{c.address.street}</div>
              <div>{c.address.postal} {c.address.city}, {c.address.country}</div>
              <div className="pt-1.5 border-t border-slate-100 mt-2">{c.registry.number}</div>
              <div>{c.registry.vatId}</div>
            </div>
          </aside>

          <article className="rounded-3xl bg-white border border-slate-200 shadow-sm">
            <div className="px-6 sm:px-10 pt-10 pb-6 border-b border-slate-100">
              <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-teal-700">
                <FileText className="h-3.5 w-3.5" />
                Dokument zyrtar
              </span>
              <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">{doc.title}</h1>
              <p className="mt-3 text-base text-slate-600 leading-relaxed">{doc.subtitle}</p>
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-slate-500">
                <span>Perditesimi i fundit: <span className="font-semibold text-slate-700">{LEGAL_INFO.effectiveDate}</span></span>
                <span>Versioni: <span className="font-semibold text-slate-700">1.0</span></span>
                <span>Juridiksioni: <span className="font-semibold text-slate-700">{c.countryName}</span></span>
              </div>
            </div>

            <div className="px-6 sm:px-10 py-8 space-y-8 text-slate-700 leading-relaxed">
              <p className="text-[15px] sm:text-base text-slate-600 italic">{doc.intro}</p>

              {doc.articles.map((a) => (
                <section key={a.number} id={`art-${a.number}`} className="scroll-mt-24">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                    <span className="text-teal-600 mr-2">§ {a.number}</span>
                    {a.title}
                  </h2>
                  <div className="mt-3 space-y-3 text-[15px] sm:text-base">
                    {a.paragraphs.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                    {a.list && a.list.length > 0 && (
                      <ul className="mt-2 space-y-2 pl-1">
                        {a.list.map((li, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="mt-2 block h-1.5 w-1.5 rounded-full bg-teal-600 flex-shrink-0" />
                            <span>{li}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              ))}

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 text-sm text-slate-600">
                <div className="font-semibold text-slate-900 mb-1">Kontakt per kete dokument</div>
                <div>{c.legalName} — {c.address.city}, {c.address.country}</div>
                <div>Email: <a href={`mailto:${c.contact.email}`} className="text-teal-700 hover:underline">{c.contact.email}</a></div>
                <div>Perfaqesues ligjor: {c.owner}</div>
              </div>
            </div>
          </article>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
