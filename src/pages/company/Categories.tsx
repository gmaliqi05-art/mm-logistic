import { useState, useEffect, useMemo, useRef } from 'react';
import { Tags, Plus, CreditCard as Edit2, Trash2, X, AlertTriangle, Loader2, Search, Package, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import FeatureGate from '../../components/subscription/FeatureGate';
import type { ProductCategory, SortingMode } from '../../types';
import { compareCategoriesByPriority, compareProducts } from '../../utils/productSort';

interface CategoryProduct {
  id: string;
  company_id: string;
  category_id: string;
  name: string;
  description: string;
  is_active: boolean;
  price_net?: number | null;
  vat_rate?: number | null;
  unit?: string | null;
  sku?: string | null;
  aliases?: string[] | null;
  keywords?: string[] | null;
  dimensions?: string | null;
  default_condition?: string | null;
  created_at: string;
  updated_at: string;
}

const CONDITION_OPTIONS = [
  { value: '', label: '-- Auto --' },
  { value: 'good', label: 'I mire' },
  { value: 'damaged', label: 'Me defekt' },
  { value: 'repaired', label: 'Riparuar' },
  { value: 'sorting', label: 'Per sortim' },
  { value: 'ready_a', label: 'Klasa A' },
  { value: 'ready_b', label: 'Klasa B' },
  { value: 'ready_c', label: 'Klasa C' },
];

const UNIT_OPTIONS = ['pcs', 'kg', 'liter', 'hour', 'meter', 'package', 'set'] as const;
const VAT_OPTIONS = [0, 7, 19] as const;

type AddMode = 'category' | 'product';

function CategoriesContent() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchCategory, setSearchCategory] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropRef = useRef<HTMLDivElement>(null);

  const [showModal, setShowModal] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('category');
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [editingProduct, setEditingProduct] = useState<CategoryProduct | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formPrice, setFormPrice] = useState('0');
  const [formVat, setFormVat] = useState<number>(19);
  const [formUnit, setFormUnit] = useState<string>('pcs');
  const [formSku, setFormSku] = useState('');
  const [formSortingMode, setFormSortingMode] = useState<SortingMode>('none');
  const [formAliases, setFormAliases] = useState<string>('');
  const [formProdAliases, setFormProdAliases] = useState<string>('');
  const [formProdKeywords, setFormProdKeywords] = useState<string>('');
  const [formProdDimensions, setFormProdDimensions] = useState<string>('');
  const [formProdDefaultCondition, setFormProdDefaultCondition] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.company_id) fetchAll();
  }, [profile?.company_id]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!categoryDropRef.current) return;
      if (!categoryDropRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function fetchAll() {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;
      const [catRes, prodRes] = await Promise.all([
        supabase
          .from('product_categories')
          .select('*')
          .eq('company_id', companyId)
          .order('name'),
        supabase
          .from('category_products')
          .select('*')
          .eq('company_id', companyId)
          .order('name'),
      ]);
      if (catRes.error) throw catRes.error;
      if (prodRes.error) throw prodRes.error;
      setCategories(catRes.data ?? []);
      setProducts(prodRes.data ?? []);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormName('');
    setFormDesc('');
    setFormCategoryId('');
    setFormPrice('0');
    setFormVat(19);
    setFormUnit('pcs');
    setFormSku('');
    setFormSortingMode('none');
    setFormAliases('');
    setFormProdAliases('');
    setFormProdKeywords('');
    setFormProdDimensions('');
    setFormProdDefaultCondition('');
    setEditingCategory(null);
    setEditingProduct(null);
  }

  function openAddNew() {
    resetForm();
    setAddMode(selectedCategoryId ? 'product' : 'category');
    if (selectedCategoryId) setFormCategoryId(selectedCategoryId);
    setShowModal(true);
  }

  function openEditCategory(cat: ProductCategory) {
    resetForm();
    setEditingCategory(cat);
    setAddMode('category');
    setFormName(cat.name);
    setFormDesc(cat.description || '');
    setFormSortingMode(cat.sorting_mode || 'none');
    setFormAliases((cat.aliases || []).join(', '));
    setShowModal(true);
  }

  function openEditProduct(prod: CategoryProduct) {
    resetForm();
    setEditingProduct(prod);
    setAddMode('product');
    setFormName(prod.name);
    setFormDesc(prod.description || '');
    setFormCategoryId(prod.category_id);
    setFormPrice(prod.price_net != null ? String(prod.price_net) : '0');
    setFormVat(prod.vat_rate != null ? Number(prod.vat_rate) : 19);
    setFormUnit(prod.unit || 'pcs');
    setFormSku(prod.sku || '');
    setFormProdAliases((prod.aliases || []).join(', '));
    setFormProdKeywords((prod.keywords || []).join(', '));
    setFormProdDimensions(prod.dimensions || '');
    setFormProdDefaultCondition(prod.default_condition || '');
    setShowModal(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    if (addMode === 'product' && !formCategoryId) {
      setError(t('company.categories.selectCategoryFirst'));
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const companyId = profile!.company_id!;

      if (addMode === 'category') {
        const aliasesArr = formAliases
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (editingCategory) {
          const { error: err } = await supabase
            .from('product_categories')
            .update({
              name: formName.trim(),
              description: formDesc,
              sorting_mode: formSortingMode,
              aliases: aliasesArr,
            })
            .eq('id', editingCategory.id);
          if (err) throw err;
        } else {
          const { error: err } = await supabase.from('product_categories').insert({
            company_id: companyId,
            name: formName.trim(),
            description: formDesc,
            sorting_mode: formSortingMode,
            aliases: aliasesArr,
          });
          if (err) throw err;
        }
      } else {
        const priceVal = Number(formPrice.replace(',', '.')) || 0;
        const vatVal = VAT_OPTIONS.includes(formVat as any) ? formVat : 19;
        const unitVal = UNIT_OPTIONS.includes(formUnit as any) ? formUnit : 'pcs';
        const prodAliasesArr = formProdAliases.split(',').map((s) => s.trim()).filter(Boolean);
        const prodKeywordsArr = formProdKeywords.split(',').map((s) => s.trim()).filter(Boolean);
        const prodDimensions = formProdDimensions.trim() || null;
        const prodDefaultCondition = formProdDefaultCondition || null;
        if (editingProduct) {
          const { error: err } = await supabase
            .from('category_products')
            .update({
              name: formName.trim(),
              description: formDesc,
              category_id: formCategoryId,
              price_net: priceVal,
              vat_rate: vatVal,
              unit: unitVal,
              sku: formSku.trim(),
              aliases: prodAliasesArr,
              keywords: prodKeywordsArr,
              dimensions: prodDimensions,
              default_condition: prodDefaultCondition,
              updated_at: new Date().toISOString(),
            })
            .eq('id', editingProduct.id);
          if (err) throw err;
        } else {
          const { error: err } = await supabase.from('category_products').insert({
            company_id: companyId,
            category_id: formCategoryId,
            name: formName.trim(),
            description: formDesc,
            price_net: priceVal,
            vat_rate: vatVal,
            unit: unitVal,
            sku: formSku.trim(),
            aliases: prodAliasesArr,
            keywords: prodKeywordsArr,
            dimensions: prodDimensions,
            default_condition: prodDefaultCondition,
          });
          if (err) throw err;
        }
      }

      setShowModal(false);
      resetForm();
      await fetchAll();
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCategory(id: string) {
    if (!window.confirm(t('company.categories.confirmDelete'))) return;
    try {
      const { error: err } = await supabase.from('product_categories').delete().eq('id', id);
      if (err) throw err;
      if (selectedCategoryId === id) setSelectedCategoryId(null);
      await fetchAll();
    } catch (err: any) {
      setError(err.message || t('common.error'));
    }
  }

  async function handleToggleProductActive(prod: CategoryProduct) {
    try {
      setError(null);
      const next = !prod.is_active;
      setProducts((prev) => prev.map((p) => (p.id === prod.id ? { ...p, is_active: next } : p)));
      const { error: err } = await supabase
        .from('category_products')
        .update({ is_active: next, updated_at: new Date().toISOString() })
        .eq('id', prod.id);
      if (err) {
        setProducts((prev) => prev.map((p) => (p.id === prod.id ? { ...p, is_active: !next } : p)));
        throw err;
      }
    } catch (err: any) {
      setError(err.message || t('common.errorSaving'));
    }
  }

  async function handleDeleteProduct(id: string) {
    if (!window.confirm(t('company.categories.confirmDeleteProduct'))) return;
    try {
      const { error: err } = await supabase.from('category_products').delete().eq('id', id);
      if (err) throw err;
      await fetchAll();
    } catch (err: any) {
      setError(err.message || t('common.error'));
    }
  }

  const sortedCategories = useMemo(
    () => categories.slice().sort((a, b) => compareCategoriesByPriority(a.name, b.name)),
    [categories],
  );

  const filteredCategories = useMemo(() => {
    const q = searchCategory.trim().toLowerCase();
    if (!q) return sortedCategories;
    return sortedCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [sortedCategories, searchCategory]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  const filteredProducts = useMemo(() => {
    let list = products.slice();
    if (selectedCategoryId) list = list.filter((p) => p.category_id === selectedCategoryId);
    const q = searchProduct.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return list.sort((a, b) =>
      compareProducts(
        a,
        b,
        (p) => categoryNameById.get(p.category_id) ?? null,
        (p) => p.name,
      ),
    );
  }, [products, selectedCategoryId, searchProduct, categoryNameById]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId]
  );

  const dropdownCategories = useMemo(() => {
    const q = searchCategory.trim().toLowerCase();
    if (!q) return sortedCategories;
    return sortedCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [sortedCategories, searchCategory]);

  if (loading) {
    return <PageSkeleton showStats={false} rows={8} cols={4} />;
  }

  const productCountByCat = new Map<string, number>();
  const inactiveCountByCat = new Map<string, number>();
  for (const p of products) {
    productCountByCat.set(p.category_id, (productCountByCat.get(p.category_id) ?? 0) + 1);
    if (p.is_active === false) {
      inactiveCountByCat.set(p.category_id, (inactiveCountByCat.get(p.category_id) ?? 0) + 1);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('company.categories.title')}</h1>
          <p className="text-gray-500 mt-1">{t('company.categories.subtitle')}</p>
        </div>
        <button
          onClick={openAddNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('company.categories.addNew')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                {t('company.categories.columnCategory')}
              </h3>
              <span className="text-xs text-gray-400">{filteredCategories.length}</span>
            </div>
            <div className="relative" ref={categoryDropRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchCategory}
                onChange={(e) => {
                  setSearchCategory(e.target.value);
                  setCategoryDropdownOpen(true);
                }}
                onFocus={() => setCategoryDropdownOpen(true)}
                placeholder={t('company.categories.searchCategory')}
                className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
              />
              <button
                type="button"
                onClick={() => setCategoryDropdownOpen((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {categoryDropdownOpen && dropdownCategories.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId(null);
                      setSearchCategory('');
                      setCategoryDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-teal-50 ${
                      selectedCategoryId === null ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {t('common.all')}
                  </button>
                  {dropdownCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(c.id);
                        setSearchCategory(c.name);
                        setCategoryDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-teal-50 flex items-center justify-between ${
                        selectedCategoryId === c.id ? 'bg-teal-50 text-teal-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Tags className="w-3.5 h-3.5 text-teal-500" />
                        {c.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {productCountByCat.get(c.id) ?? 0}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-gray-100 rounded-lg overflow-hidden">
              {filteredCategories.length === 0 ? (
                <div className="px-4 py-10 text-center text-gray-400">
                  <Tags className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">{t('company.categories.noCategories')}</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {filteredCategories.map((cat) => {
                    const isSelected = selectedCategoryId === cat.id;
                    return (
                      <li
                        key={cat.id}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                          isSelected ? 'bg-teal-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedCategoryId(isSelected ? null : cat.id)}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-teal-600 text-white' : 'bg-teal-100 text-teal-600'
                        }`}>
                          <Tags className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{cat.name}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {productCountByCat.get(cat.id) ?? 0} {t('company.categories.productsCount')}
                            {(inactiveCountByCat.get(cat.id) ?? 0) > 0 && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                                <EyeOff className="w-2.5 h-2.5" />
                                {inactiveCountByCat.get(cat.id)} joaktiv
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditCategory(cat); }}
                            className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                {t('company.categories.columnProduct')}
                {selectedCategory && (
                  <span className="ml-2 text-xs font-normal text-teal-600 normal-case">
                    / {selectedCategory.name}
                  </span>
                )}
              </h3>
              <span className="text-xs text-gray-400">{filteredProducts.length}</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchProduct}
                onChange={(e) => setSearchProduct(e.target.value)}
                placeholder={t('company.categories.searchProduct')}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                disabled={categories.length === 0}
              />
            </div>

            <div className="border border-gray-100 rounded-lg overflow-hidden">
              {filteredProducts.length === 0 ? (
                <div className="px-4 py-10 text-center text-gray-400">
                  <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">
                    {selectedCategoryId
                      ? t('company.categories.noProductsInCategory')
                      : t('company.categories.selectCategoryFirst')}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {filteredProducts.map((prod) => {
                    const catName = categories.find((c) => c.id === prod.category_id)?.name ?? '-';
                    const inactive = prod.is_active === false;
                    return (
                      <li
                        key={prod.id}
                        className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors ${
                          inactive ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            inactive ? 'bg-gray-100 text-gray-400' : 'bg-cyan-100 text-cyan-700'
                          }`}
                        >
                          <Package className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className={`text-sm font-medium truncate ${
                                inactive ? 'text-gray-500' : 'text-gray-900'
                              }`}
                            >
                              {prod.name}
                            </p>
                            {inactive && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 flex-shrink-0">
                                <EyeOff className="w-3 h-3" />
                                Joaktiv
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            {catName}{prod.description ? ` \u00b7 ${prod.description}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleToggleProductActive(prod)}
                            title={inactive ? 'Aktivizo produktin' : 'Cakto si joaktiv'}
                            className={`p-1.5 rounded transition-colors ${
                              inactive
                                ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-100'
                                : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            {inactive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => openEditProduct(prod)}
                            className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(prod.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-lg modal-panel flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingCategory
                  ? t('company.categories.editCategory')
                  : editingProduct
                  ? t('company.categories.editProduct')
                  : t('company.categories.addNew')}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 modal-body-scroll flex-1">
              {!editingCategory && !editingProduct && (
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setAddMode('category')}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      addMode === 'category' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500'
                    }`}
                  >
                    {t('company.categories.columnCategory')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddMode('product')}
                    disabled={categories.length === 0}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      addMode === 'product' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {t('company.categories.columnProduct')}
                  </button>
                </div>
              )}

              {addMode === 'product' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('company.categories.columnCategory')}
                  </label>
                  <select
                    value={formCategoryId}
                    onChange={(e) => setFormCategoryId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  >
                    <option value="">{t('company.categories.selectCategory')}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {addMode === 'category'
                    ? t('company.categories.categoryName')
                    : t('company.categories.productName')}
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  placeholder={
                    addMode === 'category' ? 'Euro Palette, EPAL...' : 'A Kualitet, B Kualitet...'
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('common.description')}
                </label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
                  placeholder={t('common.description')}
                />
              </div>

              {addMode === 'category' && (
                <div className="rounded-lg border border-teal-100 bg-teal-50/40 p-3 space-y-3">
                  <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                    {t('company.categories.sortingSection')}
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {t('company.categories.sortingMode')}
                    </label>
                    <select
                      value={formSortingMode}
                      onChange={(e) => setFormSortingMode(e.target.value as SortingMode)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm bg-white"
                    >
                      <option value="none">{t('company.categories.sortingNone')}</option>
                      <option value="class">{t('company.categories.sortingClass')}</option>
                      <option value="type">{t('company.categories.sortingType')}</option>
                    </select>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {formSortingMode === 'class' && t('company.categories.sortingClassHint')}
                      {formSortingMode === 'type' && t('company.categories.sortingTypeHint')}
                      {formSortingMode === 'none' && t('company.categories.sortingNoneHint')}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {t('company.categories.aliases')}
                    </label>
                    <input
                      type="text"
                      value={formAliases}
                      onChange={(e) => setFormAliases(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm bg-white"
                      placeholder="EPAL, UIC, Euro Palette"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      {t('company.categories.aliasesHint')}
                    </p>
                  </div>
                </div>
              )}

              {addMode === 'product' && (
                <div className="rounded-lg border border-teal-100 bg-teal-50/40 p-3 space-y-3">
                  <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                    Te dhena per fature (opsionale)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Cmimi neto</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formPrice}
                        onChange={(e) => setFormPrice(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm bg-white"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">TVSH %</label>
                      <select
                        value={formVat}
                        onChange={(e) => setFormVat(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm bg-white"
                      >
                        {VAT_OPTIONS.map((v) => (
                          <option key={v} value={v}>{v}%</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Njesia</label>
                      <select
                        value={formUnit}
                        onChange={(e) => setFormUnit(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm bg-white"
                      >
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
                      <input
                        type="text"
                        value={formSku}
                        onChange={(e) => setFormSku(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm bg-white"
                        placeholder="(opsionale)"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-teal-700/80">
                    Keto te dhena perdoren per krijim te fatures ne Kontabilitet.
                  </p>
                </div>
              )}

              {addMode === 'product' && (
                <div className="rounded-lg border border-sky-100 bg-sky-50/40 p-3 space-y-3">
                  <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide">
                    Identifikim automatik ne fatura & fletedergesa
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Emra alternative (aliases)
                    </label>
                    <input
                      type="text"
                      value={formProdAliases}
                      onChange={(e) => setFormProdAliases(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm bg-white"
                      placeholder="Europalette B Qualität, EUR-Flachpalette gebraucht"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Ndaj me presje. Nese ndonje nga keto tekste gjendet ne fature, produkti identifikohet automatikisht.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Fjale kyce (keywords)
                    </label>
                    <input
                      type="text"
                      value={formProdKeywords}
                      onChange={(e) => setFormProdKeywords(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm bg-white"
                      placeholder="gebraucht, tauschfähig, Klasse B"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Ndaj me presje. Cdo fjale kyce qe gjendet shton besueshmeri ne identifikim.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Permasat
                      </label>
                      <input
                        type="text"
                        value={formProdDimensions}
                        onChange={(e) => setFormProdDimensions(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm bg-white"
                        placeholder="1200x800"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">Format: GGGxLLL (mm)</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Kushti default
                      </label>
                      <select
                        value={formProdDefaultCondition}
                        onChange={(e) => setFormProdDefaultCondition(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm bg-white"
                      >
                        {CONDITION_OPTIONS.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-gray-500 mt-1">Vendoset automatikisht kur zgjidhet produkti.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer flex items-center justify-end gap-3 p-6 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || (addMode === 'product' && !formCategoryId)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingCategory || editingProduct ? t('common.saveChanges') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CompanyCategories() {
  return (
    <FeatureGate feature="categories">
      <CategoriesContent />
    </FeatureGate>
  );
}
