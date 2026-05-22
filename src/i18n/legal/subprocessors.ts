/**
 * Subprocessors List
 * Required by GDPR Art. 28(2) - transparency about third-party services
 * that process personal data on behalf of the platform.
 *
 * This list MUST be kept in sync with reality. When you add, remove, or
 * change a subprocessor, customers must be notified at least 30 days
 * in advance and have the right to object.
 *
 * Each entry includes:
 * - Service name and legal entity
 * - Region/location of data processing
 * - Purpose of the service
 * - Categories of data processed
 * - Legal basis for transfer (if outside EU)
 */

export const subprocessors = {
  // ============================================================
  // ALBANIAN (SQ)
  // ============================================================
  sq: {
    shortTitle: 'Nen-perpunuesit',
    title: 'Lista e Nen-perpunuesve (Subprocessors)',
    subtitle: 'Te gjitha sherbimet e paleve te treta qe perpunoi te dhena personale per llogarine tone, sipas GDPR Art. 28(2).',
    intro: 'Ne perputhje me transparencen e kerkuar nga GDPR Art. 28(2), ketu eshte lista e plote e nen-perpunuesve (subprocessors) qe perdorim per te ofruar sherbimin mm-logistic. Cdo nen-perpunues ka nenshkruar nje marreveshje me ne qe i detyron te respektoje te paktet te njejtat standarte te mbrojtjes se te dhenave si ne. Lista perditesohet rregullisht dhe ndryshimet komunikohen 30 dite paraprakisht.',
    lastUpdated: '15 Maj 2026',
    version: 'Versioni 1.0',

    section1: {
      title: 'Cfare jane nen-perpunuesit?',
      body: 'Nen-perpunuesit (subprocessors) jane kompani te paleve te treta qe na ndihmojne te ofrojme sherbimin tone. Per shembull:\n\n\u2022 Ofruesit e infrastruktures cloud (server, baza te dhenash)\n\u2022 Ofruesit e e-mailit transaksional\n\u2022 Sherbime per perpunimin e pagesave\n\u2022 Sherbime monitorimi dhe analitik\n\nKur ngarkoni te dhena ne platformen tone, ato mund te perpunohen nga keto kompani per llogarine tone, brenda kufijve te percaktuar nga Marreveshja per Perpunimin e te Dhenave (DPA).\n\nLista e meposhtme tregon EKZAKTESISHT cilat kompani perpunoi te dhenat tuaja, ku ndodhen serverat e tyre, dhe per cfare qellimi.',
    },
    section2: {
      title: 'Detyrimet e nen-perpunuesve',
      body: 'Cdo nen-perpunues ne kete liste ka nenshkruar marreveshje me ne qe e detyron te:\n\n(1) Perpunoi te dhenat vetem sipas udhezimeve tona dhe per qellime te kontraktuara\n(2) Respektoje standarte sigurie te paktet te njejta me te tonat (TLS, enkriptim, akses i kufizuar)\n(3) Njoftoje shkelje te sigurise menjehere\n(4) Te lejoje audit te kontrolluesit (klientit) tone\n(5) Te fshije te dhenat pas perfundimit te kontrates\n(6) Te respektoje te drejtat e subjekteve te te dhenave sipas GDPR\n\nNe ruajme pergjegjesi te plote per veprimet e nen-perpunuesve sipas GDPR Art. 28 paragrafit 4.',
    },
    section3: {
      title: 'INFRASTRUKTURE KRYESORE (Database, Auth, Storage)',
      body: 'NEN-PERPUNUESI:\nSupabase, Inc.\n970 Toa Payoh North #07-04\nSingapore 318992\nDhe Supabase Ireland Limited (per dataset-et BE)\n\nREGIONI I TE DHENAVE:\nFrankfurt, Gjermania (eu-central-1)\n\u2192 Te dhenat NUK dalin nga kufijte e BE-se\n\nQELLIMI:\n\u2022 Hosting i bazes se te dhenave PostgreSQL\n\u2022 Autentifikim i perdoruesve (sign-in, sign-up, 2FA)\n\u2022 Storage per dokumente dhe foto\n\u2022 Realtime per perditesimet ne kohe reale\n\u2022 Edge Functions per logjike server-side\n\nKATEGORITE E TE DHENAVE TE PERPUNUARA:\n\u2022 Te dhena llogarie (emer, e-mail, fjalekalim te hashuar)\n\u2022 Te gjitha te dhenat e platformes (dergesa, fatura, klientet)\n\u2022 Dokumente te ngarkuara (CMR, foto, scanime)\n\u2022 Audit log dhe meta-data\n\nMASAT E SIGURISE:\n\u2022 ISO 27001 certifikim\n\u2022 SOC 2 Type II compliance\n\u2022 Enkriptim TLS 1.3 ne transit\n\u2022 Enkriptim AES-256 ne pushim\n\u2022 Row Level Security (RLS) ne nivelin e bazes se te dhenave\n\nDPA: https://supabase.com/legal/dpa\nPrivacy Policy: https://supabase.com/privacy',
    },
    section4: {
      title: 'HOSTING I FRONTEND-IT',
      body: 'NEN-PERPUNUESI:\nSupabase Inc. (database, auth, storage, edge functions) — host i platformës\n\nREGIONI I TE DHENAVE:\nBE (Frankfurt, Amsterdam, Dublin - sipas ofruesit)\n\nQELLIMI:\n\u2022 Hosting i website-it dhe aplikacionit web\n\u2022 CDN per shpejtesi te lartesi\n\u2022 SSL/TLS certifikata\n\u2022 DDoS protection\n\nKATEGORITE E TE DHENAVE TE PERPUNUARA:\n\u2022 Adresat IP te vizitoreve (anonimizuar pas 7 ditesh)\n\u2022 Log te aksesit (URL, koha, User-Agent)\n\u2022 NUK perpunoi te dhena personale te tjera\n\nMASAT E SIGURISE:\n\u2022 SOC 2 Type II compliance\n\u2022 ISO 27001 (Cloudflare)\n\u2022 Enkriptim TLS 1.3\n\u2022 Audit log per akses administrativ\n\nDPA: shiko https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPrivacy Policy: shiko privacy policy te ofruesit',
    },
    section5: {
      title: 'E-MAIL TRANSAKSIONAL',
      body: 'NEN-PERPUNUESI:\nResend, Inc. — dërgim i emailit transaksional\n\nREGIONI I TE DHENAVE:\nBE (preferuar) - p.sh. Frankfurt ose Amsterdam\n\u2192 Nese ofruesi ka regiona vetem ne SHBA, kjo shenohet dhe perfshihet baza ligjore (SCC)\n\nQELLIMI:\n\u2022 Dergim i e-maileve transaksionale (regjistrim, fjalekalim, faturim)\n\u2022 NUK perdoret per marketing\n\nKATEGORITE E TE DHENAVE TE PERPUNUARA:\n\u2022 Adresa e-mail e perdoruesit\n\u2022 Emri i perdoruesit\n\u2022 Permbajtja e e-mailit (template + variabla)\n\u2022 Log te dergimit (status, hapje, klikim)\n\nMASAT E SIGURISE:\n\u2022 ISO 27001\n\u2022 SOC 2 Type II\n\u2022 Enkriptim TLS\n\u2022 Akses i kufizuar me 2FA\n\nDPA: shiko https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPrivacy Policy: shiko privacy policy te ofruesit',
    },
    section6: {
      title: 'PAGESAT (kur aktivizohet)',
      body: 'NEN-PERPUNUESI:\nStripe Payments Europe, Limited\n1 Grand Canal Street Lower\nGrand Canal Dock\nDublin, D02 H210, Ireland\n\nREGIONI I TE DHENAVE:\nIrlanda (BE) per perdoruesit evropiane\n\u2192 Disa te dhena perpunohen ne SHBA per fraud detection - baza ligjore: SCC + adequacy decision Stripe\n\nQELLIMI:\n\u2022 Perpunim i pagesave me kartë krediti/debit\n\u2022 Faturim automatik per abonime\n\u2022 Fraud detection dhe risk scoring\n\u2022 Compliance PCI DSS\n\nKATEGORITE E TE DHENAVE TE PERPUNUARA:\n\u2022 Adresa e-mail dhe emri i perdoruesit\n\u2022 Te dhena karte (te perpunuara DIREKT nga Stripe, NUK kalojne nga serverat tane)\n\u2022 Adresa e faturimit\n\u2022 Statusi i pageses\n\nMASAT E SIGURISE:\n\u2022 PCI DSS Level 1 compliance (standarti me i larte)\n\u2022 ISO 27001 + SOC 2\n\u2022 Enkriptim end-to-end\n\u2022 Tokenization e te dhenave te karteve\n\nDPA: https://stripe.com/legal/dpa\nPrivacy Policy: https://stripe.com/privacy',
    },
    section7: {
      title: 'MONITORIM DHE ANALITIK (opsionale)',
      body: 'NEN-PERPUNUESI (vetem nese aktivizoni):\nSentry.io (vetëm error tracking, planifikuar)\n\nREGIONI I TE DHENAVE:\nBE (Frankfurt) per Plausible dhe Sentry EU\n\u2192 Vetem regione EU jane te aprovuara per kete platforme\n\nQELLIMI:\n\u2022 Error tracking dhe debugging (Sentry)\n\u2022 Analiza statistikore te perdorimit (Plausible)\n\u2022 NUK perdoret per profilim\n\nKATEGORITE E TE DHENAVE TE PERPUNUARA:\n\u2022 Adresat IP (anonimizuar)\n\u2022 Tipi i shfletuesit dhe sistemit operativ\n\u2022 URL-te e vizituara dhe interaksionet\n\u2022 NUK perpunoi te dhena personale identifikuese\n\nKERKON PELQIM:\nKy nen-perpunues aktivizohet vetem nese ju jepni pelqim permes Cookie Banner.\n\nDPA: shiko https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPrivacy Policy: shiko privacy policy te ofruesit',
    },
    section8: {
      title: 'GPS DHE HARTAT (opsionale)',
      body: 'NEN-PERPUNUESI:\nOpenStreetMap Foundation — harta dhe rrugëtim\n\nREGIONI I TE DHENAVE:\n\u2022 Mapbox: BE (Berlin / Dublin)\n\u2022 OpenStreetMap: BE (Germany / France)\n\u2022 Google Maps: SHBA - kerkohet SCC dhe adequacy decision\n\nQELLIMI:\n\u2022 Vizualizim i hartave per rrugetimin\n\u2022 Llogaritja e distancave dhe rrugeve\n\u2022 Geokodim (adresa <-> koordinata)\n\u2022 Live tracking i shofereve\n\nKATEGORITE E TE DHENAVE TE PERPUNUARA:\n\u2022 Adresat e burimit dhe destinacionit (jo nominalisht)\n\u2022 Koordinatat GPS te shofereve gjate transportit\n\u2022 NUK perpunoi identitet te shoferit\n\nMASAT E SIGURISE:\n\u2022 ISO 27001\n\u2022 SOC 2 Type II\n\u2022 Enkriptim TLS\n\u2022 Anonimizim i koordinatave pas perfundimit te transportit\n\nDPA: shiko https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPrivacy Policy: shiko privacy policy te ofruesit',
    },
    section9: {
      title: 'SUPPORT DHE COMMUNICATION (opsionale)',
      body: 'NEN-PERPUNUESI:\nNuk përdorim ofrues të jashtëm — chat-i është i brendshëm në platformë\n\nREGIONI I TE DHENAVE:\nBE (preferuar)\n\u2022 Intercom: Dublin, Ireland\n\u2022 Crisp: Paris, France\n\u2022 Help Scout: Boston, USA (kerkohet SCC)\n\u2022 Freshdesk: Frankfurt, Germany\n\nQELLIMI:\n\u2022 Live chat me mbeshtetjen e klienteve\n\u2022 Tickets dhe ndjekje pyetjesh\n\u2022 Knowledge base dhe vetherbim\n\nKATEGORITE E TE DHENAVE TE PERPUNUARA:\n\u2022 Adresa e-mail dhe emri\n\u2022 Permbajtja e mesazheve\n\u2022 Historiku i bisedave\n\u2022 Meta-data (data, IP)\n\nMASAT E SIGURISE:\n\u2022 ISO 27001\n\u2022 SOC 2 Type II\n\u2022 Enkriptim TLS\n\u2022 Akses i kufizuar me 2FA per stafin tone\n\nDPA: shiko https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPrivacy Policy: shiko privacy policy te ofruesit',
    },
    section10: {
      title: 'Procesi i ndryshimit te nen-perpunuesve',
      body: 'KUR SHTOJME, ZEVENDESOJME OSE HIQNI NJE NEN-PERPUNUES:\n\n1. NJOFTIM PARAPRAK (30 DITE)\nDo te ju njoftojme nepermjet:\n\u2022 E-mail tek te gjithe klientet e regjistruar\n\u2022 Banner ne platforme\n\u2022 Perditesim i kesaj liste me datestamp te ri\n\n2. PERIUDHA E KUNDERSHTIMIT\nKeni 30 dite per te kundershtuar ndryshimin permes e-mailit tek privacy@mm-logistic.eu.\n\n3. NESE KUNDERSHTONI\nKemi te drejten te perfundojme kontraten me njoftim 30 dite. Te dhenat tuaja do te eksportohen dhe fshihen sipas DPA-se.\n\n4. ZBATIMI\nNese nuk ka kundershtim, ndryshimi behet efektiv pas periudhes se 30 ditesh.\n\nKETO RREGULLA NUK ZBATOHEN PER:\n\u2022 Ndryshime te shpejta sigurie (per te mbrojtur te dhenat tuaja)\n\u2022 Ndryshime ne ofrues te detyruara nga ligjet (urdher gjyqesor)\n\u2022 Falimentimi i nje nen-perpunuesi (zevendesim emergjent)',
    },
    section11: {
      title: 'Te drejtat tuaja',
      body: 'KENI TE DREJTE:\n\n1. TE DINI EKZAKTESISHT cilet nen-perpunues perpunoi te dhenat tuaja (kjo liste e plot\u00ebson kete kerkese sipas Art. 28(2))\n\n2. TE KUNDERSHTONI shtimin e nen-perpunuesve te rinj brenda 30 diteve nga njoftimi\n\n3. TE KERKONI INFORMACION SHTESE per cdo nen-perpunues, perfshire:\n\u2022 Marreveshjen DPA midis nesh\n\u2022 Raporte certifikimi dhe audit\n\u2022 Detaje teknike te masave te sigurise\n\n4. TE PERFUNDONI KONTRATEN nese nuk pajtoni me nje nen-perpunues te ri\n\nKERKESAT DERGOHEN NE:\nE-mail: privacy@mm-logistic.eu\nDPO: dpo@mm-logistic.eu\nPergjigja brenda 30 ditesh.',
    },
    section12: {
      title: 'Transferimi i te dhenave jashte BE/EEA',
      body: 'POLITIKA JONE KRYESORE:\nPreferon nen-perpunues me servera ne BE/EEA dhe i zgjedh keto sa here te mundur.\n\nNESE TRANSFERIM JASHTE BE/EEA EHTE I NEVOJSHEM:\n\nBazat ligjore te perdorura:\n\u2022 Standard Contractual Clauses (SCC) te Komisionit Evropian (2021)\n\u2022 Adequacy Decisions per vende te aprovuar (Andorra, Argentina, Kanada, Faroe Islands, Guernsey, Israel, Isle of Man, Japoni, Jersey, Korea e Jugut, Zealandi i Ri, Republika e Korese, Zvicra, MB)\n\u2022 Binding Corporate Rules (BCR) per grupe nderkombetare\n\nGARANCITE SHTESE:\n\u2022 Transfer Impact Assessment (TIA) per cdo transferim\n\u2022 Enkriptim end-to-end\n\u2022 Pseudonimizim ku eshte e mundur\n\u2022 Te drejta shtese te subjekteve\n\nLISTA AKTUALE E TRANSFERIMEVE JASHTE BE/EEA:\nAktualisht, vetem Stripe (Irlanda + SHBA fragmente) ka transfer te kufizuar te dhenash jashte BE. Te gjithe nen-perpunuesit e tjere jane vetem ne BE/EEA.',
    },
    section13: {
      title: 'Versionim dhe historik',
      body: 'PERDITESIMET:\nKjo liste perditesohet rregullisht. Cdo version i mehershem ruhet ne arkive per transparence.\n\nHISTORIKU:\nVersioni 1.0 (15 Maj 2026) - Lista fillestare me ofruesit kryesore\n\nNJOFTIM I PERDITESIMEVE:\n\u2022 E-mail per klientet aktiv 30 dite paraprakisht\n\u2022 Banner ne platforme\n\u2022 Datestamp e perditesuar lart ne dokument\n\nVERSIONET E MEPARSHME:\nMund te kerkohen permes e-mailit tek privacy@mm-logistic.eu per qellime te transparences dhe auditit.',
    },
    section14: {
      title: 'Verifikim i pavarur',
      body: 'NE JU MUNDESOJME TE VERIFIKONI VETE:\n\n1. CERTIFIKIMET\nKlikoni cdo emri ne kete liste per te shkuar tek faqja e ofruesit dhe verifikuar:\n\u2022 Certifikimet aktive (ISO 27001, SOC 2)\n\u2022 Politiken e privatesise\n\u2022 DPA-ne publike\n\n2. AUDIT NGA KLIENTI\nKlientet enterprise mund te kerkojne audit te DPA-se sone me cdo nen-perpunues. Procedura ne DPA, Seksioni 9.\n\n3. RAPORT VJETOR (kur do te kete)\nDo te publikojme nje raport vjetor te sigurise dhe transparences (Annual Security and Transparency Report) me detaje per:\n\u2022 Numri i kerkesave nga subjektet e te dhenave\n\u2022 Incidente sigurie (anonimizuar)\n\u2022 Ndryshime ne nen-perpunues\n\u2022 Rezultate te penetration testeve\n\nPara se publikimit te pare, mund te kerkoni informacion specifik permes e-mailit.',
    },
    section15: {
      title: 'Kontakti per pyetje',
      body: 'PER PYETJE PER KETE LISTE:\nE-mail: privacy@mm-logistic.eu\nPosta: Pfädlistraße 10, 79576 Weil am Rhein, Germany\n\nPER PERGJEGJESIN E MBROJTJES SE TE DHENAVE (DPO):\nE-mail: dpo@mm-logistic.eu\n\nPER PYETJE TEKNIKE PER NEN-PERPUNUESIT:\n\u2022 Supabase: support@supabase.io\n\u2022 Supabase Inc.: support@supabase.io\n\u2022 Resend, Inc.: support@resend.com\n\nNE NJEHEREN E NJOFTIMIT PER INCIDENT SIGURIE NE NJE NEN-PERPUNUES:\nDo t\'ju njoftojme menjehere (brenda 24 oresh nga marrja e njoftimit) per cdo shkelje qe mund te ndikoje ne te dhenat tuaja.',
    },
  },

  // ============================================================
  // ENGLISH (EN)
  // ============================================================
  en: {
    shortTitle: 'Subprocessors',
    title: 'List of Subprocessors',
    subtitle: 'All third-party services that process personal data on our behalf, according to GDPR Art. 28(2).',
    intro: 'In accordance with the transparency required by GDPR Art. 28(2), here is the complete list of subprocessors we use to provide the mm-logistic service. Each subprocessor has signed an agreement with us obligating them to respect at least the same data protection standards as we do. The list is updated regularly and changes are communicated 30 days in advance.',
    lastUpdated: '15 May 2026',
    version: 'Version 1.0',

    section1: {
      title: 'What are subprocessors?',
      body: 'Subprocessors are third-party companies that help us provide our service. For example:\n\n\u2022 Cloud infrastructure providers (servers, databases)\n\u2022 Transactional email providers\n\u2022 Payment processing services\n\u2022 Monitoring and analytics services\n\nWhen you upload data to our platform, it may be processed by these companies on our behalf, within the limits defined by the Data Processing Agreement (DPA).\n\nThe list below shows EXACTLY which companies process your data, where their servers are located, and for what purpose.',
    },
    section2: {
      title: 'Subprocessor obligations',
      body: 'Each subprocessor on this list has signed an agreement with us obligating them to:\n\n(1) Process data only according to our instructions and for contracted purposes\n(2) Respect security standards at least equal to ours (TLS, encryption, restricted access)\n(3) Notify of security breaches immediately\n(4) Allow audit by our controller (customer)\n(5) Delete data after contract termination\n(6) Respect data subject rights under GDPR\n\nWe retain full responsibility for subprocessor actions under GDPR Art. 28 paragraph 4.',
    },
    section3: {
      title: 'PRIMARY INFRASTRUCTURE (Database, Auth, Storage)',
      body: 'SUBPROCESSOR:\nSupabase, Inc.\n970 Toa Payoh North #07-04\nSingapore 318992\nAnd Supabase Ireland Limited (for EU datasets)\n\nDATA REGION:\nFrankfurt, Germany (eu-central-1)\n\u2192 Data does NOT leave the EU\n\nPURPOSE:\n\u2022 PostgreSQL database hosting\n\u2022 User authentication (sign-in, sign-up, 2FA)\n\u2022 Storage for documents and photos\n\u2022 Realtime for live updates\n\u2022 Edge Functions for server-side logic\n\nDATA CATEGORIES PROCESSED:\n\u2022 Account data (name, email, hashed password)\n\u2022 All platform data (deliveries, invoices, customers)\n\u2022 Uploaded documents (CMR, photos, scans)\n\u2022 Audit log and metadata\n\nSECURITY MEASURES:\n\u2022 ISO 27001 certified\n\u2022 SOC 2 Type II compliant\n\u2022 TLS 1.3 encryption in transit\n\u2022 AES-256 encryption at rest\n\u2022 Row Level Security (RLS) at database level\n\nDPA: https://supabase.com/legal/dpa\nPrivacy Policy: https://supabase.com/privacy',
    },
    section4: {
      title: 'FRONTEND HOSTING',
      body: 'SUBPROCESSOR:\nSupabase Inc. (database, auth, storage, edge functions) — platform host\n\nDATA REGION:\nEU (Frankfurt, Amsterdam, Dublin - depending on provider)\n\nPURPOSE:\n\u2022 Website and web application hosting\n\u2022 CDN for high speed\n\u2022 SSL/TLS certificates\n\u2022 DDoS protection\n\nDATA CATEGORIES PROCESSED:\n\u2022 Visitor IP addresses (anonymized after 7 days)\n\u2022 Access logs (URL, time, User-Agent)\n\u2022 Does NOT process other personal data\n\nSECURITY MEASURES:\n\u2022 SOC 2 Type II compliant\n\u2022 ISO 27001 (Cloudflare)\n\u2022 TLS 1.3 encryption\n\u2022 Audit log for administrative access\n\nDPA: see https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPrivacy Policy: see the provider\'s privacy policy',
    },
    section5: {
      title: 'TRANSACTIONAL EMAIL',
      body: 'SUBPROCESSOR:\nResend, Inc. — transactional email delivery\n\nDATA REGION:\nEU (preferred) - e.g. Frankfurt or Amsterdam\n\u2192 If provider has US-only regions, this is marked and legal basis included (SCC)\n\nPURPOSE:\n\u2022 Sending transactional emails (registration, password, billing)\n\u2022 NOT used for marketing\n\nDATA CATEGORIES PROCESSED:\n\u2022 User email address\n\u2022 User name\n\u2022 Email content (template + variables)\n\u2022 Delivery log (status, open, click)\n\nSECURITY MEASURES:\n\u2022 ISO 27001\n\u2022 SOC 2 Type II\n\u2022 TLS encryption\n\u2022 Restricted access with 2FA\n\nDPA: see https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPrivacy Policy: see the provider\'s privacy policy',
    },
    section6: {
      title: 'PAYMENTS (when activated)',
      body: 'SUBPROCESSOR:\nStripe Payments Europe, Limited\n1 Grand Canal Street Lower\nGrand Canal Dock\nDublin, D02 H210, Ireland\n\nDATA REGION:\nIreland (EU) for European users\n\u2192 Some data is processed in USA for fraud detection - legal basis: SCC + Stripe adequacy decision\n\nPURPOSE:\n\u2022 Credit/debit card payment processing\n\u2022 Automatic subscription billing\n\u2022 Fraud detection and risk scoring\n\u2022 PCI DSS compliance\n\nDATA CATEGORIES PROCESSED:\n\u2022 User email and name\n\u2022 Card data (processed DIRECTLY by Stripe, does NOT pass through our servers)\n\u2022 Billing address\n\u2022 Payment status\n\nSECURITY MEASURES:\n\u2022 PCI DSS Level 1 compliance (highest standard)\n\u2022 ISO 27001 + SOC 2\n\u2022 End-to-end encryption\n\u2022 Card data tokenization\n\nDPA: https://stripe.com/legal/dpa\nPrivacy Policy: https://stripe.com/privacy',
    },
    section7: {
      title: 'MONITORING AND ANALYTICS (optional)',
      body: 'SUBPROCESSOR (only if activated):\nSentry.io (error tracking only, planned)\n\nDATA REGION:\nEU (Frankfurt) for Plausible and Sentry EU\n\u2192 Only EU regions are approved for this platform\n\nPURPOSE:\n\u2022 Error tracking and debugging (Sentry)\n\u2022 Statistical usage analysis (Plausible)\n\u2022 NOT used for profiling\n\nDATA CATEGORIES PROCESSED:\n\u2022 IP addresses (anonymized)\n\u2022 Browser and OS type\n\u2022 Visited URLs and interactions\n\u2022 Does NOT process personally identifying data\n\nREQUIRES CONSENT:\nThis subprocessor is only activated if you give consent via Cookie Banner.\n\nDPA: see https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPrivacy Policy: see the provider\'s privacy policy',
    },
    section8: {
      title: 'GPS AND MAPS (optional)',
      body: 'SUBPROCESSOR:\nOpenStreetMap Foundation — maps and routing\n\nDATA REGION:\n\u2022 Mapbox: EU (Berlin / Dublin)\n\u2022 OpenStreetMap: EU (Germany / France)\n\u2022 Google Maps: USA - requires SCC and adequacy decision\n\nPURPOSE:\n\u2022 Map visualization for routing\n\u2022 Distance and route calculation\n\u2022 Geocoding (address <-> coordinates)\n\u2022 Live driver tracking\n\nDATA CATEGORIES PROCESSED:\n\u2022 Source and destination addresses (not by name)\n\u2022 Driver GPS coordinates during transport\n\u2022 Does NOT process driver identity\n\nSECURITY MEASURES:\n\u2022 ISO 27001\n\u2022 SOC 2 Type II\n\u2022 TLS encryption\n\u2022 Coordinate anonymization after transport completion\n\nDPA: see https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPrivacy Policy: see the provider\'s privacy policy',
    },
    section9: {
      title: 'SUPPORT AND COMMUNICATION (optional)',
      body: 'SUBPROCESSOR:\nWe do not use an external provider — chat is built into the platform\n\nDATA REGION:\nEU (preferred)\n\u2022 Intercom: Dublin, Ireland\n\u2022 Crisp: Paris, France\n\u2022 Help Scout: Boston, USA (SCC required)\n\u2022 Freshdesk: Frankfurt, Germany\n\nPURPOSE:\n\u2022 Live chat with customer support\n\u2022 Tickets and question tracking\n\u2022 Knowledge base and self-service\n\nDATA CATEGORIES PROCESSED:\n\u2022 Email address and name\n\u2022 Message content\n\u2022 Conversation history\n\u2022 Metadata (date, IP)\n\nSECURITY MEASURES:\n\u2022 ISO 27001\n\u2022 SOC 2 Type II\n\u2022 TLS encryption\n\u2022 Restricted access with 2FA for our staff\n\nDPA: see https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPrivacy Policy: see the provider\'s privacy policy',
    },
    section10: {
      title: 'Subprocessor change process',
      body: 'WHEN WE ADD, REPLACE OR REMOVE A SUBPROCESSOR:\n\n1. ADVANCE NOTICE (30 DAYS)\nWe will notify you through:\n\u2022 Email to all registered customers\n\u2022 Banner on platform\n\u2022 Update of this list with new datestamp\n\n2. OBJECTION PERIOD\nYou have 30 days to object to the change via email to privacy@mm-logistic.eu.\n\n3. IF YOU OBJECT\nWe have the right to terminate the contract with 30-day notice. Your data will be exported and deleted per DPA.\n\n4. IMPLEMENTATION\nIf no objection, the change becomes effective after the 30-day period.\n\nTHESE RULES DO NOT APPLY FOR:\n\u2022 Rapid security changes (to protect your data)\n\u2022 Provider changes mandated by laws (court order)\n\u2022 Subprocessor bankruptcy (emergency replacement)',
    },
    section11: {
      title: 'Your rights',
      body: 'YOU HAVE THE RIGHT:\n\n1. TO KNOW EXACTLY which subprocessors process your data (this list fulfills this requirement under Art. 28(2))\n\n2. TO OBJECT to adding new subprocessors within 30 days of notification\n\n3. TO REQUEST ADDITIONAL INFORMATION about any subprocessor, including:\n\u2022 DPA between us\n\u2022 Certification reports and audits\n\u2022 Technical details of security measures\n\n4. TO TERMINATE THE CONTRACT if you do not agree with a new subprocessor\n\nREQUESTS SENT TO:\nEmail: privacy@mm-logistic.eu\nDPO: dpo@mm-logistic.eu\nResponse within 30 days.',
    },
    section12: {
      title: 'Data transfer outside EU/EEA',
      body: 'OUR MAIN POLICY:\nPrefers subprocessors with EU/EEA servers and selects these whenever possible.\n\nIF TRANSFER OUTSIDE EU/EEA IS NECESSARY:\n\nLegal bases used:\n\u2022 Standard Contractual Clauses (SCC) from European Commission (2021)\n\u2022 Adequacy Decisions for approved countries (Andorra, Argentina, Canada, Faroe Islands, Guernsey, Israel, Isle of Man, Japan, Jersey, South Korea, New Zealand, Republic of Korea, Switzerland, UK)\n\u2022 Binding Corporate Rules (BCR) for international groups\n\nADDITIONAL SAFEGUARDS:\n\u2022 Transfer Impact Assessment (TIA) for each transfer\n\u2022 End-to-end encryption\n\u2022 Pseudonymization where possible\n\u2022 Additional subject rights\n\nCURRENT LIST OF TRANSFERS OUTSIDE EU/EEA:\nCurrently, only Stripe (Ireland + USA fragments) has limited data transfer outside EU. All other subprocessors are only in EU/EEA.',
    },
    section13: {
      title: 'Versioning and history',
      body: 'UPDATES:\nThis list is updated regularly. Each previous version is kept in archive for transparency.\n\nHISTORY:\nVersion 1.0 (15 May 2026) - Initial list with main providers\n\nUPDATE NOTIFICATION:\n\u2022 Email to active customers 30 days in advance\n\u2022 Platform banner\n\u2022 Updated datestamp at top of document\n\nPREVIOUS VERSIONS:\nCan be requested via email to privacy@mm-logistic.eu for transparency and audit purposes.',
    },
    section14: {
      title: 'Independent verification',
      body: 'WE ALLOW YOU TO VERIFY YOURSELF:\n\n1. CERTIFICATIONS\nClick each name in this list to go to the provider page and verify:\n\u2022 Active certifications (ISO 27001, SOC 2)\n\u2022 Privacy policy\n\u2022 Public DPA\n\n2. CUSTOMER AUDIT\nEnterprise customers can request audit of our DPA with each subprocessor. Procedure in DPA, Section 9.\n\n3. ANNUAL REPORT (when available)\nWe will publish an Annual Security and Transparency Report with details on:\n\u2022 Number of data subject requests\n\u2022 Security incidents (anonymized)\n\u2022 Changes in subprocessors\n\u2022 Penetration test results\n\nBefore the first publication, you can request specific information via email.',
    },
    section15: {
      title: 'Contact for questions',
      body: 'FOR QUESTIONS ABOUT THIS LIST:\nEmail: privacy@mm-logistic.eu\nMail: Pfädlistraße 10, 79576 Weil am Rhein, Germany\n\nFOR THE DATA PROTECTION OFFICER (DPO):\nEmail: dpo@mm-logistic.eu\n\nFOR TECHNICAL QUESTIONS ABOUT SUBPROCESSORS:\n\u2022 Supabase: support@supabase.io\n\u2022 Supabase Inc.: support@supabase.io\n\u2022 Resend, Inc.: support@resend.com\n\nFOR SECURITY INCIDENT NOTIFICATION IN A SUBPROCESSOR:\nWe will notify you immediately (within 24 hours of receiving notification) of any breach that may affect your data.',
    },
  },

  // ============================================================
  // GERMAN (DE) - canonical legal version
  // ============================================================
  de: {
    shortTitle: 'Unterauftragsverarbeiter',
    title: 'Liste der Unterauftragsverarbeiter',
    subtitle: 'Alle Drittanbieter, die personenbezogene Daten in unserem Auftrag verarbeiten, gem\u00e4\u00df Art. 28(2) DSGVO.',
    intro: 'In \u00dcbereinstimmung mit der von Art. 28(2) DSGVO geforderten Transparenz hier die vollst\u00e4ndige Liste der Unterauftragsverarbeiter, die wir zur Bereitstellung des Dienstes mm-logistic verwenden. Jeder Unterauftragsverarbeiter hat eine Vereinbarung mit uns unterzeichnet, die ihn verpflichtet, mindestens die gleichen Datenschutzstandards wie wir einzuhalten. Die Liste wird regelm\u00e4\u00dfig aktualisiert und \u00c4nderungen werden 30 Tage im Voraus kommuniziert.',
    lastUpdated: '15. Mai 2026',
    version: 'Version 1.0',

    section1: {
      title: 'Was sind Unterauftragsverarbeiter?',
      body: 'Unterauftragsverarbeiter sind Drittanbieter, die uns helfen, unseren Dienst bereitzustellen. Zum Beispiel:\n\n\u2022 Cloud-Infrastrukturanbieter (Server, Datenbanken)\n\u2022 Transaktionale E-Mail-Anbieter\n\u2022 Zahlungsverarbeitungsdienste\n\u2022 \u00dcberwachungs- und Analysedienste\n\nWenn Sie Daten auf unsere Plattform hochladen, k\u00f6nnen diese von diesen Unternehmen in unserem Auftrag verarbeitet werden, innerhalb der durch den Auftragsverarbeitungsvertrag (AVV) festgelegten Grenzen.\n\nDie folgende Liste zeigt GENAU, welche Unternehmen Ihre Daten verarbeiten, wo sich ihre Server befinden und zu welchem Zweck.',
    },
    section2: {
      title: 'Pflichten der Unterauftragsverarbeiter',
      body: 'Jeder Unterauftragsverarbeiter in dieser Liste hat eine Vereinbarung mit uns unterzeichnet, die ihn verpflichtet:\n\n(1) Daten nur nach unseren Anweisungen und f\u00fcr vertraglich vereinbarte Zwecke zu verarbeiten\n(2) Sicherheitsstandards mindestens gleich unseren zu respektieren (TLS, Verschl\u00fcsselung, beschr\u00e4nkter Zugriff)\n(3) Sicherheitsverletzungen sofort zu melden\n(4) Audits durch unseren Verantwortlichen (Kunden) zu erlauben\n(5) Daten nach Vertragsbeendigung zu l\u00f6schen\n(6) Rechte der betroffenen Personen nach DSGVO zu respektieren\n\nWir tragen die volle Verantwortung f\u00fcr die Handlungen der Unterauftragsverarbeiter nach Art. 28 Abs. 4 DSGVO.',
    },
    section3: {
      title: 'PRIM\u00c4RE INFRASTRUKTUR (Datenbank, Auth, Storage)',
      body: 'UNTERAUFTRAGSVERARBEITER:\nSupabase, Inc.\n970 Toa Payoh North #07-04\nSingapore 318992\nUnd Supabase Ireland Limited (f\u00fcr EU-Datens\u00e4tze)\n\nDATENREGION:\nFrankfurt, Deutschland (eu-central-1)\n\u2192 Daten verlassen NICHT die EU\n\nZWECK:\n\u2022 PostgreSQL-Datenbankhosting\n\u2022 Benutzerauthentifizierung (Anmeldung, Registrierung, 2FA)\n\u2022 Speicher f\u00fcr Dokumente und Fotos\n\u2022 Realtime f\u00fcr Live-Updates\n\u2022 Edge Functions f\u00fcr serverseitige Logik\n\nVERARBEITETE DATENKATEGORIEN:\n\u2022 Kontodaten (Name, E-Mail, gehashtes Passwort)\n\u2022 Alle Plattformdaten (Lieferungen, Rechnungen, Kunden)\n\u2022 Hochgeladene Dokumente (CMR, Fotos, Scans)\n\u2022 Audit-Log und Metadaten\n\nSICHERHEITSMASSNAHMEN:\n\u2022 ISO 27001 zertifiziert\n\u2022 SOC 2 Type II konform\n\u2022 TLS 1.3-Verschl\u00fcsselung im Transit\n\u2022 AES-256-Verschl\u00fcsselung im Ruhezustand\n\u2022 Row Level Security (RLS) auf Datenbankebene\n\nAVV: https://supabase.com/legal/dpa\nDatenschutzerkl\u00e4rung: https://supabase.com/privacy',
    },
    section4: {
      title: 'FRONTEND-HOSTING',
      body: 'UNTERAUFTRAGSVERARBEITER:\nSupabase Inc. (Datenbank, Auth, Storage, Edge Functions) — Plattform-Host\n\nDATENREGION:\nEU (Frankfurt, Amsterdam, Dublin - je nach Anbieter)\n\nZWECK:\n\u2022 Website- und Web-App-Hosting\n\u2022 CDN f\u00fcr hohe Geschwindigkeit\n\u2022 SSL/TLS-Zertifikate\n\u2022 DDoS-Schutz\n\nVERARBEITETE DATENKATEGORIEN:\n\u2022 IP-Adressen der Besucher (anonymisiert nach 7 Tagen)\n\u2022 Zugriffsprotokolle (URL, Zeit, User-Agent)\n\u2022 Verarbeitet KEINE anderen personenbezogenen Daten\n\nSICHERHEITSMASSNAHMEN:\n\u2022 SOC 2 Type II konform\n\u2022 ISO 27001 (Cloudflare)\n\u2022 TLS 1.3-Verschl\u00fcsselung\n\u2022 Audit-Log f\u00fcr administrativen Zugriff\n\nAVV: siehe https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nDatenschutzerkl\u00e4rung: siehe Datenschutzerklärung des Anbieters',
    },
    section5: {
      title: 'TRANSAKTIONALE E-MAIL',
      body: 'UNTERAUFTRAGSVERARBEITER:\nResend, Inc. — Versand transaktionaler E-Mails\n\nDATENREGION:\nEU (bevorzugt) - z.B. Frankfurt oder Amsterdam\n\u2192 Bei Anbietern nur in US-Regionen wird dies markiert und Rechtsgrundlage einbezogen (SCC)\n\nZWECK:\n\u2022 Versand transaktionaler E-Mails (Registrierung, Passwort, Abrechnung)\n\u2022 NICHT f\u00fcr Marketing verwendet\n\nVERARBEITETE DATENKATEGORIEN:\n\u2022 E-Mail-Adresse des Benutzers\n\u2022 Benutzername\n\u2022 E-Mail-Inhalt (Vorlage + Variablen)\n\u2022 Versandprotokoll (Status, \u00d6ffnung, Klick)\n\nSICHERHEITSMASSNAHMEN:\n\u2022 ISO 27001\n\u2022 SOC 2 Type II\n\u2022 TLS-Verschl\u00fcsselung\n\u2022 Beschr\u00e4nkter Zugriff mit 2FA\n\nAVV: siehe https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nDatenschutzerkl\u00e4rung: siehe Datenschutzerklärung des Anbieters',
    },
    section6: {
      title: 'ZAHLUNGEN (wenn aktiviert)',
      body: 'UNTERAUFTRAGSVERARBEITER:\nStripe Payments Europe, Limited\n1 Grand Canal Street Lower\nGrand Canal Dock\nDublin, D02 H210, Ireland\n\nDATENREGION:\nIrland (EU) f\u00fcr europ\u00e4ische Benutzer\n\u2192 Einige Daten werden in den USA zur Betrugserkennung verarbeitet - Rechtsgrundlage: SCC + Stripe-Angemessenheitsbeschluss\n\nZWECK:\n\u2022 Kredit-/Debitkartenzahlungsabwicklung\n\u2022 Automatische Abonnementabrechnung\n\u2022 Betrugserkennung und Risikobewertung\n\u2022 PCI DSS Compliance\n\nVERARBEITETE DATENKATEGORIEN:\n\u2022 E-Mail und Name des Benutzers\n\u2022 Kartendaten (DIREKT von Stripe verarbeitet, gehen NICHT \u00fcber unsere Server)\n\u2022 Rechnungsanschrift\n\u2022 Zahlungsstatus\n\nSICHERHEITSMASSNAHMEN:\n\u2022 PCI DSS Level 1 Compliance (h\u00f6chster Standard)\n\u2022 ISO 27001 + SOC 2\n\u2022 End-to-End-Verschl\u00fcsselung\n\u2022 Tokenisierung von Kartendaten\n\nAVV: https://stripe.com/legal/dpa\nDatenschutzerkl\u00e4rung: https://stripe.com/privacy',
    },
    section7: {
      title: '\u00dcBERWACHUNG UND ANALYTIK (optional)',
      body: 'UNTERAUFTRAGSVERARBEITER (nur wenn aktiviert):\nSentry.io (nur Fehler-Tracking, geplant)\n\nDATENREGION:\nEU (Frankfurt) f\u00fcr Plausible und Sentry EU\n\u2192 Nur EU-Regionen sind f\u00fcr diese Plattform genehmigt\n\nZWECK:\n\u2022 Fehler-Tracking und Debugging (Sentry)\n\u2022 Statistische Nutzungsanalyse (Plausible)\n\u2022 NICHT f\u00fcr Profiling verwendet\n\nVERARBEITETE DATENKATEGORIEN:\n\u2022 IP-Adressen (anonymisiert)\n\u2022 Browser- und Betriebssystemtyp\n\u2022 Besuchte URLs und Interaktionen\n\u2022 Verarbeitet KEINE personenidentifizierenden Daten\n\nERFORDERT EINWILLIGUNG:\nDieser Unterauftragsverarbeiter wird nur aktiviert, wenn Sie \u00fcber das Cookie-Banner einwilligen.\n\nAVV: siehe https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nDatenschutzerkl\u00e4rung: siehe Datenschutzerklärung des Anbieters',
    },
    section8: {
      title: 'GPS UND KARTEN (optional)',
      body: 'UNTERAUFTRAGSVERARBEITER:\nOpenStreetMap Foundation — Karten und Routenplanung\n\nDATENREGION:\n\u2022 Mapbox: EU (Berlin / Dublin)\n\u2022 OpenStreetMap: EU (Deutschland / Frankreich)\n\u2022 Google Maps: USA - erfordert SCC und Angemessenheitsbeschluss\n\nZWECK:\n\u2022 Kartenvisualisierung f\u00fcr Routenplanung\n\u2022 Distanz- und Routenberechnung\n\u2022 Geocoding (Adresse <-> Koordinaten)\n\u2022 Live-Fahrer-Tracking\n\nVERARBEITETE DATENKATEGORIEN:\n\u2022 Quell- und Zieladressen (nicht namentlich)\n\u2022 Fahrer-GPS-Koordinaten w\u00e4hrend des Transports\n\u2022 Verarbeitet NICHT die Fahreridentit\u00e4t\n\nSICHERHEITSMASSNAHMEN:\n\u2022 ISO 27001\n\u2022 SOC 2 Type II\n\u2022 TLS-Verschl\u00fcsselung\n\u2022 Anonymisierung von Koordinaten nach Transportabschluss\n\nAVV: siehe https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nDatenschutzerkl\u00e4rung: siehe Datenschutzerklärung des Anbieters',
    },
    section9: {
      title: 'SUPPORT UND KOMMUNIKATION (optional)',
      body: 'UNTERAUFTRAGSVERARBEITER:\nWir nutzen keinen externen Anbieter — Chat ist in die Plattform integriert\n\nDATENREGION:\nEU (bevorzugt)\n\u2022 Intercom: Dublin, Irland\n\u2022 Crisp: Paris, Frankreich\n\u2022 Help Scout: Boston, USA (SCC erforderlich)\n\u2022 Freshdesk: Frankfurt, Deutschland\n\nZWECK:\n\u2022 Live-Chat mit Kundensupport\n\u2022 Tickets und Fragenverfolgung\n\u2022 Knowledge Base und Selbstbedienung\n\nVERARBEITETE DATENKATEGORIEN:\n\u2022 E-Mail-Adresse und Name\n\u2022 Nachrichteninhalt\n\u2022 Konversationsverlauf\n\u2022 Metadaten (Datum, IP)\n\nSICHERHEITSMASSNAHMEN:\n\u2022 ISO 27001\n\u2022 SOC 2 Type II\n\u2022 TLS-Verschl\u00fcsselung\n\u2022 Beschr\u00e4nkter Zugriff mit 2FA f\u00fcr unser Personal\n\nAVV: siehe https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nDatenschutzerkl\u00e4rung: siehe Datenschutzerklärung des Anbieters',
    },
    section10: {
      title: '\u00c4nderungsprozess bei Unterauftragsverarbeitern',
      body: 'WENN WIR EINEN UNTERAUFTRAGSVERARBEITER HINZUF\u00dcGEN, ERSETZEN ODER ENTFERNEN:\n\n1. VORANK\u00dcNDIGUNG (30 TAGE)\nWir benachrichtigen Sie durch:\n\u2022 E-Mail an alle registrierten Kunden\n\u2022 Banner auf der Plattform\n\u2022 Aktualisierung dieser Liste mit neuem Datumsstempel\n\n2. WIDERSPRUCHSPERIODE\nSie haben 30 Tage Zeit, der \u00c4nderung per E-Mail an privacy@mm-logistic.eu zu widersprechen.\n\n3. WENN SIE WIDERSPRECHEN\nWir haben das Recht, den Vertrag mit 30-t\u00e4giger Frist zu k\u00fcndigen. Ihre Daten werden exportiert und gem\u00e4\u00df AVV gel\u00f6scht.\n\n4. UMSETZUNG\nOhne Widerspruch wird die \u00c4nderung nach der 30-Tage-Frist wirksam.\n\nDIESE REGELN GELTEN NICHT F\u00dcR:\n\u2022 Schnelle Sicherheits\u00e4nderungen (zum Schutz Ihrer Daten)\n\u2022 Anbieterwechsel durch Gesetze (Gerichtsbeschluss)\n\u2022 Insolvenz eines Unterauftragsverarbeiters (Notfallersatz)',
    },
    section11: {
      title: 'Ihre Rechte',
      body: 'SIE HABEN DAS RECHT:\n\n1. GENAU ZU WISSEN, welche Unterauftragsverarbeiter Ihre Daten verarbeiten (diese Liste erf\u00fcllt diese Anforderung nach Art. 28(2))\n\n2. NEUE UNTERAUFTRAGSVERARBEITER innerhalb von 30 Tagen nach Mitteilung ZU WIDERSPRECHEN\n\n3. ZUS\u00c4TZLICHE INFORMATIONEN \u00fcber jeden Unterauftragsverarbeiter ANZUFORDERN, einschlie\u00dflich:\n\u2022 AVV zwischen uns\n\u2022 Zertifizierungsberichte und Audits\n\u2022 Technische Details der Sicherheitsma\u00dfnahmen\n\n4. DEN VERTRAG ZU K\u00dcNDIGEN, wenn Sie einem neuen Unterauftragsverarbeiter nicht zustimmen\n\nANFRAGEN AN:\nE-Mail: privacy@mm-logistic.eu\nDSB: dpo@mm-logistic.eu\nAntwort innerhalb von 30 Tagen.',
    },
    section12: {
      title: 'Daten\u00fcbermittlung au\u00dferhalb der EU/EWR',
      body: 'UNSERE HAUPTRICHTLINIE:\nBevorzugt Unterauftragsverarbeiter mit EU/EWR-Servern und w\u00e4hlt diese, wann immer m\u00f6glich.\n\nWENN \u00dcBERTRAGUNG AU\u00dfERHALB DER EU/EWR NOTWENDIG IST:\n\nVerwendete Rechtsgrundlagen:\n\u2022 EU-Standardvertragsklauseln (SCC) der Europ\u00e4ischen Kommission (2021)\n\u2022 Angemessenheitsbeschl\u00fcsse f\u00fcr genehmigte L\u00e4nder (Andorra, Argentinien, Kanada, F\u00e4r\u00f6er, Guernsey, Israel, Isle of Man, Japan, Jersey, S\u00fcdkorea, Neuseeland, Schweiz, UK)\n\u2022 Binding Corporate Rules (BCR) f\u00fcr internationale Gruppen\n\nZUS\u00c4TZLICHE SCHUTZMASSNAHMEN:\n\u2022 Transfer Impact Assessment (TIA) f\u00fcr jede \u00dcbermittlung\n\u2022 End-to-End-Verschl\u00fcsselung\n\u2022 Pseudonymisierung wo m\u00f6glich\n\u2022 Zus\u00e4tzliche Subjektrechte\n\nAKTUELLE LISTE DER \u00dcBERMITTLUNGEN AU\u00dfERHALB DER EU/EWR:\nDerzeit hat nur Stripe (Irland + USA-Fragmente) begrenzte Daten\u00fcbermittlung au\u00dferhalb der EU. Alle anderen Unterauftragsverarbeiter sind nur in der EU/EWR.',
    },
    section13: {
      title: 'Versionierung und Verlauf',
      body: 'UPDATES:\nDiese Liste wird regelm\u00e4\u00dfig aktualisiert. Jede fr\u00fchere Version wird zur Transparenz archiviert.\n\nVERLAUF:\nVersion 1.0 (15. Mai 2026) - Erste Liste mit Hauptanbietern\n\nUPDATE-BENACHRICHTIGUNG:\n\u2022 E-Mail an aktive Kunden 30 Tage im Voraus\n\u2022 Plattform-Banner\n\u2022 Aktualisierter Datumsstempel oben im Dokument\n\nFR\u00dcHERE VERSIONEN:\nKann per E-Mail an privacy@mm-logistic.eu zu Transparenz- und Audit-Zwecken angefordert werden.',
    },
    section14: {
      title: 'Unabh\u00e4ngige \u00dcberpr\u00fcfung',
      body: 'WIR ERM\u00d6GLICHEN IHNEN DIE EIGENE \u00dcBERPR\u00dcFUNG:\n\n1. ZERTIFIZIERUNGEN\nKlicken Sie auf jeden Namen in dieser Liste, um zur Anbieterseite zu gelangen und zu \u00fcberpr\u00fcfen:\n\u2022 Aktive Zertifizierungen (ISO 27001, SOC 2)\n\u2022 Datenschutzerkl\u00e4rung\n\u2022 \u00d6ffentliches AVV\n\n2. KUNDEN-AUDIT\nUnternehmenskunden k\u00f6nnen Audit unseres AVV mit jedem Unterauftragsverarbeiter anfordern. Verfahren in AVV, Abschnitt 9.\n\n3. JAHRESBERICHT (wenn verf\u00fcgbar)\nWir werden einen Annual Security and Transparency Report mit Details ver\u00f6ffentlichen zu:\n\u2022 Anzahl der Anfragen betroffener Personen\n\u2022 Sicherheitsvorf\u00e4lle (anonymisiert)\n\u2022 \u00c4nderungen bei Unterauftragsverarbeitern\n\u2022 Ergebnisse von Penetration-Tests\n\nVor der ersten Ver\u00f6ffentlichung k\u00f6nnen Sie spezifische Informationen per E-Mail anfordern.',
    },
    section15: {
      title: 'Kontakt f\u00fcr Fragen',
      body: 'F\u00dcR FRAGEN ZU DIESER LISTE:\nE-Mail: privacy@mm-logistic.eu\nPost: Pfädlistraße 10, 79576 Weil am Rhein, Germany\n\nF\u00dcR DEN DATENSCHUTZBEAUFTRAGTEN (DSB):\nE-Mail: dpo@mm-logistic.eu\n\nF\u00dcR TECHNISCHE FRAGEN ZU UNTERAUFTRAGSVERARBEITERN:\n\u2022 Supabase: support@supabase.io\n\u2022 Supabase Inc.: support@supabase.io\n\u2022 Resend, Inc.: support@resend.com\n\nF\u00dcR SICHERHEITSVORFALL-BENACHRICHTIGUNG IN EINEM UNTERAUFTRAGSVERARBEITER:\nWir benachrichtigen Sie sofort (innerhalb von 24 Stunden nach Erhalt der Benachrichtigung) \u00fcber jede Verletzung, die Ihre Daten betreffen kann.',
    },
  },

  // ============================================================
  // FRENCH (FR)
  // ============================================================
  fr: {
    shortTitle: 'Sous-traitants',
    title: 'Liste des Sous-traitants Ult\u00e9rieurs',
    subtitle: 'Tous les services tiers qui traitent des donn\u00e9es personnelles pour notre compte, selon l\'Art. 28(2) du RGPD.',
    intro: 'Conform\u00e9ment \u00e0 la transparence requise par l\'Art. 28(2) du RGPD, voici la liste compl\u00e8te des sous-traitants ult\u00e9rieurs que nous utilisons pour fournir le service mm-logistic. Chaque sous-traitant a sign\u00e9 un accord avec nous l\'obligeant \u00e0 respecter au moins les m\u00eames normes de protection des donn\u00e9es que nous. La liste est mise \u00e0 jour r\u00e9guli\u00e8rement et les changements sont communiqu\u00e9s 30 jours \u00e0 l\'avance.',
    lastUpdated: '15 mai 2026',
    version: 'Version 1.0',

    section1: {
      title: 'Qu\'est-ce que les sous-traitants ult\u00e9rieurs?',
      body: 'Les sous-traitants ult\u00e9rieurs sont des entreprises tierces qui nous aident \u00e0 fournir notre service. Par exemple:\n\n\u2022 Fournisseurs d\'infrastructure cloud (serveurs, bases de donn\u00e9es)\n\u2022 Fournisseurs d\'e-mail transactionnel\n\u2022 Services de traitement des paiements\n\u2022 Services de surveillance et d\'analyse\n\nLorsque vous t\u00e9l\u00e9chargez des donn\u00e9es sur notre plateforme, elles peuvent \u00eatre trait\u00e9es par ces entreprises pour notre compte, dans les limites d\u00e9finies par l\'Accord de Traitement des Donn\u00e9es (DPA).\n\nLa liste ci-dessous montre EXACTEMENT quelles entreprises traitent vos donn\u00e9es, o\u00f9 se trouvent leurs serveurs, et dans quel but.',
    },
    section2: {
      title: 'Obligations des sous-traitants ult\u00e9rieurs',
      body: 'Chaque sous-traitant de cette liste a sign\u00e9 un accord avec nous l\'obligeant \u00e0:\n\n(1) Traiter les donn\u00e9es uniquement selon nos instructions et pour les finalit\u00e9s contract\u00e9es\n(2) Respecter des normes de s\u00e9curit\u00e9 au moins \u00e9gales aux n\u00f4tres (TLS, chiffrement, acc\u00e8s restreint)\n(3) Notifier imm\u00e9diatement les violations de s\u00e9curit\u00e9\n(4) Permettre les audits par notre responsable du traitement (client)\n(5) Supprimer les donn\u00e9es apr\u00e8s la r\u00e9siliation du contrat\n(6) Respecter les droits des personnes concern\u00e9es selon le RGPD\n\nNous conservons la pleine responsabilit\u00e9 des actions des sous-traitants ult\u00e9rieurs selon l\'Art. 28 paragraphe 4 du RGPD.',
    },
    section3: {
      title: 'INFRASTRUCTURE PRINCIPALE (Base de donn\u00e9es, Auth, Stockage)',
      body: 'SOUS-TRAITANT:\nSupabase, Inc.\n970 Toa Payoh North #07-04\nSingapore 318992\nEt Supabase Ireland Limited (pour les ensembles de donn\u00e9es UE)\n\nR\u00c9GION DE DONN\u00c9ES:\nFrancfort, Allemagne (eu-central-1)\n\u2192 Les donn\u00e9es ne quittent PAS l\'UE\n\nFINALIT\u00c9:\n\u2022 H\u00e9bergement de base de donn\u00e9es PostgreSQL\n\u2022 Authentification utilisateur (connexion, inscription, 2FA)\n\u2022 Stockage de documents et photos\n\u2022 Realtime pour les mises \u00e0 jour en direct\n\u2022 Edge Functions pour la logique c\u00f4t\u00e9 serveur\n\nCAT\u00c9GORIES DE DONN\u00c9ES TRAIT\u00c9ES:\n\u2022 Donn\u00e9es de compte (nom, e-mail, mot de passe hach\u00e9)\n\u2022 Toutes les donn\u00e9es de la plateforme (livraisons, factures, clients)\n\u2022 Documents t\u00e9l\u00e9charg\u00e9s (CMR, photos, scans)\n\u2022 Journal d\'audit et m\u00e9tadonn\u00e9es\n\nMESURES DE S\u00c9CURIT\u00c9:\n\u2022 Certifi\u00e9 ISO 27001\n\u2022 Conforme SOC 2 Type II\n\u2022 Chiffrement TLS 1.3 en transit\n\u2022 Chiffrement AES-256 au repos\n\u2022 Row Level Security (RLS) au niveau de la base de donn\u00e9es\n\nDPA: https://supabase.com/legal/dpa\nPolitique de confidentialit\u00e9: https://supabase.com/privacy',
    },
    section4: {
      title: 'H\u00c9BERGEMENT FRONTEND',
      body: 'SOUS-TRAITANT:\nSupabase Inc. (base de données, auth, stockage, edge functions) — hôte de la plateforme\n\nR\u00c9GION DE DONN\u00c9ES:\nUE (Francfort, Amsterdam, Dublin - selon le fournisseur)\n\nFINALIT\u00c9:\n\u2022 H\u00e9bergement du site web et de l\'application web\n\u2022 CDN pour la haute vitesse\n\u2022 Certificats SSL/TLS\n\u2022 Protection DDoS\n\nCAT\u00c9GORIES DE DONN\u00c9ES TRAIT\u00c9ES:\n\u2022 Adresses IP des visiteurs (anonymis\u00e9es apr\u00e8s 7 jours)\n\u2022 Journaux d\'acc\u00e8s (URL, heure, User-Agent)\n\u2022 NE traite PAS d\'autres donn\u00e9es personnelles\n\nMESURES DE S\u00c9CURIT\u00c9:\n\u2022 Conforme SOC 2 Type II\n\u2022 ISO 27001 (Cloudflare)\n\u2022 Chiffrement TLS 1.3\n\u2022 Journal d\'audit pour l\'acc\u00e8s administratif\n\nDPA: voir https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPolitique de confidentialit\u00e9: voir la politique de confidentialité du prestataire',
    },
    section5: {
      title: 'E-MAIL TRANSACTIONNEL',
      body: 'SOUS-TRAITANT:\nResend, Inc. — envoi d\'e-mails transactionnels\n\nR\u00c9GION DE DONN\u00c9ES:\nUE (pr\u00e9f\u00e9r\u00e9e) - par ex. Francfort ou Amsterdam\n\u2192 Si le fournisseur n\'a que des r\u00e9gions US, cela est marqu\u00e9 et la base juridique incluse (CCT)\n\nFINALIT\u00c9:\n\u2022 Envoi d\'e-mails transactionnels (inscription, mot de passe, facturation)\n\u2022 N\'est PAS utilis\u00e9 pour le marketing\n\nCAT\u00c9GORIES DE DONN\u00c9ES TRAIT\u00c9ES:\n\u2022 Adresse e-mail de l\'utilisateur\n\u2022 Nom de l\'utilisateur\n\u2022 Contenu de l\'e-mail (mod\u00e8le + variables)\n\u2022 Journal de livraison (statut, ouverture, clic)\n\nMESURES DE S\u00c9CURIT\u00c9:\n\u2022 ISO 27001\n\u2022 SOC 2 Type II\n\u2022 Chiffrement TLS\n\u2022 Acc\u00e8s restreint avec 2FA\n\nDPA: voir https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPolitique de confidentialit\u00e9: voir la politique de confidentialité du prestataire',
    },
    section6: {
      title: 'PAIEMENTS (lorsqu\'activ\u00e9)',
      body: 'SOUS-TRAITANT:\nStripe Payments Europe, Limited\n1 Grand Canal Street Lower\nGrand Canal Dock\nDublin, D02 H210, Irlande\n\nR\u00c9GION DE DONN\u00c9ES:\nIrlande (UE) pour les utilisateurs europ\u00e9ens\n\u2192 Certaines donn\u00e9es sont trait\u00e9es aux \u00c9tats-Unis pour la d\u00e9tection de fraude - base juridique: CCT + d\u00e9cision d\'ad\u00e9quation Stripe\n\nFINALIT\u00c9:\n\u2022 Traitement des paiements par carte de cr\u00e9dit/d\u00e9bit\n\u2022 Facturation automatique des abonnements\n\u2022 D\u00e9tection de fraude et \u00e9valuation des risques\n\u2022 Conformit\u00e9 PCI DSS\n\nCAT\u00c9GORIES DE DONN\u00c9ES TRAIT\u00c9ES:\n\u2022 E-mail et nom de l\'utilisateur\n\u2022 Donn\u00e9es de carte (trait\u00e9es DIRECTEMENT par Stripe, ne passent PAS par nos serveurs)\n\u2022 Adresse de facturation\n\u2022 Statut de paiement\n\nMESURES DE S\u00c9CURIT\u00c9:\n\u2022 Conformit\u00e9 PCI DSS Niveau 1 (norme la plus \u00e9lev\u00e9e)\n\u2022 ISO 27001 + SOC 2\n\u2022 Chiffrement de bout en bout\n\u2022 Tokenisation des donn\u00e9es de carte\n\nDPA: https://stripe.com/legal/dpa\nPolitique de confidentialit\u00e9: https://stripe.com/privacy',
    },
    section7: {
      title: 'SURVEILLANCE ET ANALYTIQUE (facultatif)',
      body: 'SOUS-TRAITANT (uniquement si activ\u00e9):\nSentry.io (uniquement suivi des erreurs, prévu)\n\nR\u00c9GION DE DONN\u00c9ES:\nUE (Francfort) pour Plausible et Sentry EU\n\u2192 Seules les r\u00e9gions UE sont approuv\u00e9es pour cette plateforme\n\nFINALIT\u00c9:\n\u2022 Suivi des erreurs et d\u00e9bogage (Sentry)\n\u2022 Analyse statistique d\'utilisation (Plausible)\n\u2022 N\'est PAS utilis\u00e9 pour le profilage\n\nCAT\u00c9GORIES DE DONN\u00c9ES TRAIT\u00c9ES:\n\u2022 Adresses IP (anonymis\u00e9es)\n\u2022 Type de navigateur et OS\n\u2022 URLs visit\u00e9es et interactions\n\u2022 NE traite PAS de donn\u00e9es personnellement identifiables\n\nN\u00c9CESSITE LE CONSENTEMENT:\nCe sous-traitant n\'est activ\u00e9 que si vous donnez votre consentement via la Banni\u00e8re Cookies.\n\nDPA: voir https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPolitique de confidentialit\u00e9: voir la politique de confidentialité du prestataire',
    },
    section8: {
      title: 'GPS ET CARTES (facultatif)',
      body: 'SOUS-TRAITANT:\nOpenStreetMap Foundation — cartes et itinéraires\n\nR\u00c9GION DE DONN\u00c9ES:\n\u2022 Mapbox: UE (Berlin / Dublin)\n\u2022 OpenStreetMap: UE (Allemagne / France)\n\u2022 Google Maps: USA - n\u00e9cessite CCT et d\u00e9cision d\'ad\u00e9quation\n\nFINALIT\u00c9:\n\u2022 Visualisation de cartes pour le routage\n\u2022 Calcul de distance et d\'itin\u00e9raire\n\u2022 G\u00e9ocodage (adresse <-> coordonn\u00e9es)\n\u2022 Suivi de chauffeur en direct\n\nCAT\u00c9GORIES DE DONN\u00c9ES TRAIT\u00c9ES:\n\u2022 Adresses source et destination (pas nominativement)\n\u2022 Coordonn\u00e9es GPS du chauffeur pendant le transport\n\u2022 NE traite PAS l\'identit\u00e9 du chauffeur\n\nMESURES DE S\u00c9CURIT\u00c9:\n\u2022 ISO 27001\n\u2022 SOC 2 Type II\n\u2022 Chiffrement TLS\n\u2022 Anonymisation des coordonn\u00e9es apr\u00e8s la fin du transport\n\nDPA: voir https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPolitique de confidentialit\u00e9: voir la politique de confidentialité du prestataire',
    },
    section9: {
      title: 'SUPPORT ET COMMUNICATION (facultatif)',
      body: 'SOUS-TRAITANT:\nNous n\'utilisons pas de prestataire externe — le chat est intégré à la plateforme\n\nR\u00c9GION DE DONN\u00c9ES:\nUE (pr\u00e9f\u00e9r\u00e9e)\n\u2022 Intercom: Dublin, Irlande\n\u2022 Crisp: Paris, France\n\u2022 Help Scout: Boston, USA (CCT requises)\n\u2022 Freshdesk: Francfort, Allemagne\n\nFINALIT\u00c9:\n\u2022 Chat en direct avec support client\n\u2022 Tickets et suivi des questions\n\u2022 Base de connaissances et libre-service\n\nCAT\u00c9GORIES DE DONN\u00c9ES TRAIT\u00c9ES:\n\u2022 Adresse e-mail et nom\n\u2022 Contenu des messages\n\u2022 Historique des conversations\n\u2022 M\u00e9tadonn\u00e9es (date, IP)\n\nMESURES DE S\u00c9CURIT\u00c9:\n\u2022 ISO 27001\n\u2022 SOC 2 Type II\n\u2022 Chiffrement TLS\n\u2022 Acc\u00e8s restreint avec 2FA pour notre personnel\n\nDPA: voir https://supabase.com/legal/dpa / https://resend.com/legal/dpa\nPolitique de confidentialit\u00e9: voir la politique de confidentialité du prestataire',
    },
    section10: {
      title: 'Processus de changement de sous-traitants',
      body: 'LORSQUE NOUS AJOUTONS, REMPLA\u00c7ONS OU SUPPRIMONS UN SOUS-TRAITANT:\n\n1. AVIS PR\u00c9ALABLE (30 JOURS)\nNous vous notifierons par:\n\u2022 E-mail \u00e0 tous les clients enregistr\u00e9s\n\u2022 Banni\u00e8re sur la plateforme\n\u2022 Mise \u00e0 jour de cette liste avec nouvel horodatage\n\n2. P\u00c9RIODE D\'OPPOSITION\nVous avez 30 jours pour vous opposer au changement par e-mail \u00e0 privacy@mm-logistic.eu.\n\n3. SI VOUS VOUS OPPOSEZ\nNous avons le droit de r\u00e9silier le contrat avec pr\u00e9avis de 30 jours. Vos donn\u00e9es seront export\u00e9es et supprim\u00e9es selon le DPA.\n\n4. MISE EN \u0152UVRE\nSans opposition, le changement devient effectif apr\u00e8s la p\u00e9riode de 30 jours.\n\nCES R\u00c8GLES NE S\'APPLIQUENT PAS POUR:\n\u2022 Changements de s\u00e9curit\u00e9 rapides (pour prot\u00e9ger vos donn\u00e9es)\n\u2022 Changements de fournisseur impos\u00e9s par les lois (d\u00e9cision de justice)\n\u2022 Faillite d\'un sous-traitant (remplacement d\'urgence)',
    },
    section11: {
      title: 'Vos droits',
      body: 'VOUS AVEZ LE DROIT:\n\n1. DE SAVOIR EXACTEMENT quels sous-traitants traitent vos donn\u00e9es (cette liste remplit cette exigence selon l\'Art. 28(2))\n\n2. DE VOUS OPPOSER \u00e0 l\'ajout de nouveaux sous-traitants dans les 30 jours suivant la notification\n\n3. DE DEMANDER DES INFORMATIONS SUPPL\u00c9MENTAIRES sur chaque sous-traitant, y compris:\n\u2022 DPA entre nous\n\u2022 Rapports de certification et audits\n\u2022 D\u00e9tails techniques des mesures de s\u00e9curit\u00e9\n\n4. DE R\u00c9SILIER LE CONTRAT si vous n\'\u00eates pas d\'accord avec un nouveau sous-traitant\n\nDEMANDES ENVOY\u00c9ES \u00c0:\nE-mail: privacy@mm-logistic.eu\nDPO: dpo@mm-logistic.eu\nR\u00e9ponse dans les 30 jours.',
    },
    section12: {
      title: 'Transfert de donn\u00e9es hors UE/EEE',
      body: 'NOTRE POLITIQUE PRINCIPALE:\nPr\u00e9f\u00e8re les sous-traitants avec serveurs UE/EEE et les choisit chaque fois que possible.\n\nSI LE TRANSFERT HORS UE/EEE EST N\u00c9CESSAIRE:\n\nBases juridiques utilis\u00e9es:\n\u2022 Clauses Contractuelles Types (CCT) de la Commission Europ\u00e9enne (2021)\n\u2022 D\u00e9cisions d\'ad\u00e9quation pour les pays approuv\u00e9s (Andorre, Argentine, Canada, F\u00e9ro\u00e9, Guernesey, Isra\u00ebl, Ile de Man, Japon, Jersey, Cor\u00e9e du Sud, Nouvelle-Z\u00e9lande, Suisse, RU)\n\u2022 R\u00e8gles d\'Entreprise Contraignantes (BCR) pour les groupes internationaux\n\nGARANTIES SUPPL\u00c9MENTAIRES:\n\u2022 Transfer Impact Assessment (TIA) pour chaque transfert\n\u2022 Chiffrement de bout en bout\n\u2022 Pseudonymisation lorsque possible\n\u2022 Droits suppl\u00e9mentaires des sujets\n\nLISTE ACTUELLE DES TRANSFERTS HORS UE/EEE:\nActuellement, seul Stripe (Irlande + fragments USA) a un transfert limit\u00e9 de donn\u00e9es hors UE. Tous les autres sous-traitants sont uniquement dans l\'UE/EEE.',
    },
    section13: {
      title: 'Versioning et historique',
      body: 'MISES \u00c0 JOUR:\nCette liste est mise \u00e0 jour r\u00e9guli\u00e8rement. Chaque version pr\u00e9c\u00e9dente est conserv\u00e9e en archive pour la transparence.\n\nHISTORIQUE:\nVersion 1.0 (15 mai 2026) - Liste initiale avec principaux fournisseurs\n\nNOTIFICATION DE MISE \u00c0 JOUR:\n\u2022 E-mail aux clients actifs 30 jours \u00e0 l\'avance\n\u2022 Banni\u00e8re sur la plateforme\n\u2022 Horodatage mis \u00e0 jour en haut du document\n\nVERSIONS PR\u00c9C\u00c9DENTES:\nPeuvent \u00eatre demand\u00e9es par e-mail \u00e0 privacy@mm-logistic.eu \u00e0 des fins de transparence et d\'audit.',
    },
    section14: {
      title: 'V\u00e9rification ind\u00e9pendante',
      body: 'NOUS VOUS PERMETTONS DE V\u00c9RIFIER VOUS-M\u00caME:\n\n1. CERTIFICATIONS\nCliquez sur chaque nom dans cette liste pour aller sur la page du fournisseur et v\u00e9rifier:\n\u2022 Certifications actives (ISO 27001, SOC 2)\n\u2022 Politique de confidentialit\u00e9\n\u2022 DPA public\n\n2. AUDIT CLIENT\nLes clients entreprise peuvent demander un audit de notre DPA avec chaque sous-traitant. Proc\u00e9dure dans le DPA, Section 9.\n\n3. RAPPORT ANNUEL (lorsque disponible)\nNous publierons un Rapport Annuel de S\u00e9curit\u00e9 et Transparence avec des d\u00e9tails sur:\n\u2022 Nombre de demandes des personnes concern\u00e9es\n\u2022 Incidents de s\u00e9curit\u00e9 (anonymis\u00e9s)\n\u2022 Changements de sous-traitants\n\u2022 R\u00e9sultats des tests de p\u00e9n\u00e9tration\n\nAvant la premi\u00e8re publication, vous pouvez demander des informations sp\u00e9cifiques par e-mail.',
    },
    section15: {
      title: 'Contact pour questions',
      body: 'POUR QUESTIONS SUR CETTE LISTE:\nE-mail: privacy@mm-logistic.eu\nCourrier: Pfädlistraße 10, 79576 Weil am Rhein, Germany, d\u00e9pt. "Datenschutz"\n\nPOUR LE D\u00c9L\u00c9GU\u00c9 \u00c0 LA PROTECTION DES DONN\u00c9ES (DPO):\nE-mail: dpo@mm-logistic.eu\n\nPOUR QUESTIONS TECHNIQUES SUR LES SOUS-TRAITANTS:\n\u2022 Supabase: support@supabase.io\n\u2022 Supabase Inc.: [e-mail]\n\u2022 Resend, Inc.: [e-mail]\n\nPOUR NOTIFICATION D\'INCIDENT DE S\u00c9CURIT\u00c9 CHEZ UN SOUS-TRAITANT:\nNous vous notifierons imm\u00e9diatement (dans les 24 heures suivant la r\u00e9ception de la notification) de toute violation pouvant affecter vos donn\u00e9es.',
    },
  },
};
