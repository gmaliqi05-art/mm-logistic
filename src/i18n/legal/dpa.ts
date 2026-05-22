/**
 * Data Processing Agreement (DPA) / Auftragsverarbeitungsvertrag (AVV)
 * Required by GDPR Art. 28 for any SaaS that processes personal data
 * on behalf of customers (B2B).
 *
 * Legal relationship:
 * - Customer = data controller (Verantwortlicher) - decides what data to upload
 * - Provider (you) = data processor (Auftragsverarbeiter) - processes on behalf
 *
 * Without a valid DPA, the customer is in violation of GDPR Art. 28 simply
 * by using the SaaS. Enterprise customers WILL NOT sign without it.
 *
 * This is a baseline template based on EU Commission SCC standard.
 * Have it reviewed by a German IT lawyer before deploying.
 */

export const dpa = {
  // ============================================================
  // ALBANIAN (SQ)
  // ============================================================
  sq: {
    shortTitle: 'DPA',
    title: 'Marreveshja per Perpunimin e te Dhenave (DPA)',
    subtitle: 'Auftragsverarbeitungsvertrag sipas GDPR Art. 28 - rregullon perpunimin e te dhenave personale ne emer te klientit.',
    intro: 'Kjo Marreveshje per Perpunimin e te Dhenave ("DPA" ose "AVV" - Auftragsverarbeitungsvertrag) eshte pjese e pa-ndashme e Kushteve te Pergjithshme te Perdorimit (AGB) midis Mar Group (Genton Maliqi) ("Perpunuesi", "ne") dhe Klientit ("Kontrolluesi", "ju"). Ajo rregullon perpunimin e te dhenave personale qe ju (si kontrollues) ngarkoni ne platformen tone, ne perputhje me GDPR Art. 28 dhe \u00a7 62 BDSG.',
    lastUpdated: '15 Maj 2026',
    version: 'Versioni 1.0',

    section1: {
      title: 'Palet dhe rolet',
      body: 'KONTROLLUESI (Verantwortlicher):\nKlienti qe perdor platformen mm-logistic dhe ngarkon te dhena personale per perpunim.\n\nPERPUNUESI (Auftragsverarbeiter):\nMar Group (Genton Maliqi)\nPfädlistraße 10, 79576 Weil am Rhein, Germany\nGjermania\n\nNe perpunoi te dhena personale ne emer dhe sipas udhezimeve te kontrolluesit, pa pasur asnje qellim te pavarur per to. Kontrolluesi mban pergjegjesine ligjore per ligjshmerine e perpunimit, perfshire baza ligjore, qellimet dhe pelqimin e subjekteve te te dhenave kur kerkohet.',
    },
    section2: {
      title: 'Subjekti, kohezgjatja dhe qellimi i perpunimit',
      body: 'SUBJEKTI:\nPerpunimi i te dhenave personale qe kontrolluesi ngarkon ne platformen mm-logistic gjate perdorimit te sherbimit.\n\nKOHEZGJATJA:\nPerpunimi vazhdon per gjate gjithe periudhes se kontrates kryesore SaaS, plus periudhat e ruajtjes ligjore (10 vjet per dokumente fiskale sipas \u00a7 147 AO).\n\nQELLIMI:\nOfrimi i sherbimit SaaS te logjistikes, depo, kontabilitetit dhe operacioneve te biznesit, ne perputhje me funksionalitetet e pershkruara ne AGB dhe planin e abonimit.\n\nNATYRA:\nPerpunim automatik dhe gjysem-automatik permes infrastruktures cloud te perpunuesit (hosting, baza e te dhenave, ruajtja e dokumenteve).',
    },
    section3: {
      title: 'Llojet e te dhenave dhe kategorite e subjekteve',
      body: 'LLOJET E TE DHENAVE PERSONALE QE PERPUNOJME PER KONTROLLUESIN:\n\nA) Te dhena identifikuese\n\u2022 Emer, mbiemer\n\u2022 ID e brendshme te perdoruesit\n\u2022 Numra dokumentesh (license, kontrate)\n\nB) Te dhena kontakti\n\u2022 Adresa e-mail\n\u2022 Numra telefoni\n\u2022 Adresa postare/biznesi\n\nC) Te dhena fiskale dhe financiare\n\u2022 USt-IdNr. (numri i TVSH-se)\n\u2022 IBAN dhe llogari bankare\n\u2022 Te dhena faturash\n\nD) Te dhena lokalizimi (GPS)\n\u2022 Koordinata te shofereve gjate transportit\n\u2022 Adresa pickup dhe delivery\n\nE) Te dhena dokumentesh\n\u2022 Fotografi te CMR-ve, faturave, lejeve\n\u2022 Skanime dokumentesh shoferi\n\nKATEGORITET E SUBJEKTEVE TE TE DHENAVE:\n\u2022 Punonjes te klientit (administrate, kontabiliste, menaxhere depo)\n\u2022 Shofere te punesuar nga klienti\n\u2022 Klientet finale te klientit (kompani qe porositin sherbime)\n\u2022 Partneret e biznesit (furnizues, transportues)\n\nKATEGORITE SPECIALE TE TE DHENAVE (Art. 9 GDPR):\nNuk perpunojme me vetedije kategori speciale (raca, religji, shendeti, etj.). Nese kontrolluesi ngarkon dokumente shoferi qe permbajne te dhena shendetesore (p.sh. certifikate mjekesore), kontrolluesi eshte pergjegjes per pelqimin ligjor te subjekteve.',
    },
    section4: {
      title: 'Udhezimet e kontrolluesit',
      body: '(1) Perpunoi te dhenat personale vetem sipas udhezimeve te dokumentuara te kontrolluesit, te tregohen permes:\n\u2022 Konfiguracionit ne platforme (parametra, role, leje)\n\u2022 Veprimeve te kryera nga perdoruesit e kontrolluesit\n\u2022 Kerkesave specifike permes mbeshtetjes\n\u2022 Funksionaliteteve te zgjedhura nga kontrolluesi\n\n(2) Nese ne mendojme se nje udhezim shkel GDPR, BDSG ose ndonje ligj tjeter te zbatueshem, do ta informojme menjehere kontrolluesin dhe do te kemi te drejte te pezullojme zbatimin deri ne konfirmim.\n\n(3) Nje udhezim mund te jepet gjithashtu permes njoftimit me shkrim drejtuar dep. tone te mbeshtetjes ne privacy@mm-logistic.eu.\n\n(4) Cdo udhezim qe shkon pertej funksionaliteteve te zakonshme te platformes mund te kerkoje nje marreveshje shtese dhe tarife.',
    },
    section5: {
      title: 'Detyrimet e perpunuesit (ne)',
      body: 'Ne zotojme:\n\n(1) Te perpunoi te dhenat vetem ne kuader te qellimeve te kontrates dhe sipas udhezimeve te kontrolluesit.\n\n(2) Te ruajme konfidencialitetin e te dhenave. Te gjithe punonjesit dhe nen-perpunuesit kane nenshkruar marreveshje konfidencialiteti.\n\n(3) Te zbatojme masa teknike dhe organizative adekuate (TOM) sipas GDPR Art. 32 - shih Aneksin 1.\n\n(4) Te bashkepunojme me kontrolluesin per t\'i mundesuar pergjigjet ndaj kerkesave te subjekteve te te dhenave qe ushtrojne te drejtat e tyre (GDPR Art. 12-22).\n\n(5) Te raportojme menjehere (brenda 24 oresh) cdo shkelje te sigurise se te dhenave personale, duke perfshire:\n\u2022 Natyren e shkeljes\n\u2022 Kategorite dhe numrin aproksimativ te subjekteve te prekur\n\u2022 Kategorite dhe numrin aproksimativ te te dhenave\n\u2022 Pasojat e mundshme\n\u2022 Masat e marra ose te propozuara\n\n(6) Te asistojme kontrolluesin ne perpunimin e DPIA (Data Protection Impact Assessment) sipas GDPR Art. 35-36.\n\n(7) Te ofrojme te gjithe informacionin e nevojshem kontrolluesit per te demonstruar pajtueshmeri me Art. 28 - perfshire akses ne audit log dhe raporte te sigurise.\n\n(8) Pas perfundimit te kontrates, sipas zgjedhjes se kontrolluesit:\n\u2022 Te kthejme te gjitha te dhenat personale, ose\n\u2022 T\'i fshijme ato (pervec rasteve kur ligji kerkon ruajtjen).',
    },
    section6: {
      title: 'Nen-perpunuesit (subprocessors)',
      body: '(1) Kontrolluesi jep autorizim te pergjithshem (general authorization) per ne te perdorim nen-perpunues, sipas GDPR Art. 28 par. 2.\n\n(2) Lista aktuale e nen-perpunuesve eshte ne dokumentin "Subprocessors" te lidhur ne footer. Lista perfshin:\n\u2022 Supabase Inc. (databaza, autentifikim, storage) - Region EU\n\u2022 Supabase Inc. - Region EU\n\u2022 Resend, Inc. - Region EU\n\n(3) Te gjithe nen-perpunuesit jane te detyruar permes marreveshjeve me shkrim te respektojne te paktet te njejtat detyrime te mbrojtjes se te dhenave si ne kete DPA (GDPR Art. 28 par. 4).\n\n(4) Ne ruajme pergjegjesi te plote per veprimet e nen-perpunuesve.\n\n(5) PARA shtimit ose zevendesimit te nje nen-perpunuesi, do te:\n\u2022 Ju njoftojme me shkrim te pakten 30 dite paraprakisht\n\u2022 Ju jepni mundesi te kundershtoni\n\u2022 Nese ju kundershtoni, kemi te drejte te perfundojme kontraten me njoftim 30 dite\n\n(6) Per nen-perpunues jashte BE/EEA, sigurojme baza ligjore te nevojshme (SCC, BCR, adequacy decision).',
    },
    section7: {
      title: 'Te drejtat e subjekteve te te dhenave',
      body: '(1) Nese nje subjekt i te dhenave drejtohet tek ne me kerkesa per te ushtruar te drejtat e tij sipas GDPR Art. 15-22 (akses, korrigjim, fshirje, kufizim, portabilitet, kundershtim), ne nuk pergjigjemi drejtperdrejt por:\n\u2022 Konfirmojme marrjen e kerkeses brenda 5 ditesh\n\u2022 Drejtojme subjektin tek kontrolluesi\n\u2022 Informojme menjehere kontrolluesin\n\u2022 Ofrojme asistence teknike sipas nevojes\n\n(2) Pergjegjesi parësore per pergjigjen e kerkesave eshte e kontrolluesit.\n\n(3) Per t\'ju asistuar ne pergjigje, ofrojme:\n\u2022 Eksport te te dhenave ne format JSON/CSV\n\u2022 Funksionalitet fshirjeje permes panelit te llogarise\n\u2022 Korrigjim te te dhenave me upload\n\u2022 Logging te te gjitha veprimeve te perpunimit',
    },
    section8: {
      title: 'Masa teknike dhe organizative (TOM)',
      body: 'Ne zbatojme masat e meposhtme per te garantuar nje nivel sigurie te pershtatshem per riskun (Art. 32 GDPR):\n\nA) KONFIDENCIALITETI\n\u2022 Enkriptim TLS 1.3 per te dhena ne tranzit\n\u2022 Enkriptim AES-256 per te dhena ne pushim\n\u2022 Hash i fjalekalimit me Argon2/bcrypt\n\u2022 2FA opsional per perdoruesit\n\u2022 Multi-tenancy me Row Level Security (783+ politika aktive)\n\u2022 Akses me principin "need-to-know"\n\u2022 Marreveshje konfidencialiteti me te gjithe punonjesit\n\nB) INTEGRITETI\n\u2022 Audit log per cdo veprim ne sistem\n\u2022 Versionim Git per cdo ndryshim ne schema\n\u2022 Constraint database (UNIQUE, FOREIGN KEY, CHECK)\n\u2022 Validim input ne front-end dhe back-end\n\nC) DISPONUESHMERIA\n\u2022 99.9% uptime SLA\n\u2022 Backup te perditshme, te enkriptuara, ruajtje 30 dite\n\u2022 Disaster recovery plan\n\u2022 Auto-scaling per ngarkesat me te medha\n\u2022 DDoS protection (Cloudflare ose i ngjashem)\n\nD) RESILIENCA\n\u2022 Multi-region backup (vetem ne EU)\n\u2022 RTO (Recovery Time Objective): 4 ore\n\u2022 RPO (Recovery Point Objective): 1 ore\n\nE) TESTIMI DHE VLERESIMI\n\u2022 Penetration testing vjetor\n\u2022 Vulnerability scanning automatik\n\u2022 Code review per cdo PR\n\u2022 Dependency security audit\n\nDetaje teknike te plota gjenden ne Aneksin 1 te kesaj DPA.',
    },
    section9: {
      title: 'Auditim dhe inspektim',
      body: '(1) Kontrolluesi ka te drejten te kontrolloje permbushjen e detyrimeve te kesaj DPA permes:\n\u2022 Pyetjeve me shkrim drejtuar privacy@mm-logistic.eu\n\u2022 Aksesit ne raporte certifikimi (ISO 27001, SOC 2 - kur disponohen)\n\u2022 Audit ne vendin tone, pas njoftimit te pakten 30 dite paraprakisht\n\n(2) Audit ne vendin tone:\n\u2022 Behet gjate orarit te punes, jo me shume se 1 here ne vit, pervec ne raste te dyshuara serioze\n\u2022 Kostot mban kontrolluesi (pervec rasteve kur audit konstaton shkelje)\n\u2022 Audit nuk duhet te nderpresi operacionet tona\n\u2022 Auditori nenshkruan NDA paraprakisht\n\n(3) Per arsye sigurie, mund te kufizojme aksesin ne sisteme te caktuara dhe te dhena te paleve te treta (klienteve te tjere).\n\n(4) Audit i jashtem nga audit-i i certifikuar pranohet si zevendesim per audit te kontrolluesit.',
    },
    section10: {
      title: 'Periudhat e ruajtjes dhe fshirja',
      body: '(1) Gjate kontrates aktive, te dhenat ruhen sa kohe qe kontrolluesi i mban aktive ne platforme.\n\n(2) Pas perfundimit te kontrates (per cfaredo arsye):\n\u2022 30 dite: Periudha e shkarkimit - kontrolluesi mund te shkarkoje te gjitha te dhenat\n\u2022 90 dite: Backup-et ruhen ne arkive te ngrira (vetem per rikuperim, nuk perdoren)\n\u2022 Pas 90 ditesh: Te gjitha te dhenat aktive fshihen ne menyre te sigurte\n\n(3) Te dhenat e detyrueshme ligjisht (fatura, kontrata, dokumente fiskale) ruhen sipas afateve ligjore (10 vjet sipas \u00a7 147 AO), por ne arkiva te ngrira me akses te kufizuar.\n\n(4) Fshirja konfirmohet me certifikate te shkruar sipas kerkeses se kontrolluesit.\n\n(5) Pas fshirjes, te dhenat NUK mund te rikuperohen.',
    },
    section11: {
      title: 'Transferimi i te dhenave jashte BE/EEA',
      body: '(1) Aktualisht NUK transferojme te dhena jashte BE/EEA. Te gjitha sistemet (Supabase, hosting, e-mail) jane te konfiguruara ne regione EU.\n\n(2) Nese ne te ardhmen do te nevojitet transferim:\n\u2022 Do te perdorim Standard Contractual Clauses (SCC) te Komisionit Evropian\n\u2022 Ose adequacy decision\n\u2022 Ose Binding Corporate Rules (BCR)\n\n(3) Do te ju njoftojme paraprakisht 30 dite per cdo transferim te ri jashte EEA.\n\n(4) Ju keni te drejte te kundershtoni transferimin dhe te perfundoni kontraten nese nuk pajtoni.',
    },
    section12: {
      title: 'Pergjegjesia dhe shperblimi',
      body: '(1) Pergjegjesia per shkelje te kesaj DPA i nenshtrohet dispozitave te pergjegjesise se AGB-ve, me kufizimet e percaktuara aty.\n\n(2) Ndaras nga kufizimet e pergjithshme, pergjegjesia ndahet sipas GDPR Art. 82:\n\u2022 Cdo pale eshte pergjegjese per shkeljen e veta\n\u2022 Pergjegjesia eshte solidare nese te dyja palet kane kontribuar ne shkelje\n\u2022 Pala qe ka paguar shperblim te plote ka te drejten e rekursit ndaj te tjereve\n\n(3) Per gjobat e GDPR (deri €20M ose 4% e te ardhurave), secila pale mban gjoben e veta perveç rasteve kur tjetra ka kontribuar drejtperdrejt.\n\n(4) Asnjera pale nuk pergjigjet per:\n\u2022 Veprime te subjekteve te te dhenave qe shkelin AGB\n\u2022 Forca madhore\n\u2022 Shkelje per shkak te udhezimeve ilegale te kontrolluesit (pas paralajmerimit tone)',
    },
    section13: {
      title: 'Te dhena qe rrjedhin nga forca madhore',
      body: '(1) Asnjera pale nuk pergjigjet per shkelje te kesaj DPA per shkak te forces madhore:\n\u2022 Katastrofa natyrore\n\u2022 Sulm kibernetik masiv jashte kontrollit\n\u2022 Veprime te qeverise\n\u2022 Embargo\n\u2022 Pandemi\n\u2022 Lufte\n\n(2) Pala e prekur duhet:\n\u2022 Te njoftoje paten tjeter brenda 24 oresh\n\u2022 Te beje perpjekje te arsyeshme per zbutje\n\u2022 Te perditesoje rregullisht per statusin\n\n(3) Nese forca madhore vazhdon me shume se 30 dite, secila pale mund te perfundoje DPA-ne me njoftim.',
    },
    section14: {
      title: 'Ndryshimet ne DPA',
      body: '(1) Cdo ndryshim ne kete DPA kerkon formen me shkrim, perfshire kete klauzole.\n\n(2) Ne mund te propozojme ndryshime me njoftim 60 dite paraprakisht. Ndryshimet bazohen ne:\n\u2022 Ndryshime ligjore (GDPR, BDSG, etj.)\n\u2022 Vendime gjyqesore relevante\n\u2022 Permiresime te sigurise dhe sherbimit\n\n(3) Nese kontrolluesi nuk pajton, ka te drejten te perfundoje kontraten kryesore SaaS me njoftim 30 dite ne fund te periudhes aktuale te faturimit.\n\n(4) Pa kundershtim brenda 60 ditesh, ndryshimet konsiderohen te pranuara.',
    },
    section15: {
      title: 'Dispozita perfundimtare',
      body: '(1) Kjo DPA eshte pjese e pa-ndashme e AGB. Ne rast konflikti, kjo DPA ka perparesi per ceshtjet e mbrojtjes se te dhenave.\n\n(2) Ne rast pavlefshmerie te ndonje dispozite, dispozitat e tjera mbeten ne fuqi (klauzola e ndarshmerise).\n\n(3) Ligji i zbatueshem: gjerman, duke perjashtuar UN-Convention on International Sale of Goods (CISG).\n\n(4) Vendi i juridiksionit: Lörrach, Gjermania.\n\n(5) Versioni gjerman eshte legjikisht detyrues. Perkthimet shqiperohen vetem per lehtesi.\n\n(6) Komunikimi zyrtar duhet te kryhet ne adrese:\nE-mail: privacy@mm-logistic.eu\nPosta: Pfädlistraße 10, 79576 Weil am Rhein, Germany\n\nDPO i jone:\nE-mail: dpo@mm-logistic.eu',
    },
  },

  // ============================================================
  // ENGLISH (EN)
  // ============================================================
  en: {
    shortTitle: 'DPA',
    title: 'Data Processing Agreement (DPA)',
    subtitle: 'Auftragsverarbeitungsvertrag according to GDPR Art. 28 - regulates the processing of personal data on behalf of the customer.',
    intro: 'This Data Processing Agreement ("DPA" or "AVV" - Auftragsverarbeitungsvertrag) is an integral part of the Terms of Service (AGB) between Mar Group (Genton Maliqi) ("Processor", "we") and the Customer ("Controller", "you"). It regulates the processing of personal data that you (as controller) upload to our platform, in accordance with GDPR Art. 28 and \u00a7 62 BDSG.',
    lastUpdated: '15 May 2026',
    version: 'Version 1.0',

    section1: {
      title: 'Parties and roles',
      body: 'CONTROLLER (Verantwortlicher):\nThe customer who uses the mm-logistic platform and uploads personal data for processing.\n\nPROCESSOR (Auftragsverarbeiter):\nMar Group (Genton Maliqi)\nPfädlistraße 10, 79576 Weil am Rhein, Germany\nGermany\n\nWe process personal data on behalf of and according to the instructions of the controller, without having any independent purpose for it. The controller retains legal responsibility for the lawfulness of processing, including legal basis, purposes, and consent of data subjects when required.',
    },
    section2: {
      title: 'Subject, duration and purpose of processing',
      body: 'SUBJECT:\nProcessing of personal data that the controller uploads to the mm-logistic platform during service use.\n\nDURATION:\nProcessing continues for the duration of the main SaaS contract, plus legal retention periods (10 years for fiscal documents under \u00a7 147 AO).\n\nPURPOSE:\nProvision of SaaS service for logistics, warehouse, accounting and business operations, in accordance with functionalities described in AGB and subscription plan.\n\nNATURE:\nAutomated and semi-automated processing through the processor\'s cloud infrastructure (hosting, database, document storage).',
    },
    section3: {
      title: 'Types of data and categories of subjects',
      body: 'TYPES OF PERSONAL DATA WE PROCESS FOR THE CONTROLLER:\n\nA) Identifying data\n\u2022 First name, last name\n\u2022 Internal user IDs\n\u2022 Document numbers (license, contract)\n\nB) Contact data\n\u2022 Email addresses\n\u2022 Phone numbers\n\u2022 Postal/business addresses\n\nC) Fiscal and financial data\n\u2022 VAT ID (USt-IdNr.)\n\u2022 IBAN and bank accounts\n\u2022 Invoice data\n\nD) Location data (GPS)\n\u2022 Driver coordinates during transport\n\u2022 Pickup and delivery addresses\n\nE) Document data\n\u2022 Photos of CMRs, invoices, permits\n\u2022 Driver document scans\n\nCATEGORIES OF DATA SUBJECTS:\n\u2022 Customer\'s employees (administrators, accountants, depot managers)\n\u2022 Drivers employed by the customer\n\u2022 Customer\'s end clients (companies requesting services)\n\u2022 Business partners (suppliers, transporters)\n\nSPECIAL CATEGORIES OF DATA (Art. 9 GDPR):\nWe do not knowingly process special categories (race, religion, health, etc.). If the controller uploads driver documents containing health data (e.g. medical certificate), the controller is responsible for the legal consent of subjects.',
    },
    section4: {
      title: 'Controller instructions',
      body: '(1) We process personal data only according to documented instructions of the controller, indicated through:\n\u2022 Platform configuration (parameters, roles, permissions)\n\u2022 Actions taken by controller\'s users\n\u2022 Specific requests through support\n\u2022 Functionalities chosen by the controller\n\n(2) If we believe an instruction violates GDPR, BDSG or any other applicable law, we will immediately inform the controller and have the right to suspend execution until confirmation.\n\n(3) An instruction can also be given through written notice directed to our support dep. at privacy@mm-logistic.eu.\n\n(4) Any instruction beyond normal platform functionalities may require an additional agreement and fee.',
    },
    section5: {
      title: 'Processor obligations (we)',
      body: 'We undertake:\n\n(1) To process data only within the contract\'s purposes and according to controller\'s instructions.\n\n(2) To maintain data confidentiality. All employees and subprocessors have signed confidentiality agreements.\n\n(3) To implement adequate technical and organizational measures (TOM) under GDPR Art. 32 - see Annex 1.\n\n(4) To cooperate with the controller to enable responses to data subject requests exercising their rights (GDPR Art. 12-22).\n\n(5) To immediately report (within 24 hours) any personal data security breach, including:\n\u2022 Nature of the breach\n\u2022 Categories and approximate number of affected subjects\n\u2022 Categories and approximate number of data\n\u2022 Potential consequences\n\u2022 Measures taken or proposed\n\n(6) To assist the controller in processing DPIA (Data Protection Impact Assessment) under GDPR Art. 35-36.\n\n(7) To provide all necessary information to the controller to demonstrate compliance with Art. 28 - including access to audit log and security reports.\n\n(8) After contract termination, at the controller\'s choice:\n\u2022 Return all personal data, or\n\u2022 Delete it (except where law requires retention).',
    },
    section6: {
      title: 'Subprocessors',
      body: '(1) The controller grants general authorization for us to use subprocessors, under GDPR Art. 28 par. 2.\n\n(2) The current list of subprocessors is in the "Subprocessors" document linked in the footer. The list includes:\n\u2022 Supabase Inc. (database, authentication, storage) - EU region\n\u2022 Supabase Inc. - EU region\n\u2022 Resend, Inc. - EU region\n\n(3) All subprocessors are bound through written agreements to respect at least the same data protection obligations as in this DPA (GDPR Art. 28 par. 4).\n\n(4) We retain full responsibility for subprocessor actions.\n\n(5) BEFORE adding or replacing a subprocessor, we will:\n\u2022 Notify you in writing at least 30 days in advance\n\u2022 Give you opportunity to object\n\u2022 If you object, we have the right to terminate the contract with 30-day notice\n\n(6) For subprocessors outside EU/EEA, we ensure necessary legal bases (SCC, BCR, adequacy decision).',
    },
    section7: {
      title: 'Data subject rights',
      body: '(1) If a data subject contacts us with requests to exercise their rights under GDPR Art. 15-22 (access, correction, deletion, restriction, portability, objection), we do not respond directly but:\n\u2022 Confirm receipt of the request within 5 days\n\u2022 Direct the subject to the controller\n\u2022 Immediately inform the controller\n\u2022 Offer technical assistance as needed\n\n(2) Primary responsibility for responding to requests is with the controller.\n\n(3) To assist you in responding, we offer:\n\u2022 Data export in JSON/CSV format\n\u2022 Deletion functionality through account panel\n\u2022 Data correction with upload\n\u2022 Logging of all processing actions',
    },
    section8: {
      title: 'Technical and Organizational Measures (TOM)',
      body: 'We implement the following measures to ensure a security level appropriate to risk (Art. 32 GDPR):\n\nA) CONFIDENTIALITY\n\u2022 TLS 1.3 encryption for data in transit\n\u2022 AES-256 encryption for data at rest\n\u2022 Password hash with Argon2/bcrypt\n\u2022 Optional 2FA for users\n\u2022 Multi-tenancy with Row Level Security (783+ active policies)\n\u2022 Access on "need-to-know" basis\n\u2022 Confidentiality agreements with all employees\n\nB) INTEGRITY\n\u2022 Audit log for every system action\n\u2022 Git versioning for every schema change\n\u2022 Database constraints (UNIQUE, FOREIGN KEY, CHECK)\n\u2022 Input validation in front-end and back-end\n\nC) AVAILABILITY\n\u2022 99.9% uptime SLA\n\u2022 Daily encrypted backups with 30-day retention\n\u2022 Disaster recovery plan\n\u2022 Auto-scaling for high loads\n\u2022 DDoS protection (Cloudflare or similar)\n\nD) RESILIENCE\n\u2022 Multi-region backup (only in EU)\n\u2022 RTO (Recovery Time Objective): 4 hours\n\u2022 RPO (Recovery Point Objective): 1 hour\n\nE) TESTING AND EVALUATION\n\u2022 Annual penetration testing\n\u2022 Automatic vulnerability scanning\n\u2022 Code review for every PR\n\u2022 Dependency security audit\n\nFull technical details are in Annex 1 of this DPA.',
    },
    section9: {
      title: 'Audit and inspection',
      body: '(1) The controller has the right to verify fulfillment of DPA obligations through:\n\u2022 Written questions to privacy@mm-logistic.eu\n\u2022 Access to certification reports (ISO 27001, SOC 2 - when available)\n\u2022 On-site audit, with at least 30 days advance notice\n\n(2) On-site audit:\n\u2022 During business hours, no more than once per year, except in serious suspected cases\n\u2022 Costs borne by controller (except when audit finds violations)\n\u2022 Audit must not interrupt our operations\n\u2022 Auditor signs NDA in advance\n\n(3) For security reasons, we may restrict access to certain systems and third-party data (other customers).\n\n(4) External audit by certified auditor is accepted as substitute for controller audit.',
    },
    section10: {
      title: 'Retention periods and deletion',
      body: '(1) During active contract, data is retained as long as controller keeps it active on platform.\n\n(2) After contract termination (for any reason):\n\u2022 30 days: Export period - controller can download all data\n\u2022 90 days: Backups retained in frozen archives (recovery only, not used)\n\u2022 After 90 days: All active data securely deleted\n\n(3) Legally mandatory data (invoices, contracts, fiscal documents) is retained per legal deadlines (10 years under \u00a7 147 AO), but in frozen archives with restricted access.\n\n(4) Deletion is confirmed by written certificate upon controller request.\n\n(5) After deletion, data CANNOT be recovered.',
    },
    section11: {
      title: 'Data transfer outside EU/EEA',
      body: '(1) We currently do NOT transfer data outside EU/EEA. All systems (Supabase, hosting, email) are configured in EU regions.\n\n(2) If transfer becomes necessary in the future:\n\u2022 We will use European Commission Standard Contractual Clauses (SCC)\n\u2022 Or adequacy decision\n\u2022 Or Binding Corporate Rules (BCR)\n\n(3) We will notify you 30 days in advance for any new transfer outside EEA.\n\n(4) You have the right to object to the transfer and terminate the contract if you do not agree.',
    },
    section12: {
      title: 'Liability and indemnification',
      body: '(1) Liability for DPA breaches is subject to the liability provisions of the AGB, with the limitations set there.\n\n(2) Separately from general limitations, liability is shared under GDPR Art. 82:\n\u2022 Each party is responsible for its own breach\n\u2022 Liability is joint if both parties contributed to the breach\n\u2022 The party that paid full compensation has the right of recourse against others\n\n(3) For GDPR fines (up to €20M or 4% of revenue), each party bears its own fine except when the other contributed directly.\n\n(4) Neither party is liable for:\n\u2022 Actions of data subjects violating AGB\n\u2022 Force majeure\n\u2022 Breaches due to controller\'s illegal instructions (after our warning)',
    },
    section13: {
      title: 'Data resulting from force majeure',
      body: '(1) Neither party is liable for DPA breach due to force majeure:\n\u2022 Natural disasters\n\u2022 Massive cyber attacks beyond control\n\u2022 Government actions\n\u2022 Embargo\n\u2022 Pandemics\n\u2022 War\n\n(2) The affected party must:\n\u2022 Notify the other party within 24 hours\n\u2022 Make reasonable efforts to mitigate\n\u2022 Regularly update on status\n\n(3) If force majeure continues for more than 30 days, either party may terminate the DPA with notice.',
    },
    section14: {
      title: 'Changes to DPA',
      body: '(1) Any change to this DPA requires written form, including this clause.\n\n(2) We may propose changes with 60-day advance notice. Changes are based on:\n\u2022 Legal changes (GDPR, BDSG, etc.)\n\u2022 Relevant court decisions\n\u2022 Security and service improvements\n\n(3) If the controller does not agree, they have the right to terminate the main SaaS contract with 30-day notice at the end of the current billing period.\n\n(4) Without objection within 60 days, changes are considered accepted.',
    },
    section15: {
      title: 'Final provisions',
      body: '(1) This DPA is an integral part of AGB. In case of conflict, this DPA takes precedence on data protection matters.\n\n(2) In case of invalidity of any provision, other provisions remain in force (severability clause).\n\n(3) Applicable law: German, excluding UN-Convention on International Sale of Goods (CISG).\n\n(4) Jurisdiction: Lörrach, Germany.\n\n(5) The German version is legally binding. Translations are provided for convenience only.\n\n(6) Official communication must be conducted at:\nE-mail: privacy@mm-logistic.eu\nMail: Pfädlistraße 10, 79576 Weil am Rhein, Germany\n\nOur DPO:\nE-mail: dpo@mm-logistic.eu',
    },
  },

  // ============================================================
  // GERMAN (DE) - canonical legal version
  // ============================================================
  de: {
    shortTitle: 'AVV',
    title: 'Auftragsverarbeitungsvertrag (AVV)',
    subtitle: 'Data Processing Agreement nach Art. 28 DSGVO - regelt die Verarbeitung personenbezogener Daten im Auftrag des Kunden.',
    intro: 'Dieser Auftragsverarbeitungsvertrag ("AVV" oder "DPA") ist integraler Bestandteil der Allgemeinen Gesch\u00e4ftsbedingungen (AGB) zwischen Mar Group (Genton Maliqi) ("Auftragsverarbeiter", "wir") und dem Kunden ("Verantwortlicher", "Sie"). Er regelt die Verarbeitung personenbezogener Daten, die Sie (als Verantwortlicher) auf unsere Plattform hochladen, gem\u00e4\u00df Art. 28 DSGVO und \u00a7 62 BDSG.',
    lastUpdated: '15. Mai 2026',
    version: 'Version 1.0',

    section1: {
      title: 'Parteien und Rollen',
      body: 'VERANTWORTLICHER:\nDer Kunde, der die Plattform mm-logistic nutzt und personenbezogene Daten zur Verarbeitung hochl\u00e4dt.\n\nAUFTRAGSVERARBEITER:\nMar Group (Genton Maliqi)\nPfädlistraße 10, 79576 Weil am Rhein, Germany\nDeutschland\n\nWir verarbeiten personenbezogene Daten im Auftrag und nach Weisung des Verantwortlichen, ohne eigenst\u00e4ndigen Zweck. Der Verantwortliche tr\u00e4gt die rechtliche Verantwortung f\u00fcr die Rechtm\u00e4\u00dfigkeit der Verarbeitung, einschlie\u00dflich Rechtsgrundlage, Zwecke und Einwilligung der betroffenen Personen, falls erforderlich.',
    },
    section2: {
      title: 'Gegenstand, Dauer und Zweck der Verarbeitung',
      body: 'GEGENSTAND:\nVerarbeitung personenbezogener Daten, die der Verantwortliche w\u00e4hrend der Nutzung des Dienstes auf die Plattform mm-logistic hochl\u00e4dt.\n\nDAUER:\nDie Verarbeitung dauert die gesamte Laufzeit des SaaS-Hauptvertrags an, zuz\u00fcglich gesetzlicher Aufbewahrungsfristen (10 Jahre f\u00fcr steuerliche Dokumente gem\u00e4\u00df \u00a7 147 AO).\n\nZWECK:\nBereitstellung des SaaS-Dienstes f\u00fcr Logistik, Lager, Buchhaltung und Gesch\u00e4ftsprozesse, gem\u00e4\u00df den in AGB und Abonnementplan beschriebenen Funktionen.\n\nART:\nAutomatisierte und teilautomatisierte Verarbeitung \u00fcber die Cloud-Infrastruktur des Auftragsverarbeiters (Hosting, Datenbank, Dokumentenspeicher).',
    },
    section3: {
      title: 'Datentypen und Kategorien betroffener Personen',
      body: 'TYPEN PERSONENBEZOGENER DATEN, DIE WIR F\u00dcR DEN VERANTWORTLICHEN VERARBEITEN:\n\nA) Identifikationsdaten\n\u2022 Vor- und Nachname\n\u2022 Interne Benutzer-IDs\n\u2022 Dokumentennummern (Lizenz, Vertrag)\n\nB) Kontaktdaten\n\u2022 E-Mail-Adressen\n\u2022 Telefonnummern\n\u2022 Post-/Gesch\u00e4ftsadressen\n\nC) Steuer- und Finanzdaten\n\u2022 USt-IdNr.\n\u2022 IBAN und Bankkonten\n\u2022 Rechnungsdaten\n\nD) Standortdaten (GPS)\n\u2022 Fahrerkoordinaten w\u00e4hrend des Transports\n\u2022 Abhol- und Lieferadressen\n\nE) Dokumentendaten\n\u2022 Fotos von CMR, Rechnungen, Genehmigungen\n\u2022 Scans von Fahrerdokumenten\n\nKATEGORIEN BETROFFENER PERSONEN:\n\u2022 Mitarbeiter des Kunden (Administratoren, Buchhalter, Lagerleiter)\n\u2022 Vom Kunden besch\u00e4ftigte Fahrer\n\u2022 Endkunden des Kunden (Unternehmen, die Dienste anfordern)\n\u2022 Gesch\u00e4ftspartner (Lieferanten, Spediteure)\n\nBESONDERE DATENKATEGORIEN (Art. 9 DSGVO):\nWir verarbeiten nicht wissentlich besondere Kategorien (Rasse, Religion, Gesundheit usw.). Wenn der Verantwortliche Fahrerdokumente mit Gesundheitsdaten hochl\u00e4dt (z.B. \u00e4rztliches Attest), ist der Verantwortliche f\u00fcr die rechtliche Einwilligung der Betroffenen verantwortlich.',
    },
    section4: {
      title: 'Weisungen des Verantwortlichen',
      body: '(1) Wir verarbeiten personenbezogene Daten nur nach dokumentierten Weisungen des Verantwortlichen, angezeigt durch:\n\u2022 Plattformkonfiguration (Parameter, Rollen, Berechtigungen)\n\u2022 Von Benutzern des Verantwortlichen durchgef\u00fchrte Aktionen\n\u2022 Spezifische Anfragen \u00fcber Support\n\u2022 Vom Verantwortlichen gew\u00e4hlte Funktionen\n\n(2) Wenn wir glauben, dass eine Weisung gegen DSGVO, BDSG oder ein anderes anwendbares Gesetz verst\u00f6\u00dft, informieren wir den Verantwortlichen unverz\u00fcglich und haben das Recht, die Ausf\u00fchrung bis zur Best\u00e4tigung auszusetzen.\n\n(3) Eine Weisung kann auch durch schriftliche Mitteilung an unsere Support-Abteilung unter privacy@mm-logistic.eu erfolgen.\n\n(4) Weisungen, die \u00fcber die normalen Plattformfunktionen hinausgehen, k\u00f6nnen eine Zusatzvereinbarung und Geb\u00fchr erfordern.',
    },
    section5: {
      title: 'Pflichten des Auftragsverarbeiters (wir)',
      body: 'Wir verpflichten uns:\n\n(1) Daten nur im Rahmen der Vertragszwecke und nach Weisung des Verantwortlichen zu verarbeiten.\n\n(2) Datenvertraulichkeit zu wahren. Alle Mitarbeiter und Unterauftragsverarbeiter haben Vertraulichkeitsvereinbarungen unterzeichnet.\n\n(3) Geeignete technische und organisatorische Ma\u00dfnahmen (TOM) gem\u00e4\u00df Art. 32 DSGVO zu implementieren - siehe Anlage 1.\n\n(4) Mit dem Verantwortlichen zusammenzuarbeiten, um Antworten auf Anfragen betroffener Personen, die ihre Rechte aus\u00fcben, zu erm\u00f6glichen (Art. 12-22 DSGVO).\n\n(5) Jede Verletzung des Schutzes personenbezogener Daten unverz\u00fcglich (innerhalb von 24 Stunden) zu melden, einschlie\u00dflich:\n\u2022 Art der Verletzung\n\u2022 Kategorien und ungef\u00e4hre Anzahl der betroffenen Personen\n\u2022 Kategorien und ungef\u00e4hre Anzahl der Daten\n\u2022 M\u00f6gliche Folgen\n\u2022 Ergriffene oder vorgeschlagene Ma\u00dfnahmen\n\n(6) Den Verantwortlichen bei der Durchf\u00fchrung einer DSFA (Datenschutz-Folgenabsch\u00e4tzung) gem\u00e4\u00df Art. 35-36 DSGVO zu unterst\u00fctzen.\n\n(7) Alle erforderlichen Informationen bereitzustellen, um die Einhaltung von Art. 28 nachzuweisen - einschlie\u00dflich Zugriff auf Audit-Log und Sicherheitsberichte.\n\n(8) Nach Vertragsende, nach Wahl des Verantwortlichen:\n\u2022 Alle personenbezogenen Daten zur\u00fcckzugeben, oder\n\u2022 Sie zu l\u00f6schen (es sei denn, das Gesetz erfordert die Aufbewahrung).',
    },
    section6: {
      title: 'Unterauftragsverarbeiter',
      body: '(1) Der Verantwortliche erteilt eine allgemeine Genehmigung (general authorization) f\u00fcr uns zur Nutzung von Unterauftragsverarbeitern gem\u00e4\u00df Art. 28 Abs. 2 DSGVO.\n\n(2) Die aktuelle Liste der Unterauftragsverarbeiter befindet sich im Dokument "Subprocessors", verlinkt im Footer. Die Liste enth\u00e4lt:\n\u2022 Supabase Inc. (Datenbank, Authentifizierung, Storage) - EU-Region\n\u2022 Supabase Inc. - EU-Region\n\u2022 Resend, Inc. - EU-Region\n\n(3) Alle Unterauftragsverarbeiter sind durch schriftliche Vereinbarungen verpflichtet, mindestens die gleichen Datenschutzpflichten wie in diesem AVV einzuhalten (Art. 28 Abs. 4 DSGVO).\n\n(4) Wir tragen die volle Verantwortung f\u00fcr die Handlungen der Unterauftragsverarbeiter.\n\n(5) VOR Hinzuf\u00fcgen oder Ersetzen eines Unterauftragsverarbeiters werden wir:\n\u2022 Sie schriftlich mindestens 30 Tage im Voraus benachrichtigen\n\u2022 Ihnen die M\u00f6glichkeit zum Widerspruch geben\n\u2022 Bei Widerspruch haben wir das Recht, den Vertrag mit 30-t\u00e4giger Frist zu k\u00fcndigen\n\n(6) F\u00fcr Unterauftragsverarbeiter au\u00dferhalb der EU/EWR stellen wir die erforderlichen Rechtsgrundlagen sicher (SCC, BCR, Angemessenheitsbeschluss).',
    },
    section7: {
      title: 'Rechte betroffener Personen',
      body: '(1) Wenn sich eine betroffene Person zur Aus\u00fcbung ihrer Rechte nach Art. 15-22 DSGVO (Auskunft, Berichtigung, L\u00f6schung, Einschr\u00e4nkung, Portabilit\u00e4t, Widerspruch) an uns wendet, antworten wir nicht direkt, sondern:\n\u2022 Best\u00e4tigen den Erhalt der Anfrage innerhalb von 5 Tagen\n\u2022 Verweisen die betroffene Person an den Verantwortlichen\n\u2022 Informieren den Verantwortlichen unverz\u00fcglich\n\u2022 Bieten technische Unterst\u00fctzung nach Bedarf\n\n(2) Die prim\u00e4re Verantwortung f\u00fcr die Beantwortung von Anfragen liegt beim Verantwortlichen.\n\n(3) Zur Unterst\u00fctzung bei der Beantwortung bieten wir:\n\u2022 Datenexport im JSON/CSV-Format\n\u2022 L\u00f6schfunktion \u00fcber Kontopanel\n\u2022 Datenberichtigung mit Upload\n\u2022 Logging aller Verarbeitungsaktionen',
    },
    section8: {
      title: 'Technische und Organisatorische Ma\u00dfnahmen (TOM)',
      body: 'Wir implementieren die folgenden Ma\u00dfnahmen, um ein dem Risiko angemessenes Sicherheitsniveau zu gew\u00e4hrleisten (Art. 32 DSGVO):\n\nA) VERTRAULICHKEIT\n\u2022 TLS 1.3-Verschl\u00fcsselung f\u00fcr Daten im Transit\n\u2022 AES-256-Verschl\u00fcsselung f\u00fcr ruhende Daten\n\u2022 Passwort-Hash mit Argon2/bcrypt\n\u2022 Optionales 2FA f\u00fcr Benutzer\n\u2022 Multi-Tenancy mit Row Level Security (783+ aktive Richtlinien)\n\u2022 Zugriff nach "Need-to-know"-Prinzip\n\u2022 Vertraulichkeitsvereinbarungen mit allen Mitarbeitern\n\nB) INTEGRIT\u00c4T\n\u2022 Audit-Log f\u00fcr jede Systemaktion\n\u2022 Git-Versionierung f\u00fcr jede Schema\u00e4nderung\n\u2022 Datenbank-Constraints (UNIQUE, FOREIGN KEY, CHECK)\n\u2022 Eingabevalidierung in Front-End und Back-End\n\nC) VERF\u00dcGBARKEIT\n\u2022 99,9% Uptime-SLA\n\u2022 T\u00e4gliche verschl\u00fcsselte Backups mit 30-Tage-Aufbewahrung\n\u2022 Disaster Recovery Plan\n\u2022 Auto-Scaling f\u00fcr hohe Lasten\n\u2022 DDoS-Schutz (Cloudflare oder \u00e4hnlich)\n\nD) BELASTBARKEIT\n\u2022 Multi-Region-Backup (nur in EU)\n\u2022 RTO (Recovery Time Objective): 4 Stunden\n\u2022 RPO (Recovery Point Objective): 1 Stunde\n\nE) TESTING UND BEWERTUNG\n\u2022 J\u00e4hrliche Penetration-Tests\n\u2022 Automatisches Schwachstellen-Scanning\n\u2022 Code-Review f\u00fcr jeden PR\n\u2022 Abh\u00e4ngigkeits-Sicherheitsaudit\n\nVollst\u00e4ndige technische Details befinden sich in Anlage 1 dieses AVV.',
    },
    section9: {
      title: 'Audit und Inspektion',
      body: '(1) Der Verantwortliche hat das Recht, die Erf\u00fcllung der AVV-Pflichten zu \u00fcberpr\u00fcfen durch:\n\u2022 Schriftliche Anfragen an privacy@mm-logistic.eu\n\u2022 Zugriff auf Zertifizierungsberichte (ISO 27001, SOC 2 - sofern verf\u00fcgbar)\n\u2022 Vor-Ort-Audit mit mindestens 30 Tagen Vorank\u00fcndigung\n\n(2) Vor-Ort-Audit:\n\u2022 W\u00e4hrend Gesch\u00e4ftszeiten, nicht mehr als einmal j\u00e4hrlich, au\u00dfer in schweren Verdachtsf\u00e4llen\n\u2022 Kosten tr\u00e4gt der Verantwortliche (au\u00dfer wenn Audit Verst\u00f6\u00dfe feststellt)\n\u2022 Audit darf unsere Operationen nicht unterbrechen\n\u2022 Auditor unterzeichnet vorab NDA\n\n(3) Aus Sicherheitsgr\u00fcnden k\u00f6nnen wir Zugriff auf bestimmte Systeme und Daten Dritter (anderer Kunden) einschr\u00e4nken.\n\n(4) Externes Audit durch zertifizierten Auditor wird als Ersatz f\u00fcr Verantwortlichen-Audit akzeptiert.',
    },
    section10: {
      title: 'Aufbewahrungsfristen und L\u00f6schung',
      body: '(1) W\u00e4hrend des aktiven Vertrags werden Daten aufbewahrt, solange der Verantwortliche sie auf der Plattform aktiv h\u00e4lt.\n\n(2) Nach Vertragsende (aus welchem Grund auch immer):\n\u2022 30 Tage: Exportzeitraum - Verantwortlicher kann alle Daten herunterladen\n\u2022 90 Tage: Backups werden in eingefrorenen Archiven aufbewahrt (nur zur Wiederherstellung, nicht verwendet)\n\u2022 Nach 90 Tagen: Alle aktiven Daten werden sicher gel\u00f6scht\n\n(3) Gesetzlich vorgeschriebene Daten (Rechnungen, Vertr\u00e4ge, Steuerdokumente) werden gem\u00e4\u00df gesetzlicher Fristen (10 Jahre nach \u00a7 147 AO) aufbewahrt, aber in eingefrorenen Archiven mit beschr\u00e4nktem Zugriff.\n\n(4) Die L\u00f6schung wird auf Anfrage des Verantwortlichen schriftlich best\u00e4tigt.\n\n(5) Nach L\u00f6schung k\u00f6nnen Daten NICHT wiederhergestellt werden.',
    },
    section11: {
      title: 'Daten\u00fcbertragung au\u00dferhalb der EU/EWR',
      body: '(1) Wir \u00fcbertragen derzeit KEINE Daten au\u00dferhalb der EU/EWR. Alle Systeme (Supabase, Hosting, E-Mail) sind in EU-Regionen konfiguriert.\n\n(2) Sollte zuk\u00fcnftig eine \u00dcbertragung erforderlich werden:\n\u2022 Wir verwenden EU-Standardvertragsklauseln (SCC)\n\u2022 Oder Angemessenheitsbeschluss\n\u2022 Oder Binding Corporate Rules (BCR)\n\n(3) Wir benachrichtigen Sie 30 Tage im Voraus bei jeder neuen \u00dcbertragung au\u00dferhalb des EWR.\n\n(4) Sie haben das Recht, der \u00dcbertragung zu widersprechen und den Vertrag zu k\u00fcndigen, wenn Sie nicht zustimmen.',
    },
    section12: {
      title: 'Haftung und Schadenersatz',
      body: '(1) Die Haftung f\u00fcr AVV-Verst\u00f6\u00dfe unterliegt den Haftungsbestimmungen der AGB mit den dort festgelegten Einschr\u00e4nkungen.\n\n(2) Separat von allgemeinen Einschr\u00e4nkungen wird die Haftung gem\u00e4\u00df Art. 82 DSGVO geteilt:\n\u2022 Jede Partei ist f\u00fcr ihren eigenen Versto\u00df verantwortlich\n\u2022 Haftung ist gesamtschuldnerisch, wenn beide Parteien zum Versto\u00df beigetragen haben\n\u2022 Die Partei, die vollst\u00e4ndige Entsch\u00e4digung gezahlt hat, hat Regressrecht gegen andere\n\n(3) F\u00fcr DSGVO-Bu\u00dfgelder (bis zu 20 Mio. € oder 4% des Umsatzes) tr\u00e4gt jede Partei ihr eigenes Bu\u00dfgeld, au\u00dfer wenn die andere direkt beigetragen hat.\n\n(4) Keine Partei haftet f\u00fcr:\n\u2022 Handlungen betroffener Personen, die gegen AGB versto\u00dfen\n\u2022 H\u00f6here Gewalt\n\u2022 Verst\u00f6\u00dfe aufgrund illegaler Weisungen des Verantwortlichen (nach unserer Warnung)',
    },
    section13: {
      title: 'Daten aus h\u00f6herer Gewalt',
      body: '(1) Keine Partei haftet f\u00fcr AVV-Versto\u00df aufgrund h\u00f6herer Gewalt:\n\u2022 Naturkatastrophen\n\u2022 Massive Cyberangriffe au\u00dferhalb der Kontrolle\n\u2022 Regierungshandlungen\n\u2022 Embargo\n\u2022 Pandemien\n\u2022 Krieg\n\n(2) Die betroffene Partei muss:\n\u2022 Die andere Partei innerhalb von 24 Stunden benachrichtigen\n\u2022 Angemessene Anstrengungen zur Minderung unternehmen\n\u2022 Regelm\u00e4\u00dfig \u00fcber den Status informieren\n\n(3) Wenn h\u00f6here Gewalt l\u00e4nger als 30 Tage andauert, kann jede Partei den AVV mit Frist k\u00fcndigen.',
    },
    section14: {
      title: '\u00c4nderungen am AVV',
      body: '(1) Jede \u00c4nderung dieses AVV bedarf der Schriftform, einschlie\u00dflich dieser Klausel.\n\n(2) Wir k\u00f6nnen \u00c4nderungen mit 60-t\u00e4giger Vorank\u00fcndigung vorschlagen. \u00c4nderungen basieren auf:\n\u2022 Rechts\u00e4nderungen (DSGVO, BDSG usw.)\n\u2022 Relevanten Gerichtsentscheidungen\n\u2022 Sicherheits- und Serviceverbesserungen\n\n(3) Wenn der Verantwortliche nicht zustimmt, hat er das Recht, den Haupt-SaaS-Vertrag mit 30-t\u00e4giger Frist zum Ende des aktuellen Abrechnungszeitraums zu k\u00fcndigen.\n\n(4) Ohne Widerspruch innerhalb von 60 Tagen gelten \u00c4nderungen als angenommen.',
    },
    section15: {
      title: 'Schlussbestimmungen',
      body: '(1) Dieser AVV ist integraler Bestandteil der AGB. Bei Konflikt hat dieser AVV Vorrang in Datenschutzfragen.\n\n(2) Bei Unwirksamkeit einer Bestimmung bleiben die anderen Bestimmungen in Kraft (Salvatorische Klausel).\n\n(3) Anwendbares Recht: Deutsch, unter Ausschluss der UN-Konvention \u00fcber den internationalen Warenkauf (CISG).\n\n(4) Gerichtsstand: Lörrach, Deutschland.\n\n(5) Die deutsche Version ist rechtsverbindlich. \u00dcbersetzungen werden nur zur Vereinfachung bereitgestellt.\n\n(6) Offizielle Kommunikation muss erfolgen unter:\nE-Mail: privacy@mm-logistic.eu\nPost: Pfädlistraße 10, 79576 Weil am Rhein, Germany\n\nUnser DSB:\nE-Mail: dpo@mm-logistic.eu',
    },
  },

  // ============================================================
  // FRENCH (FR)
  // ============================================================
  fr: {
    shortTitle: 'DPA',
    title: 'Accord de Traitement des Donn\u00e9es (DPA)',
    subtitle: 'Auftragsverarbeitungsvertrag selon l\'Art. 28 RGPD - r\u00e9gule le traitement des donn\u00e9es personnelles pour le compte du client.',
    intro: 'Cet Accord de Traitement des Donn\u00e9es ("DPA" ou "AVV" - Auftragsverarbeitungsvertrag) fait partie int\u00e9grante des Conditions G\u00e9n\u00e9rales d\'Utilisation (CGU) entre Mar Group (Genton Maliqi) ("Sous-traitant", "nous") et le Client ("Responsable du traitement", "vous"). Il r\u00e9gule le traitement des donn\u00e9es personnelles que vous (en tant que responsable) t\u00e9l\u00e9chargez sur notre plateforme, conform\u00e9ment \u00e0 l\'Art. 28 RGPD et \u00a7 62 BDSG.',
    lastUpdated: '15 mai 2026',
    version: 'Version 1.0',

    section1: {
      title: 'Parties et r\u00f4les',
      body: 'RESPONSABLE DU TRAITEMENT (Verantwortlicher):\nLe client qui utilise la plateforme mm-logistic et t\u00e9l\u00e9charge des donn\u00e9es personnelles pour traitement.\n\nSOUS-TRAITANT (Auftragsverarbeiter):\nMar Group (Genton Maliqi)\nPfädlistraße 10, 79576 Weil am Rhein, Germany\nAllemagne\n\nNous traitons les donn\u00e9es personnelles pour le compte et selon les instructions du responsable, sans aucune fin ind\u00e9pendante. Le responsable conserve la responsabilit\u00e9 l\u00e9gale de la l\u00e9galit\u00e9 du traitement, y compris la base juridique, les objectifs et le consentement des personnes concern\u00e9es lorsque requis.',
    },
    section2: {
      title: 'Objet, dur\u00e9e et finalit\u00e9 du traitement',
      body: 'OBJET:\nTraitement des donn\u00e9es personnelles que le responsable t\u00e9l\u00e9charge sur la plateforme mm-logistic lors de l\'utilisation du service.\n\nDUR\u00c9E:\nLe traitement se poursuit pendant toute la dur\u00e9e du contrat SaaS principal, plus les p\u00e9riodes de conservation l\u00e9gales (10 ans pour les documents fiscaux selon \u00a7 147 AO).\n\nFINALIT\u00c9:\nFourniture du service SaaS de logistique, entrep\u00f4t, comptabilit\u00e9 et op\u00e9rations commerciales, conform\u00e9ment aux fonctionnalit\u00e9s d\u00e9crites dans les CGU et le plan d\'abonnement.\n\nNATURE:\nTraitement automatis\u00e9 et semi-automatis\u00e9 via l\'infrastructure cloud du sous-traitant (h\u00e9bergement, base de donn\u00e9es, stockage de documents).',
    },
    section3: {
      title: 'Types de donn\u00e9es et cat\u00e9gories de personnes concern\u00e9es',
      body: 'TYPES DE DONN\u00c9ES PERSONNELLES QUE NOUS TRAITONS POUR LE RESPONSABLE:\n\nA) Donn\u00e9es d\'identification\n\u2022 Pr\u00e9nom, nom\n\u2022 ID utilisateur internes\n\u2022 Num\u00e9ros de documents (permis, contrat)\n\nB) Donn\u00e9es de contact\n\u2022 Adresses e-mail\n\u2022 Num\u00e9ros de t\u00e9l\u00e9phone\n\u2022 Adresses postales/professionnelles\n\nC) Donn\u00e9es fiscales et financi\u00e8res\n\u2022 N\u00b0 TVA (USt-IdNr.)\n\u2022 IBAN et comptes bancaires\n\u2022 Donn\u00e9es de facturation\n\nD) Donn\u00e9es de localisation (GPS)\n\u2022 Coordonn\u00e9es des chauffeurs pendant le transport\n\u2022 Adresses de ramassage et de livraison\n\nE) Donn\u00e9es de documents\n\u2022 Photos de CMR, factures, permis\n\u2022 Scans de documents chauffeur\n\nCAT\u00c9GORIES DE PERSONNES CONCERN\u00c9ES:\n\u2022 Employ\u00e9s du client (administrateurs, comptables, chefs de d\u00e9p\u00f4t)\n\u2022 Chauffeurs employ\u00e9s par le client\n\u2022 Clients finaux du client (entreprises demandant des services)\n\u2022 Partenaires commerciaux (fournisseurs, transporteurs)\n\nCAT\u00c9GORIES SP\u00c9CIALES DE DONN\u00c9ES (Art. 9 RGPD):\nNous ne traitons pas sciemment des cat\u00e9gories sp\u00e9ciales (race, religion, sant\u00e9, etc.). Si le responsable t\u00e9l\u00e9charge des documents chauffeur contenant des donn\u00e9es de sant\u00e9 (par ex. certificat m\u00e9dical), le responsable est responsable du consentement l\u00e9gal des personnes concern\u00e9es.',
    },
    section4: {
      title: 'Instructions du responsable',
      body: '(1) Nous traitons les donn\u00e9es personnelles uniquement selon les instructions document\u00e9es du responsable, indiqu\u00e9es par:\n\u2022 Configuration de la plateforme (param\u00e8tres, r\u00f4les, autorisations)\n\u2022 Actions effectu\u00e9es par les utilisateurs du responsable\n\u2022 Demandes sp\u00e9cifiques via le support\n\u2022 Fonctionnalit\u00e9s choisies par le responsable\n\n(2) Si nous pensons qu\'une instruction viole le RGPD, BDSG ou toute autre loi applicable, nous informerons imm\u00e9diatement le responsable et aurons le droit de suspendre l\'ex\u00e9cution jusqu\'\u00e0 confirmation.\n\n(3) Une instruction peut \u00e9galement \u00eatre donn\u00e9e par notification \u00e9crite \u00e0 notre d\u00e9partement de support \u00e0 privacy@mm-logistic.eu.\n\n(4) Toute instruction au-del\u00e0 des fonctionnalit\u00e9s normales de la plateforme peut n\u00e9cessiter un accord suppl\u00e9mentaire et des frais.',
    },
    section5: {
      title: 'Obligations du sous-traitant (nous)',
      body: 'Nous nous engageons \u00e0:\n\n(1) Traiter les donn\u00e9es uniquement dans le cadre des objectifs du contrat et selon les instructions du responsable.\n\n(2) Maintenir la confidentialit\u00e9 des donn\u00e9es. Tous les employ\u00e9s et sous-traitants ont sign\u00e9 des accords de confidentialit\u00e9.\n\n(3) Mettre en place des mesures techniques et organisationnelles ad\u00e9quates (TOM) selon Art. 32 RGPD - voir Annexe 1.\n\n(4) Coop\u00e9rer avec le responsable pour permettre les r\u00e9ponses aux demandes des personnes concern\u00e9es exer\u00e7ant leurs droits (Art. 12-22 RGPD).\n\n(5) Signaler imm\u00e9diatement (dans les 24 heures) toute violation de la s\u00e9curit\u00e9 des donn\u00e9es personnelles, y compris:\n\u2022 Nature de la violation\n\u2022 Cat\u00e9gories et nombre approximatif de personnes concern\u00e9es\n\u2022 Cat\u00e9gories et nombre approximatif de donn\u00e9es\n\u2022 Cons\u00e9quences potentielles\n\u2022 Mesures prises ou propos\u00e9es\n\n(6) Assister le responsable dans le traitement d\'une AIPD (Analyse d\'Impact relative \u00e0 la Protection des Donn\u00e9es) selon Art. 35-36 RGPD.\n\n(7) Fournir toutes les informations n\u00e9cessaires au responsable pour d\u00e9montrer la conformit\u00e9 \u00e0 l\'Art. 28 - y compris l\'acc\u00e8s au journal d\'audit et aux rapports de s\u00e9curit\u00e9.\n\n(8) Apr\u00e8s la fin du contrat, au choix du responsable:\n\u2022 Retourner toutes les donn\u00e9es personnelles, ou\n\u2022 Les supprimer (sauf si la loi exige la conservation).',
    },
    section6: {
      title: 'Sous-traitants ult\u00e9rieurs',
      body: '(1) Le responsable accorde une autorisation g\u00e9n\u00e9rale pour que nous utilisions des sous-traitants ult\u00e9rieurs, selon Art. 28 par. 2 RGPD.\n\n(2) La liste actuelle des sous-traitants est dans le document "Subprocessors" li\u00e9 dans le footer. La liste comprend:\n\u2022 Supabase Inc. (base de donn\u00e9es, authentification, stockage) - r\u00e9gion UE\n\u2022 Supabase Inc. - r\u00e9gion UE\n\u2022 Resend, Inc. - r\u00e9gion UE\n\n(3) Tous les sous-traitants sont li\u00e9s par des accords \u00e9crits \u00e0 respecter au moins les m\u00eames obligations de protection des donn\u00e9es que dans ce DPA (Art. 28 par. 4 RGPD).\n\n(4) Nous conservons la pleine responsabilit\u00e9 des actions des sous-traitants.\n\n(5) AVANT d\'ajouter ou de remplacer un sous-traitant, nous:\n\u2022 Vous notifierons par \u00e9crit au moins 30 jours \u00e0 l\'avance\n\u2022 Vous donnerons la possibilit\u00e9 de vous opposer\n\u2022 Si vous vous opposez, nous avons le droit de r\u00e9silier le contrat avec pr\u00e9avis de 30 jours\n\n(6) Pour les sous-traitants en dehors de l\'UE/EEE, nous assurons les bases juridiques n\u00e9cessaires (SCC, BCR, d\u00e9cision d\'ad\u00e9quation).',
    },
    section7: {
      title: 'Droits des personnes concern\u00e9es',
      body: '(1) Si une personne concern\u00e9e nous contacte avec des demandes pour exercer ses droits selon Art. 15-22 RGPD (acc\u00e8s, rectification, suppression, limitation, portabilit\u00e9, opposition), nous ne r\u00e9pondons pas directement mais:\n\u2022 Confirmons la r\u00e9ception de la demande dans les 5 jours\n\u2022 Dirigeons la personne vers le responsable\n\u2022 Informons imm\u00e9diatement le responsable\n\u2022 Offrons une assistance technique au besoin\n\n(2) La responsabilit\u00e9 primaire de r\u00e9pondre aux demandes incombe au responsable.\n\n(3) Pour vous aider \u00e0 r\u00e9pondre, nous offrons:\n\u2022 Export de donn\u00e9es au format JSON/CSV\n\u2022 Fonctionnalit\u00e9 de suppression via le panneau de compte\n\u2022 Correction de donn\u00e9es avec upload\n\u2022 Journalisation de toutes les actions de traitement',
    },
    section8: {
      title: 'Mesures Techniques et Organisationnelles (TOM)',
      body: 'Nous mettons en \u0153uvre les mesures suivantes pour assurer un niveau de s\u00e9curit\u00e9 adapt\u00e9 au risque (Art. 32 RGPD):\n\nA) CONFIDENTIALIT\u00c9\n\u2022 Chiffrement TLS 1.3 pour donn\u00e9es en transit\n\u2022 Chiffrement AES-256 pour donn\u00e9es au repos\n\u2022 Hachage de mot de passe avec Argon2/bcrypt\n\u2022 2FA optionnel pour utilisateurs\n\u2022 Multi-tenancy avec Row Level Security (783+ politiques actives)\n\u2022 Acc\u00e8s sur principe "need-to-know"\n\u2022 Accords de confidentialit\u00e9 avec tous les employ\u00e9s\n\nB) INT\u00c9GRIT\u00c9\n\u2022 Journal d\'audit pour chaque action syst\u00e8me\n\u2022 Versioning Git pour chaque changement de sch\u00e9ma\n\u2022 Contraintes de base de donn\u00e9es (UNIQUE, FOREIGN KEY, CHECK)\n\u2022 Validation des entr\u00e9es en front-end et back-end\n\nC) DISPONIBILIT\u00c9\n\u2022 SLA d\'uptime 99,9%\n\u2022 Sauvegardes quotidiennes chiffr\u00e9es avec r\u00e9tention de 30 jours\n\u2022 Plan de reprise apr\u00e8s sinistre\n\u2022 Auto-scaling pour charges \u00e9lev\u00e9es\n\u2022 Protection DDoS (Cloudflare ou similaire)\n\nD) R\u00c9SILIENCE\n\u2022 Sauvegarde multi-r\u00e9gion (uniquement dans l\'UE)\n\u2022 RTO (Recovery Time Objective): 4 heures\n\u2022 RPO (Recovery Point Objective): 1 heure\n\nE) TESTS ET \u00c9VALUATION\n\u2022 Tests de p\u00e9n\u00e9tration annuels\n\u2022 Scan automatique de vuln\u00e9rabilit\u00e9s\n\u2022 Revue de code pour chaque PR\n\u2022 Audit de s\u00e9curit\u00e9 des d\u00e9pendances\n\nLes d\u00e9tails techniques complets se trouvent dans l\'Annexe 1 de ce DPA.',
    },
    section9: {
      title: 'Audit et inspection',
      body: '(1) Le responsable a le droit de v\u00e9rifier le respect des obligations DPA par:\n\u2022 Questions \u00e9crites \u00e0 privacy@mm-logistic.eu\n\u2022 Acc\u00e8s aux rapports de certification (ISO 27001, SOC 2 - lorsque disponibles)\n\u2022 Audit sur site, avec au moins 30 jours de pr\u00e9avis\n\n(2) Audit sur site:\n\u2022 Pendant les heures de bureau, pas plus d\'une fois par an, sauf cas de suspicion grave\n\u2022 Co\u00fbts support\u00e9s par le responsable (sauf si l\'audit constate des violations)\n\u2022 L\'audit ne doit pas interrompre nos op\u00e9rations\n\u2022 L\'auditeur signe un NDA \u00e0 l\'avance\n\n(3) Pour des raisons de s\u00e9curit\u00e9, nous pouvons restreindre l\'acc\u00e8s \u00e0 certains syst\u00e8mes et donn\u00e9es de tiers (autres clients).\n\n(4) L\'audit externe par un auditeur certifi\u00e9 est accept\u00e9 comme substitut \u00e0 l\'audit du responsable.',
    },
    section10: {
      title: 'P\u00e9riodes de conservation et suppression',
      body: '(1) Pendant le contrat actif, les donn\u00e9es sont conserv\u00e9es tant que le responsable les maintient actives sur la plateforme.\n\n(2) Apr\u00e8s la fin du contrat (pour quelque raison que ce soit):\n\u2022 30 jours: P\u00e9riode d\'exportation - le responsable peut t\u00e9l\u00e9charger toutes les donn\u00e9es\n\u2022 90 jours: Sauvegardes conserv\u00e9es dans des archives gel\u00e9es (r\u00e9cup\u00e9ration uniquement, non utilis\u00e9es)\n\u2022 Apr\u00e8s 90 jours: Toutes les donn\u00e9es actives sont supprim\u00e9es en toute s\u00e9curit\u00e9\n\n(3) Les donn\u00e9es l\u00e9galement obligatoires (factures, contrats, documents fiscaux) sont conserv\u00e9es selon les d\u00e9lais l\u00e9gaux (10 ans selon \u00a7 147 AO), mais dans des archives gel\u00e9es avec acc\u00e8s restreint.\n\n(4) La suppression est confirm\u00e9e par certificat \u00e9crit \u00e0 la demande du responsable.\n\n(5) Apr\u00e8s suppression, les donn\u00e9es NE peuvent PAS \u00eatre r\u00e9cup\u00e9r\u00e9es.',
    },
    section11: {
      title: 'Transfert de donn\u00e9es hors UE/EEE',
      body: '(1) Nous ne transf\u00e9rons actuellement PAS de donn\u00e9es hors UE/EEE. Tous les syst\u00e8mes (Supabase, h\u00e9bergement, e-mail) sont configur\u00e9s en r\u00e9gions UE.\n\n(2) Si un transfert devient n\u00e9cessaire \u00e0 l\'avenir:\n\u2022 Nous utiliserons les Clauses Contractuelles Types (CCT) de la Commission Europ\u00e9enne\n\u2022 Ou une d\u00e9cision d\'ad\u00e9quation\n\u2022 Ou des R\u00e8gles d\'Entreprise Contraignantes (BCR)\n\n(3) Nous vous notifierons 30 jours \u00e0 l\'avance pour tout nouveau transfert hors EEE.\n\n(4) Vous avez le droit de vous opposer au transfert et de r\u00e9silier le contrat si vous n\'\u00eates pas d\'accord.',
    },
    section12: {
      title: 'Responsabilit\u00e9 et indemnisation',
      body: '(1) La responsabilit\u00e9 pour les violations du DPA est soumise aux dispositions de responsabilit\u00e9 des CGU, avec les limitations qui y sont \u00e9tablies.\n\n(2) S\u00e9par\u00e9ment des limitations g\u00e9n\u00e9rales, la responsabilit\u00e9 est partag\u00e9e selon Art. 82 RGPD:\n\u2022 Chaque partie est responsable de sa propre violation\n\u2022 La responsabilit\u00e9 est solidaire si les deux parties ont contribu\u00e9 \u00e0 la violation\n\u2022 La partie qui a pay\u00e9 une indemnisation compl\u00e8te a un droit de recours contre les autres\n\n(3) Pour les amendes RGPD (jusqu\'\u00e0 20 M€ ou 4% des revenus), chaque partie supporte sa propre amende sauf si l\'autre a directement contribu\u00e9.\n\n(4) Aucune partie n\'est responsable de:\n\u2022 Actions des personnes concern\u00e9es violant les CGU\n\u2022 Force majeure\n\u2022 Violations dues aux instructions illegales du responsable (apr\u00e8s notre avertissement)',
    },
    section13: {
      title: 'Donn\u00e9es r\u00e9sultant de la force majeure',
      body: '(1) Aucune partie n\'est responsable d\'une violation du DPA due \u00e0 la force majeure:\n\u2022 Catastrophes naturelles\n\u2022 Cyberattaques massives hors de contr\u00f4le\n\u2022 Actions gouvernementales\n\u2022 Embargo\n\u2022 Pand\u00e9mies\n\u2022 Guerre\n\n(2) La partie affect\u00e9e doit:\n\u2022 Notifier l\'autre partie dans les 24 heures\n\u2022 Faire des efforts raisonnables pour att\u00e9nuer\n\u2022 Mettre \u00e0 jour r\u00e9guli\u00e8rement sur le statut\n\n(3) Si la force majeure dure plus de 30 jours, chaque partie peut r\u00e9silier le DPA avec pr\u00e9avis.',
    },
    section14: {
      title: 'Modifications du DPA',
      body: '(1) Toute modification de ce DPA n\u00e9cessite la forme \u00e9crite, y compris cette clause.\n\n(2) Nous pouvons proposer des modifications avec 60 jours de pr\u00e9avis. Les modifications sont bas\u00e9es sur:\n\u2022 Changements l\u00e9gaux (RGPD, BDSG, etc.)\n\u2022 D\u00e9cisions judiciaires pertinentes\n\u2022 Am\u00e9liorations de s\u00e9curit\u00e9 et de service\n\n(3) Si le responsable n\'est pas d\'accord, il a le droit de r\u00e9silier le contrat SaaS principal avec pr\u00e9avis de 30 jours \u00e0 la fin de la p\u00e9riode de facturation actuelle.\n\n(4) Sans objection dans les 60 jours, les modifications sont consid\u00e9r\u00e9es comme accept\u00e9es.',
    },
    section15: {
      title: 'Dispositions finales',
      body: '(1) Ce DPA fait partie int\u00e9grante des CGU. En cas de conflit, ce DPA pr\u00e9vaut sur les questions de protection des donn\u00e9es.\n\n(2) En cas d\'invalidit\u00e9 d\'une disposition, les autres dispositions restent en vigueur (clause de divisibilit\u00e9).\n\n(3) Droit applicable: allemand, \u00e0 l\'exclusion de la Convention de Vienne sur la vente internationale de marchandises (CISG).\n\n(4) Juridiction: Lörrach, Allemagne.\n\n(5) La version allemande est l\u00e9galement contraignante. Les traductions sont fournies uniquement pour la commodit\u00e9.\n\n(6) La communication officielle doit s\'effectuer \u00e0:\nE-mail: privacy@mm-logistic.eu\nCourrier: Pfädlistraße 10, 79576 Weil am Rhein, Germany, d\u00e9pt. "Datenschutz"\n\nNotre DPO:\nE-mail: dpo@mm-logistic.eu',
    },
  },
};
