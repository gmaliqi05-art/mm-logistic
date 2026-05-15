/**
 * Cookie Policy
 * Required by ePrivacy Directive + TTDSG §25 (German) + GDPR.
 *
 * Key principle: ALL non-essential cookies require explicit opt-in consent
 * BEFORE being set. No pre-checked boxes. No implied consent. No "by using
 * the site you agree" notices.
 *
 * This document must be kept in sync with the actual cookies your platform
 * sets. Update the table in section3 whenever you add/remove cookies.
 */

export const cookies = {
  // ============================================================
  // ALBANIAN (SQ)
  // ============================================================
  sq: {
    shortTitle: 'Cookies',
    title: 'Politika e Cookies',
    subtitle: 'Si i perdorim cookies dhe teknologjite e ngjashme ne platformen tone.',
    intro: 'Kjo politike shpjegon cilat cookies perdorim ne platformen [EMRI I PLATFORMES], pse i perdorim dhe si ju mund t\'i kontrolloni. Ne respektojme te drejten tuaj per privatesi sipas \u00a7 25 TTDSG dhe GDPR Art. 6, dhe nuk vendosim cookies jo-thelbesore pa pelqimin tuaj te qarte paraprak.',
    lastUpdated: '15 Maj 2026',
    version: 'Versioni 1.0',

    section1: {
      title: 'Cfare jane cookies?',
      body: 'Cookies jane skedare te vegjel teksti qe ruhen ne paisjen tuaj (kompjuter, telefon ose tablet) kur vizitoni nje website. Ato lejojne website-t te ruajne informacionet rreth vizites suaj, te tilla si preferencat e gjuhes, statusin e hyrjes ose te dhena tjera te lidhura me sesionin.\n\nPerveç cookies, ne mund te perdorim teknologji te ngjashme si:\n\u2022 Web storage (localStorage, sessionStorage) - ruajtje me e madhe ne shfletuesin tuaj\n\u2022 IndexedDB - ruajtje strukturore ne shfletues (perdoret per funksionimin offline te PWA)\n\u2022 Cache API - ruajtje burimesh per shpejtesi (Service Worker cache)\n\nKete politike i referohet te gjitha ketyre teknologjive me termin e pergjithshem "cookies".',
    },
    section2: {
      title: 'Kategorite e cookies qe perdorim',
      body: '🟢 COOKIES THELBESORE (essential / strictly necessary)\nKeto jane te nevojshme per funksionimin baze te platformes dhe nuk mund te jene te c\'aktivizuara. Ato nuk kerkojne pelqim sipas \u00a7 25 paragrafit 2 TTDSG.\n\nShembuj: autentifikim, ruajtje sesioni, mbrojtje CSRF, balancim ngarkese, preferenca te gjuhes.\n\n🟡 COOKIES FUNKSIONALE (functional)\nKeto permiresojne pervojen tuaj duke kujtuar zgjedhjet (p.sh. cilat module keni hapur, layout-in e preferuar). Nuk jane te nevojshme per funksionimin baze.\n\nKERKOJNE PELQIM.\n\n🔵 COOKIES ANALITIKE (analytics)\nNa ndihmojne te kuptojme se si perdoruesit perdorin platformen (p.sh. cilat faqe shfaqen me shume, ku ndalojne perdoruesit). Te dhenat agregojne per analiza statistikore.\n\nKERKOJNE PELQIM.\n\n🟠 COOKIES MARKETING (marketing/tracking)\nPerdoren per retargeting publiciteti dhe matjen e fushatave marketing. Aktualisht NUK perdorim cookies marketing ne platformen tone.\n\nNese ndryshojme ne te ardhmen, do te kerkojme pelqimin tuaj te qarte.',
    },
    section3: {
      title: 'Lista e detajuar e cookies',
      body: 'COOKIES THELBESORE (gjithmone aktive):\n\nEmri: sb-access-token\nQellimi: Autentifikim Supabase (sesioni i hyrjes)\nKohezgjatja: 1 ore (refreshohet automatikisht)\nLloji: HTTP-only, Secure, SameSite=Lax\n\nEmri: sb-refresh-token\nQellimi: Refresh i tokenit te hyrjes\nKohezgjatja: 30 dite\nLloji: HTTP-only, Secure, SameSite=Lax\n\nEmri: ep_language\nQellimi: Ruajtja e gjuhes se zgjedhur (sq/en/de/fr)\nKohezgjatja: 1 vit (localStorage)\nLloji: localStorage\n\nEmri: ep_consent\nQellimi: Ruajtja e pelqimit tuaj per cookies\nKohezgjatja: 12 muaj\nLloji: localStorage\n\nCOOKIES FUNKSIONALE (kerkojne pelqim):\n\nEmri: ep_ui_prefs\nQellimi: Preferenca UI (kolapsi i sidebar, tema, etj.)\nKohezgjatja: 6 muaj\nLloji: localStorage\n\nCOOKIES ANALITIKE (kerkojne pelqim):\n\nAktualisht NUK perdorim sherbime te paleve te treta per analitik. Nese shtojme ne te ardhmen (p.sh. Plausible Analytics, Matomo), do te shtohen ne kete liste dhe do t\'ju kerkojme pelqimin.',
    },
    section4: {
      title: 'Baza ligjore per perpunimin',
      body: 'COOKIES THELBESORE: Perpunimi bazohet ne \u00a7 25 paragrafit 2 TTDSG (pa kerkese pelqimi, sepse jane "absolutely necessary").\n\nCOOKIES JO-THELBESORE (funksionale, analitike, marketing): Perpunimi bazohet ne pelqimin tuaj sipas \u00a7 25 paragrafit 1 TTDSG dhe GDPR Art. 6 paragrafit 1 (a). Pelqimi mund te terhiqet ne cdo kohe me efekt per te ardhmen.\n\nNuk perdorim "legitimate interest" si baze ligjore per cookies jo-thelbesore - perdorim vetem pelqim te qarte opt-in.',
    },
    section5: {
      title: 'Si mund te menaxhoni pelqimin tuaj',
      body: '1. NEPERMJET BANEROIT TONE TE COOKIES\nKur vizitoni platformen per here te pare, ju shfaqim nje baner ku mund te zgjidhni:\n\u2022 "Prano te gjitha" - pranon te gjitha kategorite\n\u2022 "Refuzo te gjitha" - vetem cookies thelbesore\n\u2022 "Personalizo" - zgjidhni individualisht\n\n2. NEPERMJET PARAMETRAVE TE LLOGARISE\nNese keni nje llogari, mund te ndryshoni preferencat tuaja ne cdo kohe ne:\nSettings → Privacy → Cookie Preferences\n\n3. NEPERMJET SHFLETUESIT TUAJ\nMund te bllokoni ose fshini cookies neper rregullimet e shfletuesit. Megjithate, c\'aktivizimi i cookies thelbesore mund t\'ju pengoje te perdorni platformen.\n\nLidhje per udhezimet e shfletuesve me te perhapur:\n\u2022 Chrome: https://support.google.com/chrome/answer/95647\n\u2022 Firefox: https://support.mozilla.org/kb/cookies\n\u2022 Safari: https://support.apple.com/guide/safari/manage-cookies-sfri11471\n\u2022 Edge: https://support.microsoft.com/microsoft-edge\n\n4. DO NOT TRACK (DNT)\nRespektojme sinjalin "Do Not Track" te shfletuesit tuaj. Nese eshte i aktivizuar, nuk do te ngarkojme cookies analitike pa marre pelqimin tuaj te qarte.',
    },
    section6: {
      title: 'Terheqja e pelqimit',
      body: 'Mund te terhiqni pelqimin tuaj ne cdo kohe me efekt per te ardhmen. Per ta bere kete:\n\n1. Klikoni butonin "Ndrysho pelqimin per cookies" qe gjendet ne fund te cdo faqeje (footer)\n2. Ose hyni ne Settings → Privacy → Cookie Preferences\n3. C\'aktivizoni kategorite qe nuk doni\n4. Ruani ndryshimet\n\nPelqimi origjinal mbetet legjitim per perpunimin e te dhenave para terheqjes. Pas terheqjes:\n\u2022 Cookies te c\'aktivizuara do te fshihen menjehere\n\u2022 Nuk do te vendosen cookies te reja te asaj kategorie\n\u2022 Te dhenat e mbledhura me pare ruhen sipas politikes se privatesise',
    },
    section7: {
      title: 'Transferimi i te dhenave jashte BE/EEA',
      body: 'Aktualisht, te gjitha cookies dhe sherbimet e perdorura nga platforma jone ndodhen ne Bashkimin Evropian (server-at jane ne EU, ofruesi i bazes se te dhenave Supabase eshte i konfiguruar ne EU region).\n\nNuk perdorim aktualisht sherbime nga ofrues te SHBA-se ose vendeve te treta per cookies.\n\nNese ne te ardhmen do te perdorim nje sherbim qe perfshin transferim te te dhenave jashte BE/EEA (p.sh. Google Analytics, Meta Pixel), do te:\n1. Ju njoftojme ne mode te qarte\n2. Kerkojme pelqim te ri eksplicit\n3. Sigurojme se ka baza ligjore (Standard Contractual Clauses ose adequacy decision)\n4. Perditesojme kete politike',
    },
    section8: {
      title: 'Te drejtat tuaja sipas GDPR',
      body: 'Ne lidhje me cookies dhe te dhenat e mbledhura permes tyre, keni te drejten:\n\n\u2022 Te dini cilat te dhena mblidhen (e drejta e informimit - GDPR Art. 13)\n\u2022 Te aksesoni te dhenat tuaja (e drejta e aksesimit - Art. 15)\n\u2022 Te korrigjoni te dhenat e gabuara (e drejta e korrigjimit - Art. 16)\n\u2022 Te kerkoni fshirjen e te dhenave (e drejta per t\'u harruar - Art. 17)\n\u2022 Te kufizoni perpunimin (e drejta e kufizimit - Art. 18)\n\u2022 Te merrni te dhenat tuaja ne format te ndertuar (portabiliteti - Art. 20)\n\u2022 Te kundershtoni perpunimin (e drejta e kundershtimit - Art. 21)\n\u2022 Te terhiqni pelqimin ne cdo kohe (Art. 7 paragrafit 3)\n\u2022 Te dorezoni ankese tek autoriteti mbikqyres (Art. 77)\n\nPer t\'i ushtruar keto te drejta, na kontaktoni ne: [datenschutz@kompani.de]',
    },
    section9: {
      title: 'Ndryshime ne kete politike',
      body: 'Kete politike mund ta perditesojme here pas here per te reflektuar:\n\u2022 Ndryshime ne cookies qe perdorim\n\u2022 Ndryshime ligjore (perditesime te TTDSG, GDPR, etj.)\n\u2022 Permiresime te transparences\n\nNdryshimet thelbesore do te njoftohen permes:\n1. Banerit te ri te cookies (kerkesa per pelqim te ri)\n2. Emailit (per perdorues te regjistruar)\n3. Datestamp-it te perditesuar lart ne dokument\n\nVersioni i fundit eshte gjithmone i disponueshem ne kete URL.',
    },
    section10: {
      title: 'Kontakti per pyetje rreth cookies',
      body: 'Per pyetje rreth kesaj politike te cookies ose perpunimit te te dhenave permes cookies, na kontaktoni:\n\nEmail: [datenschutz@kompani.de]\nAdresa: [Adresa e kompanise sic eshte ne Impressum]\n\nMund te kontaktoni gjithashtu Pergjegjesin tone te Mbrojtjes se te Dhenave (DPO) ne:\n[dpo@kompani.de]\n\nKemi nje detyrim ligjor te pergjigjemi brenda 30 diteve nga marrja e kerkeses tuaj.',
    },
  },

  // ============================================================
  // ENGLISH (EN)
  // ============================================================
  en: {
    shortTitle: 'Cookies',
    title: 'Cookie Policy',
    subtitle: 'How we use cookies and similar technologies on our platform.',
    intro: 'This policy explains which cookies we use on the [PLATFORM NAME] platform, why we use them and how you can control them. We respect your right to privacy under \u00a7 25 TTDSG and GDPR Art. 6, and we do not set non-essential cookies without your clear prior consent.',
    lastUpdated: '15 May 2026',
    version: 'Version 1.0',

    section1: {
      title: 'What are cookies?',
      body: 'Cookies are small text files stored on your device (computer, phone or tablet) when you visit a website. They allow websites to remember information about your visit, such as language preferences, login status, or other session-related data.\n\nIn addition to cookies, we may use similar technologies such as:\n\u2022 Web storage (localStorage, sessionStorage) - larger storage in your browser\n\u2022 IndexedDB - structured browser storage (used for PWA offline functionality)\n\u2022 Cache API - resource caching for speed (Service Worker cache)\n\nThis policy refers to all these technologies with the general term "cookies".',
    },
    section2: {
      title: 'Categories of cookies we use',
      body: '🟢 STRICTLY NECESSARY COOKIES (essential)\nThese are required for the basic functioning of the platform and cannot be disabled. They do not require consent according to \u00a7 25 paragraph 2 TTDSG.\n\nExamples: authentication, session storage, CSRF protection, load balancing, language preferences.\n\n🟡 FUNCTIONAL COOKIES (functional)\nThese improve your experience by remembering choices (e.g. which modules you opened, preferred layout). Not required for basic functioning.\n\nREQUIRE CONSENT.\n\n🔵 ANALYTICS COOKIES (analytics)\nHelp us understand how users use the platform (e.g. which pages are viewed most, where users stop). Data is aggregated for statistical analysis.\n\nREQUIRE CONSENT.\n\n🟠 MARKETING COOKIES (marketing/tracking)\nUsed for ad retargeting and marketing campaign measurement. We currently do NOT use marketing cookies on our platform.\n\nIf we change in the future, we will request your explicit consent.',
    },
    section3: {
      title: 'Detailed list of cookies',
      body: 'STRICTLY NECESSARY COOKIES (always active):\n\nName: sb-access-token\nPurpose: Supabase authentication (login session)\nDuration: 1 hour (automatically refreshed)\nType: HTTP-only, Secure, SameSite=Lax\n\nName: sb-refresh-token\nPurpose: Refresh of login token\nDuration: 30 days\nType: HTTP-only, Secure, SameSite=Lax\n\nName: ep_language\nPurpose: Save selected language (sq/en/de/fr)\nDuration: 1 year (localStorage)\nType: localStorage\n\nName: ep_consent\nPurpose: Save your cookie consent\nDuration: 12 months\nType: localStorage\n\nFUNCTIONAL COOKIES (require consent):\n\nName: ep_ui_prefs\nPurpose: UI preferences (sidebar collapse, theme, etc.)\nDuration: 6 months\nType: localStorage\n\nANALYTICS COOKIES (require consent):\n\nWe currently do NOT use third-party services for analytics. If we add them in the future (e.g. Plausible Analytics, Matomo), they will be added to this list and we will request your consent.',
    },
    section4: {
      title: 'Legal basis for processing',
      body: 'STRICTLY NECESSARY COOKIES: Processing is based on \u00a7 25 paragraph 2 TTDSG (no consent required, as they are "absolutely necessary").\n\nNON-ESSENTIAL COOKIES (functional, analytics, marketing): Processing is based on your consent according to \u00a7 25 paragraph 1 TTDSG and GDPR Art. 6 paragraph 1 (a). Consent can be withdrawn at any time with effect for the future.\n\nWe do NOT use "legitimate interest" as a legal basis for non-essential cookies - we only use clear opt-in consent.',
    },
    section5: {
      title: 'How to manage your consent',
      body: '1. THROUGH OUR COOKIE BANNER\nWhen you first visit the platform, we display a banner where you can choose:\n\u2022 "Accept all" - accept all categories\n\u2022 "Reject all" - only strictly necessary cookies\n\u2022 "Customize" - select individually\n\n2. THROUGH ACCOUNT SETTINGS\nIf you have an account, you can change your preferences at any time at:\nSettings → Privacy → Cookie Preferences\n\n3. THROUGH YOUR BROWSER\nYou can block or delete cookies through browser settings. However, disabling essential cookies may prevent you from using the platform.\n\nLinks to instructions for popular browsers:\n\u2022 Chrome: https://support.google.com/chrome/answer/95647\n\u2022 Firefox: https://support.mozilla.org/kb/cookies\n\u2022 Safari: https://support.apple.com/guide/safari/manage-cookies-sfri11471\n\u2022 Edge: https://support.microsoft.com/microsoft-edge\n\n4. DO NOT TRACK (DNT)\nWe respect the "Do Not Track" signal from your browser. If activated, we will not load analytics cookies without obtaining your clear consent.',
    },
    section6: {
      title: 'Withdrawal of consent',
      body: 'You can withdraw your consent at any time with effect for the future. To do this:\n\n1. Click the "Change cookie preferences" button at the bottom of any page (footer)\n2. Or go to Settings → Privacy → Cookie Preferences\n3. Deactivate categories you don\'t want\n4. Save changes\n\nThe original consent remains legitimate for data processing before withdrawal. After withdrawal:\n\u2022 Deactivated cookies will be deleted immediately\n\u2022 No new cookies of that category will be set\n\u2022 Previously collected data is retained according to the privacy policy',
    },
    section7: {
      title: 'Data transfer outside EU/EEA',
      body: 'Currently, all cookies and services used by our platform are located in the European Union (servers are in EU, Supabase database provider is configured in EU region).\n\nWe do not currently use services from US providers or third countries for cookies.\n\nIf in the future we use a service that involves data transfer outside EU/EEA (e.g. Google Analytics, Meta Pixel), we will:\n1. Clearly notify you\n2. Request new explicit consent\n3. Ensure legal basis (Standard Contractual Clauses or adequacy decision)\n4. Update this policy',
    },
    section8: {
      title: 'Your rights under GDPR',
      body: 'In relation to cookies and data collected through them, you have the right:\n\n\u2022 To know what data is collected (right of information - GDPR Art. 13)\n\u2022 To access your data (right of access - Art. 15)\n\u2022 To correct incorrect data (right of correction - Art. 16)\n\u2022 To request data deletion (right to be forgotten - Art. 17)\n\u2022 To limit processing (right of restriction - Art. 18)\n\u2022 To receive your data in a structured format (portability - Art. 20)\n\u2022 To object to processing (right of objection - Art. 21)\n\u2022 To withdraw consent at any time (Art. 7 paragraph 3)\n\u2022 To file a complaint with the supervisory authority (Art. 77)\n\nTo exercise these rights, contact us at: [datenschutz@company.de]',
    },
    section9: {
      title: 'Changes to this policy',
      body: 'We may update this policy from time to time to reflect:\n\u2022 Changes in cookies we use\n\u2022 Legal changes (TTDSG, GDPR updates, etc.)\n\u2022 Transparency improvements\n\nMaterial changes will be communicated through:\n1. New cookie banner (request for new consent)\n2. Email (for registered users)\n3. Updated datestamp at the top of the document\n\nThe latest version is always available at this URL.',
    },
    section10: {
      title: 'Contact for cookie questions',
      body: 'For questions about this cookie policy or data processing through cookies, contact us:\n\nEmail: [datenschutz@company.de]\nAddress: [Company address as in Imprint]\n\nYou can also contact our Data Protection Officer (DPO) at:\n[dpo@company.de]\n\nWe have a legal obligation to respond within 30 days of receiving your request.',
    },
  },

  // ============================================================
  // GERMAN (DE) - canonical legal version
  // ============================================================
  de: {
    shortTitle: 'Cookies',
    title: 'Cookie-Richtlinie',
    subtitle: 'Wie wir Cookies und \u00e4hnliche Technologien auf unserer Plattform verwenden.',
    intro: 'Diese Richtlinie erkl\u00e4rt, welche Cookies wir auf der Plattform [PLATTFORMNAME] verwenden, warum wir sie verwenden und wie Sie sie kontrollieren k\u00f6nnen. Wir respektieren Ihr Recht auf Privatsph\u00e4re gem\u00e4\u00df \u00a7 25 TTDSG und DSGVO Art. 6, und setzen keine nicht-essentiellen Cookies ohne Ihre klare vorherige Einwilligung.',
    lastUpdated: '15. Mai 2026',
    version: 'Version 1.0',

    section1: {
      title: 'Was sind Cookies?',
      body: 'Cookies sind kleine Textdateien, die auf Ihrem Ger\u00e4t (Computer, Telefon oder Tablet) gespeichert werden, wenn Sie eine Website besuchen. Sie erm\u00f6glichen es Websites, Informationen \u00fcber Ihren Besuch zu speichern, wie Spracheinstellungen, Anmeldestatus oder andere sitzungsbezogene Daten.\n\nZus\u00e4tzlich zu Cookies k\u00f6nnen wir \u00e4hnliche Technologien verwenden wie:\n\u2022 Web Storage (localStorage, sessionStorage) - gr\u00f6\u00dferer Speicher in Ihrem Browser\n\u2022 IndexedDB - strukturierter Browser-Speicher (verwendet f\u00fcr PWA-Offline-Funktionalit\u00e4t)\n\u2022 Cache API - Ressourcen-Cache f\u00fcr Geschwindigkeit (Service Worker Cache)\n\nDiese Richtlinie bezieht sich auf alle diese Technologien mit dem allgemeinen Begriff "Cookies".',
    },
    section2: {
      title: 'Kategorien von Cookies, die wir verwenden',
      body: '🟢 UNBEDINGT ERFORDERLICHE COOKIES (essential)\nDiese sind f\u00fcr das grundlegende Funktionieren der Plattform erforderlich und k\u00f6nnen nicht deaktiviert werden. Sie ben\u00f6tigen keine Einwilligung gem\u00e4\u00df \u00a7 25 Abs. 2 TTDSG.\n\nBeispiele: Authentifizierung, Sitzungsspeicherung, CSRF-Schutz, Lastausgleich, Spracheinstellungen.\n\n🟡 FUNKTIONALE COOKIES (functional)\nDiese verbessern Ihre Erfahrung durch Speichern von Auswahlen (z.B. welche Module Sie ge\u00f6ffnet haben, bevorzugtes Layout). Nicht erforderlich f\u00fcr grundlegende Funktion.\n\nEINWILLIGUNG ERFORDERLICH.\n\n🔵 ANALYSE-COOKIES (analytics)\nHelfen uns zu verstehen, wie Benutzer die Plattform nutzen (z.B. welche Seiten am meisten angesehen werden, wo Benutzer aufh\u00f6ren). Daten werden f\u00fcr statistische Analysen aggregiert.\n\nEINWILLIGUNG ERFORDERLICH.\n\n🟠 MARKETING-COOKIES (marketing/tracking)\nVerwendet f\u00fcr Werbe-Retargeting und Marketing-Kampagnen-Messung. Wir verwenden derzeit KEINE Marketing-Cookies auf unserer Plattform.\n\nWenn wir in Zukunft \u00e4ndern, werden wir Ihre ausdr\u00fcckliche Einwilligung einholen.',
    },
    section3: {
      title: 'Detaillierte Liste der Cookies',
      body: 'UNBEDINGT ERFORDERLICHE COOKIES (immer aktiv):\n\nName: sb-access-token\nZweck: Supabase-Authentifizierung (Anmeldungssitzung)\nDauer: 1 Stunde (automatisch erneuert)\nTyp: HTTP-only, Secure, SameSite=Lax\n\nName: sb-refresh-token\nZweck: Erneuerung des Anmelde-Tokens\nDauer: 30 Tage\nTyp: HTTP-only, Secure, SameSite=Lax\n\nName: ep_language\nZweck: Speichern der ausgew\u00e4hlten Sprache (sq/en/de/fr)\nDauer: 1 Jahr (localStorage)\nTyp: localStorage\n\nName: ep_consent\nZweck: Speichern Ihrer Cookie-Einwilligung\nDauer: 12 Monate\nTyp: localStorage\n\nFUNKTIONALE COOKIES (Einwilligung erforderlich):\n\nName: ep_ui_prefs\nZweck: UI-Einstellungen (Sidebar-Zusammenfaltung, Thema usw.)\nDauer: 6 Monate\nTyp: localStorage\n\nANALYSE-COOKIES (Einwilligung erforderlich):\n\nWir verwenden derzeit KEINE Drittanbieterdienste f\u00fcr Analysen. Wenn wir in Zukunft welche hinzuf\u00fcgen (z.B. Plausible Analytics, Matomo), werden sie zu dieser Liste hinzugef\u00fcgt und wir werden Ihre Einwilligung einholen.',
    },
    section4: {
      title: 'Rechtsgrundlage f\u00fcr die Verarbeitung',
      body: 'UNBEDINGT ERFORDERLICHE COOKIES: Die Verarbeitung basiert auf \u00a7 25 Abs. 2 TTDSG (keine Einwilligung erforderlich, da "unbedingt erforderlich").\n\nNICHT-ESSENTIELLE COOKIES (funktional, analytisch, marketing): Die Verarbeitung basiert auf Ihrer Einwilligung gem\u00e4\u00df \u00a7 25 Abs. 1 TTDSG und DSGVO Art. 6 Abs. 1 (a). Die Einwilligung kann jederzeit mit Wirkung f\u00fcr die Zukunft widerrufen werden.\n\nWir verwenden NICHT "berechtigtes Interesse" als Rechtsgrundlage f\u00fcr nicht-essentielle Cookies - wir verwenden nur klare Opt-in-Einwilligung.',
    },
    section5: {
      title: 'Wie Sie Ihre Einwilligung verwalten k\u00f6nnen',
      body: '1. \u00dcBER UNSER COOKIE-BANNER\nWenn Sie die Plattform zum ersten Mal besuchen, zeigen wir Ihnen ein Banner an, in dem Sie w\u00e4hlen k\u00f6nnen:\n\u2022 "Alle akzeptieren" - akzeptiert alle Kategorien\n\u2022 "Alle ablehnen" - nur unbedingt erforderliche Cookies\n\u2022 "Anpassen" - individuell ausw\u00e4hlen\n\n2. \u00dcBER KONTOEINSTELLUNGEN\nWenn Sie ein Konto haben, k\u00f6nnen Sie Ihre Einstellungen jederzeit \u00e4ndern unter:\nEinstellungen → Datenschutz → Cookie-Einstellungen\n\n3. \u00dcBER IHREN BROWSER\nSie k\u00f6nnen Cookies \u00fcber die Browser-Einstellungen blockieren oder l\u00f6schen. Die Deaktivierung wesentlicher Cookies kann jedoch verhindern, dass Sie die Plattform nutzen.\n\nLinks zu Anleitungen f\u00fcr beliebte Browser:\n\u2022 Chrome: https://support.google.com/chrome/answer/95647\n\u2022 Firefox: https://support.mozilla.org/kb/cookies\n\u2022 Safari: https://support.apple.com/guide/safari/manage-cookies-sfri11471\n\u2022 Edge: https://support.microsoft.com/microsoft-edge\n\n4. DO NOT TRACK (DNT)\nWir respektieren das "Do Not Track"-Signal Ihres Browsers. Wenn aktiviert, werden wir keine Analyse-Cookies laden, ohne Ihre klare Einwilligung einzuholen.',
    },
    section6: {
      title: 'Widerruf der Einwilligung',
      body: 'Sie k\u00f6nnen Ihre Einwilligung jederzeit mit Wirkung f\u00fcr die Zukunft widerrufen. Dazu:\n\n1. Klicken Sie auf die Schaltfl\u00e4che "Cookie-Einstellungen \u00e4ndern" am unteren Rand jeder Seite (Footer)\n2. Oder gehen Sie zu Einstellungen → Datenschutz → Cookie-Einstellungen\n3. Deaktivieren Sie Kategorien, die Sie nicht m\u00f6chten\n4. Speichern Sie die \u00c4nderungen\n\nDie urspr\u00fcngliche Einwilligung bleibt f\u00fcr die Datenverarbeitung vor dem Widerruf legitim. Nach dem Widerruf:\n\u2022 Deaktivierte Cookies werden sofort gel\u00f6scht\n\u2022 Keine neuen Cookies dieser Kategorie werden gesetzt\n\u2022 Zuvor erfasste Daten werden gem\u00e4\u00df Datenschutzerkl\u00e4rung aufbewahrt',
    },
    section7: {
      title: 'Datentransfer au\u00dferhalb der EU/EWR',
      body: 'Derzeit befinden sich alle von unserer Plattform verwendeten Cookies und Dienste in der Europ\u00e4ischen Union (Server sind in der EU, der Supabase-Datenbankanbieter ist in EU-Region konfiguriert).\n\nWir verwenden derzeit keine Dienste von US-Anbietern oder Drittl\u00e4ndern f\u00fcr Cookies.\n\nWenn wir in Zukunft einen Dienst nutzen, der Datentransfer au\u00dferhalb der EU/EWR beinhaltet (z.B. Google Analytics, Meta Pixel), werden wir:\n1. Sie klar benachrichtigen\n2. Neue ausdr\u00fcckliche Einwilligung einholen\n3. Rechtsgrundlage sicherstellen (Standardvertragsklauseln oder Angemessenheitsbeschluss)\n4. Diese Richtlinie aktualisieren',
    },
    section8: {
      title: 'Ihre Rechte nach DSGVO',
      body: 'In Bezug auf Cookies und durch sie erhobene Daten haben Sie das Recht:\n\n\u2022 Zu wissen, welche Daten erhoben werden (Informationsrecht - DSGVO Art. 13)\n\u2022 Auf Ihre Daten zuzugreifen (Auskunftsrecht - Art. 15)\n\u2022 Falsche Daten zu berichtigen (Berichtigungsrecht - Art. 16)\n\u2022 L\u00f6schung von Daten zu verlangen (Recht auf Vergessenwerden - Art. 17)\n\u2022 Die Verarbeitung einzuschr\u00e4nken (Einschr\u00e4nkungsrecht - Art. 18)\n\u2022 Ihre Daten in strukturiertem Format zu erhalten (Portabilit\u00e4t - Art. 20)\n\u2022 Der Verarbeitung zu widersprechen (Widerspruchsrecht - Art. 21)\n\u2022 Einwilligung jederzeit zu widerrufen (Art. 7 Abs. 3)\n\u2022 Beschwerde bei der Aufsichtsbeh\u00f6rde einzureichen (Art. 77)\n\nUm diese Rechte auszu\u00fcben, kontaktieren Sie uns: [datenschutz@firma.de]',
    },
    section9: {
      title: '\u00c4nderungen an dieser Richtlinie',
      body: 'Wir k\u00f6nnen diese Richtlinie von Zeit zu Zeit aktualisieren, um Folgendes widerzuspiegeln:\n\u2022 \u00c4nderungen an Cookies, die wir verwenden\n\u2022 Rechts\u00e4nderungen (TTDSG-, DSGVO-Updates usw.)\n\u2022 Transparenzverbesserungen\n\nWesentliche \u00c4nderungen werden mitgeteilt durch:\n1. Neues Cookie-Banner (Anforderung neuer Einwilligung)\n2. E-Mail (f\u00fcr registrierte Benutzer)\n3. Aktualisierter Datumsstempel oben im Dokument\n\nDie neueste Version ist immer unter dieser URL verf\u00fcgbar.',
    },
    section10: {
      title: 'Kontakt f\u00fcr Cookie-Fragen',
      body: 'F\u00fcr Fragen zu dieser Cookie-Richtlinie oder zur Datenverarbeitung durch Cookies kontaktieren Sie uns:\n\nE-Mail: [datenschutz@firma.de]\nAnschrift: [Firmenanschrift wie im Impressum]\n\nSie k\u00f6nnen auch unseren Datenschutzbeauftragten (DPO) kontaktieren:\n[dpo@firma.de]\n\nWir haben eine gesetzliche Pflicht, innerhalb von 30 Tagen nach Erhalt Ihrer Anfrage zu antworten.',
    },
  },

  // ============================================================
  // FRENCH (FR)
  // ============================================================
  fr: {
    shortTitle: 'Cookies',
    title: 'Politique de Cookies',
    subtitle: 'Comment nous utilisons les cookies et technologies similaires sur notre plateforme.',
    intro: 'Cette politique explique quels cookies nous utilisons sur la plateforme [NOM DE LA PLATEFORME], pourquoi nous les utilisons et comment vous pouvez les contr\u00f4ler. Nous respectons votre droit \u00e0 la vie priv\u00e9e selon \u00a7 25 TTDSG et RGPD Art. 6, et nous ne pla\u00e7ons pas de cookies non-essentiels sans votre consentement clair pr\u00e9alable.',
    lastUpdated: '15 mai 2026',
    version: 'Version 1.0',

    section1: {
      title: 'Que sont les cookies?',
      body: 'Les cookies sont de petits fichiers texte stock\u00e9s sur votre appareil (ordinateur, t\u00e9l\u00e9phone ou tablette) lorsque vous visitez un site web. Ils permettent aux sites web de m\u00e9moriser des informations sur votre visite, telles que les pr\u00e9f\u00e9rences linguistiques, l\'\u00e9tat de connexion ou d\'autres donn\u00e9es li\u00e9es \u00e0 la session.\n\nEn plus des cookies, nous pouvons utiliser des technologies similaires telles que:\n\u2022 Web storage (localStorage, sessionStorage) - stockage plus grand dans votre navigateur\n\u2022 IndexedDB - stockage structur\u00e9 du navigateur (utilis\u00e9 pour la fonctionnalit\u00e9 hors ligne PWA)\n\u2022 Cache API - mise en cache des ressources pour la vitesse (cache Service Worker)\n\nCette politique se r\u00e9f\u00e8re \u00e0 toutes ces technologies par le terme g\u00e9n\u00e9ral "cookies".',
    },
    section2: {
      title: 'Cat\u00e9gories de cookies que nous utilisons',
      body: '🟢 COOKIES STRICTEMENT N\u00c9CESSAIRES (essentiels)\nCeux-ci sont requis pour le fonctionnement de base de la plateforme et ne peuvent pas \u00eatre d\u00e9sactiv\u00e9s. Ils ne n\u00e9cessitent pas de consentement selon \u00a7 25 paragraphe 2 TTDSG.\n\nExemples: authentification, stockage de session, protection CSRF, \u00e9quilibrage de charge, pr\u00e9f\u00e9rences linguistiques.\n\n🟡 COOKIES FONCTIONNELS (fonctionnels)\nCeux-ci am\u00e9liorent votre exp\u00e9rience en m\u00e9morisant les choix (par ex. quels modules vous avez ouverts, mise en page pr\u00e9f\u00e9r\u00e9e). Non requis pour le fonctionnement de base.\n\nN\u00c9CESSITENT UN CONSENTEMENT.\n\n🔵 COOKIES ANALYTIQUES (analytics)\nNous aident \u00e0 comprendre comment les utilisateurs utilisent la plateforme (par ex. quelles pages sont les plus consult\u00e9es, o\u00f9 les utilisateurs s\'arr\u00eatent). Les donn\u00e9es sont agr\u00e9g\u00e9es pour l\'analyse statistique.\n\nN\u00c9CESSITENT UN CONSENTEMENT.\n\n🟠 COOKIES MARKETING (marketing/tracking)\nUtilis\u00e9s pour le reciblage publicitaire et la mesure de campagnes marketing. Nous n\'utilisons actuellement PAS de cookies marketing sur notre plateforme.\n\nSi nous changeons \u00e0 l\'avenir, nous demanderons votre consentement explicite.',
    },
    section3: {
      title: 'Liste d\u00e9taill\u00e9e des cookies',
      body: 'COOKIES STRICTEMENT N\u00c9CESSAIRES (toujours actifs):\n\nNom: sb-access-token\nObjectif: Authentification Supabase (session de connexion)\nDur\u00e9e: 1 heure (rafra\u00eechi automatiquement)\nType: HTTP-only, Secure, SameSite=Lax\n\nNom: sb-refresh-token\nObjectif: Rafra\u00eechissement du token de connexion\nDur\u00e9e: 30 jours\nType: HTTP-only, Secure, SameSite=Lax\n\nNom: ep_language\nObjectif: Sauvegarde de la langue s\u00e9lectionn\u00e9e (sq/en/de/fr)\nDur\u00e9e: 1 an (localStorage)\nType: localStorage\n\nNom: ep_consent\nObjectif: Sauvegarde de votre consentement cookies\nDur\u00e9e: 12 mois\nType: localStorage\n\nCOOKIES FONCTIONNELS (consentement requis):\n\nNom: ep_ui_prefs\nObjectif: Pr\u00e9f\u00e9rences UI (effondrement de la barre lat\u00e9rale, th\u00e8me, etc.)\nDur\u00e9e: 6 mois\nType: localStorage\n\nCOOKIES ANALYTIQUES (consentement requis):\n\nNous n\'utilisons actuellement PAS de services tiers pour l\'analyse. Si nous en ajoutons \u00e0 l\'avenir (par ex. Plausible Analytics, Matomo), ils seront ajout\u00e9s \u00e0 cette liste et nous demanderons votre consentement.',
    },
    section4: {
      title: 'Base juridique pour le traitement',
      body: 'COOKIES STRICTEMENT N\u00c9CESSAIRES: Le traitement est bas\u00e9 sur \u00a7 25 paragraphe 2 TTDSG (aucun consentement requis, car "absolument n\u00e9cessaires").\n\nCOOKIES NON-ESSENTIELS (fonctionnels, analytiques, marketing): Le traitement est bas\u00e9 sur votre consentement selon \u00a7 25 paragraphe 1 TTDSG et RGPD Art. 6 paragraphe 1 (a). Le consentement peut \u00eatre retir\u00e9 \u00e0 tout moment avec effet pour l\'avenir.\n\nNous n\'utilisons PAS "l\'int\u00e9r\u00eat l\u00e9gitime" comme base juridique pour les cookies non-essentiels - nous utilisons uniquement un consentement opt-in clair.',
    },
    section5: {
      title: 'Comment g\u00e9rer votre consentement',
      body: '1. VIA NOTRE BANNI\u00c8RE DE COOKIES\nLorsque vous visitez la plateforme pour la premi\u00e8re fois, nous affichons une banni\u00e8re o\u00f9 vous pouvez choisir:\n\u2022 "Accepter tout" - accepte toutes les cat\u00e9gories\n\u2022 "Refuser tout" - uniquement les cookies strictement n\u00e9cessaires\n\u2022 "Personnaliser" - s\u00e9lectionner individuellement\n\n2. VIA LES PARAM\u00c8TRES DU COMPTE\nSi vous avez un compte, vous pouvez modifier vos pr\u00e9f\u00e9rences \u00e0 tout moment:\nParam\u00e8tres → Confidentialit\u00e9 → Pr\u00e9f\u00e9rences cookies\n\n3. VIA VOTRE NAVIGATEUR\nVous pouvez bloquer ou supprimer les cookies via les param\u00e8tres du navigateur. Cependant, la d\u00e9sactivation des cookies essentiels peut vous emp\u00eacher d\'utiliser la plateforme.\n\nLiens vers les instructions pour les navigateurs populaires:\n\u2022 Chrome: https://support.google.com/chrome/answer/95647\n\u2022 Firefox: https://support.mozilla.org/kb/cookies\n\u2022 Safari: https://support.apple.com/guide/safari/manage-cookies-sfri11471\n\u2022 Edge: https://support.microsoft.com/microsoft-edge\n\n4. DO NOT TRACK (DNT)\nNous respectons le signal "Do Not Track" de votre navigateur. S\'il est activ\u00e9, nous ne chargerons pas de cookies analytiques sans obtenir votre consentement clair.',
    },
    section6: {
      title: 'Retrait du consentement',
      body: 'Vous pouvez retirer votre consentement \u00e0 tout moment avec effet pour l\'avenir. Pour ce faire:\n\n1. Cliquez sur le bouton "Modifier les pr\u00e9f\u00e9rences cookies" en bas de chaque page (footer)\n2. Ou allez dans Param\u00e8tres → Confidentialit\u00e9 → Pr\u00e9f\u00e9rences cookies\n3. D\u00e9sactivez les cat\u00e9gories que vous ne voulez pas\n4. Enregistrez les modifications\n\nLe consentement original reste l\u00e9gitime pour le traitement des donn\u00e9es avant le retrait. Apr\u00e8s le retrait:\n\u2022 Les cookies d\u00e9sactiv\u00e9s seront supprim\u00e9s imm\u00e9diatement\n\u2022 Aucun nouveau cookie de cette cat\u00e9gorie ne sera plac\u00e9\n\u2022 Les donn\u00e9es pr\u00e9c\u00e9demment collect\u00e9es sont conserv\u00e9es selon la politique de confidentialit\u00e9',
    },
    section7: {
      title: 'Transfert de donn\u00e9es hors UE/EEE',
      body: 'Actuellement, tous les cookies et services utilis\u00e9s par notre plateforme sont situ\u00e9s dans l\'Union Europ\u00e9enne (les serveurs sont dans l\'UE, le fournisseur de base de donn\u00e9es Supabase est configur\u00e9 dans la r\u00e9gion UE).\n\nNous n\'utilisons actuellement pas de services de fournisseurs am\u00e9ricains ou de pays tiers pour les cookies.\n\nSi \u00e0 l\'avenir nous utilisons un service impliquant un transfert de donn\u00e9es hors UE/EEE (par ex. Google Analytics, Meta Pixel), nous:\n1. Vous notifierons clairement\n2. Demanderons un nouveau consentement explicite\n3. Garantirons une base juridique (Clauses Contractuelles Types ou d\u00e9cision d\'ad\u00e9quation)\n4. Mettrons \u00e0 jour cette politique',
    },
    section8: {
      title: 'Vos droits selon RGPD',
      body: 'Concernant les cookies et les donn\u00e9es collect\u00e9es par leur biais, vous avez le droit:\n\n\u2022 De savoir quelles donn\u00e9es sont collect\u00e9es (droit \u00e0 l\'information - RGPD Art. 13)\n\u2022 D\'acc\u00e9der \u00e0 vos donn\u00e9es (droit d\'acc\u00e8s - Art. 15)\n\u2022 De corriger les donn\u00e9es incorrectes (droit de rectification - Art. 16)\n\u2022 De demander la suppression des donn\u00e9es (droit \u00e0 l\'oubli - Art. 17)\n\u2022 De limiter le traitement (droit de limitation - Art. 18)\n\u2022 De recevoir vos donn\u00e9es dans un format structur\u00e9 (portabilit\u00e9 - Art. 20)\n\u2022 De vous opposer au traitement (droit d\'opposition - Art. 21)\n\u2022 De retirer le consentement \u00e0 tout moment (Art. 7 paragraphe 3)\n\u2022 De d\u00e9poser une plainte aupr\u00e8s de l\'autorit\u00e9 de contr\u00f4le (Art. 77)\n\nPour exercer ces droits, contactez-nous \u00e0: [datenschutz@entreprise.de]',
    },
    section9: {
      title: 'Modifications de cette politique',
      body: 'Nous pouvons mettre \u00e0 jour cette politique de temps en temps pour refl\u00e9ter:\n\u2022 Les changements dans les cookies que nous utilisons\n\u2022 Les changements l\u00e9gaux (mises \u00e0 jour TTDSG, RGPD, etc.)\n\u2022 Les am\u00e9liorations de la transparence\n\nLes changements substantiels seront communiqu\u00e9s par:\n1. Nouvelle banni\u00e8re de cookies (demande de nouveau consentement)\n2. E-mail (pour les utilisateurs enregistr\u00e9s)\n3. Horodatage mis \u00e0 jour en haut du document\n\nLa derni\u00e8re version est toujours disponible \u00e0 cette URL.',
    },
    section10: {
      title: 'Contact pour les questions cookies',
      body: 'Pour des questions sur cette politique de cookies ou le traitement des donn\u00e9es via cookies, contactez-nous:\n\nE-mail: [datenschutz@entreprise.de]\nAdresse: [Adresse de l\'entreprise comme dans les Mentions l\u00e9gales]\n\nVous pouvez \u00e9galement contacter notre D\u00e9l\u00e9gu\u00e9 \u00e0 la Protection des Donn\u00e9es (DPO):\n[dpo@entreprise.de]\n\nNous avons une obligation l\u00e9gale de r\u00e9pondre dans les 30 jours suivant la r\u00e9ception de votre demande.',
    },
  },
};
