import { useState } from 'react';
import { X, Calculator, Check, Sparkles, Loader2, CreditCard } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';

interface Props {
  onClose: () => void;
  onActivated?: () => void;
}

const FEATURES = [
  'Skanim inteligjent i faturave dhe fletedergesave',
  'Klasifikim automatik: Blerje / Shitje / Shpenzim / Investim',
  'Kontabilitet i integruar me sinkronizim automatik',
  'Raporte financiare (P&L, TVSH, Bilanc)',
  'Eksport Datev dhe deklarate UStVa',
  'Menagjim i aseteve fikse dhe amortizimit',
];

export default function AccountingUpgradeModal({ onClose, onActivated }: Props) {
  const { profile } = useAuth();
  const { refreshSubscription } = useSubscription();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullPrice = 49;
  const addonPrice = Math.round(fullPrice / 2);

  async function handleActivate() {
    if (!profile?.company_id) return;
    setActivating(true);
    setError(null);
    try {
      // Look for an accounting plan with stripe_price_id
      const { data: accPlan } = await supabase
        .from('subscription_plans')
        .select('id, stripe_price_id')
        .eq('product_type', 'accounting')
        .eq('is_active', true)
        .not('stripe_price_id', 'is', null)
        .order('price_monthly', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (accPlan?.stripe_price_id) {
        // Use Stripe checkout for paid accounting addon
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          window.location.href = '/login';
          return;
        }

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              planId: accPlan.id,
              successUrl: `${window.location.origin}/payment-success`,
              cancelUrl: window.location.href,
              isAddon: true,
            }),
          }
        );

        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }

      // Fallback: if no Stripe price configured, activate directly (free trial / manual)
      const { error: upErr } = await supabase
        .from('companies')
        .update({
          accounting_enabled: true,
          accounting_enabled_at: new Date().toISOString(),
        })
        .eq('id', profile.company_id);
      if (upErr) throw upErr;
      await refreshSubscription();
      onActivated?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ndodhi nje gabim');
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="relative bg-gradient-to-br from-teal-600 to-emerald-700 text-white p-6">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/10 text-white/80"
            aria-label="Mbyll"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center mb-3">
            <Calculator className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold">Aktivizo Kontabilitetin</h2>
          <p className="text-teal-50/90 text-sm mt-1">
            Lidhja automatike mes kompanise suaj dhe kontabilitetit te integruar.
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-end gap-4">
            <div className="flex-1 p-4 rounded-xl border-2 border-slate-200 bg-slate-50">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vetem kontabilitet</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-400 line-through">{fullPrice}EUR</span>
                <span className="text-sm text-slate-400">/muaj</span>
              </div>
            </div>
            <div className="flex-1 p-4 rounded-xl border-2 border-teal-500 bg-teal-50 relative shadow-sm">
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-600 text-white text-[10px] font-bold tracking-wider">
                <Sparkles className="w-3 h-3" /> 50% ZBRITJE
              </span>
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Shtese mbi planin tuaj</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-teal-700">{addonPrice}EUR</span>
                <span className="text-sm text-teal-700/80">/muaj</span>
              </div>
            </div>
          </div>

          <ul className="space-y-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3 h-3" strokeWidth={3} />
                </span>
                <span className="text-sm text-slate-700">{f}</span>
              </li>
            ))}
          </ul>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}

          <button
            onClick={handleActivate}
            disabled={activating}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700 disabled:opacity-60 shadow-sm"
          >
            {activating ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
            Aktivizo per {addonPrice}EUR/muaj
          </button>
          <button
            onClick={onClose}
            className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
          >
            Me vone
          </button>
        </div>
      </div>
    </div>
  );
}
