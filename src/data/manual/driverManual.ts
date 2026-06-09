import type { ManualSection } from './types';

export const driverManual: ManualSection = {
  id: 'driver',
  role: 'driver',
  title: 'Manual i shoferit',
  intro:
    'Ky manual eshte per shoferet. Aplikacioni eshte i optimizuar per perdorim mobile (PWA). Mund te instalohet ne ekranin kryesor te telefonit duke klikuar banner-in "Instalo".',
  groups: [
    {
      id: 'driver-overview',
      title: 'Dashboard dhe detyrat',
      pages: [
        {
          id: 'driver-dashboard',
          route: '/driver',
          title: 'Dashboard i shoferit',
          blocks: [
            {
              kind: 'p',
              text:
                'Faqja kryesore tregon te gjitha detyrat tuaja te caktuara, te grupuara sipas dates: sot, te ardhshme, te vonuara. Cdo rresht ka badge-in e statusit dhe veprimet e mundshme.',
            },
            {
              kind: 'list',
              items: [
                'Pjesa siper: alarme per dokumentat tuaj (patenta, KOD 95, mjekesia) qe afrojne skadimin.',
                'Pjesa "Detyrat e sotme": flete dergese me oraret dhe adresat.',
                'Cdo flete ka butona te shpejte: "Hap navigimin", "Skano dokument", "Konfirmo dorezimin".',
                'Kur konfirmoni nje dorezim, sistemi i ben push notification administratorit te kompanise.',
              ],
            },
            {
              kind: 'steps',
              title: 'Konfirmimi i dorezimit (proof of delivery)',
              steps: [
                'Hapni fletin perkates ne dashboard.',
                'Klikoni "Konfirmo dorezimin".',
                'Bej nje foto te dorezimit (e detyrueshme).',
                'Opsionale: bej foto te nenshkrimit te klientit.',
                'Verifiko GPS-in (kapet automatikisht).',
                'Ruani. Statusi behet "delivered" dhe administratori merr njoftim "Dergesa u konfirmua nga shoferi".',
              ],
            },
            {
              kind: 'callout',
              tone: 'warn',
              text:
                'Mungesa e fotos shkakton gabim. Sistemi e kerkon si dokumentacion te dorezimit. Per dergesa pa dokument, perdorni opsionin "Mbyll pa dokument" qe njofton administratorin.',
            },
          ],
        },
      ],
    },

    {
      id: 'driver-tracking',
      title: 'Gjurmimi dhe navigimi',
      pages: [
        {
          id: 'driver-tracking-page',
          route: '/driver/tracking',
          title: 'Gjurmimi GPS',
          blocks: [
            {
              kind: 'p',
              text:
                'Aktivizoni butonin "Fillo turnin" per te dergon pozicionin tuaj GPS ne kompani. Pozicioni perditesohet automatikisht cdo 30 sekonda dhe ruhet ne historikun.',
            },
            {
              kind: 'list',
              items: [
                'Sa here qe levizni, harta brenda mostron rrugen tuaj te derguar.',
                'Klikoni "Ndalo turnin" kur perfundoni punen — gjurmimi mbyllet automatikisht.',
                'Te dhenat GPS perdoren per llogaritjen e oreve te punes ne /driver/work-hours.',
                'Kompania mund t\'i pare ne /company/live-map.',
              ],
            },
            {
              kind: 'callout',
              tone: 'tip',
              text:
                'Per te kursyer baterine, perdor "Fillo turnin" vetem ne fillim te punes dhe "Ndalo turnin" ne fund. Gjurmimi i vazhdueshem konsumon energji.',
            },
          ],
        },
        {
          id: 'driver-route-planner',
          route: '/driver/route-planner',
          title: 'Planifikuesi i rrugeve',
          blocks: [
            {
              kind: 'p',
              text:
                'Shihni rrugen e propozuar per detyrat e sotme. Sistemi i optimizon rendin sipas distances dhe oreve.',
            },
          ],
        },
        {
          id: 'driver-navigation',
          route: '/driver/navigation',
          title: 'Navigimi turn-by-turn',
          blocks: [
            {
              kind: 'p',
              text:
                'Navigim deri ne adresen e ardhshme te dorezimit duke perdorur TomTom API (nese kompania ka konfiguruar TomTom API key).',
            },
            {
              kind: 'callout',
              tone: 'info',
              text:
                'Nese TomTom nuk eshte aktiv, do te shihni nje hartë me pikat por pa navigim turn-by-turn.',
            },
          ],
        },
      ],
    },

    {
      id: 'driver-docs',
      title: 'Dokumentet',
      pages: [
        {
          id: 'driver-docs-shared',
          route: '/driver/documents',
          title: 'Dokumentet e kompanise',
          blocks: [
            { kind: 'p', text: 'Shihni dhe shkarkoni dokumente te ndara nga kompania (politika sigurie, manuale, formularet).' },
          ],
        },
        {
          id: 'driver-my-docs',
          route: '/driver/my-documents',
          title: 'Dokumentet e mia',
          blocks: [
            {
              kind: 'p',
              text:
                'Ngarkoni skanime te dokumentave tuaja personale: patenta, KOD 95, certifikata mjekesore. Pas ngarkimit, sistemi i njeh me OCR dhe perditeson automatikisht datat e skadimit ne profilin tuaj.',
            },
          ],
        },
      ],
    },

    {
      id: 'driver-other',
      title: 'Te tjera',
      pages: [
        {
          id: 'driver-overdue',
          route: '/driver/overdue',
          title: 'Dergesa te vonuara',
          blocks: [
            {
              kind: 'p',
              text:
                'Per cdo flete qe ka kaluar daten e caktuar, ju duhet te zgjidhni nje arsye: klienti nuk ishte, problem teknik, trafiku, etj. Arsyeja shfaqet ne /company/overdue te administratorit.',
            },
          ],
        },
        {
          id: 'driver-trailers',
          route: '/driver/trailers',
          title: 'Rimorkiot e mia',
          blocks: [
            { kind: 'p', text: 'Lista e rimorkiove te caktuara per ju me statusin aktual dhe pozicionin e fundit GPS.' },
          ],
        },
        {
          id: 'driver-chat',
          route: '/driver/chat',
          title: 'Chat',
          blocks: [
            { kind: 'p', text: 'Mesazhe me administratorin, koordinatoret e logjistikes ose menaxherin e depos.' },
          ],
        },
        {
          id: 'driver-leave',
          route: '/driver/leave',
          title: 'Pushimet e mia',
          blocks: [
            { kind: 'p', text: 'Kerkoni pushim (vacation, sick, unpaid). Pas aprovimit nga company_admin, ju vjen automatikisht njoftim push "Pushimi u aprovua".' },
          ],
        },
        {
          id: 'driver-attendance',
          route: '/driver/attendance',
          title: 'Prezenca',
          blocks: [
            { kind: 'p', text: 'Sistemi e regjistron automatikisht nga gjurmimi GPS. Per perjashtime mund te beni override manual.' },
          ],
        },
        {
          id: 'driver-work-hours',
          route: '/driver/work-hours',
          title: 'Oret e punes',
          blocks: [
            { kind: 'p', text: 'Total ditor/javor/mujor i oreve te ngare, pushimet, overtime. Llogaritet automatikisht nga sesionet e tracking-ut.' },
          ],
        },
        {
          id: 'driver-settings',
          route: '/driver/settings',
          title: 'Konfigurim',
          blocks: [
            { kind: 'p', text: 'Profili, telefoni, fjalekalimi, avatar, preferencat per njoftime. Sigurimi: rolin, kategorine, kompanine dhe statusin nuk mund t\'i ndryshoni vete.' },
          ],
        },
      ],
    },
  ],
};
