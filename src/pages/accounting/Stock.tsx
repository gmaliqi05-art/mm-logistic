import { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Search,
  AlertTriangle,
  X,
  Loader2,
  ArrowDownUp,
  RotateCcw,
  CornerDownLeft,
  Image as ImageIcon,
  Boxes,
  DollarSign,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import type { AccProduct, AccProductCategory, AccStockMovement, AccMovementType } from '../../types/accounting';
import { formatCurrency } from '../../types/accounting';
import { compareProducts } from '../../utils/productSort';

interface AdjustmentModal {
  product: AccProduct;
  newQty: number;
  reason: string;
}

type StockFilter = 'all' | 'in-stock' | 'low-stock' | 'out-of-stock';

export default function Stock() {
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [products, setProducts] = useState<AccProduct[]>([]);
  const [categories, setCategories] = useState<AccProductCategory[]>([]);
  const [movements, setMovements] = useState<(AccStockMovement & { product?: AccProduct })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStock, setFilterStock] = useState<StockFilter>('all');

  const [adjustmentModal, setAdjustmentModal] = useState<AdjustmentModal | null>(null);

  useEffect(() => {
    if (profile?.company_id) fetchData();
  }, [profile?.company_id]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const companyId = profile!.company_id!;

      const [productsRes, categoriesRes, movementsRes] = await Promise.all([
        supabase
          .from('acc_products')
          .select('*, category:acc_product_categories(id, name)')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('name', { ascending: true }),
        supabase
          .from('acc_product_categories')
          .select('*')
          .eq('company_id', companyId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('acc_stock_movements')
          .select('*, product:acc_products(id, name, image_url)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (movementsRes.error) throw movementsRes.error;

      setProducts(productsRes.data ?? []);
      setCategories(categoriesRes.data ?? []);
      setMovements(movementsRes.data ?? []);
    } catch (err: any) {
      setError(err.message || t('common.errorLoading'));
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
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !p.name.toLowerCase().includes(q) &&
        !p.sku?.toLowerCase().includes(q)
      )
        return false;
    }
    if (filterCategory && p.category_id !== filterCategory) return false;
    if (filterStock === 'in-stock' && p.current_stock <= p.min_stock) return false;
    if (filterStock === 'low-stock' && !(p.current_stock > 0 && p.current_stock <= p.min_stock)) return false;
    if (filterStock === 'out-of-stock' && p.current_stock > 0) return false;
    return true;
  });

  const totalProducts = products.length;
  const totalStockValue = products.reduce((sum, p) => sum + p.current_stock * p.price_net, 0);
  const inStockCount = products.filter((p) => p.current_stock > 0).length;
  const lowStockCount = products.filter((p) => p.current_stock > 0 && p.current_stock <= p.min_stock).length;

  const getStockBadge = (product: AccProduct) => {
    if (product.current_stock <= 0) {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Pa Stok</span>;
    }
    if (product.current_stock <= product.min_stock) {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Stok i Ulet</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Ne Stok</span>;
  };

  const getMovementBadge = (type: AccMovementType) => {
    const styles: Record<AccMovementType, { bg: string; label: string }> = {
      in: { bg: 'bg-green-100 text-green-700', label: 'Hyrje' },
      out: { bg: 'bg-red-100 text-red-700', label: 'Dalje' },
      adjustment: { bg: 'bg-blue-100 text-blue-700', label: 'Rregullim' },
      return: { bg: 'bg-amber-100 text-amber-700', label: 'Kthim' },
    };
    const s = styles[type];
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg}`}>{s.label}</span>;
  };

  const handleAdjustment = async () => {
    if (!adjustmentModal) return;
    try {
      setSaving(true);
      setError(null);
      const { product, newQty, reason } = adjustmentModal;
      const diff = newQty - product.current_stock;

      const { error: movError } = await supabase.from('acc_stock_movements').insert({
        company_id: profile!.company_id!,
        product_id: product.id,
        movement_type: 'adjustment' as AccMovementType,
        quantity: diff,
        unit_price: product.price_net,
        reference_type: 'manual',
        notes: reason,
        created_by: profile!.id,
      });
      if (movError) throw movError;

      const { error: updateError } = await supabase
        .from('acc_products')
        .update({ current_stock: newQty })
        .eq('id', product.id);
      if (updateError) throw updateError;

      setAdjustmentModal(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || 'Gabim gjate rregullimit te stokut');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Menaxhimi i Stokut</h1>
        <p className="text-gray-500 mt-1">Kontrollo inventarin dhe levizjet e stokut</p>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Totali Produkteve</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">{totalProducts}</p>
            </div>
            <div className="bg-emerald-500 p-2.5 rounded-xl">
              <Package className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Vlera e Stokut</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(totalStockValue)}</p>
            </div>
            <div className="bg-blue-500 p-2.5 rounded-xl">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ne Stok</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">{inStockCount}</p>
            </div>
            <div className="bg-green-500 p-2.5 rounded-xl">
              <Boxes className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stok i Ulet</p>
              <p className="text-2xl font-bold text-red-600 mt-2">{lowStockCount}</p>
            </div>
            <div className="bg-amber-500 p-2.5 rounded-xl">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Kerko produktin, SKU..."
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
            <option value="all">Te gjitha statuset</option>
            <option value="in-stock">Ne Stok</option>
            <option value="low-stock">Stok i Ulet</option>
            <option value="out-of-stock">Pa Stok</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Produkti</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stoku</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Min</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vlera</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Statusi</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Veprime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-gray-500 font-medium">Nuk ka produkte</p>
                    <p className="text-gray-400 text-sm mt-1">Asnje produkt nuk perputhet me filtrat</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-8 h-8 rounded-lg object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900">{product.name}</p>
                          {product.category && <p className="text-xs text-gray-500">{product.category.name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{product.sku || '-'}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">{product.current_stock}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 text-right">{product.min_stock}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                      {formatCurrency(product.current_stock * product.price_net)}
                    </td>
                    <td className="px-6 py-4 text-center">{getStockBadge(product)}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() =>
                          setAdjustmentModal({
                            product,
                            newQty: product.current_stock,
                            reason: '',
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                      >
                        <ArrowDownUp className="w-3.5 h-3.5" />
                        Rregullim
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <RotateCcw className="w-4.5 h-4.5 text-emerald-600" />
          <h2 className="font-semibold text-gray-900">Historia e Levizjeve</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Produkti</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lloji</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sasia</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Referenca</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Data</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Shenime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <CornerDownLeft className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-gray-500 font-medium">Asnje levizje stoku</p>
                    <p className="text-gray-400 text-sm mt-1">Levizjet e stokut do te shfaqen ketu</p>
                  </td>
                </tr>
              ) : (
                movements.map((mov) => (
                  <tr key={mov.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {(mov.product as any)?.image_url ? (
                          <img src={(mov.product as any).image_url} alt="" className="w-6 h-6 rounded object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center">
                            <Package className="w-3 h-3 text-gray-400" />
                          </div>
                        )}
                        <span className="text-sm text-gray-900">{(mov.product as any)?.name || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">{getMovementBadge(mov.movement_type)}</td>
                    <td className="px-6 py-3 text-sm font-medium text-right">
                      <span className={mov.quantity >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {mov.quantity >= 0 ? '+' : ''}{mov.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">{mov.reference_type || '-'}</td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {new Date(mov.created_at).toLocaleDateString('de-DE')}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500 truncate max-w-[200px]">{mov.notes || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adjustmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setAdjustmentModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Rregullim Stoku</h2>
              <button
                onClick={() => setAdjustmentModal(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Produkti</p>
                <p className="text-sm text-gray-900 mt-1">{adjustmentModal.product.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Sasia Aktuale</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{adjustmentModal.product.current_stock}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sasia e Re</label>
                <input
                  type="number"
                  value={adjustmentModal.newQty}
                  onChange={(e) =>
                    setAdjustmentModal({ ...adjustmentModal, newQty: parseInt(e.target.value) || 0 })
                  }
                  min="0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                />
                {adjustmentModal.newQty !== adjustmentModal.product.current_stock && (
                  <p className="text-xs mt-1">
                    <span className={adjustmentModal.newQty > adjustmentModal.product.current_stock ? 'text-green-600' : 'text-red-600'}>
                      {adjustmentModal.newQty > adjustmentModal.product.current_stock ? '+' : ''}
                      {adjustmentModal.newQty - adjustmentModal.product.current_stock}
                    </span>
                    {' '}ndryshim
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Arsyeja</label>
                <textarea
                  value={adjustmentModal.reason}
                  onChange={(e) =>
                    setAdjustmentModal({ ...adjustmentModal, reason: e.target.value })
                  }
                  rows={3}
                  placeholder="Arsyeja e rregullimit..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => setAdjustmentModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Anulo
              </button>
              <button
                onClick={handleAdjustment}
                disabled={saving || adjustmentModal.newQty === adjustmentModal.product.current_stock}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Ruaj Rregullimin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
