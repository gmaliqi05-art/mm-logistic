import type { ManualGroup } from './types';

// Common to all role manuals — explains how users enter the platform.
export const registrationGroup: ManualGroup = {
  id: 'regjistrimi',
  title: 'Regjistrimi dhe hyrja ne platforme',
  intro:
    'Hapi i pare per cdo kompani te re. Ne kete seksion shpjegohet si krijohet llogaria kryesore e kompanise, si shtohen perdoruesit (admin, depoist, reparature, shofer, kontabilist, logistike) dhe si funksionon ndarja per kategori.',
  pages: [
    {
      id: 'regjistrimi-kompanise',
      route: '/register',
      title: 'Regjistrimi i kompanise',
      blocks: [
        {
          kind: 'p',
          text:
            'Ne faqen /register cdo kompani e re plotesoi nje wizard ne disa hapa. Pas perfundimit krijohet automatikisht rreshti i kompanise dhe llogaria e pare me rolin "company_admin".',
        },
        {
          kind: 'steps',
          title: 'Hapat',
          steps: [
            'Hapni faqen publike te platformes dhe klikoni "Regjistrohu".',
            'Plotesoni te dhenat ligjore te kompanise: emri, NIPT/VAT, adresa, vendi, gjuha kryesore.',
            'Plotesoni te dhenat e administratorit te pare: emri, mbiemri, email, password.',
            'Zgjidhni planin e abonimit (free trial, basic, premium, accounting add-on).',
            'Konfirmoni email-in qe ju vjen dhe pastaj hyni ne /login.',
          ],
        },
        {
          kind: 'callout',
          tone: 'info',
          text:
            'Cdo regjistrim i ri thirret nga edge function "register-company". Llogaria e pare merr automatikisht rolin "company_admin" dhe lidhet me kompanine perkatese permes "company_id".',
        },
        {
          kind: 'fields',
          title: 'Fushat kryesore',
          fields: [
            { name: 'Emri i kompanise', description: 'Emri ligjor qe shfaqet ne fatura dhe dokumente.', required: true },
            { name: 'VAT / NIPT', description: 'Numri tatimor (DE: USt-IdNr, FR: SIREN, AL: NIPT).', required: true },
            { name: 'Vendi', description: 'Percakton regjimin tatimor, formatin e fatures dhe eksportet (DATEV/SAF-T).', required: true },
            { name: 'Plani', description: 'Mund te ndryshohet me vone nga super-admin ose nga company_admin permes upgrade-it.', required: true },
            { name: 'Gjuha', description: 'Gjuha e default per perdoruesit e rinj. Mund te ndryshohet individualisht me vone.', required: false },
          ],
        },
      ],
    },
    {
      id: 'krijimi-perdoruesve',
      route: '/company/depots',
      title: 'Krijimi i perdoruesve (admin, depoist, reparature, shofer)',
      blocks: [
        {
          kind: 'p',
          text:
            'Pas regjistrimit te kompanise, company_admin shton perdoruesit. Cdo perdorues krijohet me email + password te perkohshem dhe i caktohet automatikisht "company_id" e kompanise se administratorit. Asnje company_admin nuk mund te krijoje perdorues per nje kompani tjeter.',
        },
        {
          kind: 'steps',
          title: 'Si krijohet nje shofer',
          steps: [
            'Shko ne /company/drivers dhe kliko "Shto shofer".',
            'Plotesoni emrin, mbiemrin, email, telefon, password.',
            'Plotesoni datat e skadimit te patentes, KOD 95 dhe certifikates mjekesore.',
            'Ngarko fotografite e dokumentave (opsionale).',
            'Ruani. Sistemi i dergon shoferit nje email me kredencialet hyrese.',
          ],
        },
        {
          kind: 'steps',
          title: 'Si krijohet nje depo-worker (depoist ose reparature)',
          steps: [
            'Shko ne /company/depots, hap tab-in e workers per depon perkatese.',
            'Kliko "Shto worker" dhe plotesoni emrin, email, password, telefon.',
            'Zgjidhni "worker_category": "depoist" per pune pranimi/sortimi, "reparature" per pune riparimi.',
            'Lidheni me nje depo specifike ("depot_id").',
            'Ruaj. Worker-i merr email me kredencialet dhe mund te logohet ne /login.',
          ],
        },
        {
          kind: 'callout',
          tone: 'warn',
          text:
            'Fusha "worker_category" eshte kritike: "depoist" sheh te gjitha faqet operacionale te depos (pranim, sortim, riparime, stoku), kurse "reparature" sheh vetem Dashboard, HR, Chat, Documents, Settings dhe formularin per regjistrimin e riparimeve te tij. Per arsye sigurie, vete worker-i NUK mund ta ndryshoje kategorine e tij (eshte e mbrojtur ne nivel database).',
        },
        {
          kind: 'fields',
          title: 'Rolet ne platforme',
          fields: [
            { name: 'company_admin', description: 'Pronari/menaxheri i kompanise. Akses i plote ne /company/*, plus /logistics, plus /accounting (nese eshte aktivizuar).' },
            { name: 'depot_worker (depoist)', description: 'Punetor pranimi/sortimi/menaxhimi i stokut ne depo. Akses i plote ne /depot/*.' },
            { name: 'depot_worker (reparature)', description: 'Punetor riparimi. Akses i kufizuar ne /depot/*: vetem dashboard, HR, dokumente, chat, settings.' },
            { name: 'driver', description: 'Shofer. Akses ne /driver/*: detyrat, gjurmimi GPS, navigimi, dokumentet personale.' },
            { name: 'logistics_admin', description: 'Dispecher. Akses ne /logistics/* per shperndarjen e detyrave dhe gjurmim direkt.' },
            { name: 'Kontabilist (accounting)', description: 'Akses ne /accounting/*. Nuk eshte nje "role" e ndare por nje akses i hapur permes abonimit accounting; mund t’i jepet rolit company_admin, ose te krijohet user i dedikuar me akses te kufizuar.' },
          ],
        },
      ],
    },
    {
      id: 'hyrja-platforme',
      route: '/login',
      title: 'Hyrja, rikuperimi i fjalekalimit dhe siguria',
      blocks: [
        {
          kind: 'p',
          text:
            'Te gjithe perdoruesit hyjne nga /login me email + password. Sesioni ruhet ne localStorage me celesin "mm-logistic-auth". Nje sesion qendron i hapur deri sa perdoruesi shtypi "Dil".',
        },
        {
          kind: 'list',
          items: [
            'Harruat fjalekalimin? Kliko "Harruat fjalekalimin" ne /login. Sistemi dergon nje kod 6-shifror ne email; pastaj plotesohet i ri ne /reset-password.',
            'Verifikim email: cdo llogari e re duhet te konfirmoje emailin pas regjistrimit.',
            'Aktivizim/c’aktivizim: company_admin mund te c’aktivizoje nje perdorues (fushe is_active=false). Per arsye sigurie, perdoruesi vete nuk mund te aktivizoje veten.',
          ],
        },
        {
          kind: 'callout',
          tone: 'tip',
          text:
            'Per super-admin login perdoret /sa-access. Faqja standarde /login NUK pranon role super_admin. Ne kete manual super_admin nuk trajtohet.',
        },
      ],
    },
  ],
};
