import { useState, useRef, useEffect, useMemo } from 'react';
import {
  X, Upload, Loader2, ShoppingCart, Receipt, Briefcase, FileText, Check, AlertTriangle, Sparkles, Camera, Truck, PackageCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { formatCurrency } from '../../types/accounting';
import type { AccContact } from '../../types/accounting';
import CameraScanner from './CameraScanner';
import { matchProduct, type ProductLike, type CategoryLike } from '../../utils/productMatcher';

type DocKind = 'purchase' | 'expense' | 'investment' | 'sale' | 'delivery_out' | 'delivery_in';

interface Extracted {
  document_nature_guess: DocKind | 'unknown';
  supplier_name: string;
  supplier_vat: string;
  supplier_iban: string;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  payment_method: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    vat_rate: number;
    line_total: number;
  }>;
  confidence: number;
  notes: string;
  document_number?: string;
}

type Step = 'upload' | 'classify' | 'scanning' | 'preview' | 'saving';

interface Props {
  onClose: () => void;
  onSaved?: (kind: DocKind, entityId: string) => void;
  initialKind?: DocKind;
}

const KIND_ICONS: Record<DocKind, { icon: typeof ShoppingCart; color: string }> = {
  purchase: { icon: ShoppingCart, color: 'teal' },
  expense: { icon: Receipt, color: 'amber' },
  investment: { icon: Briefcase, color: 'blue' },
  sale: { icon: FileText, color: 'emerald' },
  delivery_out: { icon: Truck, color: 'emerald' },
  delivery_in: { icon: PackageCheck, color: 'blue' },
};

export default function ScanDocumentModal({ onClose, onSaved, initialKind }: Props) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const companyId = profile?.company_id ?? '';

  const KIND_META: Record<DocKind, { label: string; icon: typeof ShoppingCart; color: string; desc: string }> = {
    purchase: { label: t('accounting.scanModal.kindPurchase'), icon: KIND_ICONS.purchase.icon, color: KIND_ICONS.purchase.color, desc: t('accounting.scanModal.kindPurchaseDesc') },
    expense: { label: t('accounting.scanModal.kindExpense'), icon: KIND_ICONS.expense.icon, color: KIND_ICONS.expense.color, desc: t('accounting.scanModal.kindExpenseDesc') },
    investment: { label: t('accounting.scanModal.kindInvestment'), icon: KIND_ICONS.investment.icon, color: KIND_ICONS.investment.color, desc: t('accounting.scanModal.kindInvestmentDesc') },
    sale: { label: t('accounting.scanModal.kindSale'), icon: KIND_ICONS.sale.icon, color: KIND_ICONS.sale.color, desc: t('accounting.scanModal.kindSaleDesc') },
    delivery_out: { label: t('accounting.scanModal.kindDeliveryOut'), icon: KIND_ICONS.delivery_out.icon, color: KIND_ICONS.delivery_out.color, desc: t('accounting.scanModal.kindDeliveryOutDesc') },
    delivery_in: { label: t('accounting.scanModal.kindDeliveryIn'), icon: KIND_ICONS.delivery_in.icon, color: KIND_ICONS.delivery_in.color, desc: t('accounting.scanModal.kindDeliveryInDesc') },
  };

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string>('');
  const [scanId, setScanId] = useState<string>('');
  const [storagePath, setStoragePath] = useState<string>('');
  const [chosenKind, setChosenKind] = useState<DocKind>(initialKind ?? 'purchase');
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [routing, setRouting] = useState<{
    suggested_kind: DocKind | 'unknown';
    matched_contact_id: string | null;
    matched_contact_name: string | null;
    matched_contact_type: string | null;
    match_reason: string;
    confidence: number;
    company_match: boolean;
  } | null>(null);
  const [error, setError] = useState<string>('');
  const [contacts, setContacts] = useState<AccContact[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [formSupplierId, setFormSupplierId] = useState<string>('');
  const [formCustomerId, setFormCustomerId] = useState<string>('');
  const [formDate, setFormDate] = useState<string>('');
  const [formDueDate, setFormDueDate] = useState<string>('');
  const [formInvoiceNumber, setFormInvoiceNumber] = useState<string>('');
  const [formCurrency, setFormCurrency] = useState<'EUR' | 'CHF'>('EUR');
  const [formTotal, setFormTotal] = useState<number>(0);
  const [formVat, setFormVat] = useState<number>(0);
  const [formSubtotal, setFormSubtotal] = useState<number>(0);
  const [formDescription, setFormDescription] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('equipment');
  const [formLife, setFormLife] = useState<number>(5);
  const [formLines, setFormLines] = useState<Extracted['line_items']>([]);
  const [lineMatches, setLineMatches] = useState<Array<{ product_id: string | null; category_id: string | null; condition: string | null }>>([]);
  const [catalogProducts, setCatalogProducts] = useState<ProductLike[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<CategoryLike[]>([]);
  const [showCamera, setShowCamera] = useState(false);

  useEffect(() => {
    fetchContacts();
    fetchCatalog();
  }, [companyId]);

  async function fetchCatalog() {
    if (!companyId) return;
    const [catRes, prodRes] = await Promise.all([
      supabase.from('product_categories').select('id, name, aliases').eq('company_id', companyId),
      supabase.from('category_products').select('id, name, sku, category_id, aliases, keywords, dimensions, default_condition').eq('company_id', companyId).eq('is_active', true),
    ]);
    setCatalogCategories((catRes.data as CategoryLike[]) ?? []);
    setCatalogProducts((prodRes.data as ProductLike[]) ?? []);
  }

  async function fetchContacts() {
    if (!companyId) return;
    const { data } = await supabase
      .from('acc_contacts')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');
    setContacts(data ?? []);
  }

  function fuzzyFindContact(name: string, type: 'customer' | 'supplier'): string {
    if (!name.trim()) return '';
    const norm = name.toLowerCase().trim();
    const match = contacts.find((c) => {
      if (type === 'supplier' && !['supplier', 'both'].includes(c.contact_type)) return false;
      if (type === 'customer' && !['customer', 'both'].includes(c.contact_type)) return false;
      return c.name.toLowerCase().includes(norm) || norm.includes(c.name.toLowerCase());
    });
    return match?.id ?? '';
  }

  function handleFileSelect(f: File) {
    if (f.size > 15 * 1024 * 1024) {
      setError(t('accounting.scanModal.errFileSize'));
      return;
    }
    const name = f.name.toLowerCase();
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/plain', 'text/csv',
    ];
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt'];
    if (!allowedMimes.includes(f.type) && !allowedExt.some((e) => name.endsWith(e))) {
      setError(t('accounting.scanModal.errFormat'));
      return;
    }
    setError('');
    setFile(f);
    setFileUrl(URL.createObjectURL(f));
    setStep('classify');
  }

  async function runScan() {
    if (!file || !companyId) {
      setError(t('accounting.scanModal.uploadFirst'));
      return;
    }
    setStep('scanning');
    setError('');
    let localScanId = '';
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('acc-scans').upload(path, file);
      if (upErr) {
        throw new Error(`Ngarkimi i skedarit deshtoi: ${upErr.message || 'gabim i panjohur'}`);
      }

      const fileMime = file.type || (ext === 'pdf' ? 'application/pdf' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'application/octet-stream');

      const { data: scan, error: scanErr } = await supabase
        .from('acc_scanned_documents')
        .insert({
          company_id: companyId,
          uploaded_by: profile?.id,
          storage_path: path,
          file_mime: fileMime,
          file_size: file.size,
          chosen_type: chosenKind,
          status: 'uploaded',
        })
        .select()
        .maybeSingle();
      if (scanErr || !scan) {
        throw new Error(`Nuk u regjistrua dokumenti ne baze: ${scanErr?.message || 'pa pergjigje'}`);
      }
      localScanId = scan.id;
      setScanId(scan.id);
      setStoragePath(path);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-document`;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error(t('accounting.scanModal.sessionExpired'));
      }
      const docDirection = chosenKind === 'delivery_in' ? 'in'
        : chosenKind === 'delivery_out' ? 'out'
        : undefined;
      let res: Response;
      try {
        res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ scanId: scan.id, role: 'accountant', docDirection, chosenKind }),
        });
      } catch (netErr: any) {
        throw new Error(`Nuk u lidh dot me skanuesin: ${netErr?.message || 'problem rrjeti'}`);
      }
      let json: any = null;
      try { json = await res.json(); } catch {
        throw new Error(`Skanuesi kthen pergjigje te pavlefshme (HTTP ${res.status}). Ju lutem provoni perseri.`);
      }
      if (!res.ok || !json?.success) {
        const serverMsg = json?.error || json?.message;
        if (serverMsg) throw new Error(serverMsg);
        if (res.status === 429) throw new Error(t('accounting.scanModal.rateLimited'));
        if (res.status === 401 || res.status === 403) throw new Error(t('accounting.scanModal.unauthorized'));
        if (res.status >= 500) throw new Error(`Serveri ka nje problem (HTTP ${res.status}). Provoni perseri me vone.`);
        throw new Error(`Skanimi deshtoi (HTTP ${res.status})`);
      }
      const ex = json.extracted as Extracted;
      const rt = json.routing || null;
      if (rt && rt.suggested_kind && rt.suggested_kind !== 'unknown') {
        setChosenKind(rt.suggested_kind as DocKind);
      }
      setRouting(rt);
      prefillForm(ex, rt);
      setExtracted(ex);
      setStep('preview');
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : (typeof err === 'string' ? err : '');
      const msg = rawMsg && rawMsg.trim().length > 0
        ? rawMsg
        : `${t('accounting.scanModal.errScan')}: probleme te panjohura. Kontrolloni lidhjen dhe provoni perseri.`;
      setError(msg);
      const updateId = localScanId || scanId;
      if (updateId) {
        await supabase.from('acc_scanned_documents')
          .update({ status: 'error', error_message: msg.slice(0, 500) })
          .eq('id', updateId);
      }
      setStep('classify');
    }
  }

  function prefillForm(ex: Extracted, rt?: typeof routing) {
    setFormDate(ex.invoice_date || new Date().toISOString().slice(0, 10));
    setFormDueDate(ex.due_date || '');
    setFormInvoiceNumber(ex.invoice_number || '');
    setFormCurrency((ex.currency === 'CHF' ? 'CHF' : 'EUR'));
    setFormTotal(ex.total || 0);
    setFormVat(ex.vat_amount || 0);
    setFormSubtotal(ex.subtotal || Math.max(0, (ex.total || 0) - (ex.vat_amount || 0)));
    setFormLines(ex.line_items || []);
    const matches = (ex.line_items || []).map((li) => {
      const mm = matchProduct(li.description || '', catalogProducts, catalogCategories);
      const prod = mm.productId ? catalogProducts.find((p) => p.id === mm.productId) : null;
      return {
        product_id: mm.productId,
        category_id: mm.categoryId,
        condition: prod?.default_condition ?? null,
      };
    });
    setLineMatches(matches);
    const kind = (rt?.suggested_kind && rt.suggested_kind !== 'unknown') ? rt.suggested_kind as DocKind : chosenKind;
    const matchedId = rt?.matched_contact_id || '';
    if (kind === 'sale' || kind === 'delivery_out') {
      setFormCustomerId(matchedId || fuzzyFindContact(ex.customer_name || ex.supplier_name, 'customer'));
    } else {
      setFormSupplierId(matchedId || fuzzyFindContact(ex.supplier_name, 'supplier'));
    }
    setFormDescription(ex.supplier_name || ex.customer_name || '');
  }

  async function getNextNumber(kind: 'invoice' | 'purchase' | 'delivery_out' | 'delivery_in'): Promise<string> {
    const prefix = kind === 'invoice' ? 'RE' : kind === 'purchase' ? 'BL' : kind === 'delivery_out' ? 'FL' : 'FP';
    const { data } = await supabase.rpc('get_next_acc_number', {
      p_company_id: companyId,
      p_prefix: prefix,
    });
    return (data as string) || `${prefix}-${Date.now()}`;
  }

  async function moveScanToDocuments(): Promise<{ url: string; mime: string }> {
    if (!file || !storagePath) return { url: '', mime: '' };
    const newPath = `${companyId}/${chosenKind}/${crypto.randomUUID()}-${file.name}`;
    const { data: downloadData } = await supabase.storage.from('acc-scans').download(storagePath);
    if (!downloadData) return { url: '', mime: file.type };
    await supabase.storage.from('acc-documents').upload(newPath, downloadData, { contentType: file.type });
    const { data: signed } = await supabase.storage.from('acc-documents').createSignedUrl(newPath, 60 * 60 * 24 * 365);
    return { url: signed?.signedUrl || newPath, mime: file.type };
  }

  async function ensureSupplier(): Promise<string | null> {
    if (formSupplierId) return formSupplierId;
    if (!extracted?.supplier_name) return null;
    const { data, error: insErr } = await supabase
      .from('acc_contacts')
      .insert({
        company_id: companyId,
        name: extracted.supplier_name,
        contact_type: 'supplier',
        vat_number: extracted.supplier_vat || '',
        iban: extracted.supplier_iban || '',
        is_active: true,
      })
      .select('id')
      .single();
    if (insErr) return null;
    return data.id;
  }

  async function ensureCustomer(): Promise<string | null> {
    if (formCustomerId) return formCustomerId;
    if (!extracted?.customer_name && !extracted?.supplier_name) return null;
    const name = extracted.customer_name || extracted.supplier_name;
    const { data, error: insErr } = await supabase
      .from('acc_contacts')
      .insert({
        company_id: companyId,
        name,
        contact_type: 'customer',
        is_active: true,
      })
      .select('id')
      .single();
    if (insErr) return null;
    return data.id;
  }

  async function saveAsPurchase() {
    const supplierId = await ensureSupplier();
    const purchaseNumber = await getNextNumber('purchase');
    const { url, mime } = await moveScanToDocuments();
    const { data, error: pErr } = await supabase
      .from('acc_purchases')
      .insert({
        company_id: companyId,
        created_by: profile?.id,
        contact_id: supplierId,
        purchase_number: purchaseNumber,
        external_invoice_number: formInvoiceNumber,
        purchase_date: formDate,
        due_date: formDueDate || null,
        status: 'received',
        subtotal: formSubtotal,
        vat_amount: formVat,
        total: formTotal,
        currency: formCurrency,
        notes: `Krijuar nga skanimi: ${extracted?.notes || ''}`.slice(0, 500),
        document_url: url,
        document_mime: mime,
      })
      .select('id')
      .single();
    if (pErr) throw pErr;

    if (formLines.length > 0) {
      const items = formLines.map((l) => ({
        purchase_id: data.id,
        description: l.description || '-',
        quantity: l.quantity || 1,
        unit: l.unit || 'pcs',
        unit_price: l.unit_price || 0,
        vat_rate: l.vat_rate || 19,
        line_total: l.line_total || (l.quantity || 1) * (l.unit_price || 0),
      }));
      await supabase.from('acc_purchase_items').insert(items);
    }
    return data.id as string;
  }

  async function saveAsExpense() {
    const supplierId = formSupplierId || (extracted?.supplier_name ? await ensureSupplier() : null);
    const { url, mime } = await moveScanToDocuments();
    const { data, error: tErr } = await supabase
      .from('acc_transactions')
      .insert({
        company_id: companyId,
        transaction_type: 'expense',
        contact_id: supplierId,
        amount: formTotal,
        currency: formCurrency,
        description: formDescription || extracted?.supplier_name || 'Shpenzim i skanuar',
        transaction_date: formDate,
        reference_number: formInvoiceNumber,
        notes: extracted?.notes || '',
        created_by: profile?.id,
        document_url: url,
        document_mime: mime,
      })
      .select('id')
      .single();
    if (tErr) throw tErr;
    return data.id as string;
  }

  async function saveAsInvestment() {
    const supplierId = formSupplierId || (extracted?.supplier_name ? await ensureSupplier() : null);
    const { url, mime } = await moveScanToDocuments();
    const monthly = formLife > 0 ? Math.round((formSubtotal / (formLife * 12)) * 100) / 100 : 0;
    const { data: asset, error: aErr } = await supabase
      .from('acc_fixed_assets')
      .insert({
        company_id: companyId,
        created_by: profile?.id,
        name: formDescription || extracted?.supplier_name || 'Aset',
        category: formCategory,
        acquisition_date: formDate,
        acquisition_cost: formSubtotal,
        vat_amount: formVat,
        useful_life_years: formLife,
        monthly_depreciation: monthly,
        current_book_value: formSubtotal,
        supplier_contact_id: supplierId,
        document_url: url,
        document_mime: mime,
        notes: extracted?.notes || '',
      })
      .select('id')
      .single();
    if (aErr) throw aErr;

    await supabase
      .from('acc_transactions')
      .insert({
        company_id: companyId,
        transaction_type: 'expense',
        contact_id: supplierId,
        amount: formTotal,
        currency: formCurrency,
        description: `Investim: ${formDescription}`,
        transaction_date: formDate,
        reference_number: formInvoiceNumber,
        notes: `Aset fiks (${formLife} vite, zhvleresim mujor ${monthly})`,
        created_by: profile?.id,
        fixed_asset_id: asset.id,
        document_url: url,
        document_mime: mime,
      });
    return asset.id as string;
  }

  async function saveAsSale() {
    const customerId = await ensureCustomer();
    const invoiceNumber = formInvoiceNumber || (await getNextNumber('invoice'));
    const { url, mime } = await moveScanToDocuments();
    const { data, error: iErr } = await supabase
      .from('acc_invoices')
      .insert({
        company_id: companyId,
        created_by: profile?.id,
        contact_id: customerId,
        invoice_number: invoiceNumber,
        invoice_date: formDate,
        due_date: formDueDate || null,
        status: 'sent',
        subtotal: formSubtotal,
        vat_amount: formVat,
        total: formTotal,
        discount: 0,
        currency: formCurrency,
        invoice_type: 'invoice',
        notes: `Krijuar nga skanimi`,
        document_url: url,
        document_mime: mime,
      })
      .select('id')
      .single();
    if (iErr) throw iErr;

    if (formLines.length > 0) {
      const items = formLines.map((l) => ({
        invoice_id: data.id,
        description: l.description || '-',
        quantity: l.quantity || 1,
        unit: l.unit || 'pcs',
        unit_price: l.unit_price || 0,
        vat_rate: l.vat_rate || 19,
        line_discount: 0,
        line_total: l.line_total || (l.quantity || 1) * (l.unit_price || 0),
      }));
      await supabase.from('acc_invoice_items').insert(items);
    }
    return data.id as string;
  }

  async function saveAsDeliveryNote(direction: 'outgoing' | 'incoming') {
    const contactId = direction === 'outgoing'
      ? (formCustomerId || (await ensureCustomer()))
      : (formSupplierId || (await ensureSupplier()));
    const noteNumber = await getNextNumber(direction === 'outgoing' ? 'delivery_out' : 'delivery_in');
    const { url, mime } = await moveScanToDocuments();

    const { data, error: dErr } = await supabase
      .from('acc_delivery_notes')
      .insert({
        company_id: companyId,
        created_by: profile?.id,
        contact_id: contactId,
        note_number: noteNumber,
        note_date: formDate,
        status: 'draft',
        direction,
        shipping_address: formDescription || '',
        supplier_invoice_number: direction === 'incoming' ? formInvoiceNumber : '',
        notes: `Krijuar nga skanimi: ${extracted?.notes || ''}`.slice(0, 500),
        document_url: url,
        document_mime: mime,
      })
      .select('id')
      .single();
    if (dErr) throw dErr;

    if (formLines.length > 0) {
      const items = formLines.map((l) => ({
        delivery_note_id: data.id,
        description: l.description || '-',
        quantity: l.quantity || 1,
        unit: l.unit || 'pcs',
        unit_price: l.unit_price || 0,
        vat_rate: l.vat_rate || 0,
        line_total: l.line_total || (l.quantity || 1) * (l.unit_price || 0),
      }));
      await supabase.from('acc_delivery_note_items').insert(items);
    }

    await bridgeToLogistics(direction, data.id as string, url, contactId);
    return data.id as string;
  }

  async function bridgeToLogistics(
    direction: 'outgoing' | 'incoming',
    accNoteId: string,
    documentUrl: string,
    contactId: string | null,
  ) {
    if (!profile?.id || !companyId) return;
    const partnerName = direction === 'outgoing'
      ? (extracted?.customer_name || extracted?.supplier_name || '')
      : (extracted?.supplier_name || extracted?.customer_name || '');
    const noteNumber = `DN-${Date.now().toString(36).toUpperCase()}`;
    const { data: logNote, error: lErr } = await supabase
      .from('delivery_notes')
      .insert({
        company_id: companyId,
        created_by: profile.id,
        note_number: noteNumber,
        type: direction === 'outgoing' ? 'delivery' : 'pickup',
        status: 'pending_company_review',
        partner_name: partnerName || null,
        partner_id: null,
        scanned_photo_url: documentUrl || null,
        attachment_url: documentUrl || null,
        notes: (extracted?.notes || formDescription || '').slice(0, 500),
        ai_extracted_json: extracted ? { ...extracted, _acc_delivery_note_id: accNoteId, _acc_contact_id: contactId } : null,
        ai_confidence: extracted?.confidence ?? null,
        origin: 'scan',
        document_number: extracted?.document_number || extracted?.invoice_number || formInvoiceNumber || null,
        reference_number: formInvoiceNumber || null,
      })
      .select('id')
      .maybeSingle();
    if (lErr || !logNote) return;

    if (formLines.length > 0) {
      const items = formLines.map((l, i) => {
        const match = lineMatches[i] || { product_id: null, category_id: null, condition: null };
        return {
          delivery_note_id: logNote.id,
          category_id: match.category_id,
          category_product_id: match.product_id,
          product_id: null,
          quantity: Math.max(1, Math.round(l.quantity || 1)),
          condition: match.condition || 'good',
          notes: l.description || '',
          intended_action: 'stock',
        };
      });
      await supabase.from('delivery_note_items').insert(items);
    }
  }

  async function handleSave() {
    setStep('saving');
    setError('');
    try {
      let entityId = '';
      let entityType = '';
      if (chosenKind === 'purchase') { entityId = await saveAsPurchase(); entityType = 'acc_purchases'; }
      else if (chosenKind === 'expense') { entityId = await saveAsExpense(); entityType = 'acc_transactions'; }
      else if (chosenKind === 'investment') { entityId = await saveAsInvestment(); entityType = 'acc_fixed_assets'; }
      else if (chosenKind === 'sale') { entityId = await saveAsSale(); entityType = 'acc_invoices'; }
      else if (chosenKind === 'delivery_out') { entityId = await saveAsDeliveryNote('outgoing'); entityType = 'acc_delivery_notes'; }
      else if (chosenKind === 'delivery_in') { entityId = await saveAsDeliveryNote('incoming'); entityType = 'acc_delivery_notes'; }

      if (scanId && entityId) {
        await supabase
          .from('acc_scanned_documents')
          .update({ status: 'saved', linked_entity_type: entityType, linked_entity_id: entityId, chosen_type: chosenKind })
          .eq('id', scanId);
      }
      if (onSaved && entityId) onSaved(chosenKind, entityId);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('accounting.scanModal.errSave'));
      setStep('preview');
    }
  }

  const filteredContacts = useMemo(() => {
    if (chosenKind === 'sale' || chosenKind === 'delivery_out') return contacts.filter((c) => ['customer', 'both'].includes(c.contact_type));
    return contacts.filter((c) => ['supplier', 'both'].includes(c.contact_type));
  }, [contacts, chosenKind]);

  const isDeliveryKind = chosenKind === 'delivery_out' || chosenKind === 'delivery_in';

  return (
    <div className="fixed inset-0 z-[1000] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-5xl modal-panel sm:max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-xl">
              <Sparkles className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{t('accounting.scanModal.title')}</h2>
              <p className="text-xs text-slate-500">
                {step === 'preview'
                  ? t('accounting.scanModal.subtitlePreview')
                  : t('accounting.scanModal.subtitleUpload')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {step === 'upload' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                className="group relative p-8 rounded-2xl border-2 border-teal-300 bg-gradient-to-br from-teal-50 to-emerald-50 hover:border-teal-500 hover:shadow-lg transition-all text-center"
              >
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-teal-600 text-white flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Camera className="w-8 h-8" />
                </div>
                <p className="text-base font-bold text-slate-900">{t('accounting.scanModal.scanWithCamera')}</p>
                <p className="text-xs text-slate-600 mt-1">{t('accounting.scanModal.scanWithCameraHint')}</p>
                <span className="inline-block mt-3 px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-semibold uppercase tracking-wider">
                  {t('accounting.scanModal.recommendedMobile')}
                </span>
              </button>

              <div
                className="p-8 rounded-2xl border-2 border-dashed border-slate-300 hover:border-teal-400 transition-colors cursor-pointer text-center"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}
              >
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
                  <Upload className="w-8 h-8" />
                </div>
                <p className="text-base font-bold text-slate-900">{t('accounting.scanModal.uploadFromDevice')}</p>
                <p className="text-xs text-slate-600 mt-1">{t('accounting.scanModal.uploadHint')}</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
              </div>
            </div>
          )}

          {showCamera && (
            <CameraScanner
              onClose={() => setShowCamera(false)}
              onCapture={(f) => {
                setShowCamera(false);
                handleFileSelect(f);
              }}
            />
          )}

          {step === 'classify' && (
            <div>
              <h3 className="text-base font-bold text-slate-900 mb-2">{t('accounting.scanModal.whatIsThis')}</h3>
              <p className="text-sm text-slate-500 mb-4">{t('accounting.scanModal.whatIsThisHint')}</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {(Object.keys(KIND_META) as DocKind[]).map((kind) => {
                  const meta = KIND_META[kind];
                  const Icon = meta.icon;
                  const active = chosenKind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setChosenKind(kind)}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${
                        active ? 'border-teal-500 bg-teal-50/50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-1.5">
                        <div className={`p-2 rounded-lg ${active ? 'bg-teal-100' : 'bg-slate-100'}`}>
                          <Icon className={`w-4 h-4 ${active ? 'text-teal-600' : 'text-slate-500'}`} />
                        </div>
                        <span className="font-semibold text-slate-800">{meta.label}</span>
                        {active && <Check className="w-4 h-4 text-teal-600 ml-auto" />}
                      </div>
                      <p className="text-xs text-slate-500">{meta.desc}</p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex items-center justify-end gap-2">
                <button onClick={() => { setStep('upload'); setFile(null); }} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                  {t('accounting.scanModal.back')}
                </button>
                <button onClick={runScan} className="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium inline-flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> {t('accounting.scanModal.scanNow')}
                </button>
              </div>
            </div>
          )}

          {step === 'scanning' && (
            <div className="py-16 text-center">
              <Loader2 className="w-12 h-12 mx-auto text-teal-600 animate-spin mb-4" />
              <p className="text-base font-semibold text-slate-800">{t('accounting.scanModal.extractingTitle')}</p>
              <p className="text-sm text-slate-500 mt-1">{t('accounting.scanModal.extractingHint')}</p>
            </div>
          )}

          {step === 'preview' && extracted && (
            <>
            {routing && (
              <div className="mb-3 flex items-start gap-3 p-3 rounded-lg bg-teal-50 border border-teal-200">
                <Sparkles className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-teal-900">
                    <strong>{t('accounting.scanModal.aiClassifiedAs')} "{KIND_META[routing.suggested_kind === 'unknown' ? chosenKind : routing.suggested_kind as DocKind]?.label}"</strong>
                    {routing.matched_contact_name && <> {t('accounting.scanModal.aiMatchedContact')} <strong>{routing.matched_contact_name}</strong> {t('accounting.scanModal.aiFromDb')}</>}
                  </p>
                  <p className="text-[11px] text-teal-700 mt-0.5">{routing.match_reason}</p>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white text-teal-700 font-semibold">
                  {Math.round(routing.confidence * 100)}%
                </span>
              </div>
            )}
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800">
                <strong>{t('accounting.scanModal.checkDataTitle')}</strong> {t('accounting.scanModal.checkDataBody')}
              </p>
            </div>
            <div className="grid lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('accounting.scanModal.originalDoc')}</p>
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                  {file?.type === 'application/pdf' ? (
                    <iframe src={fileUrl} className="w-full h-[480px]" title="Preview" />
                  ) : file?.type.startsWith('image/') ? (
                    <img src={fileUrl} alt="Scan" className="w-full max-h-[480px] object-contain" />
                  ) : (
                    <div className="h-[480px] flex flex-col items-center justify-center p-8 text-center">
                      <FileText className="w-16 h-16 text-slate-400 mb-3" />
                      <p className="text-sm font-semibold text-slate-700">{file?.name}</p>
                      <p className="text-xs text-slate-500 mt-1">{t('accounting.scanModal.aiAnalyzed')}</p>
                    </div>
                  )}
                </div>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">
                  <Sparkles className="w-3.5 h-3.5" /> {t('accounting.scanModal.aiConfidence')}: {Math.round((extracted.confidence || 0) * 100)}%
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('accounting.scanModal.extractedFor')} — {KIND_META[chosenKind].label}</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {(chosenKind === 'sale' || chosenKind === 'delivery_out') ? t('accounting.scanModal.customer') : t('accounting.scanModal.supplier')}
                    </label>
                    <select
                      value={(chosenKind === 'sale' || chosenKind === 'delivery_out') ? formCustomerId : formSupplierId}
                      onChange={(e) => (chosenKind === 'sale' || chosenKind === 'delivery_out') ? setFormCustomerId(e.target.value) : setFormSupplierId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    >
                      <option value="">
                        {`— ${t('accounting.scanModal.createNewPrefix')}: "${((chosenKind === 'sale' || chosenKind === 'delivery_out') ? extracted.customer_name : extracted.supplier_name) || t('accounting.scanModal.unknown')}" —`}
                      </option>
                      {filteredContacts.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('accounting.scanModal.date')}</label>
                      <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {chosenKind === 'delivery_out' ? t('accounting.scanModal.deliveryOutNumber') : chosenKind === 'delivery_in' ? t('accounting.scanModal.supplierInvNumber') : t('accounting.scanModal.invoiceNumber')}
                      </label>
                      <input type="text" value={formInvoiceNumber} onChange={(e) => setFormInvoiceNumber(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    </div>
                  </div>

                  {(chosenKind === 'purchase' || chosenKind === 'sale') && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('accounting.scanModal.dueDate')}</label>
                      <input type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    </div>
                  )}

                  {(chosenKind === 'expense' || isDeliveryKind) && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {chosenKind === 'delivery_out' ? t('accounting.scanModal.deliveryAddressOut') : chosenKind === 'delivery_in' ? t('accounting.scanModal.deliveryAddressIn') : t('accounting.scanModal.description')}
                      </label>
                      <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    </div>
                  )}

                  {chosenKind === 'investment' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">{t('accounting.scanModal.assetName')}</label>
                        <input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">{t('accounting.scanModal.category')}</label>
                          <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                            <option value="equipment">{t('accounting.scanModal.catEquipment')}</option>
                            <option value="vehicle">{t('accounting.scanModal.catVehicle')}</option>
                            <option value="it">{t('accounting.scanModal.catIt')}</option>
                            <option value="furniture">{t('accounting.scanModal.catFurniture')}</option>
                            <option value="software">{t('accounting.scanModal.catSoftware')}</option>
                            <option value="other">{t('accounting.scanModal.catOther')}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">{t('accounting.scanModal.usefulLifeYears')}</label>
                          <input type="number" min="1" max="30" value={formLife} onChange={(e) => setFormLife(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">
                        {t('accounting.scanModal.monthlyDepreciation')}: <strong>{formatCurrency(formLife > 0 ? formSubtotal / (formLife * 12) : 0)}</strong>
                      </p>
                    </>
                  )}

                  <div className={`grid grid-cols-3 gap-3 ${isDeliveryKind ? 'opacity-75' : ''}`}>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('accounting.scanModal.subtotal')}</label>
                      <input type="number" step="0.01" value={formSubtotal} onChange={(e) => setFormSubtotal(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('accounting.scanModal.vat')}</label>
                      <input type="number" step="0.01" value={formVat} onChange={(e) => setFormVat(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{t('accounting.scanModal.total')}</label>
                      <input type="number" step="0.01" value={formTotal} onChange={(e) => setFormTotal(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold" />
                    </div>
                  </div>

                  {(chosenKind === 'purchase' || chosenKind === 'sale' || isDeliveryKind) && formLines.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase mb-2">{t('accounting.scanModal.itemsCount')} ({formLines.length})</p>
                      <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                        {formLines.map((l, i) => (
                          <div key={i} className="px-3 py-2 text-xs flex items-center gap-2">
                            <input
                              value={l.description}
                              onChange={(e) => {
                                const next = [...formLines]; next[i] = { ...next[i], description: e.target.value }; setFormLines(next);
                              }}
                              className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs"
                            />
                            <input
                              type="number" value={l.quantity}
                              onChange={(e) => { const next = [...formLines]; next[i] = { ...next[i], quantity: Number(e.target.value) }; setFormLines(next); }}
                              className="w-16 px-2 py-1 border border-slate-200 rounded text-xs text-right"
                            />
                            <input
                              type="number" step="0.01" value={l.unit_price}
                              onChange={(e) => { const next = [...formLines]; next[i] = { ...next[i], unit_price: Number(e.target.value) }; setFormLines(next); }}
                              className="w-20 px-2 py-1 border border-slate-200 rounded text-xs text-right"
                            />
                            <span className="w-10 text-right">{l.vat_rate}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            </>
          )}

          {step === 'saving' && (
            <div className="py-16 text-center">
              <Loader2 className="w-12 h-12 mx-auto text-teal-600 animate-spin mb-4" />
              <p className="text-base font-semibold text-slate-800">{t('accounting.scanModal.savingTitle')}</p>
            </div>
          )}
        </div>

        {step === 'preview' && (
          <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-slate-50 sm:rounded-b-2xl modal-footer">
            <button onClick={() => setStep('classify')} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm">
              {t('accounting.scanModal.changeKind')}
            </button>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm">
                {t('accounting.scanModal.cancel')}
              </button>
              <button onClick={handleSave} className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-semibold text-sm inline-flex items-center gap-2">
                <Check className="w-4 h-4" /> {t('accounting.scanModal.saveToSystem')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
