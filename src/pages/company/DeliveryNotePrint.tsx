import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';
import { logger } from '../../utils/logger';

/**
 * Printable document for a delivery note (Fletedergese) or goods receipt
 * (Fletemarrje). This is an optional document view — reachable from the
 * delivery-notes detail panel via "Dokument / Print". The visual design is
 * intentionally simple for now (the user will refine styling later); the
 * goal is a clean, printable A4 sheet with the legally useful fields:
 * sender, receiver, line items, pallet exchange, and signature blocks.
 *
 * It reuses the same data the list already loads and adds nothing to the
 * write path — purely a read + window.print() surface.
 */

interface NoteItem {
  id: string;
  quantity: number | null;
  condition: string | null;
  notes: string | null;
  category?: { name?: string | null } | null;
}

interface NoteDoc {
  id: string;
  note_number: string | null;
  document_number: string | null;
  type: string;
  status: string;
  custom_title: string | null;
  notes: string | null;
  reference_number: string | null;
  delivery_address: string | null;
  pickup_address: string | null;
  scheduled_delivery_at: string | null;
  scheduled_pickup_at: string | null;
  created_at: string;
  counterparty_name: string | null;
  counterparty_vat: string | null;
  partner_name: string | null;
  consignee_name: string | null;
  consignee_address: string | null;
  consignee_city: string | null;
  consignee_country: string | null;
  pallet_type: string | null;
  pallets_delivered: number | null;
  pallets_returned: number | null;
  driver?: { full_name?: string | null } | null;
  depot?: { name?: string | null } | null;
  items?: NoteItem[];
}

interface CompanyInfo {
  name: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  vat_number: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

export default function DeliveryNotePrint() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useTranslation();

  const [note, setNote] = useState<NoteDoc | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.company_id && id) void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, id]);

  async function fetchData() {
    try {
      setLoading(true);
      const [noteRes, companyRes] = await Promise.all([
        supabase
          .from('delivery_notes')
          .select(
            '*, driver:profiles!delivery_notes_assigned_driver_id_fkey(full_name), depot:depots!delivery_notes_assigned_depot_id_fkey(name), items:delivery_note_items(*, category:product_categories(name))',
          )
          .eq('id', id!)
          .maybeSingle(),
        supabase.from('companies').select('*').eq('id', profile!.company_id!).maybeSingle(),
      ]);
      if (noteRes.error) throw noteRes.error;
      if (companyRes.error) throw companyRes.error;
      setNote(noteRes.data as unknown as NoteDoc);
      setCompany(companyRes.data as unknown as CompanyInfo);
    } catch (err) {
      logger.error('delivery note print fetch failed', { error: err });
    } finally {
      setLoading(false);
    }
  }

  function fmtDate(d: string | null | undefined) {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('sq-AL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '—';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!note || !company) {
    return (
      <div className="p-6 text-center text-gray-500">
        {t('common.notFound') !== 'common.notFound' ? t('common.notFound') : 'Dokumenti nuk u gjet'}
      </div>
    );
  }

  const isDelivery = note.type === 'delivery';
  const docTitle = isDelivery
    ? t('company.deliveryNotes.tabDelivery')
    : t('company.deliveryNotes.tabPickup');
  const docNumber = note.document_number || note.note_number || note.id.slice(0, 8);
  const receiverName = note.consignee_name || note.counterparty_name || note.partner_name || '—';
  const receiverAddr = [note.consignee_address, note.consignee_city, note.consignee_country]
    .filter(Boolean)
    .join(', ')
    || (isDelivery ? note.delivery_address : note.pickup_address)
    || '—';
  const companyAddr = [company.address, [company.postal_code, company.city].filter(Boolean).join(' '), company.country]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('common.back') !== 'common.back' ? t('common.back') : 'Kthehu'}
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
        >
          <Printer className="w-4 h-4" />
          {t('common.print') !== 'common.print' ? t('common.print') : 'Printo'}
        </button>
      </div>

      {/* A4 document */}
      <div className="max-w-[210mm] mx-auto bg-white shadow-sm print:shadow-none my-6 print:my-0 p-10 print:p-0 text-sm text-gray-800">
        {/* Header: company + document title */}
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-4 mb-6">
          <div className="flex items-center gap-3">
            {company.logo_url && (
              <img src={company.logo_url} alt={company.name ?? ''} className="w-14 h-14 rounded object-cover" />
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{company.name ?? '—'}</h1>
              {companyAddr && <p className="text-xs text-gray-500 mt-0.5">{companyAddr}</p>}
              {company.vat_number && <p className="text-xs text-gray-500">VAT: {company.vat_number}</p>}
              {(company.phone || company.email) && (
                <p className="text-xs text-gray-500">{[company.phone, company.email].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold uppercase tracking-wide text-gray-900">{docTitle}</h2>
            <p className="text-sm text-gray-600 mt-1">Nr: <span className="font-semibold">{docNumber}</span></p>
            <p className="text-xs text-gray-500">{fmtDate(note.created_at)}</p>
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
              {isDelivery ? 'Derguesi' : 'Marresi i mallit'}
            </p>
            <p className="font-semibold text-gray-900">{company.name ?? '—'}</p>
            {companyAddr && <p className="text-xs text-gray-600">{companyAddr}</p>}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
              {isDelivery ? 'Marresi' : 'Derguesi'}
            </p>
            <p className="font-semibold text-gray-900">{receiverName}</p>
            <p className="text-xs text-gray-600">{receiverAddr}</p>
            {note.counterparty_vat && <p className="text-xs text-gray-600">VAT: {note.counterparty_vat}</p>}
          </div>
        </div>

        {/* Meta line */}
        <div className="grid grid-cols-3 gap-4 mb-6 text-xs">
          <div>
            <span className="text-gray-400">Shoferi: </span>
            <span className="font-medium text-gray-800">{note.driver?.full_name || '—'}</span>
          </div>
          <div>
            <span className="text-gray-400">Depo: </span>
            <span className="font-medium text-gray-800">{note.depot?.name || '—'}</span>
          </div>
          <div>
            <span className="text-gray-400">Data e planifikuar: </span>
            <span className="font-medium text-gray-800">
              {fmtDate(isDelivery ? note.scheduled_delivery_at : note.scheduled_pickup_at)}
            </span>
          </div>
          {note.reference_number && (
            <div>
              <span className="text-gray-400">Referenca: </span>
              <span className="font-medium text-gray-800">{note.reference_number}</span>
            </div>
          )}
        </div>

        {/* Items */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="border-b-2 border-gray-300 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 w-10">#</th>
              <th className="py-2">Produkti / Kategoria</th>
              <th className="py-2 w-28 text-center">Gjendja</th>
              <th className="py-2 w-20 text-right">Sasia</th>
            </tr>
          </thead>
          <tbody>
            {(note.items && note.items.length > 0) ? note.items.map((it, idx) => (
              <tr key={it.id} className="border-b border-gray-100">
                <td className="py-2 text-gray-500">{idx + 1}</td>
                <td className="py-2">{it.category?.name || it.notes || '—'}</td>
                <td className="py-2 text-center capitalize">{it.condition || '—'}</td>
                <td className="py-2 text-right font-medium">{it.quantity ?? '—'}</td>
              </tr>
            )) : (
              <tr><td colSpan={4} className="py-6 text-center text-gray-400">Pa artikuj</td></tr>
            )}
          </tbody>
        </table>

        {/* Pallet exchange */}
        {(note.pallet_type || note.pallets_delivered || note.pallets_returned) && (
          <div className="mb-6 text-xs border border-gray-200 rounded p-3 bg-gray-50">
            <p className="font-semibold text-gray-700 mb-1">Shkembim paletash</p>
            <div className="flex gap-6">
              <span>Lloji: <span className="font-medium">{note.pallet_type || '—'}</span></span>
              <span>Dorezuar: <span className="font-medium">{note.pallets_delivered ?? 0}</span></span>
              <span>Kthyer: <span className="font-medium">{note.pallets_returned ?? 0}</span></span>
            </div>
          </div>
        )}

        {note.notes && (
          <div className="mb-8 text-xs">
            <p className="text-gray-400 uppercase tracking-wider font-semibold mb-1">Shenime</p>
            <p className="text-gray-700">{note.notes}</p>
          </div>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-10 mt-12 pt-4">
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2 text-xs text-gray-500">Nenshkrimi i derguesit</div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2 text-xs text-gray-500">Nenshkrimi i marresit</div>
          </div>
        </div>
      </div>
    </div>
  );
}
