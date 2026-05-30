import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Plus, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

interface Contact {
  id: string;
  name: string;
  contact_type?: string | null;
  email?: string | null;
}

interface Props {
  /** Currently picked contact id, if any. */
  contactId: string | null;
  /** Free-text typed by the user (echoes the contact's name when picked). */
  partnerText: string;
  onChange: (next: { contactId: string | null; partnerText: string }) => void;
  /** Optional placeholder for the input. */
  placeholder?: string;
  /** Optional label rendered above the input. */
  label?: string;
}

/**
 * Combo-box style picker for acc_contacts. Lets the user either pick an
 * existing partner (stored as `contactId`) or just type a free name
 * (stored as `partnerText` only). Includes a "Krijo kontakt" shortcut
 * that inserts a new acc_contacts row inline.
 */
export default function ContactAutocomplete({
  contactId,
  partnerText,
  onChange,
  placeholder,
  label,
}: Props) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!profile?.company_id) return;
    setLoading(true);
    supabase
      .from('acc_contacts')
      .select('id, name, contact_type, email')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)
      .order('name')
      .limit(500)
      .then(({ data }) => {
        setContacts(((data as Contact[]) ?? []));
        setLoading(false);
      });
  }, [profile?.company_id]);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const filtered = useMemo(() => {
    const q = partnerText.trim().toLowerCase();
    if (!q) return contacts.slice(0, 20);
    return contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 20);
  }, [contacts, partnerText]);

  function pick(c: Contact) {
    onChange({ contactId: c.id, partnerText: c.name });
    setOpen(false);
  }

  function clear() {
    onChange({ contactId: null, partnerText: '' });
    setOpen(false);
  }

  async function createNew() {
    if (!partnerText.trim() || !profile?.company_id) return;
    setCreating(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('acc_contacts')
      .insert({
        company_id: profile.company_id,
        name: partnerText.trim(),
        contact_type: 'customer',
        is_active: true,
      })
      .select('id, name, contact_type, email')
      .single();
    setCreating(false);
    if (err || !data) {
      setError(err?.message || 'Krijimi i kontaktit deshtoi');
      return;
    }
    const created = data as Contact;
    setContacts((prev) => [created, ...prev]);
    pick(created);
  }

  const canCreate =
    !!partnerText.trim() &&
    !contactId &&
    !contacts.some((c) => c.name.toLowerCase() === partnerText.trim().toLowerCase());

  return (
    <div ref={wrapperRef} className="relative">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={partnerText}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            // Typing always clears any previously picked contact — the
            // user is browsing again.
            onChange({ contactId: null, partnerText: e.target.value });
            setOpen(true);
          }}
          placeholder={placeholder || 'Kerko ose shkruaj emer...'}
          className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
        />
        {(partnerText || contactId) && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700"
            title="Pastro"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {contactId && (
        <p className="text-[11px] text-emerald-700 mt-1">Kontakt nga lista (regjistrohet i lidhur me partnerin)</p>
      )}
      {!contactId && partnerText.trim() && (
        <p className="text-[11px] text-amber-700 mt-1">{t('common.tekstILireNukEshteI')}</p>
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-sm text-gray-500 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">{t('common.asnjeKontaktQePerputhet')}</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50"
                  >
                    <span className="font-medium text-gray-900">{c.name}</span>
                    {c.contact_type && <span className="text-[11px] text-gray-500 ml-2">{c.contact_type}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {canCreate && (
            <div className="border-t border-gray-100 p-2">
              <button
                type="button"
                onClick={createNew}
                disabled={creating}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 rounded-md disabled:opacity-60"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Krijo kontakt: "{partnerText.trim()}"
              </button>
              {error && <p className="text-[11px] text-rose-700 px-3 mt-1">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
