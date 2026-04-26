import { useEffect, useState } from 'react';
import { Loader2, Truck, MapPin, User, Clock, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ActiveDelivery {
  id: string;
  note_number: string;
  status: string;
  shipping_address: string;
  note_date: string;
  invoice?: { invoice_number: string; total: number; currency: string } | null;
  contact?: { name: string } | null;
  driver?: { full_name: string; phone: string } | null;
}

const STATUS_TONE: Record<string, string> = {
  assigned: 'bg-sky-100 text-sky-700',
  in_transit: 'bg-blue-100 text-blue-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABEL: Record<string, string> = {
  assigned: 'Caktuar',
  in_transit: 'Ne transit',
  delivered: 'Dorezuar',
  confirmed: 'Konfirmuar',
};

export default function LogisticsActive() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ActiveDelivery[]>([]);
  const [filter, setFilter] = useState<'all' | 'assigned' | 'in_transit' | 'delivered'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.company_id) load();
  }, [profile?.company_id]);

  async function load() {
    try {
      setLoading(true);
      const companyId = profile!.company_id!;
      const { data } = await supabase
        .from('acc_delivery_notes')
        .select(
          'id, note_number, status, shipping_address, note_date, invoice:acc_invoices(invoice_number, total, currency), contact:acc_contacts(name), driver:profiles!acc_delivery_notes_assigned_driver_id_fkey(full_name, phone)',
        )
        .eq('company_id', companyId)
        .in('status', ['assigned', 'in_transit', 'delivered', 'confirmed'])
        .order('note_date', { ascending: false })
        .limit(100);
      setRows(((data as unknown) as ActiveDelivery[]) ?? []);
    } finally {
      setLoading(false);
    }
  }

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Caktimet aktive</h1>
        <p className="text-gray-500 mt-1">Dergesat ne ekzekutim ose te dorezuara</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2">
        {(['all', 'assigned', 'in_transit', 'delivered'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {f === 'all' ? `Te gjitha (${rows.length})` : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
          <Truck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 text-sm">Nuk ka dergesa aktive</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Fletedergesa
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Klienti
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Shoferi
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    Adresa
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Statusi
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Data
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-400" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900">{r.note_number}</p>
                          {r.invoice?.invoice_number && (
                            <p className="text-xs text-gray-500">Fatura {r.invoice.invoice_number}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{r.contact?.name ?? '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="inline-flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        {r.driver?.full_name ?? '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden md:table-cell max-w-[260px] truncate">
                      <div className="inline-flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        {r.shipping_address || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_TONE[r.status] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        {r.note_date}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
