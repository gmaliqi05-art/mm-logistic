import type { ManualSection } from './types';

export const accountingManual: ManualSection = {
  id: 'accounting',
  role: 'accounting',
  title: 'Manual i kontabilitetit',
  intro:
    'Moduli i kontabilitetit eshte i ndare nga rolet baze: akses-i jepet permes abonimit (jo permes nje "role" te vetme). Permban fatura, blerje, banka, asete fikse, raporte dhe eksporte specifike per vend (DATEV per DE, SAF-T per international). Lidhet ngushte me modulin e logjistikes permes fletave te dergeses.',
  groups: [
    {
      id: 'acc-overview',
      title: 'Dashboard dhe permbledhje',
      pages: [
        {
          id: 'acc-dashboard',
          route: '/accounting',
          title: 'Dashboard i kontabilitetit',
          blocks: [
            {
              kind: 'p',
              text:
                'KPI MTD/YTD: te ardhurat (cash & accrual), shpenzimet, AR i hapur, AR i vonuar, skanime ne pritje, produkte me stok te ulet. Hap me skanimin e shpejte te dokumentit dhe panelin e shendetit te perputhshmerise.',
            },
          ],
        },
      ],
    },

    {
      id: 'acc-sales',
      title: 'Shitjet dhe fatura',
      pages: [
        {
          id: 'acc-contacts',
          route: '/accounting/contacts',
          title: 'Kontaktet',
          blocks: [
            { kind: 'p', text: 'Kontakte biznesi (furnizues, klient) me VAT, adresa, kushte pagese. Te ndryshme nga "Partneret" e modulit logjistike: keto perdoren ne fatura.' },
          ],
        },
        {
          id: 'acc-products',
          route: '/accounting/products',
          title: 'Produktet',
          blocks: [
            { kind: 'p', text: 'Katalogu i sherbimeve/produkteve me njesi, cmim, VAT rate. Perdoren si rresht artikujsh ne fatura.' },
          ],
        },
        {
          id: 'acc-invoices',
          route: '/accounting/invoices',
          title: 'Faturat',
          blocks: [
            {
              kind: 'p',
              text:
                'CRUD i plote. Tipet: fature normale dhe kredit note. Statuset: draft -> sent -> paid/partial/overdue/cancelled. Permban shumellojshmeri eksportesh.',
            },
            {
              kind: 'fields',
              title: 'Fushat kryesore',
              fields: [
                { name: 'Tipi', description: 'Fature ose kredit note.', required: true },
                { name: 'Monedha', description: 'EUR, USD, ALL, etj. Default merret nga kompania.', required: true },
                { name: 'Kontakti (klienti)', description: 'Zgjidhet nga lista.', required: true },
                { name: 'Date / Date afati', description: 'Per llogarit kushtet e pageses.', required: true },
                { name: 'Artikujt', description: 'Produkt, sasi, njesi, cmim, VAT, zbritje.', required: true },
                { name: 'Shenime', description: 'Tekst i lire qe shfaqet ne fund te fatures.', required: false },
              ],
            },
            {
              kind: 'callout',
              tone: 'tip',
              text:
                'Dergimi i fatures: butoni "Dergo me email" perdor template-t nga /company/email/templates dhe regjistron eventin ne /company/email/log.',
            },
          ],
        },
        {
          id: 'acc-invoice-builder',
          route: '/accounting/invoices/new',
          title: 'Builder i fatures',
          blocks: [
            { kind: 'p', text: 'Formular interaktiv me llogaritje automatike te VAT-it dhe totalit. Mund te lidhni nje flete dergese ekzistuese qe permbushja te plotesohet vetvetiu.' },
          ],
        },
        {
          id: 'acc-invoice-print',
          route: '/accounting/invoices/:id/print',
          title: 'Printim',
          blocks: [
            { kind: 'p', text: 'Layout per shtypje. Permban logon e kompanise, header/footer nga konfigurimi, dhe QR per pagese (nese eshte aktivizuar).' },
          ],
        },
        {
          id: 'acc-clients',
          route: '/accounting/clients',
          title: 'Faturat sipas klientit',
          blocks: [
            { kind: 'p', text: 'Pamje e filtruar e fatures sipas klientit. Per cdo klient shihet balanca AR aktuale.' },
          ],
        },
        {
          id: 'acc-deliveries',
          route: '/accounting/deliveries',
          title: 'Fletet e dergeses te pa faturuara',
          blocks: [
            { kind: 'p', text: 'Lista e fletave te dergeses qe nuk jane ende te lidhura me asnje fature. Klikoni nje rresht per ta hapur direkt ne builder-in e fatures me fushat e parapopulluara.' },
          ],
        },
      ],
    },

    {
      id: 'acc-purchases',
      title: 'Blerje dhe shpenzime',
      pages: [
        {
          id: 'acc-purchases-page',
          route: '/accounting/purchases',
          title: 'Blerjet',
          blocks: [
            { kind: 'p', text: 'Regjistroni fatura te ardhura nga furnizuesit. Mund te bashkoni skanime te dokumentit dhe klasifikim sipas kategorise se shpenzimit.' },
          ],
        },
        {
          id: 'acc-expense-categories',
          route: '/accounting/expenses',
          title: 'Kategorite e shpenzimeve',
          blocks: [
            { kind: 'p', text: 'Chart of accounts per shpenzimet: qira, sherbimet, karburanti, paga, etj. Lidhen ne raporte.' },
          ],
        },
        {
          id: 'acc-scans',
          route: '/accounting/scans',
          title: 'Skanime te kuponave',
          blocks: [
            {
              kind: 'p',
              text:
                'Ngarkoni masivisht foto te kuponave/faturave. AI nxjerr datat, shumat, furnizuesin. Ju korrigjoni dhe kategorizoni cdo nje, pastaj klikoni "Krijo blerjen" qe te kthehet ne nje regjistrim formal.',
            },
          ],
        },
        {
          id: 'acc-imports',
          route: '/accounting/imports',
          title: 'Importi i ekstraktit bankar',
          blocks: [
            { kind: 'p', text: 'Importoni CSV-n e ekstraktit nga banka. Sistemi i krahason rreshtat me fatura/blerje ekzistuese dhe sugjeron pajtimet.' },
          ],
        },
      ],
    },

    {
      id: 'acc-banking',
      title: 'Banka dhe arketim',
      pages: [
        {
          id: 'acc-bank-accounts',
          route: '/accounting/bank-accounts',
          title: 'Llogarite bankare',
          blocks: [
            { kind: 'p', text: 'Regjistron banke ose llogari arke. Cdo monedhe ka llogari te vecante.' },
          ],
        },
        {
          id: 'acc-bank-reconciliation',
          route: '/accounting/bank-reconciliation',
          title: 'Pajtim bankar',
          blocks: [
            { kind: 'p', text: 'Lidhni rreshtat e ekstraktit bankar me transaksione ne ledger. Flagjon dhe zgjidhni mospertypjet.' },
          ],
        },
        {
          id: 'acc-transactions',
          route: '/accounting/transactions',
          title: 'Transaksione manuale',
          blocks: [
            { kind: 'p', text: 'Hyrje manuale ne ledger per te ardhura/shpenzime jashte workflow-it normal te fatures dhe blerjes (p.sh. interesa banke, korrigjime).' },
          ],
        },
      ],
    },

    {
      id: 'acc-inventory-assets',
      title: 'Inventari dhe asetet',
      pages: [
        {
          id: 'acc-stock',
          route: '/accounting/stock',
          title: 'Stoku per kontabilitet',
          blocks: [
            { kind: 'p', text: 'Inventar i produkteve per rishitje ose perdorim te brendshem. Llogaritet baza e kostos sipas FIFO/LIFO.' },
          ],
        },
        {
          id: 'acc-assets',
          route: '/accounting/assets',
          title: 'Asetet fikse',
          blocks: [
            {
              kind: 'p',
              text:
                'Aktivet kapitale (automjete, pajisje) me skeden e amortizimit. Sistemi llogarit automatikisht amortizimin mujor sipas metodes se zgjedhur (linear, degresiv).',
            },
          ],
        },
      ],
    },

    {
      id: 'acc-reports',
      title: 'Raportet dhe perputhshmeria',
      pages: [
        {
          id: 'acc-reports-page',
          route: '/accounting/reports',
          title: 'Raporte',
          blocks: [
            { kind: 'p', text: 'P&L, Balance Sheet, Cash Flow, AR Aging, AP Aging, ndarja e shpenzimeve, buxhet vs aktual.' },
          ],
        },
        {
          id: 'acc-financials',
          route: '/accounting/financials',
          title: 'Pasqyrat financiare (GoBD)',
          blocks: [
            { kind: 'p', text: 'P&L dhe Balance Sheet ne format GoBD per Gjermani. Aktivizohet vetem nese country_code = DE.' },
          ],
        },
        {
          id: 'acc-coa',
          route: '/accounting/coa',
          title: 'Chart of Accounts',
          blocks: [
            { kind: 'p', text: 'Strukture GL: asete, detyrime, kapitali, te ardhurat, shpenzimet. Templates te paracaktuara per DE, FR, AL.' },
          ],
        },
        {
          id: 'acc-datev',
          route: '/accounting/datev-export',
          title: 'Eksport DATEV',
          blocks: [
            {
              kind: 'p',
              text:
                'Vetem per Gjermani. Eksport i transaksioneve GL ne format DATEV CSV per dorezim tek kontabilisti tatimor.',
            },
            {
              kind: 'callout',
              tone: 'info',
              text:
                'Edge function "generate-datev-export" pergatit skedarin. Per SAF-T (Portugali, AL etj) perdorni "generate-saft" qe shfaqet ne te njejten faqe nese country_code lejon.',
            },
          ],
        },
        {
          id: 'acc-settings',
          route: '/accounting/settings',
          title: 'Konfigurim',
          blocks: [
            { kind: 'p', text: 'Mapping i chart of accounts, monedha default, numeralizimi i fatures, VAT sipas vendit.' },
          ],
        },
      ],
    },
  ],
};
