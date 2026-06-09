import type { ManualSection } from './types';

export const depotDepoistManual: ManualSection = {
  id: 'depot_depoist',
  role: 'depot_depoist',
  title: 'Manual i depos — Punetor depoist',
  intro:
    'Ky manual eshte per punetorin e depos me "worker_category = depoist". Ai trajton pranimin, sortimin, stokun, riparimet dhe dergesat ne depo. Per punetorin "reparature" shihni manualin perkates.',
  groups: [
    {
      id: 'depot-overview',
      title: 'Dashboard',
      pages: [
        {
          id: 'depot-dashboard',
          route: '/depot',
          title: 'Dashboard i depos',
          blocks: [
            {
              kind: 'p',
              text:
                'Permbledhje e stokut sipas kategorise dhe gjendjes, rrjedha e levizjeve te 6 diteve te fundit (pranim/sortim/riparim/dergese), batchet e sortimit ne pritje dhe log i fundit i aktivitetit.',
            },
            {
              kind: 'list',
              items: [
                'Kartelat tregojne vetem te dhenat e depos suaj (ato qe lidhen me depot_id-ne tuaj).',
                'Klik mbi nje kartele te con te faqja perkatese.',
                'Aktiviteti i fundit perfshin pranim, sortim, riparim te te gjithe stafit te depos.',
              ],
            },
          ],
        },
      ],
    },

    {
      id: 'pranim',
      title: 'Pranimi (Receiving)',
      pages: [
        {
          id: 'depot-receiving',
          route: '/depot/receiving',
          title: 'Pranimi i mallit',
          blocks: [
            {
              kind: 'p',
              text:
                'Regjistroni ardhjet e reja te paletave ne depo. Cdo rresht hyn ne stokun e depos direkt pas konfirmimit.',
            },
            {
              kind: 'steps',
              title: 'Hapat e zakonshme te pranimit',
              steps: [
                'Hapni /depot/receiving.',
                'Zgjidhni partnerin nga lista (ose krijoni ne fluturim).',
                'Per cdo artikull zgjidhni kategorine, produktin, sasine dhe gjendjen (i mire / i demtuar).',
                'Mund te perdorni skanuesin e barkodit per te shtuar paletet me te shpejt.',
                'Klikoni "Skano dokument" per te ngarkuar fleten e dergeses dhe sistemi do te plotesoje fushat me OCR.',
                'Klikoni "Ruaj". Stoku hyn menjehere ne tabelen "depot_stock" dhe regjistrohet ne "stock_movements".',
              ],
            },
            {
              kind: 'callout',
              tone: 'tip',
              text:
                'Per artikujt me defekt, mos i pranoni si "te mire". Kjo do te shkaktoje gabime ne raporte. Zgjidhni "i demtuar" qe ata te kalojne automatikisht ne radhen e riparimit.',
            },
          ],
        },
        {
          id: 'depot-outgoing',
          route: '/depot/outgoing',
          title: 'Dergesat dalese (Outgoing)',
          blocks: [
            {
              kind: 'p',
              text:
                'Caktoni paletet nga stoku per nje flete dergese qe del nga depoja. Sistemi zbret stokun automatikisht dhe shenjon paletet si "gati per dergese".',
            },
          ],
        },
      ],
    },

    {
      id: 'sortim',
      title: 'Sortimi',
      pages: [
        {
          id: 'depot-sorting',
          route: '/depot/sorting',
          title: 'Sortimi ne batch',
          blocks: [
            {
              kind: 'p',
              text:
                'Krijoni nje batch sortimi nga stoku i pranuar. Cdo artikull klasifikoheni sipas gjendjes (i mire / i demtuar / defekt). Defektet duhet te kene arsyen e specifikuar (transport, ngarkim, klima, prodhim).',
            },
            {
              kind: 'steps',
              title: 'Krijimi i nje batch te ri',
              steps: [
                'Klikoni "Batch i ri" siper.',
                'Zgjidhni kategorine dhe shtoni artikujt rresht per rresht.',
                'Per cdo rresht, vendos sasine dhe gjendjen. Per defekt, shenoni arsyen.',
                'Mund te ndaloni dhe rikthehet me vone nje batch (status "in_progress").',
                'Kur perfundon, klikoni "Mbyll batch". Ne kete moment stoku perditesohet dhe paletet e demtuara hyjne automatikisht ne radhen e riparimit.',
              ],
            },
          ],
        },
      ],
    },

    {
      id: 'riparime',
      title: 'Riparimet',
      pages: [
        {
          id: 'depot-repairs',
          route: '/depot/repairs',
          title: 'Radha e riparimit',
          blocks: [
            {
              kind: 'p',
              text:
                'Lista e artikujve te demtuar qe presin riparim. Filtroni sipas kategorise, urgjences dhe dates. Mund te caktoni nje rresht ne nje punetor reparature ose te shenoni si te perfunduar drejtperdrejt.',
            },
          ],
        },
        {
          id: 'depot-repair-workers',
          route: '/depot/repair-workers',
          title: 'Punetoret e riparimit',
          blocks: [
            {
              kind: 'p',
              text:
                'Lista e punetoreve me "worker_category = reparature" qe i takojne kesaj depo. Cdo kartele tregon ngarkesen aktuale dhe historinin.',
            },
          ],
        },
        {
          id: 'depot-worker-entry',
          route: '/depot/repair-workers/:workerId',
          title: 'Regjistrimi i riparimit',
          blocks: [
            {
              kind: 'p',
              text:
                'Formulari ku worker-i (ose menaxheri) regjistron rezultatin e riparimit. Plotesohet sasia hyrese, sasia e riparuar, sasia e skraps, kategoria destinacioni dhe shenime.',
            },
            {
              kind: 'callout',
              tone: 'warn',
              text:
                'Ky formular thirr RPC-n "apply_repair_from_stock". Nese rezultati eshte 0 (asnje cope per te raportuar), do te merrni gabimin: "Asnje sasi per te raportuar".',
            },
          ],
        },
        {
          id: 'depot-damage',
          route: '/depot/damage',
          title: 'Raporte demtimi',
          blocks: [
            {
              kind: 'p',
              text:
                'Raportoni demtime te zbuluara gjate pranimit ose sortimit. Cdo raport perfshin arsyen, foton, sasine dhe gjendjen e kaluar.',
            },
          ],
        },
      ],
    },

    {
      id: 'depot-stoku',
      title: 'Stoku dhe raportet',
      pages: [
        {
          id: 'depot-stock',
          route: '/depot/stock',
          title: 'Stoku i depos',
          blocks: [
            {
              kind: 'p',
              text:
                'Pamje e detajuar e stokut te depos suaj sipas kategorise, produktit dhe gjendjes. Ndryshe nga /company/stock (qe eshte agregat), kjo eshte vetem per depon tuaj.',
            },
          ],
        },
        {
          id: 'depot-delivery-notes',
          route: '/depot/delivery-notes',
          title: 'Fletet e dergeses',
          blocks: [
            {
              kind: 'p',
              text:
                'Vetem-lexim. Shihni fletet e dergeses te caktuara per depon tuaj qe presin pranim ose dergim. Per ndryshime kontaktoni company_admin.',
            },
          ],
        },
        {
          id: 'depot-trailers',
          route: '/depot/trailers',
          title: 'Rimorkiot',
          blocks: [
            {
              kind: 'p',
              text:
                'Lista e rimorkiove te caktuara ne depon tuaj me pozicionin e fundit dhe statusin e mirembajtjes.',
            },
          ],
        },
        {
          id: 'depot-reports',
          route: '/depot/reports',
          title: 'Raporte te depos',
          blocks: [
            {
              kind: 'p',
              text:
                'KPI ditore per depon: prurje, sortime, dergesa, plakja e stokut sipas kategorise, frekuenca e demtimeve, cikli i riparimit.',
            },
          ],
        },
      ],
    },

    {
      id: 'depot-hr-admin',
      title: 'HR dhe administrim',
      pages: [
        { id: 'depot-leave', route: '/depot/leave', title: 'Pushimet e mia', blocks: [{ kind: 'p', text: 'Kerkoni nje pushim, shihni statusin (ne pritje / aprovuar / refuzuar) dhe historikun.' }] },
        { id: 'depot-attendance', route: '/depot/attendance', title: 'Prezenca ime', blocks: [{ kind: 'p', text: 'Punch-in / punch-out manual per dite, me historik mujor.' }] },
        { id: 'depot-work-hours', route: '/depot/work-hours', title: 'Oret e mia te punes', blocks: [{ kind: 'p', text: 'Log dite per dite te oreve te punuara, me total javor.' }] },
        { id: 'depot-chat', route: '/depot/chat', title: 'Chat', blocks: [{ kind: 'p', text: 'Mesazhe me company_admin dhe stafin tjeter te depos.' }] },
        { id: 'depot-documents', route: '/depot/documents', title: 'Dokumentet', blocks: [{ kind: 'p', text: 'Akses te dokumentet e ndara nga kompania.' }] },
        { id: 'depot-settings', route: '/depot/settings', title: 'Konfigurim personal', blocks: [{ kind: 'p', text: 'Profili, telefoni, fjalekalimi, preferencat per njoftime. Roli, kategoria, depo dhe statusi i aktivizimit nuk mund te ndryshohen nga vete perdoruesi.' }] },
      ],
    },
  ],
};

export const depotReparatureManual: ManualSection = {
  id: 'depot_reparature',
  role: 'depot_reparature',
  title: 'Manual i depos — Punetor reparature',
  intro:
    'Ky manual eshte per punetorin e depos me "worker_category = reparature". Ai sheh nje grup te kufizuar faqesh: dashboard-in, HR-in, chat-in, dokumentet dhe formularin e regjistrimit te riparimeve.',
  groups: [
    {
      id: 'reparature-overview',
      title: 'Cfare sheh nje reparature',
      pages: [
        {
          id: 'reparature-scope',
          route: '/depot',
          title: 'Akses i limituar',
          blocks: [
            {
              kind: 'p',
              text:
                'Si punetor reparature ju keni akses vetem ne keto faqe:',
            },
            {
              kind: 'list',
              items: [
                '/depot — Dashboard i depos (vetem-lexim).',
                '/depot/leave — Pushimet e mia.',
                '/depot/attendance — Prezenca ime.',
                '/depot/work-hours — Oret e mia te punes.',
                '/depot/chat — Mesazhe.',
                '/depot/documents — Dokumentet e ndara.',
                '/depot/settings — Profili im.',
              ],
            },
            {
              kind: 'callout',
              tone: 'info',
              text:
                'Faqet operacionale (pranim, sortim, stok, riparime, dergesa, raporte) jane te bllokuara nga ProtectedRoute me workerCategories=["depoist"]. Nese provoni te hapni nje URL te tille, sistemi ju con ne /no-access.',
            },
          ],
        },
        {
          id: 'reparature-entry',
          route: '/depot/repair-workers/:workerId',
          title: 'Regjistrimi i riparimit (per ju)',
          blocks: [
            {
              kind: 'p',
              text:
                'Megjithese ju vete nuk e hapni kete faqe, menaxheri (depoist) e perdor per te shenuar perfundimet tuaja: sasi te riparuara, sasi skrapi, koha. Numrat tuaj shfaqen tek "Punetoret" ne Repair Hub te company_admin.',
            },
          ],
        },
        {
          id: 'reparature-hr',
          title: 'HR — Pushim, prezence, ore pune',
          blocks: [
            {
              kind: 'p',
              text:
                'Ne kete sektor procedurat jane te njejta me ato te depoist: kerkesa per pushim aprovohet/refuzohet nga company_admin, dhe ju merrni njoftim push automatikisht.',
            },
          ],
        },
      ],
    },
  ],
};
