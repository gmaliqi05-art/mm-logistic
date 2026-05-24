import { supabase } from '../lib/supabase';
import { inferScanRows, parseLineItemsFromNotes, type ScanLineItem } from './scanLineInference';
import type { ProductLike, CategoryLike } from './productMatcher';

interface ApplyOptions {
  deliveryNoteId: string;
  companyId: string;
  lineItems?: ScanLineItem[] | null;
  notesFallback?: string | null;
  replaceExisting?: boolean;
}

/**
 * Inserts delivery_note_items rows from AI-extracted line items. When
 * `lineItems` is missing, falls back to parsing lines out of a notes blob.
 * Returns the count of rows inserted.
 */
export async function applyScanToDeliveryNote(opts: ApplyOptions): Promise<number> {
  const [prodsRes, catsRes] = await Promise.all([
    supabase.from('category_products').select('id, name, sku, category_id').eq('company_id', opts.companyId),
    supabase.from('product_categories').select('id, name').eq('company_id', opts.companyId),
  ]);
  const products = (prodsRes.data as ProductLike[] | null) ?? [];
  const categories = (catsRes.data as CategoryLike[] | null) ?? [];

  const items = opts.lineItems && opts.lineItems.length > 0
    ? opts.lineItems
    : parseLineItemsFromNotes(opts.notesFallback);

  const inferred = inferScanRows(items, products, categories);
  if (inferred.length === 0) return 0;

  if (opts.replaceExisting) {
    await supabase.from('delivery_note_items').delete().eq('delivery_note_id', opts.deliveryNoteId);
  }

  const rows = inferred.map((r) => ({
    delivery_note_id: opts.deliveryNoteId,
    product_id: r.match.productId,
    category_product_id: r.match.productId,
    category_id: r.match.categoryId,
    quantity: r.quantity,
    condition: r.condition,
    intended_action: r.intended_action,
    notes: `${r.description}${r.unit ? ' (' + r.unit + ')' : ''}`,
  }));

  const { error } = await supabase.from('delivery_note_items').insert(rows as any);
  if (error) throw error;
  return rows.length;
}
