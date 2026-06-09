import type { ManualSection } from './types';

export const logisticsManual: ManualSection = {
  id: 'logistics',
  role: 'logistics',
  title: 'Manual i logjistikes (dispecher)',
  intro:
    'Roli logistics_admin eshte i thjeshtuar — fokus i ngushte ne shperndarjen e detyrave dhe gjurmim live. Company_admin gjithashtu ka akses ne keto faqe. Kthim ne /company permes butonit ne kreun e faqes.',
  groups: [
    {
      id: 'logistics-pages',
      title: 'Faqet e dispecerit',
      pages: [
        {
          id: 'logistics-dashboard',
          route: '/logistics',
          title: 'Dashboard',
          blocks: [
            { kind: 'p', text: 'Numri i shofereve aktive, fleteve te dergeses ne pritje, te perfunduara sot. Permbledhje per turnin.' },
          ],
        },
        {
          id: 'logistics-dispatch',
          route: '/logistics/dispatch',
          title: 'Shperndarja (Dispatch)',
          blocks: [
            {
              kind: 'p',
              text:
                'Lista e fletave te dergeses pa shofer te caktuar (status draft/sent, driver=null). Zgjidhni shoferin nga lista dhe klikoni "Cakto". Sistemi i dergon njoftim push shoferit.',
            },
            {
              kind: 'list',
              items: [
                'Bulk-assign: zgjidhni shume rreshta dhe nje shofer per t\'i caktuar te gjithe njeheresh.',
                'Filtra: depo origjine, partneri, urgjenca.',
                'Drag & drop nga lista e fletave ne kartelen e shoferit.',
              ],
            },
          ],
        },
        {
          id: 'logistics-active',
          route: '/logistics/active',
          title: 'Detyrat aktive',
          blocks: [
            { kind: 'p', text: 'Lista e dergesave aktualisht ne udhetim, me hartë live dhe ETA. Klik mbi nje rresht hap detajet.' },
          ],
        },
        {
          id: 'logistics-live-map',
          route: '/logistics/live-map',
          title: 'Harta live',
          blocks: [
            { kind: 'p', text: 'Hartë e te gjithe shofereve ne fushe me filtra per status, automjet, zone gjeografike.' },
          ],
        },
        {
          id: 'logistics-drivers',
          route: '/logistics/drivers',
          title: 'Shoferet aktive',
          blocks: [
            { kind: 'p', text: 'Lista e shofereve aktualisht ne turn (track-ing aktiv). Butona per t\'i thirrur, mesazh, ose hapur ne hartë.' },
          ],
        },
      ],
    },
  ],
};
