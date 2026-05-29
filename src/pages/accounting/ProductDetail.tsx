import { useState, useEffect, useRef, type DragEvent, type ChangeEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon, CreditCard as Edit3, Package, AlertTriangle, X, Loader2, Upload, Trash2, Plus, ToggleLeft, ToggleRight, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type {
  AccProduct,
  AccProductCategory,
  AccStockMovement,
  AccInvoiceItem,
  AccPurchaseItem,
  AccMovementType,
} from '../../types/accounting';
import { UNITS, formatCurrency } from '../../types/accounting';
import { useCountryVatRates } from '../../hooks/useCountryVatRates';

type TabKey = 'stock' | 'sales' | 'purchases' | 'movements';

interface ProductFormData {
  name: string;
  sku: string;
  description: string;
  unit: string;
  price_net: number;
  vat_rate: number;
  category_id: string;
  min_stock: number;
}

interface InvoiceItemRow extends AccInvoiceItem {
  invoice?: {
    id: string;
    invoice_number: string;
    invoice_date: string;
    status: string;
    contact?: { id: string; name: string } | null;
  };
}

interface PurchaseItemRow extends AccPurchaseItem {
  purchase?: {
    id: string;
    purchase_number: string;
    purchase_date: string;
    status: string;
    contact?: { id: string; name: string } | null;
  };
}

function makeInitialFormData(defaultVatRate: number = 0): ProductFormData {
  return {
    name: '',
    sku: '',
    description: '',
    unit: 'pcs',
    price_net: 0,
    vat_rate: defaultVatRate,
    category_id: '',
    min_stock: 0,
  };
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useTranslation();
  const { rates: vatRates, standardRate: defaultVat } = useCountryVatRates();

  const [product, setProduct] = useState<AccProduct | null>(null);
  const [categories, setCategories] = useState<AccProductCategory[]>([]);
  const [movements, setMovements] = useState<AccStockMovement[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemRow[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('stock');

  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>(() => makeInitialFormData(defaultVat));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustNewQty, setAdjustNewQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('all');

  useEffect(() => {
    if (profile?.company_id && id) fetchAll();
  }, [profile?.company_id, id]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;

      const [productRes, categoriesRes, movementsRes, invoiceItemsRes, purchaseItemsRes] =
        await Promise.all([
          supabase
            .from('acc_products')
            .select('*, category:acc_product_categories(id, name)')
            .eq('id', id!)
            .eq('company_id', companyId)
            .single(),
          supabase
            .from('acc_product_categories')
            .select('*')
            .eq('company_id', companyId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('acc_stock_movements')
            .select('*')
            .eq('product_id', id!)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false }),
          supabase
            .from('acc_invoice_items')
            .select('*, invoice:acc_invoices(id, invoice_number, invoice_date, status, contact:acc_contacts(id, name))')
            .eq('product_id', id!),
          supabase
            .from('acc_purchase_items')
            .select('*, purchase:acc_purchases(id, purchase_number, purchase_date, status, contact:acc_contacts(id, name))')
            .eq('product_id', id!),
        ]);

      if (productRes.error) throw productRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (movementsRes.error) throw movementsRes.error;

      setProduct(productRes.data);
      setCategories(categoriesRes.data ?? []);
      setMovements(movementsRes.data ?? []);
      setInvoiceItems((invoiceItemsRes.data as InvoiceItemRow[] | null) ?? []);
      setPurchaseItems((purchaseItemsRes.data as PurchaseItemRow[] | null) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  const getStockBadge = (p: AccProduct) => {
    if (p.current_stock <= 0) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          Pa Stok
        </span>
      );
    }
    if (p.current_stock <= p.min_stock) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          Stok i Ulet
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Ne Stok
      </span>
    );
  };

  const getMovementBadge = (type: AccMovementType) => {
    const map: Record<AccMovementType, { bg: string; text: string; label: string }> = {
      in: { bg: 'bg-green-100', text: 'text-green-700', label: 'Hyrje' },
      out: { bg: 'bg-red-100', text: 'text-red-700', label: 'Dalje' },
      adjustment: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Rregullim' },
      return: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Kthim' },
    };
    const s = map[type] || { bg: 'bg-gray-100', text: 'text-gray-700', label: type };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const openEditModal = () => {
    if (!product) return;
    setFormData({
      name: product.name,
      sku: product.sku || '',
      description: product.description || '',
      unit: product.unit,
      price_net: product.price_net,
      vat_rate: product.vat_rate,
      category_id: product.category_id || '',
      min_stock: product.min_stock,
    });
    setSelectedFile(null);
    setImagePreview(product.image_url || null);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setFormData(makeInitialFormData(defaultVat));
    setSelectedFile(null);
    setImagePreview(null);
    setShowNewCategory(false);
    setNewCategoryName('');
  };

  const handleFileSelect = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setError(t('accounting.products.imageTooLarge'));
      return;
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError(t('accounting.products.imageFormatAllowed'));
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const uploadImage = async (recordId: string, file: File): Promise<string | null> => {
    try {
      setUploadingImage(true);
      const ext = file.name.split('.').pop();
      const filePath = `${profile!.company_id}/${recordId}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(filePath);
      return urlData.publicUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate ngarkimit te imazhit');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const deleteOldImage = async (imageUrl: string) => {
    try {
      const url = new URL(imageUrl);
      const pathParts = url.pathname.split('/product-images/');
      if (pathParts.length > 1) {
        const storagePath = decodeURIComponent(pathParts[1]);
        await supabase.storage.from('product-images').remove([storagePath]);
      }
    } catch {
      // noop
    }
  };

  const handleSaveEdit = async () => {
    if (!formData.name.trim() || !product) {
      setError(t('accounting.products.nameRequired') || 'Emri i produktit eshte i detyrueshem');
      return;
    }
    try {
      setSaving(true);
      setError(null);

      const payload = {
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        description: formData.description.trim(),
        unit: formData.unit,
        price_net: Number(formData.price_net),
        vat_rate: Number(formData.vat_rate),
        category_id: formData.category_id || null,
        min_stock: Number(formData.min_stock),
      };

      if (selectedFile && product.image_url) {
        await deleteOldImage(product.image_url);
      }

      const { error: updateError } = await supabase
        .from('acc_products')
        .update(payload)
        .eq('id', product.id);
      if (updateError) throw updateError;

      if (selectedFile) {
        const publicUrl = await uploadImage(product.id, selectedFile);
        if (publicUrl) {
          await supabase
            .from('acc_products')
            .update({ image_url: publicUrl })
            .eq('id', product.id);
        }
      }

      closeEditModal();
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate ruajtjes');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      setSavingCategory(true);
      const { data, error: catError } = await supabase
        .from('acc_product_categories')
        .insert({
          company_id: profile!.company_id!,
          name: newCategoryName.trim(),
          sort_order: categories.length,
        })
        .select()
        .single();
      if (catError) throw catError;
      setCategories((prev) => [...prev, data]);
      setFormData((prev) => ({ ...prev, category_id: data.id }));
      setNewCategoryName('');
      setShowNewCategory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate ruajtjes se kategorise');
    } finally {
      setSavingCategory(false);
    }
  };

  const toggleActive = async () => {
    if (!product) return;
    try {
      const { error: toggleError } = await supabase
        .from('acc_products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id);
      if (toggleError) throw toggleError;
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim');
    }
  };

  const openAdjustModal = () => {
    if (!product) return;
    setAdjustNewQty(product.current_stock);
    setAdjustReason('');
    setShowAdjustModal(true);
  };

  const closeAdjustModal = () => {
    setShowAdjustModal(false);
    setAdjustNewQty(0);
    setAdjustReason('');
  };

  const handleSaveAdjustment = async () => {
    if (!product || !adjustReason.trim()) {
      setError(t('accounting.products.reasonRequired') || 'Arsyeja eshte e detyrueshme');
      return;
    }
    const diff = adjustNewQty - product.current_stock;
    if (diff === 0) {
      setError(t('accounting.products.newQtySameAsCurrent') || 'Sasia e re eshte e njejte me ate aktuale');
      return;
    }
    try {
      setSavingAdjust(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('acc_products')
        .update({ current_stock: adjustNewQty })
        .eq('id', product.id);
      if (updateError) throw updateError;

      const { error: mvError } = await supabase.from('acc_stock_movements').insert({
        company_id: profile!.company_id!,
        product_id: product.id,
        movement_type: 'adjustment',
        quantity: diff,
        unit_price: product.price_net,
        reference_type: 'manual',
        reference_id: null,
        notes: adjustReason.trim(),
        created_by: profile!.id,
      });
      if (mvError) throw mvError;

      closeAdjustModal();
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate rregullimit');
    } finally {
      setSavingAdjust(false);
    }
  };

  const filteredSalesItems = invoiceItems.filter(
    (item) =>
      item.invoice &&
      (item.invoice.status === 'sent' || item.invoice.status === 'paid')
  );

  const totalUnitsSold = filteredSalesItems.reduce((sum, i) => sum + i.quantity, 0);
  const totalRevenue = filteredSalesItems.reduce((sum, i) => sum + i.line_total, 0);
  const uniqueInvoices = new Set(filteredSalesItems.map((i) => i.invoice_id)).size;

  const filteredPurchaseItems = purchaseItems.filter(
    (item) =>
      item.purchase &&
      (item.purchase.status === 'received' || item.purchase.status === 'paid')
  );

  const totalUnitsPurchased = filteredPurchaseItems.reduce((sum, i) => sum + i.quantity, 0);
  const totalCost = filteredPurchaseItems.reduce((sum, i) => sum + i.line_total, 0);
  const uniquePurchases = new Set(filteredPurchaseItems.map((i) => i.purchase_id)).size;

  const recentMovements = movements.slice(0, 20);
  const allMovementsFiltered =
    movementTypeFilter === 'all'
      ? movements
      : movements.filter((m) => m.movement_type === movementTypeFilter);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'stock', label: 'Stoku' },
    { key: 'sales', label: 'Shitjet' },
    { key: 'purchases', label: 'Blerjet' },
    { key: 'movements', label: 'Levizjet' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-6">
        <Link
          to="/accounting/products"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Kthehu te Produktet
        </Link>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-16 text-center">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 font-medium">Produkti nuk u gjet</p>
        </div>
      </div>
    );
  }

  const stockValue = product.current_stock * product.price_net;
  const stockMax = Math.max(product.min_stock * 3, product.current_stock, 1);
  const stockPercent = Math.min((product.current_stock / stockMax) * 100, 100);
  const stockBarColor =
    product.current_stock <= 0
      ? 'bg-red-500'
      : product.current_stock <= product.min_stock
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <div className="space-y-6">
      <Link
        to="/accounting/products"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Kthehu te Produktet
      </Link>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-shrink-0">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-[200px] h-[200px] object-cover rounded-xl"
              />
            ) : (
              <div className="w-[200px] h-[200px] rounded-xl bg-gray-100 flex items-center justify-center">
                <ImageIcon className="w-16 h-16 text-gray-300" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {product.sku && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                      SKU: {product.sku}
                    </span>
                  )}
                  <span className="text-sm text-gray-500">
                    {UNITS.find((u) => u.value === product.unit)?.label || product.unit}
                  </span>
                  {product.category && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700">
                      {product.category.name}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={openEditModal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  Ndrysho
                </button>
                <button
                  onClick={openAdjustModal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <Package className="w-4 h-4" />
                  Rregullim Stoku
                </button>
                <button
                  onClick={toggleActive}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    product.is_active
                      ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                      : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                  }`}
                >
                  {product.is_active ? (
                    <ToggleRight className="w-4 h-4" />
                  ) : (
                    <ToggleLeft className="w-4 h-4" />
                  )}
                  {product.is_active ? 'Caktivizo' : 'Aktivizo'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-sm text-gray-500">Cmimi Neto:</span>{' '}
                <span className="text-lg font-semibold text-gray-900">
                  {formatCurrency(product.price_net)}
                </span>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-purple-50 text-purple-700">
                TVSH {product.vat_rate}%
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-sm text-gray-500">Stoku:</span>{' '}
                <span className="text-lg font-semibold text-gray-900">{product.current_stock}</span>
                <span className="text-sm text-gray-400"> / Min: {product.min_stock}</span>
              </div>
              {getStockBadge(product)}
            </div>

            {product.description && (
              <p className="text-sm text-gray-500">{product.description}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-100">
          <nav className="flex -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'stock' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-emerald-50 rounded-xl p-4">
                  <p className="text-sm text-emerald-600 font-medium">Vlera e Stokut</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">
                    {formatCurrency(stockValue)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-600 font-medium">Sasia Aktuale</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{product.current_stock}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-600 font-medium">Stoku Minimal</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{product.min_stock}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Niveli i Stokut</p>
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${stockBarColor}`}
                    style={{ width: `${stockPercent}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-400">0</span>
                  <span className="text-xs text-gray-400">
                    {product.current_stock} / {stockMax}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Levizjet e Fundit te Stokut
                </h3>
                {recentMovements.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">
                    Nuk ka levizje stoku
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                            Data
                          </th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                            Tipi
                          </th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                            Sasia
                          </th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                            Referenca
                          </th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                            Shenime
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {recentMovements.map((mv) => (
                          <tr key={mv.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {formatDate(mv.created_at)}
                            </td>
                            <td className="px-4 py-2">{getMovementBadge(mv.movement_type)}</td>
                            <td className="px-4 py-2 text-sm text-right font-medium">
                              <span
                                className={
                                  mv.quantity > 0 ? 'text-green-600' : 'text-red-600'
                                }
                              >
                                {mv.quantity > 0 ? '+' : ''}
                                {mv.quantity}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                              {mv.reference_type || '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500 max-w-[200px] truncate">
                              {mv.notes || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sales' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-emerald-50 rounded-xl p-4">
                  <p className="text-sm text-emerald-600 font-medium">Totali i Shitur</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{totalUnitsSold}</p>
                  <p className="text-xs text-emerald-500 mt-0.5">njesi</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4">
                  <p className="text-sm text-emerald-600 font-medium">Te Ardhurat</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">
                    {formatCurrency(totalRevenue)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-600 font-medium">Fatura</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{uniqueInvoices}</p>
                </div>
              </div>

              {filteredSalesItems.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  Nuk ka shitje per kete produkt
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Fatura
                        </th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Klienti
                        </th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Data
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Sasia
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Cmimi
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Totali
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredSalesItems.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <span
                              onClick={() =>
                                navigate(`/accounting/invoices`)
                              }
                              className="text-sm font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer"
                            >
                              {item.invoice?.invoice_number}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {item.invoice?.contact?.name || '-'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {item.invoice?.invoice_date
                              ? formatDate(item.invoice.invoice_date)
                              : '-'}
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-gray-600">
                            {formatCurrency(item.unit_price)}
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900">
                            {formatCurrency(item.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'purchases' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-600 font-medium">Totali i Blere</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">{totalUnitsPurchased}</p>
                  <p className="text-xs text-blue-500 mt-0.5">njesi</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-600 font-medium">Kostoja Totale</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">
                    {formatCurrency(totalCost)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-600 font-medium">Blerje</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{uniquePurchases}</p>
                </div>
              </div>

              {filteredPurchaseItems.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  Nuk ka blerje per kete produkt
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Blerja
                        </th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Furnitori
                        </th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Data
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Sasia
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Cmimi
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Totali
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredPurchaseItems.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <span
                              onClick={() =>
                                navigate(`/accounting/purchases`)
                              }
                              className="text-sm font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer"
                            >
                              {item.purchase?.purchase_number}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {item.purchase?.contact?.name || '-'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {item.purchase?.purchase_date
                              ? formatDate(item.purchase.purchase_date)
                              : '-'}
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-gray-600">
                            {formatCurrency(item.unit_price)}
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900">
                            {formatCurrency(item.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'movements' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={movementTypeFilter}
                  onChange={(e) => setMovementTypeFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                >
                  <option value="all">Te gjitha tipet</option>
                  <option value="in">Hyrje</option>
                  <option value="out">Dalje</option>
                  <option value="adjustment">Rregullim</option>
                  <option value="return">Kthim</option>
                </select>
              </div>

              {allMovementsFiltered.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  Nuk ka levizje stoku
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Data
                        </th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Tipi
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Sasia
                        </th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Cmimi
                        </th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Ref. Tipi
                        </th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Ref. ID
                        </th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          Shenime
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {allMovementsFiltered.map((mv) => (
                        <tr key={mv.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {formatDate(mv.created_at)}
                          </td>
                          <td className="px-4 py-2">{getMovementBadge(mv.movement_type)}</td>
                          <td className="px-4 py-2 text-sm text-right font-medium">
                            <span
                              className={
                                mv.quantity > 0 ? 'text-green-600' : 'text-red-600'
                              }
                            >
                              {mv.quantity > 0 ? '+' : ''}
                              {mv.quantity}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-gray-600">
                            {formatCurrency(mv.unit_price)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500">
                            {mv.reference_type || '-'}
                          </td>
                          <td className="px-4 py-2 text-sm">
                            {mv.reference_id ? (
                              <span className="text-emerald-600 font-medium">
                                {mv.reference_id.substring(0, 8)}...
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500 max-w-[200px] truncate">
                            {mv.notes || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showAdjustModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={closeAdjustModal} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="border-b border-gray-100 px-6 py-4 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Rregullim Stoku</h2>
                  <button
                    onClick={closeAdjustModal}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Sasia Aktuale</p>
                  <p className="text-2xl font-bold text-gray-900">{product.current_stock}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sasia e Re
                  </label>
                  <input
                    type="number"
                    value={adjustNewQty}
                    onChange={(e) => setAdjustNewQty(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  />
                </div>

                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-sm text-gray-500">Ndryshimi</p>
                  <p
                    className={`text-lg font-bold ${
                      adjustNewQty - product.current_stock > 0
                        ? 'text-green-600'
                        : adjustNewQty - product.current_stock < 0
                          ? 'text-red-600'
                          : 'text-gray-400'
                    }`}
                  >
                    {adjustNewQty - product.current_stock > 0 ? '+' : ''}
                    {adjustNewQty - product.current_stock}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Arsyeja *
                  </label>
                  <textarea
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                    placeholder={t('common.writeReasonPlaceholder')}
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 px-6 py-4 rounded-b-2xl flex items-center justify-end gap-3">
                <button
                  onClick={closeAdjustModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  Anulo
                </button>
                <button
                  onClick={handleSaveAdjustment}
                  disabled={savingAdjust || !adjustReason.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {savingAdjust && <Loader2 className="w-4 h-4 animate-spin" />}
                  Ruaj Rregullimin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={closeEditModal} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl z-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Ndrysho Produktin</h2>
                  <button
                    onClick={closeEditModal}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Foto e Produktit
                  </label>
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                      isDragging
                        ? 'border-emerald-400 bg-emerald-50'
                        : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50'
                    }`}
                  >
                    {imagePreview ? (
                      <div className="flex flex-col items-center gap-3">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-32 h-32 object-cover rounded-xl"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">
                            Kliko ose terhiq per te ndryshuar
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFile(null);
                              setImagePreview(product?.image_url || null);
                            }}
                            className="p-1 text-red-400 hover:text-red-600 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                          <Upload className="w-6 h-6 text-gray-400" />
                        </div>
                        <p className="text-sm text-gray-600">Terhiq dhe lesho imazhin ketu</p>
                        <p className="text-xs text-gray-400">
                          ose kliko per te zgjedhur. Max 2MB (JPEG, PNG, WebP)
                        </p>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Emri *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder={t('common.productName')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      placeholder={t('common.productCode')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Njesia</label>
                    <select
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    >
                      {UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Pershkrimi
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                      placeholder={t('common.productDescription')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cmimi Neto
                    </label>
                    <input
                      type="number"
                      value={formData.price_net}
                      onChange={(e) =>
                        setFormData({ ...formData, price_net: parseFloat(e.target.value) || 0 })
                      }
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Shkalla TVSH
                    </label>
                    <select
                      value={formData.vat_rate}
                      onChange={(e) => setFormData({ ...formData, vat_rate: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    >
                      {vatRates.map((v) => (
                        <option key={`${v.rate_type}-${v.value}`} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Kategoria
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={formData.category_id}
                        onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      >
                        <option value="">Pa kategori</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewCategory(!showNewCategory)}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-200"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {showNewCategory && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder={t('common.categoryName')}
                          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCategory();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddCategory}
                          disabled={savingCategory || !newCategoryName.trim()}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {savingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ruaj'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Stoku Minimal
                    </label>
                    <input
                      type="number"
                      value={formData.min_stock}
                      onChange={(e) =>
                        setFormData({ ...formData, min_stock: parseInt(e.target.value) || 0 })
                      }
                      min="0"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 sm:px-6 py-3 sm:py-4 rounded-b-2xl flex items-center justify-end gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  onClick={closeEditModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  Anulo
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving || uploadingImage}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {(saving || uploadingImage) && <Loader2 className="w-4 h-4 animate-spin" />}
                  Ruaj Ndryshimet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
