// New component: ThreePartyForm
// Renders the 3 parties (consignor, carrier, consignee) with smart conditional display
// based on our_role. Place at: src/components/delivery/ThreePartyForm.tsx

import { useEffect, useState } from 'react';
import { Building2, Truck, MapPin, Search } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { supabase } from '../../lib/supabase';
import type { OurRole } from './OurRoleSelector';

export interface PartyData {
  contact_id?: string | null;
  name: string;
  vat: string;
  address: string;
  city: string;
  country: string;
}

export interface ThreePartyData {
  consignor: PartyData;
  carrier: PartyData;
  consignee: PartyData;
  carrier_vehicle_plate: string;
  goods_owner_contact_id?: string | null;
}

interface Contact {
  id: string;
  name: string;
  vat_number: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  contact_type: string;
}

interface Props {
  ourRole: OurRole;
  ourCompanyName: string;
  data: ThreePartyData;
  onChange: (data: ThreePartyData) => void;
  companyId: string;
  disabled?: boolean;
}

function emptyParty(): PartyData {
  return { contact_id: null, name: '', vat: '', address: '', city: '', country: '' };
}

export default function ThreePartyForm({ ourRole, ourCompanyName, data, onChange, companyId, disabled }: Props) {
  const { t } = useLanguage();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState<{ consignor: string; consignee: string }>({ consignor: '', consignee: '' });
  const [showDropdown, setShowDropdown] = useState<{ consignor: boolean; consignee: boolean }>({ consignor: false, consignee: false });

  useEffect(() => {
    async function loadContacts() {
      const { data: rows } = await supabase
        .from('acc_contacts')
        .select('id, name, vat_number, address, city, country, contact_type')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');
      setContacts(rows || []);
    }
    if (companyId) loadContacts();
  }, [companyId]);

  // Auto-fill our company when our_role dictates
  useEffect(() => {
    const isOurField = (party: 'consignor' | 'consignee') => {
      if (ourRole === 'consignor' && party === 'consignor') return true;
      if (ourRole === 'consignee' && party === 'consignee') return true;
      if (ourRole === 'internal_transfer') return true;
      if (ourRole === 'custodian_in' && party === 'consignee') return true;
      if (ourRole === 'custodian_out' && party === 'consignor') return true;
      return false;
    };

    const next = { ...data };
    if (isOurField('consignor') && !next.consignor.name) {
      next.consignor = { ...next.consignor, name: ourCompanyName };
    }
    if (isOurField('consignee') && !next.consignee.name) {
      next.consignee = { ...next.consignee, name: ourCompanyName };
    }
    if (ourRole === 'carrier' && !next.carrier.name) {
      next.carrier = { ...next.carrier, name: ourCompanyName };
    }
    if (JSON.stringify(next) !== JSON.stringify(data)) {
      onChange(next);
    }
  }, [ourRole, ourCompanyName]);

  const updateParty = (party: 'consignor' | 'carrier' | 'consignee', field: keyof PartyData, value: string) => {
    onChange({
      ...data,
      [party]: { ...data[party], [field]: value },
    });
  };

  const selectContact = (party: 'consignor' | 'consignee', contact: Contact) => {
    onChange({
      ...data,
      [party]: {
        contact_id: contact.id,
        name: contact.name,
        vat: contact.vat_number || '',
        address: contact.address || '',
        city: contact.city || '',
        country: contact.country || '',
      },
    });
    setShowDropdown({ ...showDropdown, [party]: false });
    setSearchTerm({ ...searchTerm, [party]: '' });
  };

  const filteredContacts = (party: 'consignor' | 'consignee') => {
    const term = searchTerm[party].toLowerCase();
    if (!term) return contacts.slice(0, 10);
    return contacts.filter(c => c.name.toLowerCase().includes(term)).slice(0, 10);
  };

  // Visibility rules per our_role
  const showConsignorPicker = !['consignor', 'internal_transfer', 'custodian_out'].includes(ourRole);
  const showConsigneePicker = !['consignee', 'internal_transfer', 'custodian_in'].includes(ourRole);
  const showCarrierFields = !['carrier'].includes(ourRole);
  const showWarnConsigneeIsClientOfClient = ourRole === 'carrier';

  const partySection = (
    party: 'consignor' | 'consignee',
    icon: typeof Building2,
    titleKey: string,
    subtitleKey: string,
    badge?: { text: string; color: string }
  ) => {
    const partyData = data[party];
    const Icon = icon;
    const isOur =
      (party === 'consignor' && (ourRole === 'consignor' || ourRole === 'custodian_out' || ourRole === 'internal_transfer')) ||
      (party === 'consignee' && (ourRole === 'consignee' || ourRole === 'custodian_in' || ourRole === 'internal_transfer'));

    return (
      <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-slate-600" />
            <div>
              <div className="text-sm font-semibold text-slate-900">{t(titleKey)}</div>
              <div className="text-xs text-slate-500">{t(subtitleKey)}</div>
            </div>
          </div>
          {badge && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
              {badge.text}
            </span>
          )}
        </div>

        {isOur ? (
          <div className="text-sm bg-teal-50 border border-teal-200 rounded p-2 text-teal-800">
            {t('threeParty.thisIsUs')}: <strong>{ourCompanyName}</strong>
          </div>
        ) : (
          <>
            {/* Contact search/picker for non-us parties */}
            {((party === 'consignor' && showConsignorPicker) || (party === 'consignee' && showConsigneePicker)) && (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm[party] || partyData.name}
                    disabled={disabled}
                    placeholder={t('threeParty.searchPartner')}
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                    onChange={(e) => {
                      setSearchTerm({ ...searchTerm, [party]: e.target.value });
                      setShowDropdown({ ...showDropdown, [party]: true });
                      updateParty(party, 'name', e.target.value);
                      updateParty(party, 'contact_id' as keyof PartyData, '');
                    }}
                    onFocus={() => setShowDropdown({ ...showDropdown, [party]: true })}
                  />
                </div>
                {showDropdown[party] && filteredContacts(party).length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-auto">
                    {filteredContacts(party).map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectContact(party, c)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-0"
                      >
                        <div className="font-medium text-slate-900">{c.name}</div>
                        {c.vat_number && <div className="text-xs text-slate-500">VAT: {c.vat_number}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={partyData.vat}
                disabled={disabled}
                placeholder={t('threeParty.vat')}
                onChange={(e) => updateParty(party, 'vat', e.target.value)}
                className="px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <input
                type="text"
                value={partyData.city}
                disabled={disabled}
                placeholder={t('threeParty.city')}
                onChange={(e) => updateParty(party, 'city', e.target.value)}
                className="px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <input
              type="text"
              value={partyData.address}
              disabled={disabled}
              placeholder={t('threeParty.address')}
              onChange={(e) => updateParty(party, 'address', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Consignor */}
      {partySection(
        'consignor',
        Building2,
        'threeParty.consignor.title',
        'threeParty.consignor.subtitle',
        ourRole === 'carrier' ? { text: t('threeParty.ourClient'), color: 'bg-purple-100 text-purple-700' } :
        ourRole === 'consignee' ? { text: t('threeParty.ourSupplier'), color: 'bg-orange-100 text-orange-700' } : undefined
      )}

      {/* Carrier (between consignor and consignee in CMR order) */}
      {ourRole === 'carrier' ? (
        <div className="flex items-center gap-2 p-3 bg-teal-50 rounded-lg border border-teal-200">
          <Truck className="w-4 h-4 text-teal-700" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-teal-800">{t('threeParty.weAreCarrier')}</div>
            <div className="text-xs text-teal-700">{t('threeParty.weAreCarrierDesc')}</div>
          </div>
          <input
            type="text"
            value={data.carrier_vehicle_plate}
            disabled={disabled}
            placeholder={t('threeParty.vehiclePlate')}
            onChange={(e) => onChange({ ...data, carrier_vehicle_plate: e.target.value })}
            className="px-2 py-1.5 text-sm border border-teal-300 rounded-md w-32 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      ) : showCarrierFields && (
        <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-slate-600" />
            <div className="text-sm font-semibold text-slate-900">{t('threeParty.carrier.title')}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={data.carrier.name}
              disabled={disabled}
              placeholder={t('threeParty.carrier.name')}
              onChange={(e) => updateParty('carrier', 'name', e.target.value)}
              className="px-2 py-1.5 text-sm border border-slate-200 rounded-md"
            />
            <input
              type="text"
              value={data.carrier_vehicle_plate}
              disabled={disabled}
              placeholder={t('threeParty.vehiclePlate')}
              onChange={(e) => onChange({ ...data, carrier_vehicle_plate: e.target.value })}
              className="px-2 py-1.5 text-sm border border-slate-200 rounded-md"
            />
          </div>
        </div>
      )}

      {/* Consignee */}
      {partySection(
        'consignee',
        MapPin,
        'threeParty.consignee.title',
        'threeParty.consignee.subtitle',
        ourRole === 'carrier' ? { text: t('threeParty.clientOfClient'), color: 'bg-slate-200 text-slate-700' } :
        ourRole === 'consignor' ? { text: t('threeParty.ourCustomer'), color: 'bg-blue-100 text-blue-700' } : undefined
      )}

      {/* Warning when carrier-only */}
      {showWarnConsigneeIsClientOfClient && (
        <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">
          <strong>{t('threeParty.warningCarrier')}</strong>: {t('threeParty.warningCarrierDesc')}
        </div>
      )}
    </div>
  );
}
