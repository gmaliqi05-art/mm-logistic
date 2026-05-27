import { useState, useEffect } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  AlertTriangle,
  X,
  Loader2,
  Plus,
  Trash2,
  Package,
  Sparkles,
  FileText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import SmartDocScanner, { SmartScanResult } from '../../components/scanner/SmartDocScanner';
import PalletScanner from '../../components/scanner/PalletScanner';
import ContactAutocomplete from '../../components/depot/ContactAutocomplete';
import type { ProductCategory } from '../../types';
import { epalClassRank } from '../../utils/productSort';
import { notifyUsers } from '../../utils/notifications';

interface CategoryProductLite {
  id: string;
  category_id: string;
  name: string;
}

interface StockRow {
  category_id: string;
  category_product_id: string | null;
  condition: string;
  quantity: number;
}

interface ItemRow {
  id: string;
  category_id: string;
  category_product_id: string;
  quantity: string;
  condition: string;
}

interface HistoryRow {
  id: string;
  movement_type: string;
  quantity: number;
  created_at: string;
  destination_partner: string;
  category: { name: string } | null;
  product: { name: string } | null;
  performer: { full_name: string } | null;
}

function createRow(): ItemRow {
  return { id: crypto.randomUUID(), category_id: '', category_product_id: '', quantity: '', condition: 'good' };
}

export default function DepotOutgoing() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<CategoryProductLite[]>([]);
  const [stockData, setStockData] = useState<StockRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [rows, setRows] = useState<ItemRow[]>([createRow()]);
  const [notes, setNotes] = useState('');
  const [destPartner, setDestPartner] = useState('');
  const [destContactId, setDestContactId] = useState<string | null>(null);

  const [showScanner, setShowScanner] = useState(false);
  const [showPalletScanner, setShowPalletScanner] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // Scan result state for linking to delivery note
  const [lastScanUrl, setLastScanUrl] = useState<string | null>(null);
  const [lastScanJson, setLastScanJson] = useState<any>(null);

  useEffect(() => {
    if (profile?.depot_id && profile?.company_id) fetchData();
  }, [profile?.depot_id, profile?.company_id]);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const depotId = profile!.depot_id!;
      const companyId = profile!.company_id!;

      const [catRes, prodRes, stockRes, histRes] = await Promise.all([
        supabase
          .from('product_categories')
          .select('*')
          .eq('company_id', companyId),
        supabase
          .from('category_products')
          .select('id, category_id, name')
          .eq('company_id', companyId)
          .eq('is_active', true),
        supabase
          .from('stock')
          .select('category_id, category_product_id, condition, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .gt('quantity', 0),
        supabase
          .from('stock_movements')
          .select('id, movement_type, quantity, created_at, destination_partner, category:product_categories(name), product:category_products(name), performer:profiles!stock_movements_performed_by_fkey(full_name)')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('movement_type', 'exit')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      if (catRes.error) throw catRes.error;
      if (prodRes.error) throw prodRes.error;
      if (stockRes.error) throw stockRes.error;
      if (histRes.error) throw histRes.error;

      setCategories(catRes.data ?? []);
      setProducts(prodRes.data ?? []);
      setStockData((stockRes.data ?? []) as StockRow[]);
      setHistory((histRes.data ?? []) as unknown as HistoryRow[]);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  function getAvailable(categoryId: string, productId: string | null, condition: string): number {
    return stockData
      .filter((s) => {
        if (s.category_id !== categoryId) return false;
        if (s.condition !== condition) return false;
        if (productId) return s.category_product_id === productId;
        return !s.category_product_id;
      })
      .reduce((sum, s) => sum + s.quantity, 0);
  }

  function productsForCategory(categoryId: string): CategoryProductLite[] {
    return products
      .filter((p) => p.category_id === categoryId)
      .sort((a, b) => epalClassRank(a.name) - epalClassRank(b.name) || a.name.localeCompare(b.name));
  }

  function categoryHasProducts(categoryId: string): boolean {
    return products.some((p) => p.category_id === categoryId);
  }

  function addRow() {
    setRows((prev) => [...prev, createRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.length > 1 ? prev.filter((r) => r.id !== id) : prev);
  }

  function updateRow(id: string, field: keyof ItemRow, value: string) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, [field]: value };
      if (field === 'category_id') next.category_product_id = '';
      return next;
    }));
  }

  function normalizeForMatch(s: string) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function normalize(s: string): string {
    return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  }

  function findCategoryId(description: string): string {
    const n = normalize(description);
    if (!n) return '';
    const exact = categories.find((c) => normalize(c.name) === n);
    if (exact) return exact.id;
    const partial = categories.find((c) => {
      const cn = normalize(c.name);
      return cn && (n.includes(cn) || cn.includes(n));
    });
    return partial?.id || '';
  }

  function handlePalletScan(code: string) {
    const needle = normalizeForMatch(code);
    const matchedProduct = products.find(
      (p) => normalizeForMatch(p.name) === needle || normalizeForMatch(p.name).includes(needle)
    );
    if (matchedProduct) {
      setRows((prev) => {
        const blank = prev.find((r) => !r.category_id);
        if (blank) {
          return prev.map((r) => r.id === blank.id
            ? { ...r, category_id: matchedProduct.category_id, category_product_id: matchedProduct.id, quantity: r.quantity || '1' }
            : r);
        }
        return [...prev, { id: crypto.randomUUID(), category_id: matchedProduct.category_id, category_product_id: matchedProduct.id, quantity: '1', condition: 'good' }];
      });
    } else {
      const tpl = t('depot.receiving.codeNotFound') || 'Kodi "{code}" nuk u gjet';
      setError(tpl.replace('{code}', code));
    }
  }

  function handleScanConfirm(r: SmartScanResult) {
    const ex = r.extracted;
    const scannedRows: ItemRow[] = (ex.line_items || [])
      .map((li: any) => {
        const catId = findCategoryId(li.description || '');
        const desc = normalize(li.description || '');
        const productMatch = catId
          ? products.find((p) => p.category_id === catId && desc && (
              normalize(p.name) === desc || desc.includes(normalize(p.name)) || normalize(p.name).includes(desc)
            ))
          : null;
        return {
          id: crypto.randomUUID(),
          category_id: catId,
          category_product_id: productMatch?.id ?? '',
          quantity: String(Math.max(1, Math.round(Number(li.quantity) || 1))),
          condition: 'good',
        };
      })
      .filter((row: ItemRow) => row.category_id);

    const finalRows = scannedRows.length > 0 ? scannedRows : [createRow()];

    const routing = r.routing;
    let partnerName = '';
    let matchedContactId: string | null = null;

    if (routing) {
      if (routing.partner_to_register === 'consignor') {
        partnerName = ex.consignor_name || '';
      } else if (routing.partner_to_register === 'consignee') {
        partnerName = ex.consignee_name || '';
      }
      if (routing.matched_contact_id) {
        matchedContactId = routing.matched_contact_id;
        partnerName = routing.matched_contact_name || partnerName;
      }
    }
    if (!partnerName) {
      partnerName = ex.consignee_name || ex.customer_name || ex.consignor_name || '';
    }

    const docNumber = ex.document_number || ex.invoice_number || '';
    const refNote = docNumber ? `Ref: ${docNumber}` : '';

    setRows(finalRows);
    setNotes(refNote);
    setDestPartner(partnerName);
    setDestContactId(matchedContactId);
    setLastScanUrl(r.fileUrl);
    setLastScanJson(ex);

    const unmatched = (ex.line_items || []).length - scannedRows.length;
    const parts = [t('common.scanner.depotScan.aiFilled'), `${scannedRows.length} ${t('common.scanner.depotScan.itemsRecognized')}`];
    if (unmatched > 0) parts.push(`${unmatched} ${t('common.scanner.depotScan.unmatched')}`);
    else parts.push(t('common.scanner.driverScan.verifyBeforeSave'));
    setAiNotice(parts.join(' · '));
    setShowScanner(false);
  }

  async function handleOutgoing(e: React.FormEvent) {
    e.preventDefault();
    const validRows = rows.filter((r) => r.category_id && r.quantity && parseInt(r.quantity, 10) > 0);
    if (validRows.length === 0) {
      setError(t('depot.outgoing.atLeastOne') || 'Shto te pakten nje artikull valid');
      return;
    }

    if (!destPartner.trim()) {
      setError(t('depot.outgoing.partnerRequired') || 'Vendosni partnerin/klientin per daljen');
      return;
    }

    const missingProduct = validRows.find(
      (r) => categoryHasProducts(r.category_id) && !r.category_product_id,
    );
    if (missingProduct) {
      const cat = categories.find((c) => c.id === missingProduct.category_id);
      const tpl = t('depot.receiving.pickProductForCategory') || 'Zgjedh produktin specifik per kategorin "{category}".';
      setError(tpl.replace('{category}', cat?.name ?? ''));
      return;
    }

    for (const row of validRows) {
      const qty = parseInt(row.quantity, 10);
      const productId = row.category_product_id || null;
      const available = getAvailable(row.category_id, productId, row.condition);
      if (qty > available) {
        const productName = productId
          ? products.find((p) => p.id === productId)?.name
          : categories.find((c) => c.id === row.category_id)?.name;
        const tpl = t('depot.outgoing.insufficientStock') || 'Stoku i pamjaftueshem per {product}: disponueshem {available}, kerkuar {requested}';
        setError(tpl.replace('{product}', productName || '?').replace('{available}', String(available)).replace('{requested}', String(qty)));
        return;
      }
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      const depotId = profile!.depot_id!;
      const companyId = profile!.company_id!;

      const movements = validRows.map((r) => ({
        company_id: companyId,
        depot_id: depotId,
        category_id: r.category_id,
        category_product_id: r.category_product_id || null,
        movement_type: 'exit' as const,
        quantity: parseInt(r.quantity, 10),
        condition_before: r.condition,
        condition_after: r.condition,
        notes: notes,
        performed_by: profile!.id,
        destination_partner: destPartner.trim(),
        destination_contact_id: destContactId,
      }));

      const { data: movData, error: movErr } = await supabase
        .from('stock_movements')
        .insert(movements)
        .select('id');
      if (movErr) throw movErr;

      for (const row of validRows) {
        const qty = parseInt(row.quantity, 10);
        const productId = row.category_product_id || null;
        let lookup = supabase
          .from('stock')
          .select('id, quantity')
          .eq('depot_id', depotId)
          .eq('company_id', companyId)
          .eq('category_id', row.category_id)
          .eq('condition', row.condition);
        lookup = productId ? lookup.eq('category_product_id', productId) : lookup.is('category_product_id', null);
        const { data: existing } = await lookup.maybeSingle();

        if (existing) {
          await supabase
            .from('stock')
            .update({ quantity: Math.max(0, existing.quantity - qty), updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
      }

      const noteNumber = `DEPO-${new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14)}`;
      const { data: noteData } = await supabase
        .from('delivery_notes')
        .insert({
          company_id: companyId,
          created_by: profile!.id,
          assigned_depot_id: depotId,
          note_number: noteNumber,
          type: 'delivery',
          status: 'completed',
          partner_name: destPartner.trim(),
          counterparty_name: destPartner.trim(),
          counterparty_contact_id: destContactId,
          our_role: 'consignor',
          scanned_photo_url: lastScanUrl || null,
          ai_extracted_json: lastScanJson || null,
          notes: notes || null,
          delivered_at: new Date().toISOString(),
        })
        .select('id')
        .maybeSingle();

      if (noteData?.id) {
        const noteItems = validRows.map((r) => ({
          delivery_note_id: noteData.id,
          category_id: r.category_id,
          category_product_id: r.category_product_id || null,
          quantity: parseInt(r.quantity, 10),
          condition: r.condition,
          intended_action: 'stock',
        }));
        await supabase.from('delivery_note_items').insert(noteItems);

        if (movData && movData.length > 0) {
          for (const mv of movData) {
            await supabase
              .from('stock_movements')
              .update({ delivery_note_id: noteData.id })
              .eq('id', mv.id);
          }
        }
      }

      const totalQty = validRows.reduce((s, r) => s + parseInt(r.quantity, 10), 0);
      const catNames = [...new Set(validRows.map((r) => {
        const cat = categories.find((c) => c.id === r.category_id);
        return cat?.name || '';
      }).filter(Boolean))].join(', ');

      if (companyId) {
        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .eq('company_id', companyId)
          .eq('role', 'company_admin')
          .eq('is_active', true);
        if (admins && admins.length > 0) {
          await notifyUsers({
            userIds: admins.map((a) => a.id),
            type: 'delivery',
            titleKey: 'notifications.templates.depotStockExit.title',
            messageKey: 'notifications.templates.depotStockExit.body',
            params: { quantity: String(totalQty), category: catNames, partner: destPartner.trim() },
            referenceId: noteData?.id || undefined,
            fallbackTitle: 'Dalje malli nga depo',
            fallbackMessage: `${totalQty} cope ${catNames} dolen nga depo per ${destPartner.trim()}.`,
          });
        }
      }

      setRows([createRow()]);
      setNotes('');
      setDestPartner('');
      setDestContactId(null);
      setLastScanUrl(null);
      setLastScanJson(null);
      setAiNotice(null);
      setSuccess(t('depot.outgoing.savedOk') || 'Dalja u regjistrua me sukses');
      await fetchData();
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('depot.outgoing.title') || 'Dalje malli'}</h1>
          <p className="text-gray-500 mt-1">{t('depot.outgoing.subtitle') || 'Regjistro dalje malli nga depo per klient'}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPalletScanner(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-medium"
          >
            <Sparkles className="w-4 h-4" />
            {t('depot.outgoing.scanPallet') || 'Skano paleten'}
          </button>
          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-rose-600 text-rose-700 rounded-lg hover:bg-rose-50 transition-colors font-medium"
          >
            <Sparkles className="w-4 h-4" />
            {t('depot.outgoing.scanDocument') || 'Skano dokumentin'}
          </button>
        </div>
      </div>

      <PalletScanner
        open={showPalletScanner}
        onClose={() => setShowPalletScanner(false)}
        onScan={handlePalletScan}
        context="receiving"
        continuous
        title={t('depot.outgoing.scanPalletTitle') || 'Skano paletat per dalje'}
      />

      {aiNotice && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200">
          <Sparkles className="w-4 h-4 text-rose-600 mt-0.5" />
          <p className="text-xs text-rose-800 flex-1">{aiNotice}</p>
          <button onClick={() => setAiNotice(null)} className="text-rose-600 hover:text-rose-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showScanner && (
        <SmartDocScanner
          role="depot"
          docDirection="out"
          title={t('depot.outgoing.scanDocTitle') || 'Skano dokumentin e daljes'}
          subtitle={t('depot.outgoing.scanDocSubtitle') || 'Vendosni fletedergesen perpara kameres'}
          allowedKinds={['delivery_out', 'sale']}
          onClose={() => setShowScanner(false)}
          onConfirm={handleScanConfirm}
        />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <ArrowDownCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-green-700 text-sm flex-1">{success}</p>
          <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-100 px-6 py-3">
          <div className="flex items-center gap-2 text-rose-600 font-medium text-sm">
            <ArrowDownCircle className="w-4 h-4" />
            {t('depot.outgoing.exitForm') || 'Dalje malli'}
          </div>
        </div>

        <div className="p-6">
          <form onSubmit={handleOutgoing} className="space-y-4">
            <div className="space-y-3">
              {rows.map((row) => {
                const rowProducts = productsForCategory(row.category_id);
                const hasProducts = rowProducts.length > 0;
                const productId = row.category_product_id || null;
                const available = row.category_id
                  ? getAvailable(row.category_id, hasProducts ? productId : null, row.condition)
                  : 0;

                return (
                  <div key={row.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('depot.stock.category')}</label>
                        <select
                          value={row.category_id}
                          onChange={(e) => updateRow(row.id, 'category_id', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                        >
                          <option value="">{t('depot.stock.selectCategory')}</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          {t('depot.stock.product') || 'Produkti'}
                        </label>
                        <select
                          value={row.category_product_id}
                          onChange={(e) => updateRow(row.id, 'category_product_id', e.target.value)}
                          disabled={!row.category_id || !hasProducts}
                          required={hasProducts}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          <option value="">
                            {hasProducts ? (t('depot.stock.selectProduct') || 'Zgjedh produktin') : (row.category_id ? (t('depot.receiving.noProductsForCategory') || '-- pa produkte --') : (t('depot.receiving.pickCategoryFirst') || '-- zgjedh kategorin --'))}
                          </option>
                          {rowProducts.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          {t('common.quantity')}
                          {row.category_id && (
                            <span className={`ml-2 text-[10px] font-normal ${available > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              ({t('depot.outgoing.available') || 'Disponueshem'}: {available})
                            </span>
                          )}
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={available || undefined}
                          value={row.quantity}
                          onChange={(e) => updateRow(row.id, 'quantity', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('company.stock.condition')}</label>
                        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
                          <button
                            type="button"
                            onClick={() => updateRow(row.id, 'condition', 'good')}
                            className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                              row.condition === 'good' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {t('company.stock.good') || 'Mire'}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateRow(row.id, 'condition', 'damaged')}
                            className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                              row.condition === 'damaged' ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {t('company.stock.damaged') || 'Defekt'}
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="mt-6 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('depot.receiving.addItem')}
            </button>

            <ContactAutocomplete
              label={t('depot.outgoing.forWhom') || 'Per kend? (Klienti/Partneri)'}
              placeholder={t('depot.outgoing.partnerPlaceholder') || 'Emri i kompanise ose klientit qe merr mallin...'}
              contactId={destContactId}
              partnerText={destPartner}
              onChange={({ contactId, partnerText }) => {
                setDestContactId(contactId);
                setDestPartner(partnerText);
              }}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.notes')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm resize-none"
                placeholder={t('depot.outgoing.notesPlaceholder') || 'Shenime shtese per daljen...'}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('depot.outgoing.registerExit') || 'Regjistro daljen'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('depot.outgoing.exitHistory') || 'Historiku i daljeve'}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.type')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Produkti / {t('depot.stock.category')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.quantity')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('depot.outgoing.forWhomShort') || 'Per kend'}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">{t('common.createdBy')}</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    {t('depot.outgoing.noExits') || 'Asnje dalje e regjistruar'}
                  </td>
                </tr>
              ) : (
                history.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
                        <ArrowDownCircle className="w-3 h-3" />
                        Dalje
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{(m.product as any)?.name ?? (m.category as any)?.name ?? '-'}</div>
                      {(m.product as any)?.name && (m.category as any)?.name && (
                        <div className="text-xs text-gray-500">{(m.category as any)?.name}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{m.quantity}</td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className="text-sm text-gray-700">{m.destination_partner || '-'}</span>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell text-sm text-gray-500">
                      {m.performer?.full_name ?? '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(m.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
