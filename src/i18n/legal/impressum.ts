/**
 * Impressum / Legal Notice translations.
 *
 * Operator setup: Genton Maliqi is a French Entrepreneur individuel (EI)
 * registered in France (RCS Saint-Louis), trading as "Mar Group", with
 * the operating address in Germany (Pfaedlistrasse 10, 79576 Weil am
 * Rhein). German law (DDG / TMG / MStV) applies to telemedia services
 * targeted at Germany regardless of where the operator is incorporated,
 * so this Impressum is mandatory.
 */

const operator = {
  legalName: 'Genton Maliqi',
  tradingName: 'Mar Group',
  legalForm: 'Entrepreneur individuel (EI) — sole proprietor under French law',
  legalFormShort: 'EI',
  registrationDate: '28.07.2023',

  operatingAddress: 'Pfädlistraße 10, 79576 Weil am Rhein, Baden-Württemberg, Germany',
  operatingStreet: 'Pfädlistraße 10',
  operatingCity: '79576 Weil am Rhein',
  operatingRegion: 'Baden-Württemberg',
  operatingCountry: 'Germany',

  registeredSeatCity: 'Saint-Louis (Haut-Rhin)',
  registeredSeatCountry: 'France',
  registeredCourt: 'Registre du Commerce et des Sociétés (RCS)',
  registeredCommune: 'Saint-Louis (Haut-Rhin), France',

  siren: '978 437 606',
  siret: '978 437 606 00012',
  vat: 'FR01978437606',
  nafApe: '7112B (ingénierie, études techniques)',

  phone: '+49 172 8443861',
  email: 'info@mm-logistic.eu',
  website: 'https://www.mm-logistic.eu',
};

export const impressum = {
  // ============================================================
  // ALBANIAN (SQ)
  // ============================================================
  sq: {
    shortTitle: 'Impressum',
    title: 'Impressum / Te dhenat ligjore',
    subtitle: 'Informacioni i ofruesit sipas § 5 DDG (ish-TMG) dhe § 18 MStV.',
    intro: 'Kjo faqe permban te dhenat e detyrueshme te ofruesit te sherbimit. Operatori eshte nje sipermarres individual (Entrepreneur individuel) i regjistruar ne France me adrese operuese ne Gjermani — prandaj zbatohet ligji gjerman per telemedia (DDG/MStV) dhe paralelisht ligji francez per regjistrimin tregtar.',
    lastUpdated: '22 Maj 2026',
    version: 'Versioni 1.1',

    section1: {
      title: 'Ofruesi i sherbimit',
      body:
`Emri ligjor: ${operator.legalName}
Emri tregtar: ${operator.tradingName}
Forma juridike: ${operator.legalForm}
Data e regjistrimit: ${operator.registrationDate}

Adresa operuese (Gjermani):
${operator.operatingStreet}
${operator.operatingCity}
${operator.operatingRegion}
${operator.operatingCountry}

Selia e regjistruar (Franca):
${operator.registeredSeatCity}
${operator.registeredSeatCountry}

Kjo pjese identifikon ofruesin e sherbimit sipas § 5 DDG.`,
    },
    section2: {
      title: 'Perfaqesuesi ligjor',
      body:
`${operator.legalName} (sipermarres individual / sole proprietor)

Si Entrepreneur individuel, pronari eshte personalisht dhe i drejtperdrejti pergjegjes per veprimtarine e biznesit dhe e perfaqeson ate ne te gjitha ceshtjet ligjore dhe komerciale.`,
    },
    section3: {
      title: 'Kontakti',
      body:
`Telefoni: ${operator.phone}
Email: ${operator.email}
Website: ${operator.website}

Mund te na kontaktoni gjate orarit te punes nga e Hena ne te Premte, ora 09:00 - 17:00 (CET).`,
    },
    section4: {
      title: 'Regjistri tregtar dhe identifikuesit tatimore',
      body:
`Regjistri tregtar: ${operator.registeredCourt}, ${operator.registeredCommune}
SIREN: ${operator.siren}
SIRET (selia): ${operator.siret}
Kodi NAF / APE: ${operator.nafApe}

Numri i identifikimit te TVSH-se intra-komunitare (Art. 286 ter CGI):
${operator.vat}

Kontrolloni vlefshmerine e numrit te TVSH-se ne sistemin VIES te BE-se:
https://ec.europa.eu/taxation_customs/vies/

Vereje: Operatori nuk ka regjistrim tregtar ne Gjermani (HRB), pasi forma juridike "Entrepreneur individuel" eshte e regjistruar ne France. Per kete arsye, te dhenat e mesiperme jane referenca franceze.`,
    },
    section5: {
      title: 'Pergjegjes per permbajtjen',
      body:
`Pergjegjes per permbajtjen redaksionale sipas § 18 paragrafit 2 MStV:

${operator.legalName}
${operator.operatingAddress}

Pergjegjesi siguron qe permbajtja e publikuar respekton ligjet e zbatueshme dhe te drejtat e paleve te treta.`,
    },
    section6: {
      title: 'Zgjidhja online e mosmarreveshjeve (ODR)',
      body:
`Komisioni Evropian ofron nje platforme per zgjidhjen online te mosmarreveshjeve (OS-Plattform):

https://ec.europa.eu/consumers/odr/

Adresa jone e emailit gjendet me lart ne kete Impressum.`,
    },
    section7: {
      title: 'Procedurat e zgjidhjes se mosmarreveshjeve te konsumatoreve',
      body:
`Ne nuk jemi te detyruar dhe as te gatshem te marrim pjese ne procedurat e zgjidhjes se mosmarreveshjeve para nje bordi te arbitrazhit te konsumatoreve sipas Verbraucherstreitbeilegungsgesetz (VSBG).

Klientet B2B nuk perfshihen ne kete kuader rregullator.`,
    },
    section8: {
      title: 'Mohim pergjegjesie per permbajtjen',
      body:
`Permbajtja e ketij website-i eshte krijuar me kujdesin me te madh te mundshem. Megjithate, ne nuk mund te garantojme korrektesine, plotesine dhe aktualitetin e permbajtjes.

Si ofrues sherbimi, jemi pergjegjes per permbajtjen tone te vete ne kete website sipas § 7 paragrafit 1 DDG dhe ligjeve te pergjithshme. Sipas §§ 8 deri 10 DDG, megjithate, ne si ofrues sherbimi nuk jemi te detyruar te monitorojme informacionin e transmetuar ose te ruajtur nga te trete, ose te hetojme rrethanat qe tregojne aktivitet te paligjshem.`,
    },
    section9: {
      title: 'Mohim pergjegjesie per lidhjet (Linkhaftung)',
      body:
`Oferta jone permban lidhje me website-t e jashtem te paleve te treta, mbi permbajtjen e te cilave nuk kemi ndikim. Prandaj, nuk mund te marrim asnje pergjegjesi per kete permbajtje te jashtme. Per permbajtjen e faqeve te lidhura eshte gjithmone pergjegjes ofruesi perkates ose operatori i faqeve.

Faqet e lidhura jane kontrolluar per shkelje te mundshme ligjore ne kohen e lidhjes. Permbajtje te paligjshme nuk u njohen ne kohen e lidhjes. Megjithate, nje kontroll i vazhdueshem i permbajtjes se faqeve te lidhura nuk eshte i arsyeshem pa prova konkrete te nje shkelje. Pas njoftimit per shkelje, do te heqim menjehere lidhje te tilla.`,
    },
    section10: {
      title: 'E drejta e autorit',
      body:
`Permbajtjet dhe veprat e krijuara nga operatori ne keto faqe i nenshtrohen ligjit gjerman te se drejtes se autorit. Riprodhimi, perpunimi, shperndarja dhe cdo forme shfrytezimi jashte kufijve te se drejtes se autorit kerkojne miratimin me shkrim te autorit.

Shkarkimet dhe kopjet e ketij website lejohen vetem per perdorim privat, jo komercial.

Per aq sa permbajtjet ne kete faqe nuk u krijuan nga operatori, te drejtat e autorit te paleve te treta respektohen. Ne vecanti, permbajtjet e paleve te treta jane te identifikuara si te tilla. Nese vereni nje shkelje te se drejtes se autorit, ju lutemi te na njoftoni. Pas njoftimit per shkelje, do te heqim menjehere permbajtjen e tille.`,
    },
  },

  // ============================================================
  // ENGLISH (EN)
  // ============================================================
  en: {
    shortTitle: 'Imprint',
    title: 'Imprint / Legal Notice',
    subtitle: 'Provider identification according to § 5 DDG (formerly TMG) and § 18 MStV.',
    intro: 'This page contains the mandatory provider information. The operator is a French Entrepreneur individuel (sole proprietor) with an operating address in Germany — German telemedia law (DDG/MStV) therefore applies in parallel with French commercial registration law.',
    lastUpdated: '22 May 2026',
    version: 'Version 1.1',

    section1: {
      title: 'Service Provider',
      body:
`Legal name: ${operator.legalName}
Trading name: ${operator.tradingName}
Legal form: ${operator.legalForm}
Registered since: ${operator.registrationDate}

Operating address (Germany):
${operator.operatingStreet}
${operator.operatingCity}
${operator.operatingRegion}
${operator.operatingCountry}

Registered seat (France):
${operator.registeredSeatCity}
${operator.registeredSeatCountry}

This section identifies the service provider in accordance with § 5 DDG.`,
    },
    section2: {
      title: 'Legal Representative',
      body:
`${operator.legalName} (Entrepreneur individuel / sole proprietor)

As a sole proprietor, the owner is personally and directly liable for the business and represents it in all legal and commercial matters.`,
    },
    section3: {
      title: 'Contact',
      body:
`Phone: ${operator.phone}
Email: ${operator.email}
Website: ${operator.website}

You can reach us during business hours Monday to Friday, 09:00 - 17:00 (CET).`,
    },
    section4: {
      title: 'Commercial Register and Tax IDs',
      body:
`Commercial register: ${operator.registeredCourt}, ${operator.registeredCommune}
SIREN: ${operator.siren}
SIRET (seat): ${operator.siret}
NAF / APE code: ${operator.nafApe}

Intra-Community VAT identification number (Art. 286 ter CGI):
${operator.vat}

You can verify the VAT number through the EU VIES system:
https://ec.europa.eu/taxation_customs/vies/

Note: the operator does not hold a German commercial register entry (HRB) because the legal form "Entrepreneur individuel" is registered in France. The above identifiers are therefore French.`,
    },
    section5: {
      title: 'Responsible for Content',
      body:
`Responsible for editorial content according to § 18 paragraph 2 MStV:

${operator.legalName}
${operator.operatingAddress}

The responsible party ensures that published content complies with applicable laws and third-party rights.`,
    },
    section6: {
      title: 'Online Dispute Resolution (ODR)',
      body:
`The European Commission provides a platform for online dispute resolution (OS platform):

https://ec.europa.eu/consumers/odr/

Our email address can be found above in this Imprint.`,
    },
    section7: {
      title: 'Consumer Dispute Resolution',
      body:
`We are neither obliged nor willing to participate in dispute resolution proceedings before a consumer arbitration board pursuant to the Verbraucherstreitbeilegungsgesetz (VSBG).

B2B customers are not covered by this regulatory framework.`,
    },
    section8: {
      title: 'Disclaimer for Content',
      body:
`The content of this website has been created with the utmost care. However, we cannot guarantee the accuracy, completeness, and timeliness of the content.

As a service provider, we are responsible for our own content on this website according to § 7 paragraph 1 DDG and general laws. According to §§ 8 to 10 DDG, however, we as service providers are not obliged to monitor transmitted or stored third-party information or to investigate circumstances that indicate illegal activity.`,
    },
    section9: {
      title: 'Disclaimer for Links',
      body:
`Our offer contains links to external third-party websites over whose content we have no influence. Therefore, we cannot accept any liability for this external content. The respective provider or operator of the pages is always responsible for the content of the linked pages.

The linked pages were checked for possible legal violations at the time of linking. Illegal content was not recognizable at the time of linking. However, permanent monitoring of the content of linked pages is not reasonable without concrete evidence of a violation. Upon notification of violations, we will remove such links immediately.`,
    },
    section10: {
      title: 'Copyright',
      body:
`The content and works created by the operator on these pages are subject to German copyright law. Reproduction, processing, distribution, and any form of exploitation outside the limits of copyright require the written consent of the author.

Downloads and copies of this website are only permitted for private, non-commercial use.

Insofar as the content on this site was not created by the operator, the copyrights of third parties are respected. In particular, third-party content is identified as such. Should you nevertheless notice a copyright infringement, please notify us. Upon notification of violations, we will remove such content immediately.`,
    },
  },

  // ============================================================
  // GERMAN (DE) — canonical legal version
  // ============================================================
  de: {
    shortTitle: 'Impressum',
    title: 'Impressum',
    subtitle: 'Anbieterkennzeichnung gemäß § 5 DDG (vormals TMG) und § 18 MStV.',
    intro: 'Diese Seite enthält die nach deutschem Recht erforderlichen Anbieterangaben. Der Betreiber ist ein in Frankreich eingetragener Einzelunternehmer (Entrepreneur individuel) mit operativer Anschrift in Deutschland — das deutsche Telemedienrecht (DDG/MStV) gilt parallel zum französischen Handelsregisterrecht.',
    lastUpdated: '22. Mai 2026',
    version: 'Version 1.1',

    section1: {
      title: 'Diensteanbieter',
      body:
`Name: ${operator.legalName}
Handelsname: ${operator.tradingName}
Rechtsform: Einzelunternehmer (Entrepreneur individuel nach französischem Recht)
Eingetragen seit: ${operator.registrationDate}

Operative Anschrift (Deutschland):
${operator.operatingStreet}
${operator.operatingCity}
${operator.operatingRegion}
${operator.operatingCountry}

Eingetragener Sitz (Frankreich):
${operator.registeredSeatCity}
${operator.registeredSeatCountry}

Diese Angaben kennzeichnen den Diensteanbieter gemäß § 5 DDG.`,
    },
    section2: {
      title: 'Vertretungsberechtigter',
      body:
`${operator.legalName} (Einzelunternehmer / Entrepreneur individuel)

Als Einzelunternehmer haftet der Inhaber persönlich und unmittelbar für den Geschäftsbetrieb und vertritt das Unternehmen in allen rechtlichen und geschäftlichen Angelegenheiten.`,
    },
    section3: {
      title: 'Kontakt',
      body:
`Telefon: ${operator.phone}
E-Mail: ${operator.email}
Website: ${operator.website}

Sie erreichen uns während der Geschäftszeiten Montag bis Freitag, 09:00 - 17:00 Uhr (MEZ).`,
    },
    section4: {
      title: 'Handelsregister und Steueridentifikation',
      body:
`Registerführende Behörde: ${operator.registeredCourt}, ${operator.registeredCommune}
SIREN: ${operator.siren}
SIRET (Sitz): ${operator.siret}
NAF / APE-Code: ${operator.nafApe}

Umsatzsteuer-Identifikationsnummer (innergemeinschaftlich, Art. 286 ter CGI):
${operator.vat}

Die USt-IdNr. kann über das VIES-System der EU geprüft werden:
https://ec.europa.eu/taxation_customs/vies/

Hinweis: Eine Eintragung im deutschen Handelsregister (HRB) liegt nicht vor, da die Rechtsform "Entrepreneur individuel" in Frankreich geführt wird. Die obigen Identifikatoren sind daher französisch.`,
    },
    section5: {
      title: 'Inhaltlich Verantwortlicher',
      body:
`Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:

${operator.legalName}
${operator.operatingAddress}

Der Verantwortliche stellt sicher, dass die veröffentlichten Inhalte geltendes Recht und Rechte Dritter wahren.`,
    },
    section6: {
      title: 'Online-Streitbeilegung (OS)',
      body:
`Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:

https://ec.europa.eu/consumers/odr/

Unsere E-Mail-Adresse finden Sie oben in diesem Impressum.`,
    },
    section7: {
      title: 'Verbraucherstreitbeilegung',
      body:
`Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle gemäß dem Verbraucherstreitbeilegungsgesetz (VSBG) teilzunehmen.

Geschäftskunden (B2B) fallen nicht unter diesen regulatorischen Rahmen.`,
    },
    section8: {
      title: 'Haftung für Inhalte',
      body:
`Die Inhalte dieser Website wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen.

Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf dieser Website nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.`,
    },
    section9: {
      title: 'Haftung für Links',
      body:
`Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.

Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.`,
    },
    section10: {
      title: 'Urheberrecht',
      body:
`Die durch den Betreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des Autors.

Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet.

Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt wurden, werden die Urheberrechte Dritter beachtet. Insbesondere werden Inhalte Dritter als solche gekennzeichnet. Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Inhalte umgehend entfernen.`,
    },
  },

  // ============================================================
  // FRENCH (FR)
  // ============================================================
  fr: {
    shortTitle: 'Mentions légales',
    title: 'Mentions légales',
    subtitle: 'Identification du prestataire selon § 5 DDG (droit allemand) et droit français applicable à un Entrepreneur individuel.',
    intro: 'Cette page contient les informations obligatoires du prestataire. L\'opérateur est un Entrepreneur individuel enregistré en France avec une adresse opérationnelle en Allemagne — le droit allemand des télémédias (DDG/MStV) s\'applique donc parallèlement au droit français du registre du commerce (RCS).',
    lastUpdated: '22 mai 2026',
    version: 'Version 1.1',

    section1: {
      title: 'Prestataire de services',
      body:
`Nom : ${operator.legalName}
Nom commercial : ${operator.tradingName}
Forme juridique : Entrepreneur individuel (EI)
Date d'immatriculation : ${operator.registrationDate}

Adresse opérationnelle (Allemagne) :
${operator.operatingStreet}
${operator.operatingCity}
${operator.operatingRegion}
${operator.operatingCountry}

Siège enregistré (France) :
${operator.registeredSeatCity}
${operator.registeredSeatCountry}

Cette section identifie le prestataire de services conformément au § 5 DDG.`,
    },
    section2: {
      title: 'Représentant légal',
      body:
`${operator.legalName} (Entrepreneur individuel)

En tant qu'entrepreneur individuel, le propriétaire est personnellement et directement responsable de l'activité et la représente dans toutes les affaires juridiques et commerciales.`,
    },
    section3: {
      title: 'Contact',
      body:
`Téléphone : ${operator.phone}
E-mail : ${operator.email}
Site web : ${operator.website}

Vous pouvez nous joindre pendant les heures de bureau du lundi au vendredi, 09h00 - 17h00 (CET).`,
    },
    section4: {
      title: 'Registre du commerce et identifiants fiscaux',
      body:
`Registre : ${operator.registeredCourt}, ${operator.registeredCommune}
SIREN : ${operator.siren}
SIRET (siège) : ${operator.siret}
Code NAF / APE : ${operator.nafApe}

Numéro de TVA intracommunautaire (Art. 286 ter CGI) :
${operator.vat}

Vérifiez la validité du numéro de TVA via le système VIES de l'UE :
https://ec.europa.eu/taxation_customs/vies/

Remarque : l'opérateur ne dispose pas d'une inscription au registre du commerce allemand (HRB), car la forme juridique « Entrepreneur individuel » est immatriculée en France. Les identifiants ci-dessus sont par conséquent français.`,
    },
    section5: {
      title: 'Responsable du contenu',
      body:
`Responsable du contenu rédactionnel selon § 18 paragraphe 2 MStV :

${operator.legalName}
${operator.operatingAddress}

Le responsable s'assure que le contenu publié respecte les lois en vigueur et les droits des tiers.`,
    },
    section6: {
      title: 'Règlement en ligne des litiges (RLL)',
      body:
`La Commission européenne met à disposition une plateforme de règlement en ligne des litiges (plateforme RLL) :

https://ec.europa.eu/consumers/odr/

Notre adresse e-mail figure ci-dessus dans ces mentions légales.`,
    },
    section7: {
      title: 'Règlement des litiges de consommation',
      body:
`Nous ne sommes ni obligés ni disposés à participer à des procédures de règlement des litiges devant un organe d'arbitrage de consommation conformément à la Verbraucherstreitbeilegungsgesetz (VSBG).

Les clients B2B ne sont pas couverts par ce cadre réglementaire.`,
    },
    section8: {
      title: 'Clause de non-responsabilité pour le contenu',
      body:
`Le contenu de ce site a été créé avec le plus grand soin. Toutefois, nous ne pouvons garantir l'exactitude, l'exhaustivité et l'actualité du contenu.

En tant que prestataire de services, nous sommes responsables de notre propre contenu sur ce site selon § 7 paragraphe 1 DDG et les lois générales. Selon §§ 8 à 10 DDG, cependant, nous ne sommes pas tenus, en tant que prestataires de services, de surveiller les informations transmises ou stockées par des tiers, ni d'enquêter sur les circonstances indiquant une activité illégale.`,
    },
    section9: {
      title: 'Clause de non-responsabilité pour les liens',
      body:
`Notre offre contient des liens vers des sites web externes de tiers, sur le contenu desquels nous n'avons aucune influence. Par conséquent, nous ne pouvons assumer aucune responsabilité pour ce contenu externe. Le fournisseur ou l'opérateur respectif des pages est toujours responsable du contenu des pages liées.

Les pages liées ont été vérifiées pour déceler d'éventuelles violations légales au moment de l'établissement du lien. Aucun contenu illégal n'était reconnaissable au moment de l'établissement du lien. Cependant, une surveillance permanente du contenu des pages liées n'est pas raisonnable sans preuve concrète d'une violation. Lors de la notification de violations, nous supprimerons immédiatement ces liens.`,
    },
    section10: {
      title: 'Droit d\'auteur',
      body:
`Les contenus et œuvres créés par l'opérateur sur ces pages sont soumis au droit d'auteur allemand. La reproduction, le traitement, la distribution et toute forme d'exploitation en dehors des limites du droit d'auteur nécessitent le consentement écrit de l'auteur.

Les téléchargements et copies de ce site ne sont autorisés que pour un usage privé et non commercial.

Dans la mesure où le contenu de ce site n'a pas été créé par l'opérateur, les droits d'auteur de tiers sont respectés. En particulier, le contenu de tiers est identifié comme tel. Si vous remarquez néanmoins une violation du droit d'auteur, veuillez nous en informer. Lors de la notification de violations, nous supprimerons immédiatement un tel contenu.`,
    },
  },
};
