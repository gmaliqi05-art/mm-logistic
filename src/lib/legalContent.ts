import type { LegalSlug } from './legalInfo';
import { LEGAL_INFO } from './legalInfo';

export interface LegalArticle {
  number: string;
  title: string;
  paragraphs: string[];
  list?: string[];
}

export interface LegalDocument {
  slug: LegalSlug;
  title: string;
  subtitle: string;
  intro: string;
  articles: LegalArticle[];
}

const c = LEGAL_INFO.company;
const addr = `${c.address.street}, ${c.address.postal} ${c.address.city}, ${c.address.country}`;

const IMPRINT: LegalDocument = {
  slug: 'imprint',
  title: 'Impressum',
  subtitle: 'Te dhenat ligjore te ofruesit te sherbimit sipas § 5 TMG (Telemediengesetz, Gjermani)',
  intro:
    'Ky impressum permban informacionet e detyrueshme ligjore qe identifikojne ofruesin e platformes ' +
    `${LEGAL_INFO.platformName}, si dhe te dhenat e kontaktit dhe te regjistrimit tregtar, ne perputhje ` +
    'me kornizen ligjore gjermane (§ 5 TMG, § 55 RStV, § 27a UStG).',
  articles: [
    {
      number: '1',
      title: 'Identifikimi i ofruesit te sherbimit',
      paragraphs: [
        `Sherbimi ofrohet nga ${c.legalName}, regjistruar ne ${c.countryName}.`,
        `Adresa e selise: ${addr}.`,
        `Perfaqesues ligjor i autorizuar: ${c.owner} (${c.ownerRole}).`,
      ],
    },
    {
      number: '2',
      title: 'Te dhenat e kontaktit',
      paragraphs: [
        `Email zyrtar: ${c.contact.email}`,
        `Email mbeshtetjeje: ${c.contact.support}`,
        `Telefon: ${c.contact.phone}`,
      ],
    },
    {
      number: '3',
      title: 'Regjistrimi tregtar dhe identifikimi tatimor',
      paragraphs: [
        `Gjykata e Regjistrit Tregtar: ${c.registry.court}.`,
        `Numri i Regjistrit Tregtar: ${c.registry.number}.`,
        `Numri i Identifikimit te TVSH-se sipas § 27a UStG: ${c.registry.vatId}.`,
        `Numri tatimor: ${c.registry.taxNumber}.`,
      ],
    },
    {
      number: '4',
      title: 'Pergjegjes per permbajtjen sipas § 55 (2) RStV',
      paragraphs: [
        `${c.owner}, ${addr}.`,
        'Pergjegjesia per permbajtjen e brendshme te platformes mbetet tek ofruesi i sherbimit. ' +
          'Lidhjet e jashtme jane shqyrtuar me kujdes ne kohen e publikimit; megjithate, ofruesi nuk ' +
          'ka kontroll mbi permbajtjen e faqeve te treta dhe nuk merr pergjegjesi per to.',
      ],
    },
    {
      number: '5',
      title: 'Zgjidhja alternative e mosmarreveshjeve',
      paragraphs: [
        'Komisioni Evropian ofron platformen e Zgjidhjes Online te Mosmarreveshjeve (ODR) te aksesueshme ' +
          'ne https://ec.europa.eu/consumers/odr.',
        'Ofruesi nuk eshte i detyruar dhe nuk eshte i gatshem te marre pjese ne procedura te zgjidhjes ' +
          'se mosmarreveshjeve para nje organi arbitrazhi konsumator.',
      ],
    },
    {
      number: '6',
      title: 'E drejta e autorit',
      paragraphs: [
        `Permbajtja, kodi burimor, dizajni dhe markat e ${LEGAL_INFO.platformName} jane prone e ${c.legalName} ` +
          'dhe mbrohen nga ligji gjerman dhe evropian per te drejtat e autorit (UrhG dhe Direktiva 2001/29/EC).',
        'Çdo riprodhim, modifikim ose perdorim tregtar pa autorizim me shkrim eshte i ndaluar.',
      ],
    },
  ],
};

const PRIVACY: LegalDocument = {
  slug: 'privacy-policy',
  title: 'Politika e Privatesise',
  subtitle:
    'Mbrojtja e te dhenave personale ne perputhje me Rregulloren (BE) 2016/679 (GDPR) dhe BDSG (Bundesdatenschutzgesetz, Gjermani)',
  intro:
    `${c.legalName}, ne cilesine e kontrolluesit te te dhenave, e konsideron mbrojtjen e te dhenave personale ` +
    'si nje detyrim themelor. Kjo politike shpjegon se cilat te dhena mblidhen, mbi cilat baza ligjore, per cfare qellimi, ' +
    'sa kohe ruhen dhe cilat jane te drejtat tuaja si subjekt i te dhenave.',
  articles: [
    {
      number: '1',
      title: 'Kontrolluesi i te dhenave',
      paragraphs: [
        `Kontrollues sipas Nenit 4(7) GDPR: ${c.legalName}, ${addr}.`,
        `Perfaqesues ligjor: ${c.owner}.`,
        `Kontakt: ${c.contact.email}.`,
      ],
    },
    {
      number: '2',
      title: 'Zyrtari per Mbrojtjen e te Dhenave (DPO)',
      paragraphs: [
        `Emer: ${c.dpo.name}.`,
        `Email kontakti: ${c.dpo.email}.`,
        'Mund te kontaktoni DPO direkt per cdo pyetje, ankese ose ushtrim te te drejtave tuaja.',
      ],
    },
    {
      number: '3',
      title: 'Kategorite e te dhenave qe perpunohen',
      paragraphs: [
        'Ne perpunojme te dhena qe na i jepni vete (regjistrimi, perdorimi i platformes, kontakti) dhe te dhena ' +
          'teknike te krijuara nga perdorimi:',
      ],
      list: [
        'Te dhena identifikuese: emer, mbiemer, email, numer telefoni.',
        'Te dhena te kompanise: emer ligjor, adrese, NIPT/VAT, numri i punonjesve.',
        'Te dhena te perdorimit: log-et, IP, lloji i shfletuesit, cookies te nevojshem.',
        'Te dhena te transaksionit: porosi, fletedergesa, fatura, levizje stoku.',
        'Te dhena te komunikimit: mesazhe ne chat, dokumente te ngarkuar, kerkesa mbeshtetjeje.',
      ],
    },
    {
      number: '4',
      title: 'Bazat ligjore te perpunimit',
      paragraphs: ['Ne mbeshtetemi ne keto baza sipas Nenit 6(1) GDPR:'],
      list: [
        'Ekzekutimi i kontrates (Neni 6(1)(b)) — per te ofruar sherbimet e abonimit.',
        'Detyrim ligjor (Neni 6(1)(c)) — per detyrimet e librave kontabel sipas HGB dhe AO (10 vjet).',
        'Interesi legjitim (Neni 6(1)(f)) — per sigurine, parandalimin e mashtrimit dhe permiresimet.',
        'Pelqim (Neni 6(1)(a)) — per cookies opsionale dhe komunikime marketing.',
      ],
    },
    {
      number: '5',
      title: 'Qellimet e perpunimit',
      paragraphs: [
        'Te dhenat perpunohen vetem per qellimet e mePoshteme:',
      ],
      list: [
        'Ofrimi i sherbimeve te logjistikes, depos, kontabilitetit dhe raportimit.',
        'Faturimi, mbledhja e pagesave dhe pajtueshmeria fiskale.',
        'Mbeshtetja teknike, asistenca dhe komunikimet operative.',
        'Permiresimi i sigurise, zbulimi i abuzimit dhe respektimi i ligjit.',
      ],
    },
    {
      number: '6',
      title: 'Afati i ruajtjes',
      paragraphs: [
        'Te dhenat ruhen vetem per kohen e nevojshme per qellimin per te cilin u mblodhen ose sa kohe e kerkon ligji.',
      ],
      list: [
        'Te dhena kontabel dhe fiskale: 10 vjet (§ 147 AO, § 257 HGB).',
        'Te dhena kontaktuale dhe abonimi: per kohen e marredhenies + 3 vjet.',
        'Log-e teknike: deri ne 12 muaj.',
        'Komunikime marketing: deri ne terheqjen e pelqimit.',
      ],
    },
    {
      number: '7',
      title: 'Marresit e te dhenave',
      paragraphs: [
        'Te dhenat ndahen vetem me procesues te angazhuar me kontrate sipas Nenit 28 GDPR:',
      ],
      list: [
        'Ofrues te infrastruktures cloud me Klauzola Standarde Kontraktuale te BE-se.',
        'Procesues pagese (kur aplikohet) — Stripe, vetem te dhena minimale.',
        'Ofrues sherbimi emaili dhe njoftimi push.',
        'Autoriteteve publike vetem nese kerkohet me ligj.',
      ],
    },
    {
      number: '8',
      title: 'Transferimi nderkombetar i te dhenave',
      paragraphs: [
        'Cdo transferim jashte BEE-se kryhet vetem mbi bazen e nje vendimi adekuatesise se Komisionit Evropian ' +
          'ose me Klauzola Standarde Kontraktuale (SCCs) sipas Nenit 46(2)(c) GDPR.',
      ],
    },
    {
      number: '9',
      title: 'Te drejtat tuaja',
      paragraphs: [
        'Si subjekt i te dhenave ju keni te drejtat e mePoshteme sipas Neneve 15-22 GDPR:',
      ],
      list: [
        'E drejta e aksesit (Neni 15).',
        'E drejta e korrigjimit (Neni 16).',
        'E drejta e fshirjes / "harreses" (Neni 17).',
        'E drejta e kufizimit te perpunimit (Neni 18).',
        'E drejta e portabilitetit te te dhenave (Neni 20).',
        'E drejta e kundershtimit (Neni 21).',
        'E drejta e ankeses tek autoriteti mbikeqyres kompetent.',
      ],
    },
    {
      number: '10',
      title: 'Cookies dhe teknologji te ngjashme',
      paragraphs: [
        'Perdorim vetem cookies strikte te nevojshme pa pelqim. Cookies analitike ose marketing perdoren vetem ' +
          'pas pelqimit te qarte. Per detaje shihni Politiken e Cookies.',
      ],
    },
    {
      number: '11',
      title: 'Siguria',
      paragraphs: [
        'Ne zbatojme masa teknike dhe organizative sipas Nenit 32 GDPR: enkriptim TLS, kontroll aksesi me role, ' +
          'log-im audit, backup-e te enkriptuara, ndarje me arkitekture multi-tenant me Row Level Security.',
      ],
    },
    {
      number: '12',
      title: 'Ankesa',
      paragraphs: [
        'Per ankesa kontaktoni Berliner Beauftragte fur Datenschutz und Informationsfreiheit, Friedrichstr. 219, ' +
          '10969 Berlin (mailbox@datenschutz-berlin.de).',
      ],
    },
  ],
};

const TERMS: LegalDocument = {
  slug: 'terms',
  title: 'Kushtet e Sherbimit',
  subtitle: `Marreveshja ndermjet jush dhe ${c.legalName} per perdorimin e platformes ${LEGAL_INFO.platformName}.`,
  intro:
    'Keto Kushte rregullojne perdorimin e platformes dhe sherbimeve perkatese. Duke krijuar nje llogari, ju pranoni ' +
    'keto kushte ne menyre te plote.',
  articles: [
    {
      number: '1',
      title: 'Pranimi i kushteve',
      paragraphs: [
        'Duke u regjistruar ose perdorur platformen, perdoruesi konfirmon se ka lexuar, kuptuar dhe pranuar plotesisht ' +
          'keto Kushte si dhe Politiken e Privatesise.',
      ],
    },
    {
      number: '2',
      title: 'Llogaria dhe regjistrimi',
      paragraphs: [
        'Perdoruesi duhet te jape te dhena te sakta dhe te perditesuara. Llogaria eshte personale dhe nuk mund te ' +
          'transferohet pa miratim me shkrim. Ruajtja e fjalekalimeve eshte pergjegjesi e perdoruesit.',
      ],
    },
    {
      number: '3',
      title: 'Abonimi dhe pagesa',
      paragraphs: [
        'Sherbimi ofrohet me bazen e nje plan abonimi mujor ose vjetor. Pagesat fakturohen ne fillim te periudhes. ' +
          'Cmimet jane neto dhe TVSH-ja shtohet sipas ligjit te aplikueshem.',
      ],
    },
    {
      number: '4',
      title: 'Periudha provuese dhe e drejta e terheqjes',
      paragraphs: [
        'Konsumatoret ne BE kane te drejten e terheqjes brenda 14 diteve sipas Direktives 2011/83/UE. Per kontratat ' +
          'B2B kjo e drejte nuk aplikohet, perveç nese eshte rene dakord shprehimisht.',
      ],
    },
    {
      number: '5',
      title: 'Detyrimet e perdoruesit',
      paragraphs: ['Perdoruesi merr persiper:'],
      list: [
        'Te respektoje ligjet e aplikueshme dhe te drejtat e te treteve.',
        'Te mos perpiqet te aksesoje te dhena te perdoruesve te tjere.',
        'Te mos ngarkoje permbajtje te paligjshme, mashtruese ose qe shkel te drejtat e autorit.',
        'Te respektoje politiken e perdorimit te pranueshem.',
      ],
    },
    {
      number: '6',
      title: 'Disponueshmeria e sherbimit',
      paragraphs: [
        'Ne synojme nje disponueshmeri 99.9% mujore (shih SLA). Mirembajtjet e planifikuara njoftohen me kohe.',
      ],
    },
    {
      number: '7',
      title: 'Pergjegjesia',
      paragraphs: [
        'Pergjegjesia kufizohet ne demet e drejtperdrejta te shkaktuara nga pakujdesi e rende ose qellim i lige. ' +
          'Per dem indirekt, humbje te ardhurash apo te dhenash, pergjegjesia eshte e perjashtuar ne masen ' +
          'maksimale te lejuar nga ligji.',
      ],
    },
    {
      number: '8',
      title: 'Perfundimi i marreveshjes',
      paragraphs: [
        'Cdo pale mund ta zgjidhe marreveshjen me njoftim 30-ditor para fundit te periudhes se faturimit. ' +
          'Shkelje te renda lejojne perfundim te menjehershem.',
      ],
    },
    {
      number: '9',
      title: 'Modifikimet',
      paragraphs: [
        'Kushtet mund te perditesohen. Perdoruesit njoftohen te pakten 30 dite para hyrjes ne fuqi te ndryshimeve thelbesore.',
      ],
    },
    {
      number: '10',
      title: 'Ligji aplikues dhe juridiksioni',
      paragraphs: [
        `Keto Kushte rregullohen nga ligji i ${c.countryName}, perjashtuar Konventen e Vjenes per Shitjet ` +
          'Nderkombetare (CISG). Juridiksioni ekskluziv eshte gjykatat kompetente te Berlinit, perveç pjeseve te ' +
          'detyrueshme te konsumatorit.',
      ],
    },
  ],
};

const COOKIES: LegalDocument = {
  slug: 'cookies',
  title: 'Politika e Cookies',
  subtitle: 'Si perdorim cookies dhe teknologjite e ngjashme ne perputhje me Direktiven ePrivacy dhe TTDSG.',
  intro:
    'Cookies jane skedare te vegjel teksti qe ruhen ne pajisjen tuaj. Ne perdorim sa me pak cookies te jete e mundur ' +
    'dhe vetem ato strikte te nevojshme pa pelqim.',
  articles: [
    {
      number: '1',
      title: 'Llojet e cookies qe perdoren',
      paragraphs: ['Klasifikimi sipas qellimit:'],
      list: [
        'Strikte te nevojshme: identifikimi i sesionit, autentifikimi, parandalimi i CSRF.',
        'Funksionale: gjuha e zgjedhur, preferencat e UI.',
        'Statistikore (opsionale, vetem me pelqim): metrika anonime per permiresim.',
      ],
    },
    {
      number: '2',
      title: 'Baza ligjore',
      paragraphs: [
        'Cookies strikte te nevojshme bazohen ne Nenin 25(2) TTDSG. Cookies opsionale kerkojne pelqim te qarte ' +
          'sipas Nenit 25(1) TTDSG dhe Nenit 6(1)(a) GDPR.',
      ],
    },
    {
      number: '3',
      title: 'Kohezgjatja',
      paragraphs: [
        'Cookies te sesionit fshihen ne mbylljen e shfletuesit. Cookies persistente ruhen me se shumti 12 muaj.',
      ],
    },
    {
      number: '4',
      title: 'Si te menaxhoni pelqimin',
      paragraphs: [
        'Mund ta terhiqni pelqimin ne cdo kohe nga shfletuesi ose nga panel-i i preferencave. Bllokimi i cookies ' +
          'strikte mund ta beje platformen te padisponueshme.',
      ],
    },
  ],
};

const GDPR: LegalDocument = {
  slug: 'gdpr',
  title: 'Pajtueshmeria me GDPR',
  subtitle: 'Permbledhje e te drejtave dhe procedurave per ushtrimin e tyre sipas Rregullores (BE) 2016/679.',
  intro:
    'Ky dokument permbledh masat tona te pajtueshmerise me GDPR dhe shpjegon hapat per te ushtruar te drejtat tuaja.',
  articles: [
    {
      number: '1',
      title: 'Te drejtat tuaja kryesore',
      paragraphs: [],
      list: [
        'Akses (Neni 15) — kopje e te dhenave personale.',
        'Korrigjim (Neni 16) — perditesim i te dhenave te pasakta.',
        'Fshirje (Neni 17) — me kushte te caktuara.',
        'Kufizim (Neni 18) — pezullim i perpunimit.',
        'Portabilitet (Neni 20) — eksport ne format te lexueshem.',
        'Kundershtim (Neni 21) — kunder perpunimit me bazen e interesit legjitim.',
        'Mos i nenshtrohuni vendimeve te automatizuara (Neni 22).',
      ],
    },
    {
      number: '2',
      title: 'Si te paraqisni nje kerkese',
      paragraphs: [
        `Dergoni nje email te DPO ne ${c.dpo.email} duke specifikuar te drejten qe doni te ushtroni dhe nje dokument ` +
          'identifikimi per te konfirmuar identitetin.',
        'Pergjigja jepet brenda 30 diteve, e zgjatshme deri ne 60 dite per kerkesa komplekse.',
      ],
    },
    {
      number: '3',
      title: 'Vleresimi i ndikimit (DPIA)',
      paragraphs: [
        'Per perpunime me rrezik te larte kryejme nje DPIA sipas Nenit 35 GDPR para se te nisim perpunimin.',
      ],
    },
    {
      number: '4',
      title: 'Njoftimi i shkeljes',
      paragraphs: [
        'Cdo shkelje sigurie qe perben rrezik per te drejtat dhe lirite e individeve njoftohet brenda 72 oreve ' +
          'tek autoriteti mbikeqyres dhe, kur eshte e nevojshme, edhe tek subjektet e prekur.',
      ],
    },
  ],
};

const DPA: LegalDocument = {
  slug: 'data-processing',
  title: 'Marreveshja e Procesimit te te Dhenave (DPA)',
  subtitle: `Procesim sipas Nenit 28 GDPR ndermjet klientit (kontrollues) dhe ${c.legalName} (procesues).`,
  intro:
    'Kjo DPA aplikohet automatikisht per te gjithe klientet B2B qe perdorin platformen per te perpunuar te dhena ' +
    'personale per te cilat veprojne si kontrollues.',
  articles: [
    {
      number: '1',
      title: 'Objekti dhe kohezgjatja',
      paragraphs: [
        'Procesuesi perpunon te dhena per llogari te kontrolluesit vetem per kohen e marredhenies kontraktuale dhe ' +
          'periudhen e detyrueshme ligjore te ruajtjes.',
      ],
    },
    {
      number: '2',
      title: 'Natyra dhe qellimi',
      paragraphs: [
        'Perpunimi mbulon hostimin, ruajtjen, transmetimin dhe analizen funksionale brenda platformes per ofrimin ' +
          'e moduleve te logjistikes, depos dhe kontabilitetit.',
      ],
    },
    {
      number: '3',
      title: 'Detyrimet e procesuesit',
      paragraphs: [],
      list: [
        'Te perpunoje vetem mbi udhezimet e dokumentuara te kontrolluesit.',
        'Te ruaje konfidencialitetin (Neni 28(3)(b)).',
        'Te zbatoje masa sigurie sipas Nenit 32.',
        'Te asistoje kontrolluesin per ushtrimin e te drejtave te subjekteve.',
        'Te asistoje per DPIA dhe konsultim paraprak (Neni 36).',
        'Te fshije ose t\u2019i kthen te dhenat ne fund te marredhenies.',
      ],
    },
    {
      number: '4',
      title: 'Nenprocesues',
      paragraphs: [
        'Procesuesi mund te angazhoje nenprocesues vetem me autorizim te pergjithshem dhe me kontrate qe pasqyron ' +
          'detyrimet e ketij DPA. Kontrolluesi do te informohet per cdo ndryshim.',
      ],
    },
    {
      number: '5',
      title: 'Auditimi',
      paragraphs: [
        'Kontrolluesi ka te drejten e auditimit te masave teknike dhe organizative me njoftim te arsyeshem dhe pa ' +
          'demtuar operacionet e procesuesit.',
      ],
    },
  ],
};

const REFUND: LegalDocument = {
  slug: 'refund-policy',
  title: 'Politika e Rimbursimit dhe Anulimit',
  subtitle: 'Te drejtat e anulimit dhe rimbursimit per abonimet e platformes.',
  intro:
    'Ne perpiqemi te ofrojme transparence te plote per pagesat. Ky dokument percakton kushtet per anulim, ' +
    'tarifa pro-rata dhe rimbursim.',
  articles: [
    {
      number: '1',
      title: 'E drejta e terheqjes per konsumatoret',
      paragraphs: [
        'Konsumatoret ne BE kane 14 dite kalendarike nga lidhja e kontrates per t\u2019u terhequr pa shpjegim ' +
          '(Direktiva 2011/83/UE). Forma e terheqjes mund te paraqitet me email ose nga panel-i i llogarise.',
      ],
    },
    {
      number: '2',
      title: 'Klientet B2B',
      paragraphs: [
        'Per klientet biznes te drejta e terheqjes 14-ditore nuk aplikohet. Anulimi i abonimit eshte i mundur ne fund ' +
          'te periudhes aktuale te faturimit me njoftim 30-ditor.',
      ],
    },
    {
      number: '3',
      title: 'Rimbursime pro-rata',
      paragraphs: [
        'Per planet vjetore te paguara paraprakisht, anulimi i hershem nuk gjeneron rimbursim pjesor, perveç rasteve ' +
          'te shkeljes thelbesore te kontrates nga ana jone.',
      ],
    },
    {
      number: '4',
      title: 'Procesi i rimbursimit',
      paragraphs: [
        'Rimbursimet kthehen ne te njejten metode pagese brenda 14 diteve te punes nga konfirmimi.',
      ],
    },
  ],
};

const AUP: LegalDocument = {
  slug: 'acceptable-use',
  title: 'Politika e Perdorimit te Pranueshem',
  subtitle: 'Rregullat e sjelljes per perdoruesit e platformes me qellim mbrojtjen e komunitetit dhe te dhenave.',
  intro: 'Per te ruajtur nje mjedis te sigurte dhe te besueshem, te gjithe perdoruesit jane te detyruar te respektojne keto rregulla.',
  articles: [
    {
      number: '1',
      title: 'Aktivitete te ndaluara',
      paragraphs: [],
      list: [
        'Perdorimi i platformes per qellime te paligjshme ose mashtruese.',
        'Perpjekjet per te aksesuar llogarite e te treteve.',
        'Inxhinieria e prapme, skanimi i automatizuar pa autorizim, ose ngarkimi i malware.',
        'Spam, abuzim, dergim masiv emailesh ose njoftimesh push pa pelqim.',
        'Perpjekjet per te kapercyer kufirin e perdorimit ose limitet e abonimit.',
      ],
    },
    {
      number: '2',
      title: 'Permbajtja e perdoruesit',
      paragraphs: [
        'Perdoruesit jane plotesisht pergjegjes per permbajtjen qe ngarkojne. Permbajtja qe shkel te drejtat e te ' +
          'treteve, eshte fyese, raciste, dhune ose pornografi mund te fshihet pa paralajmerim.',
      ],
    },
    {
      number: '3',
      title: 'Perdorimi i sherbimit te chat-it',
      paragraphs: [
        'Komunikimet e brendshme jane te kufizuara ne fushen e biznesit dhe nuk lejohen mesazhe diskriminuese, ' +
          'persekutuese ose te bezdisshme.',
      ],
    },
    {
      number: '4',
      title: 'Sanksionet',
      paragraphs: [
        'Shkelje te politikes mund te rezultojne ne paralajmerim, pezullim ose perfundim te llogarise pa rimbursim.',
      ],
    },
  ],
};

const SECURITY: LegalDocument = {
  slug: 'security',
  title: 'Politika e Sigurise',
  subtitle: 'Masat teknike dhe organizative te zbatuara per mbrojtjen e te dhenave dhe disponueshmerine e sherbimit.',
  intro:
    'Siguria eshte ne thelb te dizajnit te platformes. Ne aplikojme nje qasje shumeshtreshe (defense-in-depth) qe ' +
    'mbulon infrastrukturen, aplikacionin dhe njerezit.',
  articles: [
    {
      number: '1',
      title: 'Enkriptimi',
      paragraphs: [],
      list: [
        'TLS 1.2+ per te gjithe trafikun ne tranzit.',
        'Enkriptim AES-256 per te dhenat ne ruajtje.',
        'Hash i fjalekalimeve me bcrypt/argon2.',
      ],
    },
    {
      number: '2',
      title: 'Kontrolli i aksesit',
      paragraphs: [],
      list: [
        'Identifikim me OAuth/JWT dhe sesione me kohezgjatje te kufizuar.',
        'Role dhe lejime granulare (RBAC) per cdo perdorues.',
        'Row Level Security ne baze te dhenash per izolim te plote per kompani.',
        'Aksesi me te drejta minimale (least privilege) per personelin.',
      ],
    },
    {
      number: '3',
      title: 'Monitorim dhe audit',
      paragraphs: [
        'Te gjitha veprimet e ndjeshme regjistrohen ne audit logs te pandryshueshem. Sistemet monitorohen 24/7 dhe ' +
          'sinjalizojne anomalite.',
      ],
    },
    {
      number: '4',
      title: 'Backup dhe vazhdimesi',
      paragraphs: [
        'Backup-e te enkriptuara te perditshme me ruajtje 30-ditore. Plan i restaurimit te testuar (DR) me RTO 4 ore ' +
          'dhe RPO 1 ore.',
      ],
    },
    {
      number: '5',
      title: 'Pergjigja ndaj incidenteve',
      paragraphs: [
        'Procedure e dokumentuar e pergjigjes ndaj incidenteve me njoftim te subjekteve dhe autoriteteve brenda ' +
          '72 oreve sipas Nenit 33 GDPR.',
      ],
    },
  ],
};

const SLA: LegalDocument = {
  slug: 'sla',
  title: 'Marreveshja e Nivelit te Sherbimit (SLA)',
  subtitle: 'Niveli i garantuar i sherbimit, dritaret e mirembajtjes dhe kompensimi ne rast mosperputhjeje.',
  intro: 'Kjo SLA percakton angazhimet tona per disponueshmerine dhe performancen e platformes.',
  articles: [
    {
      number: '1',
      title: 'Disponueshmeria',
      paragraphs: [
        'Synojme disponueshmeri mujore prej 99.9% ne te gjitha modulet, te llogaritur si: (Koha totale ne muaj − Koha ' +
          'e ndalimit te papritur) / Koha totale × 100.',
      ],
    },
    {
      number: '2',
      title: 'Mirembajtja e planifikuar',
      paragraphs: [
        'Mirembajtjet e planifikuara kryhen ne dritaren e te dielave 02:00–06:00 CET dhe nuk llogariten kunder ' +
          'disponueshmerise.',
      ],
    },
    {
      number: '3',
      title: 'Klasifikimi i incidenteve',
      paragraphs: [],
      list: [
        'Kritik (P1) — sherbimi total i panjohur. Pergjigje brenda 30 minutash.',
        'I larte (P2) — modul kryesor i pamundur. Pergjigje brenda 2 oreve.',
        'I mesem (P3) — disfunksion i pjesshem. Pergjigje brenda 8 oreve.',
        'I ulet (P4) — kerkese e pergjithshme. Pergjigje brenda 24 oreve.',
      ],
    },
    {
      number: '4',
      title: 'Kompensimi',
      paragraphs: [
        'Per cdo 0.1% nen 99.9%, kreditohet 5% e tarifes mujore te abonimit, deri ne maksimum 50%. Krediti aplikohet ' +
          'automatikisht ne faturen e ardhshme me kerkese me shkrim te klientit brenda 30 diteve.',
      ],
    },
    {
      number: '5',
      title: 'Perjashtimet',
      paragraphs: [
        'SLA nuk aplikohet per ndalime te shkaktuara nga force majeure, abuzim i klientit, modifikime te paautorizuara ' +
          'ose probleme ne rrjetin e jashtem te internetit.',
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  imprint: IMPRINT,
  'privacy-policy': PRIVACY,
  terms: TERMS,
  cookies: COOKIES,
  gdpr: GDPR,
  'data-processing': DPA,
  'refund-policy': REFUND,
  'acceptable-use': AUP,
  security: SECURITY,
  sla: SLA,
};

export const LEGAL_NAV_ORDER: LegalSlug[] = [
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
];
