import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Trash2, Loader2, Tag, Package, Filter, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Contact {
  id: string;
  name: string;
  contact_type: string;
  email: string;
}

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
  contact_id: string;
  product_id: string;
  product_source: 'accounting' | 'stock';
  custom_price_net: number;
  currency: string;
  notes: string | null;
  updated_at: string;
}

export default function ClientPricesPage() {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [prices, setPrices] = useState<ClientPrice[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterContact, setFilterContact] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [addMode, setAddMode] = useState(false);
  const [newContactId, setNewContactId] = useState('');
  const [newProductKey, setNewProductKey] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.company_id) fetchAll();
  }, [profile?.company_id]);

  async function fetchAll() {
    setLoading(true);
    const companyId = profile!.company_id!;

    const [contactsRes, accRes, catRes, pricesRes] = await Promise.all([
      supabase.from('acc_contacts').select('id, name, contact_type, email')
        .eq('company_id', companyId).eq('is_active', true).order('name'),
      supabase.from('acc_products').select('id, name, sku, price_net, unit')
        .eq('company_id', companyId).eq('is_active', true).order('name'),
      supabase.from('category_products').select('id, name, sku, price_net, unit')
        .eq('company_id', companyId).eq('is_active', true).order('name'),
      supabase.from('acc_client_prices').select('*')
        .eq('company_id', companyId).eq('is_active', true)
        .order('updated_at', { ascending: false }),
    ]);

    setContacts((contactsRes.data ?? []) as Contact[]);

    const merged: CatalogProduct[] = [];
    for (const r of (accRes.data ?? []) as any[]) {
      merged.push({ id: r.id, source: 'accounting', name: r.name, sku: r.sku, price_net: Number(r.price_net ?? 0), unit: r.unit });
    }
    for (const r of (catRes.data ?? []) as any[]) {
      merged.push({ id: r.id, source: 'stock', name: r.name, sku: r.sku, price_net: Number(r.price_net ?? 0), unit: r.unit });
    }
    setCatalog(merged);
    setPrices((pricesRes.data ?? []) as ClientPrice[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return prices.filter((p) => {
      if (filterContact && p.contact_id !== filterContact) return false;
      if (filterProduct) {
        const key = `${p.product_source}:${p.product_id}`;
        if (key !== filterProduct) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const contact = contacts.find(c => c.id === p.contact_id);
        const product = catalog.find(c => c.id === p.product_id && c.source === p.product_source);
        const haystack = `${contact?.name ?? ''} ${product?.name ?? ''} ${product?.sku ?? ''} ${p.notes ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [prices, filterContact, filterProduct, searchQuery, contacts, catalog]);

  function getProduct(productId: string, source: string) {
    return catalog.find(c => c.id === productId && c.source === source);
  }

  async function handleAdd() {
    if (!newContactId || !newProductKey || !newPrice) return;
    setSaving(true);
    const [source, productId] = newProductKey.split(':');

    await supabase.from('acc_client_prices').upsert({
      company_id: profile!.company_id,
      contact_id: newContactId,
      product_id: productId,
      product_source: source,
      custom_price_net: parseFloat(newPrice),
      currency: 'EUR',
      notes: newNotes || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,contact_id,product_id,product_source' });

    setAddMode(false);
    setNewContactId('');
    setNewProductKey('');
    setNewPrice('');
    setNewNotes('');
    setSaving(false);
    await fetchAll();
  }

  async function handleRemove(id: string) {
    await supabase.from('acc_client_prices').update({ is_active: false }).eq('id', id);
    setPrices(prev => prev.filter(p => p.id !== id));
  }

  async function handleUpdatePrice(id: string, value: string) {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    await supabase.from('acc_client_prices').update({
      custom_price_net: num,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Tag className="w-4 h-4" />
            Cmime totale
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{prices.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Users className="w-4 h-4" />
            Kliente me cmim
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {new Set(prices.map(p => p.contact_id)).size}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Package className="w-4 h-4" />
            Produkte me cmim
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {new Set(prices.map(p => `${p.product_source}:${p.product_id}`)).size}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter className="w-4 h-4" />
            Kontakte totale
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{contacts.length}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Kerko..."
            />
          </div>
          <select
            value={filterContact}
            onChange={(e) => setFilterContact(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">Te gjithe klientet</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">Te gjitha produktet</option>
            {catalog.map(p => (
              <option key={`${p.source}:${p.id}`} value={`${p.source}:${p.id}`}>
                {p.name} {p.sku ? `(${p.sku})` : ''} [{p.source === 'accounting' ? 'Kont.' : 'Stok'}]
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setAddMode(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Shto Cmim
        </button>
      </div>

      {/* Add form */}
      {addMode && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-teal-800">Shto cmim te personalizuar</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Klienti</label>
              <select
                value={newContactId}
                onChange={(e) => setNewContactId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">-- Zgjedh klientin --</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Produkti</label>
              <select
                value={newProductKey}
                onChange={(e) => {
                  setNewProductKey(e.target.value);
                  const [src, id] = e.target.value.split(':');
                  const prod = catalog.find(p => p.id === id && p.source === src);
                  if (prod) setNewPrice(prod.price_net.toFixed(2));
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">-- Zgjedh produktin --</option>
                {catalog.map(p => (
                  <option key={`${p.source}:${p.id}`} value={`${p.source}:${p.id}`}>
                    {p.name} - {p.price_net.toFixed(2)} EUR
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cmimi (EUR)</label>
              <input
                type="number"
                step="0.01"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Shenim</label>
              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="opsionale"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setAddMode(false)}
              className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Anulo
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !newContactId || !newProductKey || !newPrice}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Ruaj
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Tag className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">Nuk ka cmime te personalizuara</p>
            <p className="text-xs text-gray-400 mt-1">Shtoni cmime te vecanta per kliente specifike</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Klienti</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Produkti</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Burimi</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Cmimi standard</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Cmimi klienti</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Diferenca</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Shenim</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((cp) => {
                  const contact = contacts.find(c => c.id === cp.contact_id);
                  const product = getProduct(cp.product_id, cp.product_source);
                  const stdPrice = product?.price_net ?? 0;
                  const diff = cp.custom_price_net - stdPrice;
                  const diffPct = stdPrice > 0 ? ((diff / stdPrice) * 100) : 0;

                  return (
                    <tr key={cp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {contact?.name ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900">{product?.name ?? '-'}</div>
                        {product?.sku && (
                          <span className="text-xs text-gray-400 font-mono">{product.sku}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${
                          cp.product_source === 'accounting'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-amber-50 text-amber-600'
                        }`}>
                          {cp.product_source === 'accounting' ? 'Kontabilitet' : 'Stok'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {stdPrice.toFixed(2)} EUR
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={cp.custom_price_net.toFixed(2)}
                          onBlur={(e) => handleUpdatePrice(cp.id, e.target.value)}
                          className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-right text-sm font-semibold text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-medium ${
                          diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-red-600' : 'text-gray-400'
                        }`}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(2)} ({diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">
                        {cp.notes || '-'}
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
        )}
      </div>

      {/* Info footer */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs text-gray-500">
          Cmimet e personalizuara perdoren automatikisht kur krijoni fatura per klientet perkates.
          Nese nuk ka cmim te personalizuar, perdoret cmimi standard i produktit.
          Ndryshimet ruhen menjehere kur ndryshoni cmimin ne tabele.
        </p>
      </div>
    </div>
  );
}
