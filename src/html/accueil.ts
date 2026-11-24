/**
 * Page d'accueil publique (`GET /`) de `acces.poirierlavoie.ca` (`SPEC §9`).
 *
 * Pure : aucune lecture de secret ni d'état de requête ; survit au coupe-circuit `MCP_ENABLED` (`G22`).
 */

import { COURRIEL_CONTACT_RESPONSABLE, ORIGINE_PORTAIL_PAR_DEFAUT } from "../constantes";
import {
  barreSuite,
  bi,
  biP,
  boutonsEntete,
  esc,
  repondrePageHtml,
  type SectionSommaire,
} from "./gabarit";

export const SECTIONS_ACCUEIL: readonly SectionSommaire[] = [
  { id: "admissibilite", fr: "Admissibilité", en: "Eligibility" },
  { id: "connecteurs", fr: "Connecteurs et plateformes", en: "Connectors & platforms" },
  { id: "admission", fr: "Parcours d'admission", en: "Admission process" },
  { id: "confidentialite", fr: "Confidentialité et coffre", en: "Privacy & vault" },
  { id: "gouvernance", fr: "Gouvernance et accès", en: "Governance & access" },
] as const;

function h2(id: (typeof SECTIONS_ACCUEIL)[number]["id"], idTitre?: string): string {
  const s = SECTIONS_ACCUEIL.find((entree) => entree.id === id)!;
  return `<h2${idTitre ? ` id="${esc(idTitre)}"` : ""}>${bi(s.fr, s.en)}</h2>`;
}

const JSON_LD_ACCUEIL: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${ORIGINE_PORTAIL_PAR_DEFAUT}/#site`,
      url: `${ORIGINE_PORTAIL_PAR_DEFAUT}/`,
      name: ["MCP Accès — Droit civil québécois", "MCP Access — Québec Civil Law"],
      inLanguage: ["fr-CA", "en-CA"],
      publisher: { "@id": `${ORIGINE_PORTAIL_PAR_DEFAUT}/#operateur` },
    },
    {
      "@type": "Person",
      "@id": `${ORIGINE_PORTAIL_PAR_DEFAUT}/#operateur`,
      name: "Jason Poirier Lavoie",
      jobTitle: ["Avocat", "Lawyer"],
      email: `mailto:${COURRIEL_CONTACT_RESPONSABLE}`,
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://github.com/jpoirierlavoie/droit-civil-quebecois#plugin",
      name: "Droit civil québécois",
      url: "https://github.com/jpoirierlavoie/droit-civil-quebecois",
      applicationCategory: "LegalApplication",
      operatingSystem: "Cross-platform (MCP)",
      isAccessibleForFree: true,
      license: "https://www.apache.org/licenses/LICENSE-2.0",
      termsOfService: `${ORIGINE_PORTAIL_PAR_DEFAUT}/cgu`,
      inLanguage: ["fr-CA", "en-CA"],
      author: { "@id": `${ORIGINE_PORTAIL_PAR_DEFAUT}/#operateur` },
      hasPart: [
        {
          "@type": "WebAPI",
          name: "MCP Législation (lois)",
          url: "https://legislation.poirierlavoie.ca/",
          documentation: "https://legislation.poirierlavoie.ca/mcp/server-card",
        },
        {
          "@type": "WebAPI",
          name: "MCP Jurisprudence (juris)",
          url: "https://jurisprudence.poirierlavoie.ca/",
          documentation: "https://jurisprudence.poirierlavoie.ca/mcp/server-card",
        },
        {
          "@type": "WebAPI",
          name: "MCP Outils (outils)",
          url: "https://outils.poirierlavoie.ca/",
          documentation: "https://outils.poirierlavoie.ca/mcp/server-card",
        },
      ],
    },
  ],
};

function carteConnecteur(params: {
  titreFr: string;
  titreEn: string;
  badgeFr: string;
  badgeEn: string;
  descFr: string;
  descEn: string;
  url: string;
  ctaFr: string;
  ctaEn: string;
}): string {
  return `<article class="carte">
<div>
<p><span class="badge">${bi(params.badgeFr, params.badgeEn)}</span></p>
<h3>${bi(params.titreFr, params.titreEn)}</h3>
${biP([params.descFr], [params.descEn])}
</div>
<p><a class="btn-sec" href="${esc(params.url)}">${bi(params.ctaFr, params.ctaEn)}</a></p>
</article>`;
}

export function construireCorpsAccueil(): string {
  return `<header>
${barreSuite(true, true)}
<div class="bar">
<h1>${bi("MCP Accès — Droit civil québécois", "MCP Access — Québec Civil Law")}</h1>
${boutonsEntete(true)}
</div>
${biP(
  [
    "Portail d'admission et de gestion des accès pour la suite MCP Droit civil québécois. Il régit " +
      "l'accès aux connecteurs Législation (lois) et Jurisprudence (juris), réservés aux membres " +
      "actifs en règle du Barreau du Québec, aux côtés du connecteur public Outils (outils).",
  ],
  [
    "Admission and access management portal for the Québec Civil Law MCP suite. It governs access " +
      "to the Legislation (lois) and Case Law (juris) connectors, reserved for active members in " +
      "good standing of the Barreau du Québec, alongside the public Tools (outils) connector.",
  ],
)}
<div class="avert">
${biP(
  [
    "Service gratuit entre confrères, exploité par un avocat plaideur en exercice (Jason Poirier Lavoie), " +
      "fourni « TEL QUEL » et sans engagement de niveau de service (SLA). Chaque avocat demeure " +
      "exclusivement responsable de la vérification indépendante des textes législatifs consolidés " +
      "et du texte intégral officiel des jugements.",
  ],
  [
    "Free collegial service operated by a practising litigator (Jason Poirier Lavoie), provided " +
      '"AS IS" with zero SLA. Each lawyer remains solely responsible for independent verification ' +
      "of consolidated statutes and full official judgment texts.",
  ],
)}
</div>
<p class="btns">
<a class="btn" href="/demande">${bi("Déposer une demande d'accès", "Apply for access")}</a>
<a class="btn-sec" href="#connecteurs">${bi("Explorer les 3 connecteurs", "Inspect the 3 connectors")}</a>
<a class="btn-sec" href="/moi">${bi("Espace libre-service (/moi)", "Self-service portal (/moi)")}</a>
</p>
</header>

<section id="admissibilite">
${h2("admissibilite")}
${biP(
  [
    "L'accès aux connecteurs authentifiés MCP Législation (lois) et MCP Jurisprudence (juris) est " +
      "strictement réservé aux avocats inscrits actifs et en règle au Tableau de l'Ordre du Barreau " +
      "du Québec. Le connecteur complémentaire MCP Outils (outils — calendrier C.p.c., intérêts " +
      "art. 1619 C.c.Q., greffes, registres et terminologie) demeure public et sans authentification.",
    "Le code source de la suite est publié gratuitement sous licence open source Apache-2.0 " +
      "(accompagnée du fichier NOTICE reconnaissant les sources officielles et données ouvertes sans " +
      "revendication de propriété). Les membres admis du Barreau du Québec peuvent utiliser les " +
      "connecteurs hébergés gratuitement au sein de leur pratique, y compris dans leurs mandats " +
      "clients, conformément aux /cgu et aux licences propres aux sources desservies.",
  ],
  [
    "Access to the authenticated MCP Legislation (lois) and MCP Case Law (juris) connectors is " +
      "strictly reserved for lawyers actively enrolled in good standing on the Roll of the Barreau " +
      "du Québec. The companion MCP Tools connector (outils — C.C.P. deadlines, art. 1619 C.C.Q. " +
      "interest, court registries, and terminology) remains public and unauthenticated.",
    "The suite's source code is published free of charge under the Apache-2.0 open-source license " +
      "(with a NOTICE file crediting official and open-data sources without claiming ownership). " +
      "Admitted Barreau du Québec members may use the hosted connectors free of charge in their " +
      "practice, including client mandates, in accordance with /cgu and upstream source terms.",
  ],
)}
</section>

<section id="connecteurs">
${h2("connecteurs")}
${biP(
  ["Le périmètre, les outils et les limites de chaque connecteur sont documentés publiquement :"],
  ["The scope, tools, and limits of each connector are documented publicly:"],
)}
<div class="grille-cartes">
${carteConnecteur({
  titreFr: "MCP Législation (lois)",
  titreEn: "MCP Legislation (lois)",
  badgeFr: "Barreau du Québec · 10 outils",
  badgeEn: "Barreau du Québec · 10 tools",
  descFr:
    "Texte officiel verbatim des lois et règlements du Québec et du Canada, directives de pratique " +
    "des tribunaux et textes AMF, avec hiérarchie complète et recherche plein texte.",
  descEn:
    "Official verbatim text of Québec and federal statutes and regulations, court practice " +
    "directives, and AMF texts, with full hierarchy and full-text search.",
  url: "https://legislation.poirierlavoie.ca/",
  ctaFr: "Inspecter Législation →",
  ctaEn: "Inspect Legislation →",
})}
${carteConnecteur({
  titreFr: "MCP Jurisprudence (juris)",
  titreEn: "MCP Case Law (juris)",
  badgeFr: "Barreau · Clé CanLII (BYOK) · 10 outils",
  badgeEn: "Barreau · BYOK CanLII · 10 tools",
  descFr:
    "Vérification déterministe de citations, fiches officielles de décisions et listes brutes de " +
    "citateur adossées à la collection de CanLII.",
  descEn:
    "Deterministic citation verification, official decision metadata records, and raw citator lists " +
    "backed by CanLII's collection.",
  url: "https://jurisprudence.poirierlavoie.ca/",
  ctaFr: "Inspecter Jurisprudence →",
  ctaEn: "Inspect Case Law →",
})}
${carteConnecteur({
  titreFr: "MCP Outils (outils)",
  titreEn: "MCP Tools (outils)",
  badgeFr: "Public sans compte · 12 outils",
  badgeEn: "Public, no account · 12 tools",
  descFr:
    "Calculateurs déterministes (délais C.p.c., intérêts art. 1619 C.c.Q.), numéros de dossier, " +
    "palais de justice, registres d'entreprises, adresses RQA et terminologie bijuridique.",
  descEn:
    "Deterministic calculators (C.C.P. deadlines, art. 1619 C.C.Q. interest), court file numbers, " +
    "courthouses, business registries, RQA addresses, and bijural terminology.",
  url: "https://outils.poirierlavoie.ca/",
  ctaFr: "Consulter Outils →",
  ctaEn: "Inspect Tools →",
})}
</div>
${biP(
  [
    "Deux modes de connexion donnent accès aux mêmes outils : l'autorisation par navigateur " +
      "OAuth 2.1 (/mcp/oauth, par défaut dans Claude, ChatGPT, Google Antigravity et Gemini) sans " +
      "clé à copier dans vos fichiers, et l'accès par jeton personnel (/mcp) destiné aux outils " +
      "en ligne de commande, scripts automatisés et à l'API Gemini Deep Research.",
  ],
  [
    "Two connection modes provide access to the same tools: browser-based OAuth 2.1 authorization " +
      "(/mcp/oauth, default in Claude, ChatGPT, Google Antigravity, and Gemini) with no key to copy " +
      "into config files, and personal token access (/mcp) for command-line tools, automated " +
      "scripts, and Gemini API Deep Research.",
  ],
)}
<p><a href="https://github.com/jpoirierlavoie/droit-civil-quebecois">${bi("Greffon cadre droit-civil-quebecois (10 compétences, 59 feuilles de référence)", "Umbrella plugin droit-civil-quebecois (10 skills, 59 reference sheets)")}</a></p>
</section>

<section id="admission">
${h2("admission")}
${biP(
  [
    "1. Clé API CanLII personnelle obligatoire (BYOK) : chaque demandeur fournit sa propre clé " +
      "REST API CanLII lors de sa demande sur /demande. La clé est vérifiée directement auprès de " +
      "CanLII à l'envoi ; le service n'utilise jamais une clé de l'exploitant en repli.",
    "2. Confirmation par courriel (30 minutes) : l'envoi d'une demande transmet un lien à usage " +
      "unique depuis noreply@acces.poirierlavoie.ca, valable 30 minutes. Une demande non confirmée " +
      "expire automatiquement sans bloquer votre numéro de membre du Barreau.",
    "3. Vérification au Bottin des avocats : l'inscription active au Tableau de l'Ordre est " +
      "vérifiée manuellement avant l'activation du compte. Une fois approuvé, vous gérez vos " +
      "connexions par navigateur et vos jetons personnels (affichés une seule fois à la création) " +
      "dans /moi.",
  ],
  [
    "1. Personal CanLII API key required (BYOK): every applicant provides their own CanLII REST API " +
      "key on /demande. The key is verified directly with CanLII upon submission; the service " +
      "never falls back to an operator key.",
    "2. Email confirmation (30 minutes): submitting /demande sends a single-use confirmation link " +
      "from noreply@acces.poirierlavoie.ca, valid for 30 minutes. Unconfirmed applications expire " +
      "automatically without locking your Barreau member number.",
    "3. Bottin des avocats verification: active enrolment on the Roll of the Order is verified " +
      "manually before account activation. Once approved, you manage browser connections and " +
      "personal tokens (displayed once at creation) in /moi.",
  ],
)}
</section>

<section id="confidentialite">
${h2("confidentialite")}
${biP(
  [
    "Aucune journalisation du contenu des recherches : le service n'enregistre ni les lois, ni les " +
      "citations, ni les noms de parties ou extraits consultés par les connecteurs. Les journaux " +
      "d'exécution sont désactivés ; seuls des compteurs quotidiens par catégorie et des événements " +
      "techniques sans contenu (conservés au plus 90 jours) sont tenus.",
    "Protection de votre clé CanLII et contrôle du compte : votre clé API CanLII est chiffrée " +
      "par compte et déchiffrée en mémoire uniquement le temps d'un appel sortant vers CanLII. " +
      "Depuis /moi, vous pouvez la remplacer ou la retirer immédiatement, désactiver la recherche " +
      "vectorielle dans lois, exporter vos données personnelles (Loi 25) ou supprimer intégralement " +
      "votre compte (spécifications techniques de chiffrement et de conservation sur /conformite).",
  ],
  [
    "No logging of search content: the service never records the statutes, citations, party " +
      "names, or text excerpts queried through the connectors. Application execution logs are " +
      "disabled; only daily usage counts by category and content-free technical events (kept for " +
      "at most 90 days) are stored.",
    "Protection of your CanLII key and account control: your CanLII API key is stored encrypted " +
      "per account and decrypted in memory only during an outbound call to CanLII. From /moi, you " +
      "can replace or remove your key immediately, disable semantic vector search in lois, export " +
      "your personal data (Law 25), or permanently delete your account (full encryption and " +
      "retention specifications on /conformite).",
  ],
)}
</section>

<section id="gouvernance">
${h2("gouvernance", "h-gouvernance")}
<div class="tw" tabindex="0" role="region" aria-labelledby="h-gouvernance"><table><thead><tr>
<th scope="col">${bi("Document public", "Public document")}</th>
<th scope="col">${bi("Objet", "Purpose")}</th>
</tr></thead><tbody>
<tr><td><a href="/cgu"><code>/cgu</code></a></td><td>${bi("Conditions d'utilisation, licence Apache-2.0, usage professionnel, absence de SLA et rétablissement sous 5 jours ouvrables", "Terms of use, Apache-2.0 license, professional use, zero SLA, and 5-business-day reinstatement procedure")}</td></tr>
<tr><td><a href="/confidentialite"><code>/confidentialite</code></a></td><td>${bi("Politique de confidentialité (Loi 25), responsable des renseignements personnels et droits d'accès/suppression", "Privacy policy (Law 25), privacy officer, and access/erasure rights")}</td></tr>
<tr><td><a href="/attestation"><code>/attestation</code></a></td><td>${bi("Attestation solennelle d'inscription active au Barreau du Québec et de détention légitime d'une clé API CanLII", "Solemn attestation of active Barreau du Québec enrolment and legitimate CanLII API key holding")}</td></tr>
<tr><td><a href="/conformite"><code>/conformite</code></a></td><td>${bi("Fiche technique de conformité dérivée du code : sous-traitants, chiffrement et inventaire des 11 tables D1", "Code-derived compliance sheet: sub-processors, encryption, and 11-table D1 retention inventory")}</td></tr>
<tr><td><a href="/gouverne"><code>/gouverne</code></a></td><td>${bi("Registre public de gouverne dérivé du code : quotas journaliers, plafonds d'arête et états de compte", "Code-derived governance register: daily quotas, edge rate limits, and account states")}</td></tr>
</tbody></table></div>
<p><a href="https://github.com/jpoirierlavoie/MCP-Acces">github.com/jpoirierlavoie/MCP-Acces</a>
 · <a href="https://github.com/jpoirierlavoie/droit-civil-quebecois">droit-civil-quebecois</a>
 · <a href="mailto:${esc(COURRIEL_CONTACT_RESPONSABLE)}">${esc(COURRIEL_CONTACT_RESPONSABLE)}</a></p>
</section>

<footer>
${biP(
  [
    "Jason Poirier Lavoie, avocat (Québec). Code source sous licence Apache-2.0 (voir LICENSE et NOTICE) · Conditions du service hébergé : /cgu.",
    "Aucun conseil juridique. Ces connecteurs ne remplacent ni la vérification à la source, ni le jugement professionnel.",
  ],
  [
    "Jason Poirier Lavoie, Lawyer (Québec). Source code licensed under Apache-2.0 (see LICENSE and NOTICE) · Hosted service terms: /cgu.",
    "Not legal advice. These connectors replace neither primary-source verification nor professional judgment.",
  ],
)}
</footer>`;
}

const CORPS_ACCUEIL_MEMO = construireCorpsAccueil();

export function repondrePageAccueil(method: string): Response {
  return repondrePageHtml({
    titrePage: "MCP Accès — Admission et OAuth 2.1 (Barreau du Québec)",
    titrePageEn: "MCP Access — Admission & OAuth 2.1 (Barreau du Québec)",
    descriptionMeta:
      "Portail d'admission Barreau du Québec, coffre individuel CanLII BYOK et serveur d'autorisation OAuth 2.1 pour MCP Législation, MCP Jurisprudence et MCP Outils.",
    corpsHtml: CORPS_ACCUEIL_MEMO,
    sections: SECTIONS_ACCUEIL,
    bilingue: true,
    method,
    formAction: "'none'",
    cachePublicMaxAge: 600,
    urlCanonique: `${ORIGINE_PORTAIL_PAR_DEFAUT}/`,
    jsonLd: JSON_LD_ACCUEIL,
  });
}
