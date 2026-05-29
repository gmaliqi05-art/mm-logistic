import { useState, useEffect, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Package, X, AlertTriangle, Upload, Image as ImageIcon, Loader2, Trash2, CreditCard as Edit3, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { AccProduct, AccProductCategory } from '../../types/accounting';
import { UNITS, formatCurrency } from '../../types/accounting';
import EmptyState from '../../components/ui/EmptyState';
import { useCountryVatRates } from '../../hooks/useCountryVatRates';
import { compareProducts } from '../../utils/productSort';

type StockFilter = 'all' | 'in-stock' | 'low-stock' | 'out-of-stock';

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

export default function Products() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { rates: vatRates, standardRate: defaultVat } = useCountryVatRates();

  const [products, setProducts] = useState<AccProduct[]>([]);
  const [categories, setCategories] = useState<AccProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStock, setFilterStock] = useState<StockFilter>('all');
  const [filterVat, setFilterVat] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AccProduct | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(() => makeInitialFormData(defaultVat));

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  useEffect(() => {
    if (profile?.company_id) fetchData();
  }, [profile?.company_id]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;

      const [productsRes, categoriesRes] = await Promise.all([
        supabase
          .from('acc_products')
          .select('*, category:acc_product_categories(id, name)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('acc_product_categories')
          .select('*')
          .eq('company_id', companyId)
          .order('sort_order', { ascending: true }),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setProducts(productsRes.data ?? []);
      setCategories(categoriesRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [profile?.company_id]);

  const filteredProducts = products
    .slice()
    .sort((a, b) =>
      compareProducts(
        a,
        b,
        (p) => p.category?.name ?? null,
        (p) => p.name,
      ),
    )
    .filter((p) => {
    if (!p.is_active) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = p.name.toLowerCase().includes(q);
      const matchesSku = p.sku?.toLowerCase().includes(q);
      const matchesDesc = p.description?.toLowerCase().includes(q);
      if (!matchesName && !matchesSku && !matchesDesc) return false;
    }

    if (filterCategory && p.category_id !== filterCategory) return false;

    if (filterStock === 'in-stock' && p.current_stock <= p.min_stock) return false;
    if (filterStock === 'low-stock' && !(p.current_stock > 0 && p.current_stock <= p.min_stock)) return false;
    if (filterStock === 'out-of-stock' && p.current_stock > 0) return false;

    if (filterVat && p.vat_rate !== Number(filterVat)) return false;

    return true;
  });

  const getStockBadge = (product: AccProduct) => {
    if (product.current_stock <= 0) {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Pa Stok</span>;
    }
    if (product.current_stock <= product.min_stock) {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Stok i Ulet</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Ne Stok</span>;
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData(makeInitialFormData(defaultVat));
    setSelectedFile(null);
    setImagePreview(null);
    setShowModal(true);
  };

  const openEditModal = (product: AccProduct) => {
    setEditingProduct(product);
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
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
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

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError(t('accounting.products.nameRequired') || 'Emri i produktit eshte i detyrueshem');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const companyId = profile!.company_id!;

      const payload = {
        company_id: companyId,
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        description: formData.description.trim(),
        unit: formData.unit,
        price_net: Number(formData.price_net),
        vat_rate: Number(formData.vat_rate),
        category_id: formData.category_id || null,
        min_stock: Number(formData.min_stock),
      };

      if (editingProduct) {
        if (selectedFile && editingProduct.image_url) {
          await deleteOldImage(editingProduct.image_url);
        }

        const { error: updateError } = await supabase
          .from('acc_products')
          .update(payload)
          .eq('id', editingProduct.id);
        if (updateError) throw updateError;

        if (selectedFile) {
          const publicUrl = await uploadImage(editingProduct.id, selectedFile);
          if (publicUrl) {
            await supabase
              .from('acc_products')
              .update({ image_url: publicUrl })
              .eq('id', editingProduct.id);
          }
        }
      } else {
        const { data: newProduct, error: insertError } = await supabase
          .from('acc_products')
          .insert(payload)
          .select()
          .single();
        if (insertError) throw insertError;

        if (selectedFile && newProduct) {
          const publicUrl = await uploadImage(newProduct.id, selectedFile);
          if (publicUrl) {
            await supabase
              .from('acc_products')
              .update({ image_url: publicUrl })
              .eq('id', newProduct.id);
          }
        }
      }

      closeModal();
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim gjate ruajtjes');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (product: AccProduct) => {
    try {
      const { error: toggleError } = await supabase
        .from('acc_products')
        .update({ is_active: !product.is_active })
        .eq('id', product.id);
      if (toggleError) throw toggleError;
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gabim');
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produktet</h1>
          <p className="text-gray-500 mt-1">Menaxho produktet dhe sherbimet</p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Shto Produkt
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('accounting.products.searchPlaceholder') || 'Kerko emrin, SKU, pershkrimin...'}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
          >
            <option value="">Te gjitha kategorite</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={filterStock}
            onChange={(e) => setFilterStock(e.target.value as StockFilter)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
          >
            <option value="all">Te gjitha stokut</option>
            <option value="in-stock">Ne Stok</option>
            <option value="low-stock">Stok i Ulet</option>
            <option value="out-of-stock">Pa Stok</option>
          </select>
          <select
            value={filterVat}
            onChange={(e) => setFilterVat(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
          >
            <option value="">Te gjitha TVSH</option>
            {vatRates.map((v) => (
              <option key={`${v.rate_type}-${v.value}`} value={v.value}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Produkti</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Njesia</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cmimi Neto</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">TVSH</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stoku</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Min</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Statusi</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Veprime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-0">
                    <EmptyState
                      icon={Package}
                      title={t('accounting.products.noProducts')}
                      hint={t('accounting.products.noProductsHint') || 'Shto produktin e pare duke klikuar butonin lart'}
                      action={{
                        label: t('accounting.products.addProduct'),
                        onClick: openCreateModal,
                        icon: Plus,
                      }}
                    />
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    onClick={() => navigate(`/accounting/products/${product.id}`)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900">{product.name}</p>
                          {product.category && (
                            <p className="text-xs text-gray-500">{product.category.name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{product.sku || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {UNITS.find((u) => u.value === product.unit)?.label || product.unit}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {formatCurrency(product.price_net)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{product.vat_rate}%</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{product.current_stock}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{product.min_stock}</td>
                    <td className="px-6 py-4">{getStockBadge(product)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openEditModal(product)}
                          className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleActive(product)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <EyeOff className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden divide-y divide-gray-100">
          {filteredProducts.length === 0 ? (
            <EmptyState
              icon={Package}
              title={t('accounting.products.noProducts')}
              hint={t('accounting.products.noProductsHint') || 'Shto produktin e pare duke klikuar butonin lart'}
              action={{
                label: t('accounting.products.addProduct'),
                onClick: openCreateModal,
                icon: Plus,
              }}
            />
          ) : (
            filteredProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => navigate(`/accounting/products/${product.id}`)}
                className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                      {getStockBadge(product)}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {product.sku && <span className="text-xs text-gray-500">SKU: {product.sku}</span>}
                      <span className="text-xs text-gray-500">{product.vat_rate}% TVSH</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-semibold text-gray-900">{formatCurrency(product.price_net)}</span>
                      <span className="text-xs text-gray-500">Stoku: {product.current_stock} / Min: {product.min_stock}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openEditModal(product)}
                      className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleActive(product)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={closeModal} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl z-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {editingProduct ? 'Ndrysho Produktin' : 'Shto Produkt te Ri'}
                  </h2>
                  <button
                    onClick={closeModal}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Foto e Produktit</label>
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
                          <span className="text-sm text-gray-500">Kliko ose terhiq per te ndryshuar</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFile(null);
                              setImagePreview(editingProduct?.image_url || null);
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
                        <p className="text-xs text-gray-400">ose kliko per te zgjedhur. Max 2MB (JPEG, PNG, WebP)</p>
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
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pershkrimi</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                      placeholder={t('common.productDescription')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cmimi Neto</label>
                    <input
                      type="number"
                      value={formData.price_net}
                      onChange={(e) => setFormData({ ...formData, price_net: parseFloat(e.target.value) || 0 })}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shkalla TVSH</label>
                    <select
                      value={formData.vat_rate}
                      onChange={(e) => setFormData({ ...formData, vat_rate: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    >
                      {vatRates.map((v) => (
                        <option key={`${v.rate_type}-${v.value}`} value={v.value}>{v.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kategoria</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={formData.category_id}
                        onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      >
                        <option value="">Pa kategori</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stoku Minimal</label>
                    <input
                      type="number"
                      value={formData.min_stock}
                      onChange={(e) => setFormData({ ...formData, min_stock: parseInt(e.target.value) || 0 })}
                      min="0"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 sm:px-6 py-3 sm:py-4 rounded-b-2xl flex items-center justify-end gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  Anulo
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || uploadingImage}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {(saving || uploadingImage) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingProduct ? 'Ruaj Ndryshimet' : 'Shto Produktin'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
