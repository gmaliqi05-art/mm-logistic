import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, TrendingUp, TrendingDown, Search, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { logger } from '../../utils/logger';

interface PalletAccountRow {
  id: string;
  partner_contact_id: string;
  pallet_type: string;
  current_balance: number;
  last_movement_at: string | null;
  partner_name: string;
}

export default function PalletAccounts() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<PalletAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!profile?.company_id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('pallet_accounts')
          .select('id, partner_contact_id, pallet_type, current_balance, last_movement_at, acc_contacts(name)')
          .eq('company_id', profile.company_id)
          .order('last_movement_at', { ascending: false, nullsFirst: false });
        if (error) throw error;
        const mapped: PalletAccountRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
          id: String(r.id),
          partner_contact_id: String(r.partner_contact_id),
          pallet_type: String(r.pallet_type),
          current_balance: Number(r.current_balance ?? 0),
          last_movement_at: (r.last_movement_at as string | null) ?? null,
          partner_name: ((r.acc_contacts as { name?: string } | null)?.name) ?? '—',
        }));
        setRows(mapped);
      } catch (err) {
        logger.error('PalletAccounts load failed', { error: err });
      } finally {
        setLoading(false);
      }
    })();
  }, [profile?.company_id]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => r.partner_name.toLowerCase().includes(needle) || r.pallet_type.toLowerCase().includes(needle));
  }, [rows, q]);

  const totalOwedToUs = rows.reduce((s, r) => s + Math.max(0, r.current_balance), 0);
  const totalOwedByUs = rows.reduce((s, r) => s + Math.max(0, -r.current_balance), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pallet Accounts</h1>
        <p className="text-sm text-slate-600 mt-1">{t('common.epalPalletLedgerPerPartnerAutomatically')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wide">Partners owe us</div>
              <div className="text-2xl font-bold text-slate-900">{totalOwedToUs}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-700" />
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wide">We owe partners</div>
              <div className="text-2xl font-bold text-slate-900">{totalOwedByUs}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-teal-700" />
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wide">Active accounts</div>
              <div className="text-2xl font-bold text-slate-900">{rows.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('common.searchPartner')}
            className="flex-1 text-sm outline-none"
          />
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No pallet accounts yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <Link
                key={r.id}
                to={`/company/pallet-accounts/${r.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{r.partner_name}</div>
                  <div className="text-xs text-slate-500">
                    {r.pallet_type}
                    {r.last_movement_at && <span> · Last: {new Date(r.last_movement_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold ${r.current_balance > 0 ? 'text-emerald-700' : r.current_balance < 0 ? 'text-red-700' : 'text-slate-500'}`}>
                    {r.current_balance > 0 ? '+' : ''}{r.current_balance}
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
