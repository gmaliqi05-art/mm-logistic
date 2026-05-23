import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Ship, Trash2, CreditCard as Edit2, X, Search, Calculator, FileDown, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { formatCurrency } from '../../types/accounting';

interface ImportRow {
  id: string;
  import_number: string;
  import_date: string;
  supplier_id: string | null;
  country_of_origin: string;
  incoterms: string;
  currency: string;
  exchange_rate: number;
  customs_value: number;
  freight_cost: number;
  insurance_cost: number;
  other_charges: number;
  customs_duty_total: number;
  import_vat_total: number;
  total_landed_cost: number;
  status: string;
  customs_doc_ref: string;
  notes: string;
  supplier?: { name: string } | null;
}

interface ImportItem {
  id?: string;
  product_id: string | null;
  description: string;
  hs_code: string;
  country_of_origin: string;
  quantity: number;
  unit_price_foreign: number;
  unit_price_eur: number;
  customs_value_line: number;
  duty_rate: number;
  duty_amount: number;
  vat_rate: number;
  vat_amount: number;
  landed_cost_per_unit: number;
}

interface Tariff { hs_code: string; description: string; duty_rate: number; vat_rate: number; }
interface Supplier { id: string; name: string; }
interface Product { id: string; name: string; sku: string; }

const emptyItem = (): ImportItem => ({
  product_id: null, description: '', hs_code: '', country_of_origin: '',
  quantity: 1, unit_price_foreign: 0, unit_price_eur: 0, customs_value_line: 0,
  duty_rate: 0, duty_amount: 0, vat_rate: 19, vat_amount: 0, landed_cost_per_unit: 0,
});

export default function Imports() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ImportRow | null>(null);

  const [form, setForm] = useState({
    import_number: '',
    import_date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    country_of_origin: '',
    incoterms: 'FOB',
    currency: 'USD',
    exchange_rate: 1.05,
    freight_cost: 0,
    insurance_cost: 0,
    other_charges: 0,
    customs_doc_ref: '',
    notes: '',
    status: 'draft',
  });
  const [items, setItems] = useState<ImportItem[]>([emptyItem()]);

  const load = useCallback(async () => {
    if (!profile?.company_id) return;
    setLoading(true);
    const [impRes, supRes, prodRes, tariffRes] = await Promise.all([
      supabase.from('acc_imports')
        .select('*, supplier:acc_contacts(name)')
        .eq('company_id', profile.company_id)
        .order('import_date', { ascending: false }),
      supabase.from('acc_contacts')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .in('contact_type', ['supplier', 'both'])
        .eq('is_active', true)
        .order('name'),
      supabase.from('acc_products')
        .select('id, name, sku')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('name'),
      supabase.from('acc_customs_tariffs').select('*').order('hs_code'),
    ]);
    setImports((impRes.data as ImportRow[]) ?? []);
    setSuppliers((supRes.data as Supplier[]) ?? []);
    setProducts((prodRes.data as Product[]) ?? []);
    setTariffs((tariffRes.data as Tariff[]) ?? []);
    setLoading(false);
  }, [profile?.company_id]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing(null);
    const num = `IMP-${new Date().getFullYear()}-${String(imports.length + 1).padStart(4, '0')}`;
    setForm({
      import_number: num,
      import_date: new Date().toISOString().split('T')[0],
      supplier_id: '',
      country_of_origin: '',
      incoterms: 'FOB',
      currency: 'USD',
      exchange_rate: 1.05,
      freight_cost: 0,
      insurance_cost: 0,
      other_charges: 0,
      customs_doc_ref: '',
      notes: '',
      status: 'draft',
    });
    setItems([emptyItem()]);
    setShowModal(true);
  }

  async function openEdit(imp: ImportRow) {
    setEditing(imp);
    setForm({
      import_number: imp.import_number,
      import_date: imp.import_date,
      supplier_id: imp.supplier_id ?? '',
      country_of_origin: imp.country_of_origin,
      incoterms: imp.incoterms,
      currency: imp.currency,
      exchange_rate: Number(imp.exchange_rate),
      freight_cost: Number(imp.freight_cost),
      insurance_cost: Number(imp.insurance_cost),
      other_charges: Number(imp.other_charges),
      customs_doc_ref: imp.customs_doc_ref,
      notes: imp.notes,
      status: imp.status,
    });
    const { data } = await supabase
      .from('acc_import_items')
      .select('*')
      .eq('import_id', imp.id)
      .order('line_order');
    setItems((data as ImportItem[]) ?? [emptyItem()]);
    setShowModal(true);
  }

  function updateItem(idx: number, patch: Partial<ImportItem>) {
    setItems(list => list.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, ...patch };
      if (patch.unit_price_foreign !== undefined || patch.quantity !== undefined) {
        next.unit_price_eur = Number(next.unit_price_foreign) * Number(form.exchange_rate);
        next.customs_value_line = next.unit_price_eur * Number(next.quantity);
      }
      if (patch.customs_value_line !== undefined) {
        next.customs_value_line = patch.customs_value_line;
      }
      if (patch.hs_code !== undefined) {
        const t = tariffs.find(tr => tr.hs_code === patch.hs_code);
        if (t) {
          next.duty_rate = Number(t.duty_rate);
          next.vat_rate = Number(t.vat_rate);
        }
      }
      next.duty_amount = (Number(next.customs_value_line) * Number(next.duty_rate)) / 100;
      next.vat_amount = ((Number(next.customs_value_line) + Number(next.duty_amount)) * Number(next.vat_rate)) / 100;
      return next;
    }));
  }

  const customsValue = items.reduce((s, i) => s + Number(i.customs_value_line || 0), 0);
  const dutyTotal = items.reduce((s, i) => s + Number(i.duty_amount || 0), 0);
  const vatTotal = items.reduce((s, i) => s + Number(i.vat_amount || 0), 0);
  const extraCharges = Number(form.freight_cost) + Number(form.insurance_cost) + Number(form.other_charges);
  const landedTotal = customsValue + dutyTotal + extraCharges;

  const itemsWithLanded = items.map(i => {
    const proportion = customsValue > 0 ? Number(i.customs_value_line) / customsValue : 0;
    const landedLine = Number(i.customs_value_line) + Number(i.duty_amount) + proportion * extraCharges;
    const perUnit = Number(i.quantity) > 0 ? landedLine / Number(i.quantity) : 0;
    return { ...i, landed_cost_per_unit: perUnit };
  });

  async function save() {
    if (!profile?.company_id) return;

    const payload = {
      company_id: profile.company_id,
      import_number: form.import_number,
      import_date: form.import_date,
      supplier_id: form.supplier_id || null,
      country_of_origin: form.country_of_origin,
      incoterms: form.incoterms,
      currency: form.currency,
      exchange_rate: Number(form.exchange_rate),
      customs_value: customsValue,
      freight_cost: Number(form.freight_cost),
      insurance_cost: Number(form.insurance_cost),
      other_charges: Number(form.other_charges),
      customs_duty_total: dutyTotal,
      import_vat_total: vatTotal,
      total_landed_cost: landedTotal,
      status: form.status,
      customs_doc_ref: form.customs_doc_ref,
      notes: form.notes,
      created_by: profile.id,
    };

    let importId: string;

    if (editing) {
      const { error } = await supabase
        .from('acc_imports')
        .update(payload)
        .eq('id', editing.id);
      if (error) { alert(t('common.error') + ': ' + error.message); return; }
      importId = editing.id;
      await supabase.from('acc_import_items').delete().eq('import_id', importId);
    } else {
      const { data, error } = await supabase
        .from('acc_imports')
        .insert(payload)
        .select()
        .single();
      if (error) { alert(t('common.error') + ': ' + error.message); return; }
      importId = data.id;
    }

    const itemPayload = itemsWithLanded
      .filter(i => i.description || i.product_id)
      .map((i, idx) => ({
        import_id: importId,
        product_id: i.product_id || null,
        description: i.description,
        hs_code: i.hs_code,
        country_of_origin: i.country_of_origin,
        quantity: Number(i.quantity),
        unit_price_foreign: Number(i.unit_price_foreign),
        unit_price_eur: Number(i.unit_price_eur),
        customs_value_line: Number(i.customs_value_line),
        duty_rate: Number(i.duty_rate),
        duty_amount: Number(i.duty_amount),
        vat_rate: Number(i.vat_rate),
        vat_amount: Number(i.vat_amount),
        landed_cost_per_unit: Number(i.landed_cost_per_unit),
        line_order: idx,
      }));

    if (itemPayload.length) {
      const { error: itemErr } = await supabase.from('acc_import_items').insert(itemPayload);
      if (itemErr) { alert(t('common.linesPrefix') + ': ' + itemErr.message); return; }
    }

    setShowModal(false);
    load();
  }

  async function removeImport(id: string) {
    if (!confirm(t('common.deleteImportConfirm'))) return;
    const { error } = await supabase.from('acc_imports').delete().eq('id', id);
    if (error) { alert(`${t('common.error')}: ${error.message}`); return; }
    load();
  }

  const filtered = imports.filter(i =>
    (i.import_number || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.supplier?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.country_of_origin || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Ship className="w-6 h-6 text-emerald-600" /> Importet (jashte BE)
          </h1>
          <p className="text-sm text-gray-600 mt-1">Menaxho importet me kode HS, taksa doganore dhe EUSt (TVSH importi)</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
          <Plus className="w-4 h-4" /> Import i ri
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 p-3 flex items-center gap-3">
        <Search className="w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder={t('accounting.imports.searchPlaceholder') || 'Kerko sipas numrit, furnitorit ose vendit...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm focus:outline-none"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Ship className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nuk ka importe te regjistruara.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Numri</th>
                  <th className="text-left py-2 px-3 font-medium">Data</th>
                  <th className="text-left py-2 px-3 font-medium">Furnitori</th>
                  <th className="text-left py-2 px-3 font-medium">Vendi</th>
                  <th className="text-left py-2 px-3 font-medium">Incoterms</th>
                  <th className="text-right py-2 px-3 font-medium">Vlera doganore</th>
                  <th className="text-right py-2 px-3 font-medium">Takse</th>
                  <th className="text-right py-2 px-3 font-medium">EUSt</th>
                  <th className="text-right py-2 px-3 font-medium">Total landed</th>
                  <th className="text-center py-2 px-3 font-medium">Statusi</th>
                  <th className="text-right py-2 px-3 font-medium">Veprime</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(imp => (
                  <tr key={imp.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium">{imp.import_number}</td>
                    <td className="py-2 px-3 text-gray-600">{imp.import_date}</td>
                    <td className="py-2 px-3">{imp.supplier?.name ?? '-'}</td>
                    <td className="py-2 px-3">{imp.country_of_origin}</td>
                    <td className="py-2 px-3 font-mono text-xs">{imp.incoterms}</td>
                    <td className="py-2 px-3 text-right">{formatCurrency(Number(imp.customs_value))}</td>
                    <td className="py-2 px-3 text-right">{formatCurrency(Number(imp.customs_duty_total))}</td>
                    <td className="py-2 px-3 text-right">{formatCurrency(Number(imp.import_vat_total))}</td>
                    <td className="py-2 px-3 text-right font-semibold">{formatCurrency(Number(imp.total_landed_cost))}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        imp.status === 'posted' ? 'bg-emerald-100 text-emerald-800' :
                        imp.status === 'received' ? 'bg-blue-100 text-blue-800' :
                        imp.status === 'cleared' ? 'bg-amber-100 text-amber-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>{imp.status}</span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => openEdit(imp)} className="text-blue-600 hover:text-blue-800 p-1"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => removeImport(imp.id)} className="text-red-600 hover:text-red-800 p-1 ml-1"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-6xl my-8 shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold">{editing ? 'Ndrysho Importin' : 'Import i ri'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Numri i importit</label>
                  <input type="text" value={form.import_number} onChange={e => setForm({ ...form, import_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Data</label>
                  <input type="date" value={form.import_date} onChange={e => setForm({ ...form, import_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Statusi</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                    <option value="draft">Draft</option>
                    <option value="cleared">Doganim perfunduar</option>
                    <option value="received">Pranuar ne depo</option>
                    <option value="posted">Regjistruar</option>
                    <option value="cancelled">Anuluar</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Furnitori</label>
                  <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                    <option value="">— Zgjidh —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Vendi i origjines</label>
                  <input type="text" value={form.country_of_origin} onChange={e => setForm({ ...form, country_of_origin: e.target.value })}
                    placeholder="p.sh. China, Turkey"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Incoterms</label>
                  <select value={form.incoterms} onChange={e => setForm({ ...form, incoterms: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                    {['EXW','FOB','CIF','CFR','DAP','DDP'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Valuta</label>
                  <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                    {['USD','EUR','CHF','GBP','CNY','TRY'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Kursi i kembimit ne EUR</label>
                  <input type="number" step="0.0001" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Dokumenti doganor (MRN)</label>
                  <input type="text" value={form.customs_doc_ref} onChange={e => setForm({ ...form, customs_doc_ref: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Artikujt e importit</h3>
                  <button onClick={() => setItems(l => [...l, emptyItem()])} className="text-xs px-2 py-1 bg-emerald-600 text-white rounded">+ Shto artikull</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Produkti</th>
                        <th className="px-2 py-1.5 text-left">Kodi HS</th>
                        <th className="px-2 py-1.5 text-right">Sasia</th>
                        <th className="px-2 py-1.5 text-right">Cmim valute</th>
                        <th className="px-2 py-1.5 text-right">Cmim EUR</th>
                        <th className="px-2 py-1.5 text-right">Vlera doganore</th>
                        <th className="px-2 py-1.5 text-right">Takse %</th>
                        <th className="px-2 py-1.5 text-right">Takse €</th>
                        <th className="px-2 py-1.5 text-right">TVSH %</th>
                        <th className="px-2 py-1.5 text-right">EUSt €</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={idx} className="border-t border-gray-100">
                          <td className="px-2 py-1">
                            <select value={it.product_id ?? ''} onChange={e => updateItem(idx, { product_id: e.target.value || null, description: products.find(p => p.id === e.target.value)?.name || it.description })}
                              className="w-full px-1 py-1 border border-gray-200 rounded text-xs">
                              <option value="">— pa produkt —</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <input type="text" placeholder="Pershkrim" value={it.description}
                              onChange={e => updateItem(idx, { description: e.target.value })}
                              className="w-full mt-1 px-1 py-1 border border-gray-200 rounded text-xs" />
                          </td>
                          <td className="px-2 py-1">
                            <input list={`tariffs-${idx}`} value={it.hs_code} onChange={e => updateItem(idx, { hs_code: e.target.value })}
                              className="w-28 px-1 py-1 border border-gray-200 rounded font-mono" />
                            <datalist id={`tariffs-${idx}`}>
                              {tariffs.map(t => <option key={t.hs_code} value={t.hs_code}>{t.description}</option>)}
                            </datalist>
                          </td>
                          <td className="px-2 py-1 text-right">
                            <input type="number" step="0.01" value={it.quantity} onChange={e => updateItem(idx, { quantity: Number(e.target.value) })}
                              className="w-20 px-1 py-1 border border-gray-200 rounded text-right" />
                          </td>
                          <td className="px-2 py-1 text-right">
                            <input type="number" step="0.0001" value={it.unit_price_foreign} onChange={e => updateItem(idx, { unit_price_foreign: Number(e.target.value) })}
                              className="w-24 px-1 py-1 border border-gray-200 rounded text-right" />
                          </td>
                          <td className="px-2 py-1 text-right text-gray-700">{it.unit_price_eur.toFixed(4)}</td>
                          <td className="px-2 py-1 text-right font-medium">{Number(it.customs_value_line).toFixed(2)}</td>
                          <td className="px-2 py-1 text-right">
                            <input type="number" step="0.01" value={it.duty_rate} onChange={e => updateItem(idx, { duty_rate: Number(e.target.value) })}
                              className="w-16 px-1 py-1 border border-gray-200 rounded text-right" />
                          </td>
                          <td className="px-2 py-1 text-right">{Number(it.duty_amount).toFixed(2)}</td>
                          <td className="px-2 py-1 text-right">
                            <select value={it.vat_rate} onChange={e => updateItem(idx, { vat_rate: Number(e.target.value) })}
                              className="w-14 px-1 py-1 border border-gray-200 rounded">
                              <option value={0}>0</option>
                              <option value={7}>7</option>
                              <option value={19}>19</option>
                            </select>
                          </td>
                          <td className="px-2 py-1 text-right">{Number(it.vat_amount).toFixed(2)}</td>
                          <td className="px-2 py-1">
                            <button onClick={() => setItems(l => l.filter((_, i) => i !== idx))} className="text-red-500 p-0.5">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Transporti (EUR)</label>
                  <input type="number" step="0.01" value={form.freight_cost} onChange={e => setForm({ ...form, freight_cost: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Sigurimi (EUR)</label>
                  <input type="number" step="0.01" value={form.insurance_cost} onChange={e => setForm({ ...form, insurance_cost: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Shpenzime te tjera (EUR)</label>
                  <input type="number" step="0.01" value={form.other_charges} onChange={e => setForm({ ...form, other_charges: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2 text-emerald-900">
                  <Calculator className="w-4 h-4" /> Permbledhja e kostos se importit
                </h3>
                <div className="grid md:grid-cols-5 gap-2 text-sm">
                  <Summary label="Vlera doganore" value={customsValue} />
                  <Summary label="Takse doganore" value={dutyTotal} />
                  <Summary label="EUSt (TVSH importi)" value={vatTotal} />
                  <Summary label="Shpenzime shtese" value={extraCharges} />
                  <Summary label="Total landed cost" value={landedTotal} highlight />
                </div>
                <p className="text-xs text-emerald-800 mt-2">
                  Kostoja e landed per njesi ne secilin artikull ndahet proporcionalisht me vleren doganore.
                  TVSH e importit eshte e zbritshme (Vorsteuerabzug) ne llogarine 1588.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Shenime</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 sticky bottom-0 bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">Anulo</button>
              <button onClick={save} className="px-4 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 flex items-center gap-1">
                <FileDown className="w-4 h-4" /> Ruaj importin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`p-2 rounded ${highlight ? 'bg-emerald-600 text-white' : 'bg-white'}`}>
      <p className={`text-[10px] ${highlight ? 'text-emerald-100' : 'text-gray-500'} uppercase`}>{label}</p>
      <p className="font-bold">{formatCurrency(value)}</p>
    </div>
  );
}
