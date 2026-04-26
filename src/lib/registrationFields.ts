export type FieldKey =
  | 'vatNumber'
  | 'taxNumber'
  | 'commercialRegister'
  | 'legalForm'
  | 'registrationCourt';

export interface FieldSpec {
  key: FieldKey;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}

export interface LegalFormOption {
  value: string;
  label: string;
}

export interface CountryRegistrationProfile {
  countryCode: string;
  fields: FieldSpec[];
  legalForms: LegalFormOption[];
  note?: string;
}

const DEFAULT_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'LLC', label: 'Limited Liability Company' },
  { value: 'JSC', label: 'Joint-Stock Company' },
  { value: 'SoleProprietor', label: 'Sole Proprietor' },
  { value: 'Partnership', label: 'Partnership' },
  { value: 'Other', label: 'Tjetër / Other' },
];

const DE_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'GmbH', label: 'GmbH (Gesellschaft mit beschränkter Haftung)' },
  { value: 'AG', label: 'AG (Aktiengesellschaft)' },
  { value: 'UG', label: 'UG (haftungsbeschränkt) / Mini-GmbH' },
  { value: 'KG', label: 'KG (Kommanditgesellschaft)' },
  { value: 'OHG', label: 'OHG (Offene Handelsgesellschaft)' },
  { value: 'eK', label: 'e.K. (Eingetragener Kaufmann)' },
  { value: 'GbR', label: 'GbR (Gesellschaft bürgerlichen Rechts)' },
  { value: 'Other', label: 'Tjetër / Other' },
];

const AT_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'GmbH', label: 'GmbH' },
  { value: 'AG', label: 'AG' },
  { value: 'OG', label: 'OG (Offene Gesellschaft)' },
  { value: 'KG', label: 'KG' },
  { value: 'EU', label: 'Einzelunternehmer' },
  { value: 'Other', label: 'Tjetër / Other' },
];

const CH_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'GmbH', label: 'GmbH / Sàrl' },
  { value: 'AG', label: 'AG / SA' },
  { value: 'EinzelF', label: 'Einzelfirma / Raison individuelle' },
  { value: 'KG', label: 'Kommanditgesellschaft' },
  { value: 'Verein', label: 'Verein / Association' },
  { value: 'Other', label: 'Tjetër / Other' },
];

const XK_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'SH.P.K.', label: 'SH.P.K. (Shoqëri me Përgjegjësi të Kufizuar)' },
  { value: 'SH.A.', label: 'SH.A. (Shoqëri Aksionare)' },
  { value: 'B.I.', label: 'B.I. (Biznes Individual)' },
  { value: 'O.P.', label: 'O.P. (Ortakëri e Përgjithshme)' },
  { value: 'Other', label: 'Tjetër' },
];

const AL_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'SHPK', label: 'SHPK (Shoqëri me Përgjegjësi të Kufizuar)' },
  { value: 'SHA', label: 'SHA (Shoqëri Aksionare)' },
  { value: 'PF', label: 'Person Fizik' },
  { value: 'Other', label: 'Tjetër' },
];

const FR_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'SARL', label: 'SARL (Société à Responsabilité Limitée)' },
  { value: 'SAS', label: 'SAS (Société par Actions Simplifiée)' },
  { value: 'SA', label: 'SA (Société Anonyme)' },
  { value: 'EURL', label: 'EURL (Entreprise Unipersonnelle)' },
  { value: 'EI', label: 'EI (Entreprise Individuelle)' },
  { value: 'Other', label: 'Autre' },
];

const IT_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'Srl', label: 'S.r.l. (Società a responsabilità limitata)' },
  { value: 'SpA', label: 'S.p.A. (Società per azioni)' },
  { value: 'Sas', label: 'S.a.s. (Società in accomandita semplice)' },
  { value: 'Snc', label: 'S.n.c. (Società in nome collettivo)' },
  { value: 'DI', label: 'Ditta Individuale' },
  { value: 'Other', label: 'Altro' },
];

const ES_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'SL', label: 'S.L. (Sociedad Limitada)' },
  { value: 'SA', label: 'S.A. (Sociedad Anónima)' },
  { value: 'SLU', label: 'S.L.U. (Sociedad Limitada Unipersonal)' },
  { value: 'Auto', label: 'Autónomo' },
  { value: 'Other', label: 'Otro' },
];

const NL_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'BV', label: 'B.V. (Besloten Vennootschap)' },
  { value: 'NV', label: 'N.V. (Naamloze Vennootschap)' },
  { value: 'EZ', label: 'Eenmanszaak' },
  { value: 'VOF', label: 'V.O.F. (Vennootschap onder Firma)' },
  { value: 'Other', label: 'Overig' },
];

const BE_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'BV', label: 'BV / SRL' },
  { value: 'NV', label: 'NV / SA' },
  { value: 'CV', label: 'CV / SC' },
  { value: 'EZ', label: 'Eenmanszaak / Indépendant' },
  { value: 'Other', label: 'Overig / Autre' },
];

const GB_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'LTD', label: 'Ltd (Private Limited Company)' },
  { value: 'PLC', label: 'PLC (Public Limited Company)' },
  { value: 'LLP', label: 'LLP (Limited Liability Partnership)' },
  { value: 'Sole', label: 'Sole Trader' },
  { value: 'Other', label: 'Other' },
];

const PL_LEGAL_FORMS: LegalFormOption[] = [
  { value: 'sp.zoo', label: 'Sp. z o.o.' },
  { value: 'SA', label: 'S.A.' },
  { value: 'JDG', label: 'JDG (Jednoosobowa Działalność Gospodarcza)' },
  { value: 'Other', label: 'Inne / Other' },
];

function field(
  key: FieldKey,
  label: string,
  opts: Partial<FieldSpec> = {},
): FieldSpec {
  return { key, label, ...opts };
}

const PROFILES: Record<string, CountryRegistrationProfile> = {
  DE: {
    countryCode: 'DE',
    fields: [
      field('vatNumber', 'Umsatzsteuer-ID (USt-IdNr)', {
        placeholder: 'DE123456789',
        hint: 'Numri TVSH-së për tregti brenda BE-së',
        required: true,
      }),
      field('taxNumber', 'Steuernummer', {
        placeholder: '12/345/67890',
        hint: 'Numri tatimor i Finanzamt-it lokal',
        required: true,
      }),
      field('commercialRegister', 'Handelsregisternummer', {
        placeholder: 'HRB 12345',
        hint: 'Numri i regjistrimit në Handelsregister',
      }),
      field('registrationCourt', 'Registergericht (Amtsgericht)', {
        placeholder: 'Amtsgericht Berlin-Charlottenburg',
        hint: 'Gjykata vendore ku është regjistruar kompania',
      }),
      field('legalForm', 'Rechtsform / Forma Ligjore'),
    ],
    legalForms: DE_LEGAL_FORMS,
    note: 'Për operim ligjor në Gjermani: USt-IdNr dhe Steuernummer janë të detyrueshme.',
  },
  AT: {
    countryCode: 'AT',
    fields: [
      field('vatNumber', 'UID-Nummer', {
        placeholder: 'ATU12345678',
        required: true,
      }),
      field('taxNumber', 'Steuernummer', {
        placeholder: '12 345/6789',
        required: true,
      }),
      field('commercialRegister', 'Firmenbuchnummer', { placeholder: 'FN 123456a' }),
      field('legalForm', 'Rechtsform'),
    ],
    legalForms: AT_LEGAL_FORMS,
    note: 'UID-Nummer dhe Firmenbuch janë regjistrime standarde austriake.',
  },
  CH: {
    countryCode: 'CH',
    fields: [
      field('vatNumber', 'MWST-Nummer (UID)', {
        placeholder: 'CHE-123.456.789 MWST',
        required: true,
      }),
      field('taxNumber', 'UID', {
        placeholder: 'CHE-123.456.789',
        hint: 'Unternehmens-Identifikationsnummer',
        required: true,
      }),
      field('commercialRegister', 'Handelsregisternummer', {
        placeholder: 'CH-020.4.001.234-5',
      }),
      field('legalForm', 'Rechtsform'),
    ],
    legalForms: CH_LEGAL_FORMS,
  },
  XK: {
    countryCode: 'XK',
    fields: [
      field('taxNumber', 'NUI / Numri Fiskal', {
        placeholder: '601234567',
        hint: 'Numri Unik Identifikues nga ATK',
        required: true,
      }),
      field('vatNumber', 'Numri i TVSH-së', {
        placeholder: '331234567',
        hint: 'I detyrueshëm nëse jeni i regjistruar për TVSH',
      }),
      field('commercialRegister', 'Numri i Biznesit (ARBK)', {
        placeholder: '70123456',
      }),
      field('legalForm', 'Forma Ligjore'),
    ],
    legalForms: XK_LEGAL_FORMS,
    note: 'Për Kosovë: NUI/Numri Fiskal nga Administrata Tatimore (ATK) është i detyrueshëm.',
  },
  AL: {
    countryCode: 'AL',
    fields: [
      field('taxNumber', 'NIPT', {
        placeholder: 'L12345678A',
        hint: 'Numri i Identifikimit të Personit të Tatueshëm',
        required: true,
      }),
      field('vatNumber', 'Numri i TVSH-së', {
        placeholder: 'L12345678A',
        hint: 'Zakonisht i njëjtë me NIPT-in',
      }),
      field('legalForm', 'Forma Ligjore'),
    ],
    legalForms: AL_LEGAL_FORMS,
    note: 'Për Shqipëri: NIPT-i është numri kryesor i identifikimit tatimor.',
  },
  FR: {
    countryCode: 'FR',
    fields: [
      field('taxNumber', 'SIREN', {
        placeholder: '123 456 789',
        hint: 'Numri i regjistrimit të biznesit (9 shifra)',
        required: true,
      }),
      field('commercialRegister', 'SIRET', {
        placeholder: '123 456 789 00012',
        hint: 'SIREN + 5 shifra për vendndodhjen',
        required: true,
      }),
      field('vatNumber', 'TVA Intracommunautaire', {
        placeholder: 'FR12345678901',
        required: true,
      }),
      field('legalForm', 'Forme juridique'),
    ],
    legalForms: FR_LEGAL_FORMS,
  },
  IT: {
    countryCode: 'IT',
    fields: [
      field('vatNumber', 'Partita IVA', {
        placeholder: 'IT12345678901',
        required: true,
      }),
      field('taxNumber', 'Codice Fiscale', {
        placeholder: 'RSSMRA80A01H501Z',
        required: true,
      }),
      field('commercialRegister', 'REA / Registro Imprese', {
        placeholder: 'MI-1234567',
      }),
      field('legalForm', 'Forma giuridica'),
    ],
    legalForms: IT_LEGAL_FORMS,
  },
  ES: {
    countryCode: 'ES',
    fields: [
      field('taxNumber', 'NIF / CIF', {
        placeholder: 'B12345678',
        required: true,
      }),
      field('vatNumber', 'IVA Intracomunitario', {
        placeholder: 'ESB12345678',
      }),
      field('commercialRegister', 'Registro Mercantil', {
        placeholder: 'Tomo 123, Folio 45',
      }),
      field('legalForm', 'Forma jurídica'),
    ],
    legalForms: ES_LEGAL_FORMS,
  },
  NL: {
    countryCode: 'NL',
    fields: [
      field('vatNumber', 'BTW-nummer', {
        placeholder: 'NL123456789B01',
        required: true,
      }),
      field('commercialRegister', 'KvK-nummer', {
        placeholder: '12345678',
        hint: 'Numri i Kamer van Koophandel',
        required: true,
      }),
      field('legalForm', 'Rechtsvorm'),
    ],
    legalForms: NL_LEGAL_FORMS,
  },
  BE: {
    countryCode: 'BE',
    fields: [
      field('vatNumber', 'BTW / TVA', {
        placeholder: 'BE0123.456.789',
        required: true,
      }),
      field('commercialRegister', 'BCE / KBO', {
        placeholder: '0123.456.789',
        hint: 'Numri i Banque-Carrefour des Entreprises',
        required: true,
      }),
      field('legalForm', 'Vorm / Forme'),
    ],
    legalForms: BE_LEGAL_FORMS,
  },
  GB: {
    countryCode: 'GB',
    fields: [
      field('commercialRegister', 'Companies House Number', {
        placeholder: '12345678',
        required: true,
      }),
      field('vatNumber', 'VAT Number', {
        placeholder: 'GB123456789',
        hint: 'Required if VAT-registered (turnover > £85k)',
      }),
      field('legalForm', 'Legal Form'),
    ],
    legalForms: GB_LEGAL_FORMS,
  },
  PL: {
    countryCode: 'PL',
    fields: [
      field('taxNumber', 'NIP', { placeholder: '1234567890', required: true }),
      field('commercialRegister', 'REGON / KRS', { placeholder: '0000123456' }),
      field('vatNumber', 'VAT-UE', { placeholder: 'PL1234567890' }),
      field('legalForm', 'Forma prawna'),
    ],
    legalForms: PL_LEGAL_FORMS,
  },
};

const DEFAULT_PROFILE: Omit<CountryRegistrationProfile, 'countryCode'> = {
  fields: [
    field('vatNumber', 'VAT Number / Numri i TVSH-së', {
      placeholder: 'VAT123456789',
      required: true,
    }),
    field('taxNumber', 'Tax Number / Numri Tatimor', {
      placeholder: '123456789',
    }),
    field('commercialRegister', 'Commercial Register / Regjistri Tregtar', {
      placeholder: 'Reg. No.',
    }),
    field('legalForm', 'Legal Form / Forma Ligjore'),
  ],
  legalForms: DEFAULT_LEGAL_FORMS,
};

export function getRegistrationProfile(
  countryCode: string | null | undefined,
): CountryRegistrationProfile {
  const code = (countryCode ?? '').toUpperCase();
  if (!code) {
    return { countryCode: '', ...DEFAULT_PROFILE };
  }
  return PROFILES[code] ?? { countryCode: code, ...DEFAULT_PROFILE };
}

export function isFieldVisible(
  profile: CountryRegistrationProfile,
  key: FieldKey,
): boolean {
  return profile.fields.some((f) => f.key === key);
}

export function isFieldRequired(
  profile: CountryRegistrationProfile,
  key: FieldKey,
): boolean {
  return profile.fields.some((f) => f.key === key && f.required === true);
}
