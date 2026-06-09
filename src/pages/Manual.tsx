import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Search, ChevronRight, ExternalLink, Info, AlertTriangle, Lightbulb, Crown } from 'lucide-react';
import { getManualSections, type ManualScope, type ManualPage, type ManualBlock } from '../data/manual';
import { useAuth } from '../contexts/AuthContext';

interface ManualProps {
  scope: ManualScope;
}

function matchesQuery(page: ManualPage, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (page.title.toLowerCase().includes(needle)) return true;
  if (page.route?.toLowerCase().includes(needle)) return true;
  for (const block of page.blocks) {
    const text = JSON.stringify(block).toLowerCase();
    if (text.includes(needle)) return true;
  }
  return false;
}

function BlockRenderer({ block }: { block: ManualBlock }) {
  if (block.kind === 'p') {
    return <p className="text-gray-700 leading-relaxed">{block.text}</p>;
  }
  if (block.kind === 'list') {
    const Tag = block.ordered ? 'ol' : 'ul';
    return (
      <Tag className={`${block.ordered ? 'list-decimal' : 'list-disc'} ml-5 space-y-1.5 text-gray-700`}>
        {block.items.map((it, i) => (
          <li key={i} className="leading-relaxed">{it}</li>
        ))}
      </Tag>
    );
  }
  if (block.kind === 'steps') {
    return (
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
        {block.title && <div className="font-semibold text-slate-900 mb-2">{block.title}</div>}
        <ol className="list-decimal ml-5 space-y-1.5 text-gray-700">
          {block.steps.map((s, i) => (
            <li key={i} className="leading-relaxed">{s}</li>
          ))}
        </ol>
      </div>
    );
  }
  if (block.kind === 'fields') {
    return (
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        {block.title && (
          <div className="bg-slate-50 px-4 py-2 font-semibold text-slate-900 border-b border-slate-200">
            {block.title}
          </div>
        )}
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {block.fields.map((f) => (
              <tr key={f.name}>
                <td className="px-4 py-2.5 align-top w-1/3 font-medium text-slate-800">
                  {f.name}
                  {f.required && <span className="text-red-500 ml-1" title="E detyrueshme">*</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-700 leading-relaxed">{f.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.kind === 'callout') {
    const map = {
      info: { Icon: Info, classes: 'bg-blue-50 border-blue-200 text-blue-900' },
      warn: { Icon: AlertTriangle, classes: 'bg-amber-50 border-amber-200 text-amber-900' },
      tip: { Icon: Lightbulb, classes: 'bg-teal-50 border-teal-200 text-teal-900' },
    } as const;
    const { Icon, classes } = map[block.tone];
    return (
      <div className={`rounded-lg border p-3 flex gap-3 ${classes}`}>
        <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="text-sm leading-relaxed">{block.text}</div>
      </div>
    );
  }
  return null;
}

export default function Manual({ scope }: ManualProps) {
  const sections = useMemo(() => getManualSections(scope), [scope]);
  const [query, setQuery] = useState('');

  // Apply search across pages but keep group structure.
  const filteredSections = useMemo(() => {
    if (!query.trim()) return sections;
    return sections
      .map((sec) => ({
        ...sec,
        groups: sec.groups
          .map((g) => ({ ...g, pages: g.pages.filter((p) => matchesQuery(p, query)) }))
          .filter((g) => g.pages.length > 0),
      }))
      .filter((sec) => sec.groups.length > 0);
  }, [sections, query]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-teal-600 text-white flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Manual i perdorimit</h1>
        </div>
        <p className="text-gray-600">
          Udhezues hap-pas-hapi per cdo faqe dhe funksion qe ju mund te perdorni. Klikoni nje seksion ne anen e majte ose perdorni kerkimin.
        </p>
      </div>

      <div className="mb-6 relative">
        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Kerkoni nje fjale, faqe ose route (p.sh. 'fature', 'sortim', '/depot/repairs')"
          className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <aside className="lg:sticky lg:top-4 self-start max-h-[calc(100vh-100px)] overflow-y-auto pr-2 hidden lg:block">
          <nav className="space-y-4 text-sm">
            {filteredSections.map((sec) => (
              <div key={sec.id}>
                <a href={`#${sec.id}`} className="font-semibold text-slate-900 hover:text-teal-700 block mb-1">
                  {sec.title}
                </a>
                <ul className="space-y-1 ml-2 border-l border-slate-200 pl-2">
                  {sec.groups.map((g) => (
                    <li key={g.id}>
                      <a href={`#${sec.id}-${g.id}`} className="text-gray-600 hover:text-teal-700">
                        {g.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <div className="space-y-10">
          {filteredSections.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
              Asnje rezultat per "{query}".
            </div>
          )}

          {filteredSections.map((sec) => (
            <section key={sec.id} id={sec.id} className="scroll-mt-4">
              <div className="mb-4 border-b border-gray-200 pb-3">
                <h2 className="text-2xl font-bold text-gray-900">{sec.title}</h2>
                <p className="text-gray-600 mt-1 leading-relaxed">{sec.intro}</p>
              </div>

              <div className="space-y-8">
                {sec.groups.map((g) => (
                  <div key={g.id} id={`${sec.id}-${g.id}`} className="scroll-mt-4">
                    <div className="mb-3">
                      <h3 className="text-xl font-bold text-slate-900">{g.title}</h3>
                      {g.intro && <p className="text-gray-600 mt-1 leading-relaxed">{g.intro}</p>}
                    </div>

                    <div className="space-y-5">
                      {g.pages.map((page) => (
                        <article key={page.id} id={`${sec.id}-${g.id}-${page.id}`} className="scroll-mt-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                          <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h4 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                {page.title}
                                {page.premium && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                    <Crown className="w-3 h-3" /> Premium
                                  </span>
                                )}
                              </h4>
                              {page.route && (
                                <code className="text-xs text-teal-700 bg-teal-50 px-2 py-0.5 rounded mt-1 inline-block">
                                  {page.route}
                                </code>
                              )}
                            </div>
                            {page.route && !page.route.includes(':') && (
                              <Link
                                to={page.route}
                                className="text-sm text-teal-700 hover:text-teal-800 inline-flex items-center gap-1"
                              >
                                Hap faqen <ExternalLink className="w-3.5 h-3.5" />
                              </Link>
                            )}
                          </header>

                          <div className="space-y-3">
                            {page.blocks.map((block, i) => (
                              <BlockRenderer key={i} block={block} />
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="text-sm text-gray-500 border-t border-gray-200 pt-4">
            <ChevronRight className="w-4 h-4 inline" /> Per nje kerkese mbeshtetje, perdorni Chat-in e brendshem ne sidebar.
          </div>
        </div>
      </div>
    </div>
  );
}

// Depot has two worker categories with different page access. Pick the
// right manual based on the logged-in user's worker_category.
export function DepotManual() {
  const { profile } = useAuth();
  const scope: ManualScope =
    profile?.worker_category === 'reparature' ? 'depot_reparature' : 'depot_depoist';
  return <Manual scope={scope} />;
}
