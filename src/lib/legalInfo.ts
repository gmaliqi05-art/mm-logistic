export const LEGAL_INFO = {
  platformName: 'MM Logistic',
  productSuffix: 'Business Suite',
  company: {
    legalName: 'Mar Group',
    countryName: 'Republika Federale e Gjermanise',
    countryShort: 'Gjermani',
    owner: 'Genton Maliqi',
    ownerRole: 'Pronar dhe Perfaqesues Ligjor',
    address: {
      street: 'Mar Group Headquarters',
      postal: '10115',
      city: 'Berlin',
      country: 'Gjermani',
    },
    contact: {
      email: 'legal@mmlogistic.com',
      support: 'support@mmlogistic.com',
      phone: '+49 (0)30 0000 0000',
    },
    registry: {
      court: 'Amtsgericht Berlin (Charlottenburg)',
      number: 'HRB 000000',
      vatId: 'DE000000000',
      taxNumber: 'St.-Nr. 00/000/00000',
    },
    dpo: {
      name: 'Genton Maliqi',
      email: 'dpo@mmlogistic.com',
    },
  },
  effectiveDate: '2026-04-27',
  copyrightYear: 2026,
} as const;

export const LEGAL_SLUGS = [
  'imprint',
  'privacy-policy',
  'terms',
  'cookies',
  'gdpr',
  'data-processing',
  'refund-policy',
  'acceptable-use',
  'security',
  'sla',
] as const;

export type LegalSlug = (typeof LEGAL_SLUGS)[number];
