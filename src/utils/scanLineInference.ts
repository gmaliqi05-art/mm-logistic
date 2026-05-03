import { matchProduct, type ProductLike, type CategoryLike, type MatchResult } from './productMatcher';

export type IntendedAction = 'stock' | 'sorting' | 'repair';
export type StockCondition = 'good' | 'damaged' | 'sorting' | 'ready_a' | 'ready_b' | 'ready_c';

export interface ScanLineItem {
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
}

export interface InferredRow {
  description: string;
  quantity: number;
  unit: string | null;
  condition: StockCondition;
  intended_action: IntendedAction;
  match: MatchResult;
}

export function deriveConditionAction(
  desc: string,
  productName?: string | null,
): { condition: StockCondition; intended_action: IntendedAction } {
  const d = `${desc || ''} ${productName || ''}`.toLowerCase();

  if (/\b(defekt|defect|damage|damaged|kaputt|broken|repair|riparim)\b/i.test(d)) {
    return { condition: 'damaged', intended_action: 'repair' };
  }
  if (/\b(klasse\s*a|\bkl\.?\s*a\b|class\s*a|a[- ]?qualit(a|ä)t|qualit(a|ä)t\s*a)\b/i.test(d)) {
    return { condition: 'ready_a', intended_action: 'sorting' };
  }
  if (/\b(klasse\s*b|\bkl\.?\s*b\b|class\s*b|b[- ]?qualit(a|ä)t|qualit(a|ä)t\s*b)\b/i.test(d)) {
    return { condition: 'ready_b', intended_action: 'sorting' };
  }
  if (/\b(klasse\s*c|\bkl\.?\s*c\b|class\s*c|c[- ]?qualit(a|ä)t|qualit(a|ä)t\s*c)\b/i.test(d)) {
    return { condition: 'ready_c', intended_action: 'sorting' };
  }
  if (/\b(sortier|sortir|sorting|mix|mischpalette|misch)\b/i.test(d)) {
    return { condition: 'sorting', intended_action: 'sorting' };
  }
  return { condition: 'good', intended_action: 'stock' };
}

export function inferScanRows(
  lineItems: ScanLineItem[] | null | undefined,
  products: ProductLike[],
  categories: CategoryLike[],
): InferredRow[] {
  if (!lineItems || lineItems.length === 0) return [];
  return lineItems
    .filter((li) => (li.description || '').trim().length > 0 && (li.quantity ?? 0) > 0)
    .map((li) => {
      const description = (li.description || '').trim();
      const match = matchProduct(description, products, categories);
      const matchedProduct = match.productId ? products.find((p) => p.id === match.productId) ?? null : null;
      const { condition, intended_action } = deriveConditionAction(description, matchedProduct?.name);
      return {
        description,
        quantity: Math.max(1, Math.round(li.quantity || 0)),
        unit: li.unit || null,
        condition,
        intended_action,
        match,
      };
    });
}

/**
 * Fallback parser: extracts "- 660 Stück x Europalette ..." style lines from
 * free-form notes text (used when the delivery note only has a notes blob and
 * no structured ai_extracted_json.line_items).
 */
export function parseLineItemsFromNotes(notes: string | null | undefined): ScanLineItem[] {
  if (!notes) return [];
  const lines = notes.split(/\r?\n/);
  const out: ScanLineItem[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('-')) continue;
    const body = line.replace(/^[-*]\s*/, '');
    const m = body.match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-zÀ-ÿ.]+)?\s*(?:x|×)\s+(.+)$/i);
    if (m) {
      const qty = Number(m[1].replace(',', '.'));
      const unit = m[2] || null;
      const description = m[3].trim();
      if (qty > 0 && description) out.push({ description, quantity: qty, unit });
    }
  }
  return out;
}
