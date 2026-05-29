import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Loader2, Tag, Package, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../types/accounting';
import { useTranslation } from '../../i18n';

interface CatalogProduct {
  id: string;
  source: 'accounting' | 'stock';
  name: string;
  sku: string | null;
  price_net: number;
  unit: string | null;
}

interface ClientPrice {
  id: string;
  product_id: string;
  product_source: 'accounting' | 'stock';
  custom_price_net: number;
  currency: string;
  notes: string | null;
}

interface Props {
  contactId: string;
  contactName: string;
  companyId: string;
  onClose: () => void;
}

export default function ClientPricesModal({ contactId, contactName, companyId, onClose }: Props) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [prices, setPrices] = useState<ClientPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [addingProduct, setAddingProduct] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedSource, setSelectedSource] = useState<'accounting' | 'stock'>('accounting');
  const [newPrice, setNewPrice] = useState('');
  const [newNotes, setNewNotes] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [{ data: accProds }, { data: catProds }, { data: clientPrices }] = await Promise.all([
      supabase.from('acc_products')
        .select('id, name, sku, price_net, unit')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name'),
      supabase.from('category_products')
        .select('id, name, sku, price_net, unit')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name'),
      supabase.from('acc_client_prices')
        .select('*')
        .eq('company_id', companyId)
        .eq('contact_id', contactId)
        .eq('is_active', true),
    ]);

    const merged: CatalogProduct[] = [];
    const seen = new Set<string>();
    for (const r of (accProds ?? []) as any[]) {
      const key = `accounting:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ id: r.id, source: 'accounting', name: r.name, sku: r.sku, price_net: Number(r.price_net ?? 0), unit: r.unit });
    }
    for (const r of (catProds ?? []) as any[]) {
      const key = `stock:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ id: r.id, source: 'stock', name: r.name, sku: r.sku, price_net: Number(r.price_net ?? 0), unit: r.unit });
    }
    merged.sort((a, b) => a.name.localeCompare(b.name));
    setCatalog(merged);
    setPrices((clientPrices ?? []) as ClientPrice[]);
    setLoading(false);
  }

  function getProduct(priceRow: ClientPrice): CatalogProduct | undefined {
    return catalog.find(p => p.id === priceRow.product_id && p.source === priceRow.product_source);
  }

  async function handleAdd() {
    if (!selectedProductId || !newPrice) return;
    setSaving(true);
    const product = catalog.find(p =>
      p.id === selectedProductId && p.source === selectedSource
    );
    if (!product) { setSaving(false); return; }

    const { error } = await supabase.from('acc_client_prices').upsert({
      company_id: companyId,
      contact_id: contactId,
      product_id: selectedProductId,
      product_source: selectedSource,
      custom_price_net: parseFloat(newPrice),
      currency: 'EUR',
      notes: newNotes || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,contact_id,product_id,product_source' });

    if (!error) {
      setToast('Cmimi u ruajt');
      setTimeout(() => setToast(null), 2000);
      setAddingProduct(false);
      setSelectedProductId('');
      setNewPrice('');
      setNewNotes('');
      await fetchData();
    }
    setSaving(false);
  }

  async function handleRemove(priceId: string) {
    await supabase.from('acc_client_prices').update({ is_active: false }).eq('id', priceId);
    setPrices(prev => prev.filter(p => p.id !== priceId));
    setToast('Cmimi u hoq');
    setTimeout(() => setToast(null), 2000);
  }

  async function handleUpdatePrice(priceId: string, value: string) {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    await supabase.from('acc_client_prices').update({
      custom_price_net: num,
      updated_at: new Date().toISOString(),
    }).eq('id', priceId);
    setPrices(prev => prev.map(p => p.id === priceId ? { ...p, custom_price_net: num } : p));
  }

  const availableProducts = catalog.filter(p =>
    !prices.some(cp => cp.product_id === p.id && cp.product_source === p.source)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Tag className="w-5 h-5 text-emerald-600" />
              Cmime te personalizuara
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">per: {contactName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
            </div>
          ) : (
            <>
              {/* Toast */}
              {toast && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  {toast}
                </div>
              )}

              {/* Existing prices */}
              {prices.length > 0 ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Produkti</th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-600">{t('common.standardPrice')}</th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-600">{t('common.clientPrice')}</th>
                        <th className="w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {prices.map((cp) => {
                        const product = getProduct(cp);
                        return (
                          <tr key={cp.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{product?.name || '-'}</div>
                              <div className="text-xs text-gray-500">
                                {product?.sku && <span className="mr-2">SKU: {product.sku}</span>}
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${cp.product_source === 'accounting' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                                  {cp.product_source === 'accounting' ? 'Kontabilitet' : 'Stok'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">
                              {product ? formatCurrency(product.price_net, 'EUR') : '-'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                step="0.01"
                                defaultValue={cp.custom_price_net.toFixed(2)}
                                onBlur={(e) => handleUpdatePrice(cp.id, e.target.value)}
                                className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-right text-sm font-medium text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </td>
                            <td className="px-3 py-3">
                              <button
                                onClick={() => handleRemove(cp.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">{t('common.noCustomPricesForClient')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('common.addCustomPricesHint')}</p>
                </div>
              )}

              {/* Add new price */}
              {addingProduct ? (
                <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Produkti</label>
                      <select
                        value={`${selectedSource}:${selectedProductId}`}
                        onChange={(e) => {
                          const [src, id] = e.target.value.split(':');
                          setSelectedSource(src as 'accounting' | 'stock');
                          setSelectedProductId(id || '');
                          const prod = catalog.find(p => p.id === id && p.source === src);
                          if (prod) setNewPrice(prod.price_net.toFixed(2));
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value=":">-- Zgjedh produktin --</option>
                        {availableProducts.map(p => (
                          <option key={`${p.source}:${p.id}`} value={`${p.source}:${p.id}`}>
                            {p.name} {p.sku ? `(${p.sku})` : ''} - {formatCurrency(p.price_net, 'EUR')} [{p.source === 'accounting' ? 'Kont.' : 'Stok'}]
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Cmimi per klientin (EUR)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Shenim (opsional)</label>
                      <input
                        type="text"
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="p.sh. kontrate vjetore"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setAddingProduct(false)}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Anulo
                    </button>
                    <button
                      onClick={handleAdd}
                      disabled={saving || !selectedProductId || !newPrice}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Ruaj
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingProduct(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Shto cmim te personalizuar
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <p className="text-xs text-gray-500">
            Cmimet e personalizuara perdoren automatikisht kur krijoni fatura per kete klient.
            Nese nuk ka cmim te personalizuar, perdoret cmimi standard i produktit.
          </p>
        </div>
      </div>
    </div>
  );
}
