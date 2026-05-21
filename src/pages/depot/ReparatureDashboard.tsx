import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, Clock, Calendar, Loader2, CheckCircle2, XCircle, BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface RepairRow {
  id: string;
  logged_at: string;
  quantity_repaired: number;
  quantity_scrapped: number;
  product_name: string | null;
  category?: { name?: string | null } | null;
}

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfWeek(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

export default function ReparatureDashboard() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<RepairRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function load() {
    if (!profile?.id || !profile.company_id) return;
    setLoading(true);
    const { data } = await supabase
      .from('depot_repairs')
      .select('id, logged_at, quantity_repaired, quantity_scrapped, product_name, category:product_categories(name)')
      .eq('company_id', profile.company_id)
      .eq('worker_id', profile.id)
      .gte('logged_at', startOfWeek())
      .order('logged_at', { ascending: false })
      .limit(100);
    setRows((data ?? []) as unknown as RepairRow[]);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const today = startOfToday();
    let todayRep = 0, todayScrap = 0, weekRep = 0, weekScrap = 0;
    for (const r of rows) {
      weekRep += r.quantity_repaired || 0;
      weekScrap += r.quantity_scrapped || 0;
      if (r.logged_at >= today) {
        todayRep += r.quantity_repaired || 0;
        todayScrap += r.quantity_scrapped || 0;
      }
    }
    return { todayRep, todayScrap, weekRep, weekScrap };
  }, [rows]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          {profile?.full_name ? `Mireserdhe, ${profile.full_name}` : 'Mireserdhe'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Permbledhje e punes suaj. Te dhenat regjistrohen nga depoisti pasi ju te keni perfunduar reparimet.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Sot - Riparuar" value={stats.todayRep} tone="emerald" icon={<Wrench className="w-5 h-5" />} />
        <Stat label="Sot - Scrap" value={stats.todayScrap} tone="rose" icon={<XCircle className="w-5 h-5" />} />
        <Stat label="7 dite - Riparuar" value={stats.weekRep} tone="teal" icon={<CheckCircle2 className="w-5 h-5" />} />
        <Stat label="7 dite - Scrap" value={stats.weekScrap} tone="amber" icon={<XCircle className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickLink to="/depot/attendance" icon={<Clock className="w-5 h-5" />} label="Prezenca" desc="Hyrje / dalje, oraret" />
        <QuickLink to="/depot/work-hours" icon={<BookOpen className="w-5 h-5" />} label="Oraret e punes" desc="Shiko orarin javor" />
        <QuickLink to="/depot/leave" icon={<Calendar className="w-5 h-5" />} label="Kerkesa per pushim" desc="Krijo apo ndiq kerkesat" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Puna e regjistruar (7 dite e fundit)</h2>
        </div>
        {loading ? (
          <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 text-slate-400 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 text-center">
            Asnje regjistrim ende. Depoisti i shton automatikisht keto te dhena pas raportimit te punes.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {r.product_name || r.category?.name || 'Reparim'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {new Date(r.logged_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Riparuar</p>
                    <p className="text-sm font-bold text-emerald-700">{r.quantity_repaired || 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Scrap</p>
                    <p className="text-sm font-bold text-rose-700">{r.quantity_scrapped || 0}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: number; tone: 'emerald' | 'rose' | 'teal' | 'amber'; icon: React.ReactNode }) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    teal: 'bg-teal-50 text-teal-700 border-teal-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide opacity-70">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function QuickLink({ to, icon, label, desc }: { to: string; icon: React.ReactNode; label: string; desc: string }) {
  return (
    <Link to={to} className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-teal-300 hover:shadow-sm transition-all">
      <div className="flex items-center gap-3 mb-1">
        <span className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">{icon}</span>
        <p className="font-semibold text-slate-900">{label}</p>
      </div>
      <p className="text-xs text-slate-500">{desc}</p>
    </Link>
  );
}
