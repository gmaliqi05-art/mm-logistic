// i18n keys to add for 3-party logistics model
// Add these keys to the existing i18n files: src/i18n/sq.ts, en.ts, de.ts, fr.ts
//
// IMPORTANT: Do not replace the entire file - merge these into the existing translations.
// Place them at the top level of the language object alongside other root keys.

// ============================================================================
// SQ (Albanian) - src/i18n/sq.ts
// ============================================================================
const sqAdditions = {
  ourRole: {
    title: 'Roli juaj në këtë dorëzim',
    consignor: {
      label: 'Dërgues (Consignor)',
      desc: 'Ne dërgojmë mallin tonë te klienti',
    },
    consignee: {
      label: 'Marrës (Consignee)',
      desc: 'Ne marrim mallin nga furnizuesi',
    },
    carrier: {
      label: 'Spedicion (Carrier)',
      desc: 'Ne vetëm transportojmë për partner',
    },
    custodianIn: {
      label: 'Mbajtës - Marrje',
      desc: 'Marrim për ruajtje (mall i partnerit)',
    },
    custodianOut: {
      label: 'Mbajtës - Dorëzim',
      desc: 'Dorëzojmë nga ruajtja (mall i partnerit)',
    },
    internalTransfer: {
      label: 'Transfer i Brendshëm',
      desc: 'Lëvizje mes depove tona',
    },
  },
  threeParty: {
    consignor: {
      title: 'Dërguesi (Consignor)',
      subtitle: 'Pala që dërgon mallin',
    },
    carrier: {
      title: 'Spedicioni (Carrier)',
      subtitle: 'Pala që transporton',
      name: 'Emri spedicionit',
    },
    consignee: {
      title: 'Marrësi (Consignee)',
      subtitle: 'Pala që merr mallin',
    },
    thisIsUs: 'Kjo është kompania jonë',
    weAreCarrier: 'Ju jeni Spedicioni',
    weAreCarrierDesc: 'Ky është transport vetëm — stoku juaj nuk preket',
    searchPartner: 'Kërko partner sipas emrit',
    vat: 'Nr. TVSH',
    city: 'Qyteti',
    address: 'Adresa',
    vehiclePlate: 'Targa e mjetit',
    ourCustomer: 'Klienti yt',
    ourSupplier: 'Furnizuesi yt',
    ourClient: 'Klient transporti',
    clientOfClient: 'Klient i klientit (nuk regjistrohet)',
    warningCarrier: 'Kujdes',
    warningCarrierDesc: 'Si spedicion, vetëm dërguesi do regjistrohet si partner. Marrësi është klient i klientit tonë dhe NUK regjistrohet.',
  },
  scenarios: {
    sale: 'Shitje',
    purchase: 'Blerje',
    transportOnly: 'Transport për partner',
    custody: 'Mbajtje për partner',
    internalTransfer: 'Transfer i brendshëm',
  },
};

// ============================================================================
// EN (English) - src/i18n/en.ts
// ============================================================================
const enAdditions = {
  ourRole: {
    title: 'Your role in this delivery',
    consignor: {
      label: 'Consignor (Sender)',
      desc: 'We send our goods to customer',
    },
    consignee: {
      label: 'Consignee (Receiver)',
      desc: 'We receive goods from supplier',
    },
    carrier: {
      label: 'Carrier (Transport only)',
      desc: 'We only transport for partner',
    },
    custodianIn: {
      label: 'Custodian - Receiving',
      desc: 'Receive for storage (partner\'s goods)',
    },
    custodianOut: {
      label: 'Custodian - Releasing',
      desc: 'Release from storage (partner\'s goods)',
    },
    internalTransfer: {
      label: 'Internal Transfer',
      desc: 'Move between our depots',
    },
  },
  threeParty: {
    consignor: {
      title: 'Consignor (Sender)',
      subtitle: 'Party sending the goods',
    },
    carrier: {
      title: 'Carrier (Transporter)',
      subtitle: 'Party transporting the goods',
      name: 'Carrier name',
    },
    consignee: {
      title: 'Consignee (Receiver)',
      subtitle: 'Party receiving the goods',
    },
    thisIsUs: 'This is our company',
    weAreCarrier: 'You are the Carrier',
    weAreCarrierDesc: 'Transport-only service — your stock is not affected',
    searchPartner: 'Search partner by name',
    vat: 'VAT number',
    city: 'City',
    address: 'Address',
    vehiclePlate: 'Vehicle plate',
    ourCustomer: 'Your customer',
    ourSupplier: 'Your supplier',
    ourClient: 'Transport client',
    clientOfClient: 'Client of client (not registered)',
    warningCarrier: 'Note',
    warningCarrierDesc: 'As carrier, only the consignor is registered as your partner. The consignee is your client\'s client and is NOT registered.',
  },
  scenarios: {
    sale: 'Sale',
    purchase: 'Purchase',
    transportOnly: 'Transport for partner',
    custody: 'Custody for partner',
    internalTransfer: 'Internal transfer',
  },
};

// ============================================================================
// DE (German) - src/i18n/de.ts
// ============================================================================
const deAdditions = {
  ourRole: {
    title: 'Ihre Rolle bei dieser Lieferung',
    consignor: {
      label: 'Absender (Consignor)',
      desc: 'Wir senden unsere Ware an den Kunden',
    },
    consignee: {
      label: 'Empfänger (Consignee)',
      desc: 'Wir empfangen Ware vom Lieferanten',
    },
    carrier: {
      label: 'Spediteur (Carrier)',
      desc: 'Wir transportieren nur für Partner',
    },
    custodianIn: {
      label: 'Verwahrer - Eingang',
      desc: 'Annahme zur Lagerung (Ware des Partners)',
    },
    custodianOut: {
      label: 'Verwahrer - Ausgang',
      desc: 'Auslieferung aus der Lagerung',
    },
    internalTransfer: {
      label: 'Interne Übertragung',
      desc: 'Bewegung zwischen unseren Depots',
    },
  },
  threeParty: {
    consignor: {
      title: 'Absender (Consignor)',
      subtitle: 'Partei, die die Ware versendet',
    },
    carrier: {
      title: 'Spediteur (Carrier)',
      subtitle: 'Partei, die die Ware transportiert',
      name: 'Name des Spediteurs',
    },
    consignee: {
      title: 'Empfänger (Consignee)',
      subtitle: 'Partei, die die Ware empfängt',
    },
    thisIsUs: 'Das ist unser Unternehmen',
    weAreCarrier: 'Sie sind der Spediteur',
    weAreCarrierDesc: 'Reiner Transport — Ihr Bestand wird nicht beeinflusst',
    searchPartner: 'Partner nach Name suchen',
    vat: 'USt-IdNr.',
    city: 'Stadt',
    address: 'Adresse',
    vehiclePlate: 'Kennzeichen',
    ourCustomer: 'Ihr Kunde',
    ourSupplier: 'Ihr Lieferant',
    ourClient: 'Transport-Kunde',
    clientOfClient: 'Kunde des Kunden (nicht erfasst)',
    warningCarrier: 'Hinweis',
    warningCarrierDesc: 'Als Spediteur wird nur der Absender als Ihr Partner registriert. Der Empfänger ist der Kunde Ihres Kunden und wird NICHT registriert.',
  },
  scenarios: {
    sale: 'Verkauf',
    purchase: 'Einkauf',
    transportOnly: 'Transport für Partner',
    custody: 'Verwahrung für Partner',
    internalTransfer: 'Interne Übertragung',
  },
};

// ============================================================================
// FR (French) - src/i18n/fr.ts
// ============================================================================
const frAdditions = {
  ourRole: {
    title: 'Votre rôle dans cette livraison',
    consignor: {
      label: 'Expéditeur (Consignor)',
      desc: 'Nous envoyons notre marchandise au client',
    },
    consignee: {
      label: 'Destinataire (Consignee)',
      desc: 'Nous recevons des marchandises du fournisseur',
    },
    carrier: {
      label: 'Transporteur (Carrier)',
      desc: 'Nous transportons uniquement pour un partenaire',
    },
    custodianIn: {
      label: 'Dépositaire - Entrée',
      desc: 'Réception pour stockage (marchandise du partenaire)',
    },
    custodianOut: {
      label: 'Dépositaire - Sortie',
      desc: 'Sortie du stockage',
    },
    internalTransfer: {
      label: 'Transfert interne',
      desc: 'Mouvement entre nos dépôts',
    },
  },
  threeParty: {
    consignor: {
      title: 'Expéditeur (Consignor)',
      subtitle: 'Partie qui expédie la marchandise',
    },
    carrier: {
      title: 'Transporteur (Carrier)',
      subtitle: 'Partie qui transporte',
      name: 'Nom du transporteur',
    },
    consignee: {
      title: 'Destinataire (Consignee)',
      subtitle: 'Partie qui reçoit la marchandise',
    },
    thisIsUs: 'C\'est notre entreprise',
    weAreCarrier: 'Vous êtes le Transporteur',
    weAreCarrierDesc: 'Service de transport uniquement — votre stock n\'est pas affecté',
    searchPartner: 'Rechercher un partenaire par nom',
    vat: 'N° TVA',
    city: 'Ville',
    address: 'Adresse',
    vehiclePlate: 'Plaque du véhicule',
    ourCustomer: 'Votre client',
    ourSupplier: 'Votre fournisseur',
    ourClient: 'Client de transport',
    clientOfClient: 'Client du client (non enregistré)',
    warningCarrier: 'Attention',
    warningCarrierDesc: 'En tant que transporteur, seul l\'expéditeur est enregistré comme partenaire. Le destinataire est le client de votre client et n\'est PAS enregistré.',
  },
  scenarios: {
    sale: 'Vente',
    purchase: 'Achat',
    transportOnly: 'Transport pour partenaire',
    custody: 'Garde pour partenaire',
    internalTransfer: 'Transfert interne',
  },
};

// USAGE:
// 1. Open src/i18n/sq.ts. Find the existing root object (where keys like 'company', 'driver' etc. live)
// 2. Add the keys from `sqAdditions` at the same level. Example:
//    export const sq = {
//      common: { ... },
//      company: { ... },
//      ourRole: { ... },        // <- ADD
//      threeParty: { ... },     // <- ADD
//      scenarios: { ... },      // <- ADD
//    };
// 3. Repeat for en.ts, de.ts, fr.ts with their respective additions above.

export { sqAdditions, enAdditions, deAdditions, frAdditions };
