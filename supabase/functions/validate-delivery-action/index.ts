import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireCaller, forbidden } from '../_shared/requireCaller.ts';
import { parseJson, quantitySchema, uuidSchema, z } from '../_shared/schemas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ItemSchema = z.object({
  category_product_id: z.union([uuidSchema, z.null()]).optional(),
  category_id: z.union([uuidSchema, z.null()]).optional(),
  quantity: quantitySchema,
  condition: z.string().max(64).optional(),
});

const Body = z.object({
  action: z.enum(['create', 'confirm', 'complete'], {
    errorMap: () => ({ message: "Veprimi duhet te jete 'create', 'confirm' ose 'complete'" }),
  }),
  delivery_note_id: uuidSchema.optional(),
  type: z.enum(['delivery', 'pickup']).optional(),
  items: z.array(ItemSchema).max(500, 'Tepric artikujsh').optional(),
  company_id: uuidSchema.optional(),
  partner_id: uuidSchema.optional(),
  pallet_type: z.string().max(64).optional(),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const caller = await requireCaller(req, { corsHeaders });
  if (!caller.ok) return caller.response;

  try {
    const parsed = await parseJson(req, Body, corsHeaders);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const warnings: string[] = [];
    const blockers: string[] = [];

    const callerCompanyId = caller.profile.company_id;
    const isSuperAdmin = caller.profile.role === 'super_admin';
    if (!callerCompanyId && !isSuperAdmin) {
      return forbidden(corsHeaders, 'Caller has no tenant');
    }
    if (body.company_id && !isSuperAdmin && body.company_id !== callerCompanyId) {
      return forbidden(corsHeaders, 'Cross-tenant access denied');
    }
    const scopeCompanyId = isSuperAdmin && body.company_id ? body.company_id : callerCompanyId;

    // Hard requirement: the validator must run in a single,
    // explicit tenant scope. A NULL scopeCompanyId would let the
    // .in('category_product_id', ids) query span every tenant
    // (the eq('company_id', ...) filter is skipped at line 58
    // when scopeCompanyId is null). Reject upfront.
    if (!scopeCompanyId) {
      return forbidden(corsHeaders, 'Missing tenant scope');
    }

    if (body.action === 'create' && body.type === 'delivery') {
      const items = body.items ?? [];
      const ids = items.map((i) => i.category_product_id).filter(Boolean) as string[];
      if (ids.length > 0) {
        let stockQuery = caller.admin
          .from('stock')
          .select('category_product_id, quantity, company_id')
          .in('category_product_id', ids);
        if (scopeCompanyId) stockQuery = stockQuery.eq('company_id', scopeCompanyId);
        const { data: stockRows } = await stockQuery;
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
      const { data: note, error: noteErr } = await caller.admin
        .from('delivery_notes')
        .select('id, status, stock_posted, stock_confirmed_at, partner_id, pallet_type, company_id')
        .eq('id', body.delivery_note_id)
        .maybeSingle();
      if (noteErr || !note) {
        blockers.push('Delivery note not found');
      } else {
        const n = note as Record<string, unknown>;
        if (!isSuperAdmin && n.company_id !== callerCompanyId) {
          return forbidden(corsHeaders, 'Cross-tenant access denied');
        }
        if (n.stock_posted === true) {
          blockers.push('Stock has already been posted for this note');
        }
        void n;
      }
    }

    return new Response(
      JSON.stringify({ valid: blockers.length === 0, warnings, blockers }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: 'Validation system error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
