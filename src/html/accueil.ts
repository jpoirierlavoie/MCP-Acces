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
  { id: "connecteurs", fr: "Les 3 connecteurs et connexion", en: "The 3 connectors & setup" },
  { id: "admission", fr: "Comment obtenir l'accès", en: "How to apply" },
  { id: "confidentialite", fr: "Confidentialité et sécurité", en: "Privacy & security" },
  { id: "gouvernance", fr: "Gouvernance et documents", en: "Governance & documents" },
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
    "Portail d'accès gratuit de la suite « Droit civil québécois ». Il permet à votre assistant IA " +
      "(Claude, ChatGPT, Gemini ou Antigravity) de consulter directement le texte officiel des lois " +
      "et règlements (lois), de vérifier des citations dans CanLII (juris) et d'effectuer des calculs " +
      "et vérifications de greffe, de registres et de terminologie (outils) — plutôt que de répondre " +
      "de mémoire.",
    "Comment démarrer avec le greffon (installation par archive .zip ou place de marché) : " +
      "1) déposez votre demande sur /demande avec votre numéro du Barreau et votre clé API CanLII ; " +
      "2) installez le greffon droit-civil-quebecois dans votre assistant IA ; " +
      "3) cliquez sur « Connecter » pour autoriser l'accès via votre navigateur — sans code ni clé à recopier.",
  ],
  [
    "Free access portal for the « Québec Civil Law » suite. It connects your AI assistant " +
      "(Claude, ChatGPT, Gemini, or Antigravity) directly to official consolidated statutes and " +
      "regulations (lois), CanLII case-law citation checks (juris), and exact procedural, registry, " +
      "and terminology tools (outils) — instead of guessing from memory.",
    "How to get started with the plugin (.zip archive or marketplace install): " +
      "1) apply once on /demande using your Barreau member number and personal CanLII API key; " +
      "2) install the droit-civil-quebecois plugin in your AI app; " +
      "3) click Connect and sign in through your browser — no config files or secret keys to copy.",
  ],
)}
<div class="avert">
${biP(
  [
    "Service gratuit entre confrères, exploité par un avocat plaideur en exercice (Jason Poirier Lavoie), " +
      "fourni « TEL QUEL » et sans garantie de disponibilité continue. Chaque avocat demeure " +
      "exclusivement responsable de la vérification indépendante des textes législatifs consolidés " +
      "et du texte intégral officiel des jugements.",
  ],
  [
    "Free collegial service operated by a practising litigator (Jason Poirier Lavoie), provided " +
      '"AS IS" with no uptime guarantee. Each lawyer remains solely responsible for independent ' +
      "verification of consolidated statutes and full official judgment texts.",
  ],
)}
</div>
<p class="btns">
<a class="btn" href="/demande">${bi("Déposer une demande d'accès", "Apply for access")}</a>
<a class="btn-sec" href="#connecteurs">${bi("Explorer les 3 connecteurs", "Explore the 3 connectors")}</a>
<a class="btn-sec" href="/moi">${bi("Gérer mon compte (/moi)", "Manage my account (/moi)")}</a>
</p>
</header>

<section id="admissibilite">
${h2("admissibilite")}
${biP(
  [
    "L'accès aux connecteurs Législation (lois) et Jurisprudence (juris) est réservé gratuitement aux " +
      "avocats inscrits actifs et en règle au Tableau de l'Ordre du Barreau du Québec. Le connecteur " +
      "complémentaire Outils (outils — délais C.p.c., intérêts art. 1619 C.c.Q., greffes, palais, " +
      "registres d'entreprises et terminologie) est public et utilisable sans compte.",
    "Le code source de l'ensemble de la suite est libre et gratuit sous licence ouverte Apache-2.0 " +
      "(accompagnée du fichier NOTICE reconnaissant les sources officielles et données ouvertes sans " +
      "revendication de propriété). Les membres admis du Barreau du Québec peuvent utiliser les " +
      "connecteurs gratuitement au sein de leur pratique, y compris dans leurs mandats clients, " +
      "conformément aux /cgu et aux conditions des éditeurs officiels.",
  ],
  [
    "Access to the Legislation (lois) and Case Law (juris) connectors is reserved free of charge for " +
      "lawyers actively enrolled in good standing on the Roll of the Barreau du Québec. The companion " +
      "Tools connector (outils — C.C.P. deadlines, art. 1619 C.C.Q. interest, court registries, " +
      "courthouses, business registries, and terminology) is public and requires no account.",
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
  [
    "La suite associe le greffon d'instructions « droit-civil-quebecois » (guides par étape, gabarits " +
      "et règles déontologiques) à trois connecteurs spécialisés que votre assistant IA interroge " +
      "automatiquement en cours de session :",
  ],
  [
    "The suite pairs the « droit-civil-quebecois » guidance plugin (step-by-step checklists, " +
      "drafting templates, and ethical safeguards) with three specialized connectors that your AI " +
      "assistant queries automatically during a session:",
  ],
)}
<div class="grille-cartes">
${carteConnecteur({
  titreFr: "Législation (lois)",
  titreEn: "Legislation (lois)",
  badgeFr: "Barreau du Québec · 10 outils",
  badgeEn: "Barreau du Québec · 10 tools",
  descFr:
    "Texte officiel mot pour mot des lois et règlements du Québec et du Canada, directives de pratique " +
    "des tribunaux et textes AMF, avec table des matières complète et recherche dans les articles.",
  descEn:
    "Official word-for-word text of Québec and federal statutes and regulations, court practice " +
    "directives, and AMF texts, with full structure and article search.",
  url: "https://legislation.poirierlavoie.ca/",
  ctaFr: "Voir Législation →",
  ctaEn: "View Legislation →",
})}
${carteConnecteur({
  titreFr: "Jurisprudence (juris)",
  titreEn: "Case Law (juris)",
  badgeFr: "Barreau · Votre clé CanLII · 12 outils",
  badgeEn: "Barreau · Your CanLII key · 12 tools",
  descFr:
    "Vérification fiable de citations jurisprudentielles, fiches officielles, listes " +
    "d'autorités dispensées de reproduction et citateur issus de CanLII (liens directs vers les décisions).",
  descEn:
    "Reliable case-citation verification, official decision records, courts' " +
    "exempt-authorities lists, and citator backed by CanLII's collection (with direct links to full decisions).",
  url: "https://jurisprudence.poirierlavoie.ca/",
  ctaFr: "Voir Jurisprudence →",
  ctaEn: "View Case Law →",
})}
${carteConnecteur({
  titreFr: "Outils (outils)",
  titreEn: "Tools (outils)",
  badgeFr: "Public sans compte · 15 outils",
  badgeEn: "Public, no account · 15 tools",
  descFr:
    "Calculateurs exacts (délais C.p.c., intérêts art. 1619 C.c.Q., taux BdC, IPC, loyer TAL), " +
    "numéros de dossier, palais de justice, registres (REQ/GLEIF), adresses civiques et terminologie bijuridique.",
  descEn:
    "Exact calculators (C.C.P. deadlines, art. 1619 C.C.Q. interest, BoC rates, CPI, TAL rent), " +
    "court file numbers, courthouses, corporate registries (REQ/GLEIF), civic addresses, and bijural terminology.",
  url: "https://outils.poirierlavoie.ca/",
  ctaFr: "Voir Outils →",
  ctaEn: "View Tools →",
})}
</div>
${biP(
  [
    "Connexion dans Claude, ChatGPT, Gemini ou Antigravity : une fois votre compte approuvé, cliquez " +
      "simplement sur « Connecter » dans votre assistant IA (ou connectez les adresses de la suite " +
      "dans les réglages) et ouvrez votre session via votre navigateur — aucune clé technique à copier.",
  ],
  [
    "Connecting in Claude, ChatGPT, Gemini, or Antigravity: once your account is approved, simply " +
      "click Connect in your AI app (or add the suite URLs in settings) and sign in through your " +
      "browser — no technical keys to copy into files.",
  ],
)}
<details>
<summary>${bi("Détails techniques de connexion (OAuth 2.1, scripts et ligne de commande)", "Technical connection details (OAuth 2.1, scripts & CLI)")}</summary>
${biP(
  [
    "Les connecteurs proposent deux points d'entrée donnant accès aux mêmes outils : la connexion " +
      "interactive par navigateur OAuth 2.1 (/mcp/oauth, utilisée par défaut dans Claude, ChatGPT, " +
      "Google Antigravity et Gemini) et l'accès par jeton personnel (/mcp) destiné aux outils en " +
      "ligne de commande, aux scripts automatisés et à l'API Gemini Deep Research.",
    "Adresses des connecteurs : https://legislation.poirierlavoie.ca/mcp/oauth (lois), " +
      "https://jurisprudence.poirierlavoie.ca/mcp/oauth (juris) et " +
      "https://outils.poirierlavoie.ca/mcp (outils, sans authentification).",
  ],
  [
    "Two connection endpoints expose the same tools: browser-based OAuth 2.1 authorization " +
      "(/mcp/oauth, default in Claude, ChatGPT, Google Antigravity, and Gemini) and personal token " +
      "access (/mcp) for command-line tools, automated scripts, and Gemini API Deep Research.",
    "Connector URLs: https://legislation.poirierlavoie.ca/mcp/oauth (lois), " +
      "https://jurisprudence.poirierlavoie.ca/mcp/oauth (juris), and " +
      "https://outils.poirierlavoie.ca/mcp (outils, unauthenticated).",
  ],
)}
</details>
<p><a href="https://github.com/jpoirierlavoie/droit-civil-quebecois">${bi("Greffon d'instructions droit-civil-quebecois (10 compétences, 59 feuilles de référence, archive .zip sur GitHub Releases)", "Guidance plugin droit-civil-quebecois (10 skills, 59 reference sheets, .zip archive on GitHub Releases)")}</a></p>
</section>

<section id="admission">
${h2("admission")}
${biP(
  [
    "1. Préparer votre propre clé API CanLII (gratuite) : chaque avocat fournit sa propre clé API " +
      "CanLII (ou celle de son cabinet). Vous pouvez demander une clé gratuitement auprès de CanLII " +
      "(sur canlii.org, rubrique API / formulaire de contact). La clé est vérifiée auprès de CanLII " +
      "dès l'envoi ; le service n'utilise jamais la clé d'un tiers ni de l'exploitant à votre place.",
    "2. Déposer votre demande sur /demande et confirmer votre courriel (30 minutes) : vous recevez " +
      "un lien à usage unique de noreply@acces.poirierlavoie.ca, valable 30 minutes. Sans confirmation, " +
      "la demande expire simplement sans bloquer votre numéro du Barreau.",
    "3. Vérification au Bottin des avocats et utilisation : votre inscription active au Tableau de " +
      "l'Ordre est vérifiée manuellement. Dès la réception du courriel d'approbation, connectez " +
      "directement les connecteurs dans Claude, ChatGPT ou Gemini en vous authentifiant dans votre " +
      "navigateur (l'espace /moi permet ensuite de gérer votre clé CanLII, vos préférences ou " +
      "d'éventuels jetons de script).",
  ],
  [
    "1. Prepare your own CanLII API key (free): every applicant provides their own personal or firm " +
      "CanLII REST API key. You can request a free key directly from CanLII (on canlii.org under " +
      "API / Contact). The key is verified with CanLII upon submission; the service never falls back " +
      "to the operator's key.",
    "2. Apply on /demande and confirm your email (30 minutes): submitting sends a single-use link " +
      "from noreply@acces.poirierlavoie.ca valid for 30 minutes. Unconfirmed applications expire " +
      "automatically without locking your Barreau number.",
    "3. Bottin des avocats check and sign-in: active enrolment on the Roll of the Order is verified " +
      "manually. As soon as your approval email arrives, simply sign in through your browser from " +
      "Claude, ChatGPT, or Gemini (you can also visit /moi anytime to update your CanLII key, search " +
      "preferences, or optional script tokens).",
  ],
)}
</section>

<section id="confidentialite">
${h2("confidentialite")}
${biP(
  [
    "Aucune journalisation de vos recherches : le service n'enregistre ni les lois, ni les " +
      "citations, ni les noms de parties ou extraits consultés par vos assistants. Les journaux " +
      "d'exécution du serveur sont désactivés ; seuls des compteurs globaux par jour (sans contenu) " +
      "et des événements techniques (conservés au plus 90 jours) sont tenus pour protéger la disponibilité.",
    "Protection de votre clé CanLII et contrôle total dans /moi : votre clé API CanLII est chiffrée " +
      "séparément pour votre compte et n'est déchiffrée en mémoire que le temps d'un appel vers CanLII. " +
      "Depuis /moi, vous pouvez la remplacer ou la retirer immédiatement, choisir si la recherche " +
      "dans lois inclut la recherche par sens assistée par IA (ou s'en tient aux mots exacts), " +
      "exporter vos données (Loi 25) ou supprimer définitivement votre compte.",
  ],
  [
    "Zero logging of your searches: the service never records the statutes, citations, party names, " +
      "or text excerpts queried through your AI assistants. Server execution logs are disabled; only " +
      "daily aggregate usage counts (with no search content) and technical events (kept at most " +
      "90 days) are stored to keep the service reliable.",
    "Protection of your CanLII key and full control in /moi: your CanLII API key is encrypted per " +
      "account and decrypted in memory only during an outbound call to CanLII. In /moi, you can " +
      "replace or remove it anytime, choose whether statute search uses AI meaning-based matching " +
      "(or exact words only), export your personal data (Law 25), or permanently delete your account.",
  ],
)}
</section>

<section id="gouvernance">
${h2("gouvernance", "h-gouvernance")}
<div class="tw" tabindex="0" role="region" aria-labelledby="h-gouvernance"><table><thead><tr>
<th scope="col">${bi("Document public", "Public document")}</th>
<th scope="col">${bi("Objet", "Purpose")}</th>
</tr></thead><tbody>
<tr><td><a href="/cgu"><code>/cgu</code></a></td><td>${bi("Conditions d'utilisation : licence libre Apache-2.0, usage en cabinet, absence de garantie de disponibilité et révision sous 5 jours ouvrables", "Terms of use: Apache-2.0 open-source license, law-practice use, no uptime guarantee, and 5-business-day review procedure")}</td></tr>
<tr><td><a href="/confidentialite"><code>/confidentialite</code></a></td><td>${bi("Politique de confidentialité (Loi 25), responsable des renseignements personnels et droits d'exportation et de suppression", "Privacy policy (Law 25), privacy officer, and data export/erasure rights")}</td></tr>
<tr><td><a href="/attestation"><code>/attestation</code></a></td><td>${bi("Attestation d'inscription active au Barreau du Québec et de détention légitime d'une clé API CanLII", "Solemn attestation of active Barreau du Québec enrolment and legitimate CanLII API key holding")}</td></tr>
<tr><td><a href="/conformite"><code>/conformite</code></a></td><td>${bi("Fiche technique de sécurité : sous-traitants, chiffrement de la clé CanLII et durées de conservation des données", "Technical compliance sheet: sub-processors, CanLII key encryption, and data retention schedule")}</td></tr>
<tr><td><a href="/gouverne"><code>/gouverne</code></a></td><td>${bi("Règles de fonctionnement : plafonds quotidiens d'utilisation, protection anti-surcharge et états de compte", "Governance register: daily usage limits, overload protection, and account states")}</td></tr>
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
    titrePage: "MCP Accès — Droit civil québécois (Barreau du Québec)",
    titrePageEn: "MCP Access — Québec Civil Law (Barreau du Québec)",
    descriptionMeta:
      "Portail d'accès pour les membres du Barreau du Québec : connecteurs officiels de législation, vérification CanLII et outils de pratique civile.",
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
