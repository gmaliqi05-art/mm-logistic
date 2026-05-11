import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

type Action = 'create' | 'confirm' | 'complete';
interface Item {
  category_product_id?: string | null;
  category_id?: string | null;
  quantity: number;
  condition?: string;
}
interface Body {
  action: Action;
  delivery_note_id?: string;
  type?: 'delivery' | 'pickup';
  items?: Item[];
  company_id?: string;
  partner_id?: string;
  pallet_type?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const body = (await req.json()) as Body;
    const warnings: string[] = [];
    const blockers: string[] = [];

    if (body.action === 'create' && body.type === 'delivery') {
      const items = body.items ?? [];
      const ids = items.map((i) => i.category_product_id).filter(Boolean) as string[];
      if (ids.length > 0) {
        const { data: stockRows } = await supabase
          .from('stock')
          .select('category_product_id, quantity')
          .in('category_product_id', ids);
        const stockMap = new Map<string, number>();
        for (const r of stockRows ?? []) {
          const id = (r as { category_product_id: string }).category_product_id;
          const q = Number((r as { quantity: number }).quantity ?? 0);
          stockMap.set(id, (stockMap.get(id) ?? 0) + q);
        }
        for (const it of items) {
          if (!it.category_product_id) continue;
          const available = stockMap.get(it.category_product_id) ?? 0;
          if (available < it.quantity) {
            blockers.push(
              `Insufficient stock for item ${it.category_product_id}: need ${it.quantity}, have ${available}`,
            );
          }
        }
      }
    }

    if (body.action === 'confirm' && body.delivery_note_id) {
      const { data: note, error: noteErr } = await supabase
        .from('delivery_notes')
        .select('id, status, stock_posted, stock_confirmed_at, partner_id, pallet_type, company_id')
        .eq('id', body.delivery_note_id)
        .maybeSingle();
      if (noteErr || !note) {
        blockers.push(noteErr?.message || 'Delivery note not found');
      } else {
        const n = note as Record<string, unknown>;
        if (n.stock_posted === true) {
          blockers.push('Stock has already been posted for this note');
        }
        // Pallet account is auto-created downstream when needed; no warning shown to user.
        void n;
      }
    }

    return new Response(
      JSON.stringify({ valid: blockers.length === 0, warnings, blockers }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Validation failed';
    return new Response(
      JSON.stringify({ valid: false, warnings: [], blockers: [msg] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
