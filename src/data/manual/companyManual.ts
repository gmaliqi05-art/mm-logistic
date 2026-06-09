import type { ManualSection } from './types';
import { registrationGroup } from './registration';

export const companyManual: ManualSection = {
  id: 'company',
  role: 'company',
  title: 'Manual i kompanise (company_admin)',
  intro:
    'Ky seksion permban manualin e plote per administratorin e kompanise. Ai ka akses ne te gjitha modulet: stoku, dergesat, flota, partnere, raporte, HR, fatura dhe konfigurimi. Permban gjithashtu nenseksionet per perdoruesit nen kete kompani (depo, shofer, kontabilist, logjistike) qe te jete nje burim i vetem perdorimi.',
  groups: [
    registrationGroup,

    {
      id: 'dashboard',
      title: 'Dashboard dhe permbledhje ditore',
      pages: [
        {
          id: 'company-dashboard',
          route: '/company',
          title: 'Dashboard kryesor',
          blocks: [
            {
              kind: 'p',
              text:
                'Faqja qe shfaqet sapo logoheni. Permban "shenjat vitale" te kompanise per diten: numri i depove, shofereve aktive, gjendja e stokut sipas kushtit (i mire / i demtuar / i riparuar), riparimet ne pritje, dergesat aktive dhe ato te vonuara.',
            },
            {
              kind: 'list',
              items: [
                'Kartela "Stoku" — totali nga te gjitha depot, ndare per kategori dhe gjendje.',
                'Kartela "Dergesa aktive" — flete dergese qe nuk jane mbyllur akoma.',
                'Kartela "Per shqyrtim" — fletet qe shoferi i ka konfirmuar dhe presin aprovimin tuaj.',
                'Kartela "Alarme" — skadime te dokumentave (patenta, KOD 95, TUV, ATP) brenda 30 ditesh.',
                'Skanim i shpejte — buton "Skano dokument" qe hap modulin OCR ne te njejten faqe.',
                'Aktiviteti i fundit — log i shkurter i veprimeve te te gjithe perdoruesve ne kompanine tuaj.',
              ],
            },
            {
              kind: 'callout',
              tone: 'tip',
              text:
                'Kartelat jane klikabile: cdo numer ju con direkt te faqja perkatese me filtrat e zbatuara.',
            },
          ],
        },
        {
          id: 'company-live-map',
          route: '/company/live-map',
          title: 'Harta direkt me planifikuesin e rrugeve',
          blocks: [
            {
              kind: 'p',
              text:
                'Shfaq ne kohe reale pozicionin GPS te shofereve qe kane aktivizuar "Tracking" nga aplikacioni i tyre. Per cdo shofer shihet rruga e marre dhe ETA per ndalesat e tjera.',
            },
            {
              kind: 'list',
              items: [
                'Filtra: sipas shoferit, statusit (ne udhetim / ne pushim), date.',
                'Klik mbi marker e shoferit ju jep ngjarjet e fundit dhe dergesen ne ngarkim.',
                'Butoni "Planifiko rruge" — shtoni piket e dergeses dhe sistemi sugjeron renditjen me te shkurter (perdor TomTom API nese eshte konfiguruar ne Settings).',
              ],
            },
            {
              kind: 'callout',
              tone: 'info',
              text:
                'Shoferi i sheh ndryshimet e rruges automatikisht ne /driver/navigation kur company_admin e konfirmon nje rruge te re.',
            },
          ],
        },
      ],
    },

    {
      id: 'fleet',
      title: 'Menaxhimi i flotes',
      intro: 'Cdo gje qe lidhet me automjete, rimorkio, shofere dhe perputhshmerine ligjore.',
      pages: [
        {
          id: 'drivers',
          route: '/company/drivers',
          title: 'Shoferet',
          blocks: [
            {
              kind: 'p',
              text:
                'Lista e te gjithe shofereve aktive te kompanise. Cdo rresht tregon emrin, telefonin, datat e skadimit te dokumentave dhe nje badge me ngjyre kur ndonje dokument eshte afer skadimit.',
            },
            {
              kind: 'steps',
              title: 'Si shtohet nje shofer i ri',
              steps: [
                'Kliko "Shto shofer" siper djathtas.',
                'Plotesoni te dhenat personale dhe kredencialet.',
                'Vendos datat: skadimi i patentes, KOD 95, certifikata mjekesore.',
                'Mund te ngarkoni edhe fotografi te patentes dhe certifikates.',
                'Ruani. Shoferi merr email me hyrjen.',
              ],
            },
            {
              kind: 'fields',
              title: 'Treguesit me ngjyre',
              fields: [
                { name: 'E kuqe (kritike)', description: 'Dokument i skaduar ose me pak se 30 dite ne fund.' },
                { name: 'Portokalli (kujdes)', description: 'Skadon brenda 60 ditesh.' },
                { name: 'Verdhe (njoftim)', description: 'Skadon brenda 90 ditesh.' },
                { name: 'Jeshile (ne rregull)', description: 'Skadimi me shume se 90 dite larg.' },
              ],
            },
          ],
        },
        {
          id: 'vehicles',
          route: '/company/automjetet',
          title: 'Automjetet (kamionet)',
          blocks: [
            {
              kind: 'p',
              text:
                'Regjistron kamionet me te gjitha te dhenat teknike dhe ligjore. Cdo automjet lidhet me nje shofer kryesor (nepermjet vehicle_assignments) dhe me dokumentet perkatese.',
            },
            {
              kind: 'fields',
              title: 'Te dhenat qe duhen plotesuar',
              fields: [
                { name: 'Targe / VIN', description: 'Identifikues unik per kontrollet.', required: true },
                { name: 'Marka / Modeli', description: 'Per raporte dhe perputhshmeri.', required: true },
                { name: 'Peshat', description: 'Pesha bosh, pesha maksimale. Per filtra te rrugeve.', required: false },
                { name: 'Euro emission, ADR, lloji i karburantit', description: 'Per kufizimet ne kufi dhe per ngarkesa te rrezikshme.', required: false },
                { name: 'Permasat (gjatesia/gjeresia/lartesia)', description: 'Perdoret nga planifikuesi i rrugeve per te perjashtuar tunelet/ureat.', required: false },
                { name: 'HU/TÜV, AU, SP, takograf, sigurim, KFZ tax', description: 'Datat e skadimit per cdo dokument.', required: false },
              ],
            },
            {
              kind: 'callout',
              tone: 'warn',
              text:
                'Caktimi i shoferit ne automjet: para insert-it ne vehicle_assignments verifikohet qe shoferi ben pjese ne kompanine tuaj. Nje shofer nga kompani tjeter nuk mund te caktohet.',
            },
          ],
        },
        {
          id: 'trailers',
          route: '/company/trailers',
          title: 'Rimorkiot',
          blocks: [
            {
              kind: 'p',
              text:
                'Pamje e ngjashme me automjetet, e specializuar per rimorkio (semi-trailer, container). Permban datat e ATP (per rimorkiot termoteknike), inspektimet periodike dhe trajetektorin e fundit.',
            },
          ],
        },
        {
          id: 'compliance',
          route: '/company/compliance',
          title: 'Perputhshmeria (Compliance)',
          blocks: [
            {
              kind: 'p',
              text:
                'Permbledhje e te gjitha dokumentave qe skadojne: patentat, KOD 95, certifikatat mjekesore, TUV, AU, sigurimet, ADR. Lejon filtrim per urgjence dhe periudhe.',
            },
            {
              kind: 'list',
              items: [
                'Filtra paraprake: "Te skaduara", "Kritike (≤30 dite)", "Kujdes (≤60)", "Njoftim (≤90)".',
                'Klik mbi nje rresht ju con tek dokumenti specifik (shofer ose automjet).',
                'Eksport ne CSV per ndarje me jurist.',
              ],
            },
          ],
        },
        {
          id: 'fleet-scans',
          route: '/company/fleet-scans',
          title: 'Skanim i dokumentave te flotes',
          blocks: [
            {
              kind: 'p',
              text:
                'Ngarkoni nje grup fotosh dokumentesh dhe sistemi i njeh me OCR (edge function "scan-fleet-document"). Identifikon llojin (patente, KOD 95, TUV...) dhe nxjerr datat e skadimit. Pastaj sistemi i lidh automatikisht me shoferin/automjetin perkates.',
            },
            {
              kind: 'callout',
              tone: 'tip',
              text:
                'Kjo eshte menyra me e shpejte per te ngarkuar dhjetera dokumente njeheresh. Pas skanit, ju i verifikoni te dhenat dhe konfirmoni.',
            },
          ],
        },
        {
          id: 'fleet-reports',
          route: '/company/fleet-reports',
          title: 'Raportet e flotes',
          premium: true,
          blocks: [
            {
              kind: 'p',
              text:
                'Vetem me planin premium. Grafiqe te shperndarjes se skadimeve, perdorimi i shofereve, ndalesat e automjeteve dhe nje hartë e nxehte risku.',
            },
          ],
        },
      ],
    },

    {
      id: 'depo-stok',
      title: 'Depot dhe stoku',
      intro: 'Menaxhimi i depove fizike dhe i stokut te paletave (te mira, te demtuara, te riparuara).',
      pages: [
        {
          id: 'depots',
          route: '/company/depots',
          title: 'Depot',
          blocks: [
            {
              kind: 'p',
              text:
                'Listoni dhe konfiguroni depot e kompanise: emri, adresa, telefoni, menaxheri. Cdo depo ka taba: te dhenat e depos, punetoret depoist, punetoret reparature, dhe log-u i riparimeve.',
            },
            {
              kind: 'fields',
              title: 'Cilesite',
              fields: [
                { name: 'Emri i depos', description: 'P.sh. "Depo Tirana - Vora".', required: true },
                { name: 'Adresa', description: 'Perdoret per geokodim dhe ETA per shoferet.', required: true },
                { name: 'Menaxheri', description: 'Nje user me rol depot_worker (depoist) qe trajtohet si "supervisor".', required: false },
                { name: 'Eshte depo qendrore?', description: 'Nese po, perdoret si destinacion default kur dergesa nuk ka depo specifike.', required: false },
              ],
            },
          ],
        },
        {
          id: 'stock',
          route: '/company/stock',
          title: 'Stoku i kompanise',
          blocks: [
            {
              kind: 'p',
              text:
                'Pamje agregate e te gjithe stokut, per te gjitha depot, per te gjitha kategorite dhe produktet. Eshte burimi i vetem i te vertetes per gjendjen.',
            },
            {
              kind: 'list',
              items: [
                'Tab "Aktiv" — stoku ne gjendje "i mire".',
                'Tab "Me defekt" — stoku ne gjendje "i demtuar" qe pret riparim.',
                'Cdo kartele produkti hapet per te treguar shperndarjen sipas depove.',
                'Brenda kartele shihet edhe burimi i hyrjes (riparim, dergese, manual).',
                'Veprime: regjistrim manual, transferim midis depove, korrigjim sasie.',
              ],
            },
            {
              kind: 'callout',
              tone: 'info',
              text:
                'Cdo ndryshim shkruan automatikisht ne tabelen "stock_movements" me identitetin e perdoruesit. Audit-i eshte i plote dhe i pandryshueshem.',
            },
          ],
        },
        {
          id: 'categories',
          route: '/company/categories',
          title: 'Kategorite e produkteve',
          blocks: [
            {
              kind: 'p',
              text:
                'Strukturoni produktet ne kategori (p.sh. "Paleta EUR", "Paleta CP1", "Paleta plastike"). Cdo produkt ben pjese ne nje kategori. Kategoria eshte filtri kryesor ne raporte dhe ne stokun.',
            },
          ],
        },
        {
          id: 'stock-alerts',
          route: '/company/stock-alerts',
          title: 'Alarme te stokut',
          premium: true,
          blocks: [
            {
              kind: 'p',
              text:
                'Caktoni minimum dhe maksimum per cdo kategori dhe cdo depo. Kur stoku tejkalon vleren, sistemi dergon njoftim push dhe email tek administratoret.',
            },
          ],
        },
        {
          id: 'repair-hub',
          route: '/company/repair-reports',
          title: 'Qendra e riparimeve',
          blocks: [
            {
              kind: 'p',
              text:
                'Pamje me taba per gjithe procesin e riparimit:',
            },
            {
              kind: 'list',
              items: [
                'Tab "Ne pritje" — paletat e demtuara qe presin riparim.',
                'Tab "Te perfunduara" — historiku me sasine e riparuar, ate te skrapit dhe punetorin.',
                'Tab "Demtimet" — raporte demtimi sipas arsyes (transport, klima, ngarkim).',
                'Tab "Punetoret" — KPI per cdo worker (reparature): sa rregullon, sa skrap, sa kohe.',
              ],
            },
            {
              kind: 'callout',
              tone: 'info',
              text:
                'Cdo regjistrim riparimi nga depo-worker thirret me RPC "apply_repair_from_stock" qe automatikisht zbret stokun e demtuar, shton ate te mire, krijon nje rresht ne "depot_repairs" dhe nje ne "stock_movements".',
            },
          ],
        },
      ],
    },

    {
      id: 'dergesat',
      title: 'Dergesat dhe logjistika',
      pages: [
        {
          id: 'delivery-notes',
          route: '/company/delivery-notes',
          title: 'Fletet e dergeses',
          blocks: [
            {
              kind: 'p',
              text:
                'Krijoni dhe menaxhoni fletet e dergeses (delivery notes). Cdo flete percakton: tipi (marrje ose dergese), partneri, adresa, shoferi i caktuar, depo origjine/destinacioni, artikujt me sasi dhe gjendje, oraret.',
            },
            {
              kind: 'steps',
              title: 'Cikli i statusit',
              steps: [
                'Draft — flete ne pune, jo ende dergua.',
                'Sent — derguar shoferit, pret marrjen ne dorezim.',
                'In-transit — shoferi e ka pranuar dhe eshte ne udhetim.',
                'Pending-review — shoferi konfirmoi dergesen, pret aprovimin tuaj.',
                'Delivered — dergesa u perfundua, stoku eshte azhornuar.',
                'Confirmed — administratori shqyrtoi dhe e mbylli formalisht.',
              ],
            },
            {
              kind: 'callout',
              tone: 'tip',
              text:
                'Kur shoferi konfirmon dorezimin, automatikisht ju vjen nje njoftim push "Dergesa u konfirmua nga shoferi" me numrin perkates te dokumentit. Pas kesaj duhet ta hapni ne "Per shqyrtim" dhe ta mbyllni.',
            },
          ],
        },
        {
          id: 'delivery-notes-print',
          route: '/company/delivery-notes/:id/print',
          title: 'Printim i fletes se dergeses',
          blocks: [
            {
              kind: 'p',
              text:
                'Faqe per shtypje (printer-friendly) me QR kod. QR-i lexohet nga aplikacioni i shoferit per te konfirmuar pranimin/dorezimin pa nevoje per kopjim manual.',
            },
          ],
        },
        {
          id: 'route-planner',
          route: '/company/route-planner',
          title: 'Planifikuesi i rrugeve',
          blocks: [
            {
              kind: 'p',
              text:
                'Caktoni nje grup fletesh dergese tek shoferi, shihni rrugen e propozuar ne harte dhe optimizoni renditjen. Perdor edge function "plan-truck-route" qe llogarit ETA dhe distancen sipas permasave te kamionit.',
            },
          ],
        },
        {
          id: 'review',
          route: '/company/review',
          title: 'Per shqyrtim (Review)',
          blocks: [
            {
              kind: 'p',
              text:
                'Lista e dergesave qe shoferi i ka shenuar si te konfirmuara, por presin aprovimin tuaj. Hapni nje rresht, shihni foton, nenshkrimin, GPS-in dhe pastaj klikoni "Konfirmo dhe poste stokun" ose "Refuzo".',
            },
          ],
        },
        {
          id: 'overdue',
          route: '/company/overdue',
          title: 'Dergesa te vonuara',
          blocks: [
            {
              kind: 'p',
              text:
                'Fletet qe kane kaluar daten e caktuar. Per cdo rresht shihet arsyeja qe ka raportuar shoferi (klienti mungonte, problem teknik, trafiku) dhe veprimet e mundshme: ricaktim shoferi, ndryshim orari, mbyllje pa dergese.',
            },
          ],
        },
      ],
    },

    {
      id: 'partnere-paleta',
      title: 'Partneret dhe llogarite e paletave',
      pages: [
        {
          id: 'partners',
          route: '/company/partners',
          title: 'Partneret',
          blocks: [
            {
              kind: 'p',
              text:
                'Kontaktet e biznesit: furnizues, klient, partnere te logjistikes. Permbajne VAT, adrese, telefon, email, kushte pagese. Perdoren ne flete dergese, fatura, raporte.',
            },
          ],
        },
        {
          id: 'partner-flows',
          route: '/company/partner-flows',
          title: 'Rrjedha e paletave nga/per partnere',
          blocks: [
            {
              kind: 'p',
              text:
                'Pamje grafike per cdo partner: sa palet hyne, sa palet dolen, balanca aktuale. Perdoret per pajtimin (reconciliation) me partneret pool-imi.',
            },
          ],
        },
        {
          id: 'pallet-accounts',
          route: '/company/pallet-accounts',
          title: 'Llogarite e paletave',
          blocks: [
            {
              kind: 'p',
              text:
                'Ledger zyrtar per pooling-un e paletave: sa eshte borxh kompania ndaj partnerit ose anasjelltas. Cdo flete dergese qe ka tipin "pool" rrit ose ul kete llogari automatikisht.',
            },
          ],
        },
      ],
    },

    {
      id: 'raporte',
      title: 'Raportet',
      pages: [
        {
          id: 'reports',
          route: '/company/reports',
          title: 'Raporte operacionale',
          blocks: [
            {
              kind: 'p',
              text:
                'Dashboard ekzekutiv me grafike per cdo gje: rrjedha e stokut, levizjet sipas tipit/dates/partner, demtimet sipas arsyes/gjendjes, KPI te dergesave (% ne kohe, te konfirmuara vs ne pritje), renditje shoferesh per performance.',
            },
          ],
        },
        {
          id: 'sorting-reports',
          route: '/company/sorting-reports',
          title: 'Raporte te sortimit',
          blocks: [
            {
              kind: 'p',
              text:
                'KPI sipas batch-it te sortimit: sasi te pranuara vs te sortuara vs ne proces, kohe cikli per batch, % e defekteve te zbuluara per batch.',
            },
          ],
        },
        {
          id: 'financial-summary',
          route: '/company/financial-summary',
          title: 'Permbledhje financiare',
          premium: true,
          blocks: [
            {
              kind: 'p',
              text:
                'Vetem me abonimin Accounting. Te ardhurat MTD/YTD, shpenzimet, faturat e leshuara, blerjet, plakja e AR, klientet kryesore.',
            },
          ],
        },
        {
          id: 'audit-report',
          route: '/company/audit-report',
          title: 'Raporti i audit-it',
          blocks: [
            {
              kind: 'p',
              text:
                'Log agregat i te gjitha veprimeve (krijim, perditesim, fshirje) sipas tipit te entitetit, perdoruesit dhe dates. Eksport per perputhshmeri.',
            },
          ],
        },
      ],
    },

    {
      id: 'hr',
      title: 'Burimet njerezore (HR)',
      intro: 'Vetem me planin premium. Permban pushime, prezence, ore pune dhe raportime.',
      pages: [
        {
          id: 'hr-dashboard',
          route: '/company/hr',
          title: 'Dashboard HR',
          premium: true,
          blocks: [
            { kind: 'p', text: 'Permbledhje e numrit te punonjesve, kerkesat per pushim ne pritje, statistika prezence, ore te punuara YTD.' },
          ],
        },
        {
          id: 'hr-leave',
          route: '/company/hr/requests',
          title: 'Kerkesat per pushim',
          premium: true,
          blocks: [
            {
              kind: 'p',
              text:
                'Aprovoni ose refuzoni kerkesat per pushim te punonjesve. Cdo aprovim/refuzim dergon automatikisht njoftim te kerkuesi (push + in-app).',
            },
          ],
        },
        {
          id: 'hr-attendance',
          route: '/company/hr/attendance',
          title: 'Prezenca',
          premium: true,
          blocks: [
            { kind: 'p', text: 'Log manual i hyrjeve/daljeve dhe kalendari i mungesave per cdo punonjes. Shoferi ka punch-in automatik kur fillon track-ing-un.' },
          ],
        },
        {
          id: 'hr-work-hours',
          route: '/company/hr/work-hours',
          title: 'Oret e punes',
          premium: true,
          blocks: [
            { kind: 'p', text: 'Log oresh i punes (manual ose integrim me tracking-un GPS), llogaritja e overtime sipas konfigurimit.' },
          ],
        },
        {
          id: 'hr-reports',
          route: '/company/hr/reports',
          title: 'Raporte HR',
          premium: true,
          blocks: [
            { kind: 'p', text: 'Qarkullimi, ditet e mungeses, oret e overtime, pushimet sipas tipit (vacation/sick/unpaid).' },
          ],
        },
        {
          id: 'hr-settings',
          route: '/company/hr/settings',
          title: 'Konfigurimi i HR',
          premium: true,
          blocks: [
            { kind: 'p', text: 'Tipet e pushimeve, oret e punes per jave, multiplikatoret e overtime, workflow-i i aprovimit.' },
          ],
        },
      ],
    },

    {
      id: 'email-automation',
      title: 'Automatizimi i email-eve',
      intro: 'Premium. Konfigurim i templateve, branding-ut, rregullave automatike dhe log-ut.',
      pages: [
        { id: 'email-templates', route: '/company/email/templates', title: 'Template emaili', premium: true, blocks: [{ kind: 'p', text: 'Krijim/editim i template-ve transaksionale me merge fields (p.sh. {{numri_dergeses}}).' }] },
        { id: 'email-branding', route: '/company/email/branding', title: 'Branding i emailit', premium: true, blocks: [{ kind: 'p', text: 'Logo, ngjyrat, header/footer per emailet e kompanise.' }] },
        { id: 'email-automation-rules', route: '/company/email/automation', title: 'Rregulla automatike', premium: true, blocks: [{ kind: 'p', text: 'Dergim automatik i emailit kur ndodh nje event (p.sh. "Dergese e konfirmuar" => preview i fatures per klient).' }] },
        { id: 'email-manual', route: '/company/email/send', title: 'Email manual', premium: true, blocks: [{ kind: 'p', text: 'Dergim ad-hoc tek partnere, shofere, ose te gjithe punonjesit.' }] },
        { id: 'email-log', route: '/company/email/log', title: 'Log i email-eve', premium: true, blocks: [{ kind: 'p', text: 'Lista e te derguarve me marresin, subjektin, kohen dhe statusin (deliver/bounce).' }] },
      ],
    },

    {
      id: 'fatura',
      title: 'Fatura (accounting integration)',
      intro: 'Premium, gated nga abonimi accounting. Lidh fletet e dergeses me fatura.',
      pages: [
        {
          id: 'invoices',
          route: '/company/invoices',
          title: 'Faturat',
          premium: true,
          blocks: [
            {
              kind: 'p',
              text:
                'Krijoni dhe dergoni fatura nga flete dergese ose manualisht. Statuset: draft, sent, paid, partial, overdue, cancelled. Eksport ne X-Rechnung (DE) ose SAF-T (international). Printim dhe email automatik.',
            },
          ],
        },
        {
          id: 'accounting-upgrade',
          route: '/company/accounting-upgrade',
          title: 'Aktivizo modulin Accounting',
          blocks: [
            { kind: 'p', text: 'Nese moduli accounting nuk eshte aktivizuar, faqja ofron upgrade me Stripe. Pas pageses, accountingEnabled vendoset true ne SubscriptionContext.' },
          ],
        },
      ],
    },

    {
      id: 'administrim',
      title: 'Administrim dhe konfigurim',
      pages: [
        {
          id: 'settings',
          route: '/company/settings',
          title: 'Konfigurimi i kompanise',
          blocks: [
            {
              kind: 'p',
              text:
                'Profili i kompanise (emri, adresa, telefoni, email, logo, VAT), defaults per fature (prefiksi, monedha, VAT-i, kushtet e pageses, teksti i header/footer), TomTom API key per planifikim rrugesh.',
            },
          ],
        },
        {
          id: 'api-webhooks',
          route: '/company/settings/api-webhooks',
          title: 'API & Webhooks',
          premium: true,
          blocks: [
            {
              kind: 'p',
              text:
                'Krijim i webhook-ve te personalizuara per te njoftuar sisteme te jashtme kur ndryshon statusi i nje flete dergese, leviz stoku, ose skadon nje dokument.',
            },
          ],
        },
        {
          id: 'data-export',
          route: '/company/data-export',
          title: 'Eksport i te dhenave',
          premium: true,
          blocks: [
            { kind: 'p', text: 'Eksport i te gjitha te dhenave te kompanise ne CSV/JSON per backup ose import ne BI.' },
          ],
        },
        {
          id: 'audit-log',
          route: '/company/audit-log',
          title: 'Audit log',
          premium: true,
          blocks: [
            { kind: 'p', text: 'Log real-time me filtra per tip entiteti, perdorues, veprim, dato. Eksport CSV.' },
          ],
        },
        {
          id: 'documents',
          route: '/company/documents',
          title: 'Dokumentet e kompanise',
          blocks: [
            { kind: 'p', text: 'Repozitor qendror dokumentesh (kontrata, politika, template) i ndare me te gjithe perdoruesit e kompanise.' },
          ],
        },
        {
          id: 'chat',
          route: '/company/chat',
          title: 'Chat-i i brendshem',
          blocks: [
            { kind: 'p', text: 'Mesazhe te brendshme me te gjithe stafin (shofere, depo, kontabilist). Suporton bisheda 1-me-1 dhe grupe.' },
          ],
        },
      ],
    },
  ],
};
