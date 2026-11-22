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
      license: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
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
    "Portail d'admission, coffre individuel de clés API CanLII et serveur d'autorisation OAuth 2.1 " +
      "pour les connecteurs MCP Législation et Jurisprudence réservés aux membres actifs en règle " +
      "du Barreau du Québec.",
  ],
  [
    "Admission portal, individual BYOK CanLII API key vault, and OAuth 2.1 authorization server " +
      "for the Legislation and Case Law MCP connectors reserved for active members in good standing " +
      "of the Barreau du Québec.",
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
<a class="btn-sec" href="/moi">${bi("Console libre-service (/moi)", "Self-service console (/moi)")}</a>
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
    "Conformément à l'Autorisation complémentaire de pratique professionnelle du droit accompagnant " +
      "la licence CC BY-NC-SA 4.0, les membres admis peuvent employer les connecteurs au sein de " +
      "leurs mandats clients rémunérés, à l'exclusion stricte de toute revente commerciale, offre " +
      "SaaS ou encapsulation LegalTech.",
  ],
  [
    "Access to the authenticated MCP Legislation (lois) and MCP Case Law (juris) connectors is " +
      "strictly reserved for lawyers actively enrolled in good standing on the Roll of the Barreau " +
      "du Québec. The companion MCP Tools connector (outils — C.C.P. deadlines, art. 1619 C.C.Q. " +
      "interest, court registries, and terminology) remains public and unauthenticated.",
    "Under the Companion Professional Legal Practice Grant accompanying the CC BY-NC-SA 4.0 license, " +
      "admitted members may use the connectors within fee-bearing client mandates, strictly excluding " +
      "any commercial resale, SaaS offering, or LegalTech wrapping.",
  ],
)}
</section>

<section id="connecteurs">
${h2("connecteurs")}
${biP(
  [
    "Évaluez librement le périmètre, les schémas d'outils et les garanties de chaque connecteur avant " +
      "de déposer une demande d'accès — et testez dès maintenant le connecteur public Outils sans compte :",
  ],
  [
    "Freely inspect the scope, tool schemas, and safeguards of each connector before applying for " +
      "access — and test the public Tools connector right away with no account:",
  ],
)}
<div class="grille-cartes">
${carteConnecteur({
  titreFr: "MCP Législation (lois)",
  titreEn: "MCP Legislation (lois)",
  badgeFr: "Barreau du Québec · 10 outils",
  badgeEn: "Barreau du Québec · 10 tools",
  descFr:
    "Texte officiel verbatim des lois et règlements du Québec et du Canada, directives de pratique " +
    "des tribunaux et textes AMF, hiérarchie complète et repérage hybride.",
  descEn:
    "Official verbatim text of Québec and federal statutes and regulations, court practice " +
    "directives, and AMF texts, with full hierarchy and hybrid retrieval.",
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
  ctaFr: "Explorer et essayer Outils →",
  ctaEn: "Explore & try Tools now →",
})}
</div>
${biP(
  [
    "Les connecteurs prennent en charge deux montures complémentaires sur le même registre de 32 " +
      "outils : la monture OAuth 2.1 par défaut /mcp/oauth (PKCE S256 obligatoire, RFC 9728 / " +
      "RFC 8414 et inscription dynamique RFC 7591 sans état) permet l'auto-connexion sans clé " +
      "manuelle dans Claude Code, Claude Desktop, claude.ai, Google Antigravity, Gemini CLI, " +
      "Gemini App et Vertex AI Gemini Enterprise, tandis que la monture directe /mcp (jeton opaque " +
      "Bearer, ?key= ou segment de chemin, refus uniforme 404 sans oracle) demeure active pour " +
      "l'exécution automatisée sans navigateur (CLI/CI) et l'API Gemini Deep Research.",
  ],
  [
    "The connectors support two complementary mounts over the same 32-tool registry: the default " +
      "OAuth 2.1 mount /mcp/oauth (mandatory PKCE S256, RFC 9728 / RFC 8414, and stateless " +
      "RFC 7591 dynamic client registration) enables zero-config auto-connection in Claude Code, " +
      "Claude Desktop, claude.ai, Google Antigravity, Gemini CLI, Gemini App, and Vertex AI Gemini " +
      "Enterprise, while the direct /mcp mount (opaque Bearer, ?key=, or path token, uniform 404 " +
      "refusal with zero oracle) remains active for headless CLI/CI automation and Gemini API Deep Research.",
  ],
)}
<p><a href="https://github.com/jpoirierlavoie/droit-civil-quebecois">${bi("Greffon cadre droit-civil-quebecois (10 compétences, 59 feuilles de référence)", "Umbrella plugin droit-civil-quebecois (10 skills, 59 reference sheets)")}</a></p>
</section>

<section id="admission">
${h2("admission")}
${biP(
  [
    "1. Clé API CanLII individuelle obligatoire (BYOK) : chaque demandeur fournit sa propre clé " +
      "REST API CanLII dès /demande. La clé est éprouvée en direct contre caseBrowse/fr/ avant " +
      "toute mise en file ; il n'existe aucune retombée sur une clé de l'exploitant.",
    "2. Sas anti-squattage et confirmation du courriel : la demande initiale est placée dans un sas " +
      "temporaire de 30 minutes sans bloquer votre numéro du Barreau tant que le lien envoyé par " +
      "noreply@acces.poirierlavoie.ca n'a pas été confirmé.",
    "3. Vérification humaine au Bottin des avocats : l'exploitant vérifie manuellement l'inscription " +
      "active au Tableau de l'Ordre avant d'activer le compte. Une fois approuvé, vous frappez vos " +
      "jetons (affichés une seule fois) ou autorisez vos clients OAuth 2.1 dans /moi.",
  ],
  [
    "1. Mandatory individual CanLII API key (BYOK): every applicant supplies their own CanLII REST " +
      "API key on /demande. The key is probed live against caseBrowse/fr/ before queuing; there is " +
      "never any fallback to an operator key.",
    "2. Anti-squatting staging & email confirmation: unconfirmed applications are held in a 30-minute " +
      "staging table without locking your Barreau number until the confirmation link sent from " +
      "noreply@acces.poirierlavoie.ca is confirmed.",
    "3. Manual Bottin des avocats check: the operator manually verifies active enrolment on the Roll " +
      "of the Order before activating the account. Once approved, you mint your tokens (shown once) " +
      "or authorize your OAuth 2.1 clients in /moi.",
  ],
)}
</section>

<section id="confidentialite">
${h2("confidentialite")}
${biP(
  [
    "Zéro journalisation du contenu des recherches : aucune table de requêtes n'existe dans " +
      "mcp-identite, et les journaux d'invocation Cloudflare (observability / invocation_logs) sont " +
      "désactivés. Seuls des compteurs journaliers par classe et des événements techniques sans " +
      "contenu tronqués à la minute UTC (rétention maximale de 90 jours) sont tenus.",
    "Votre clé CanLII est scellée par enveloppe cryptographique (HKDF-SHA256 + AES-256-GCM avec " +
      "donnée authentifiée liée à votre identifiant) et n'est déchiffrée qu'en fermeture mémoire " +
      "éphémère lors d'un appel sortant. Vous pouvez la faire tourner, la retirer immédiatement, " +
      "désactiver la recherche vectorielle hybride (Workers AI), exporter vos données Loi 25 ou " +
      "supprimer intégralement votre compte depuis /moi.",
  ],
  [
    "Zero query-content logging: no search query table exists in mcp-identite, and Cloudflare " +
      "invocation logs (observability / invocation_logs) are disabled. Only daily class counters and " +
      "content-free technical events truncated to the UTC minute (90-day maximum retention) are kept.",
    "Your CanLII key is envelope-encrypted (HKDF-SHA256 + AES-256-GCM with AAD bound to your " +
      "account ID) and is only decrypted inside an ephemeral closure for outbound calls. You can " +
      "rotate it, remove it immediately, opt out of Workers AI hybrid vector search, export your " +
      "Law 25 personal data, or permanently erase your account from /moi.",
  ],
)}
</section>

<section id="gouvernance">
${h2("gouvernance", "h-gouvernance")}
<div class="tw" tabindex="0" role="region" aria-labelledby="h-gouvernance"><table><thead><tr>
<th scope="col">${bi("Document public", "Public document")}</th>
<th scope="col">${bi("Objet", "Purpose")}</th>
</tr></thead><tbody>
<tr><td><a href="/cgu"><code>/cgu</code></a></td><td>${bi("Conditions d'utilisation, autorisation de pratique professionnelle, absence de SLA et rétablissement sous 5 jours ouvrables", "Terms of use, professional practice grant, zero SLA, and 5-business-day reinstatement procedure")}</td></tr>
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
    "Jason Poirier Lavoie, avocat (Québec). Licence CC BY-NC-SA 4.0 + Autorisation complémentaire de pratique professionnelle du droit.",
    "Aucun conseil juridique. Ces connecteurs ne remplacent ni la vérification à la source, ni le jugement professionnel.",
  ],
  [
    "Jason Poirier Lavoie, Lawyer (Québec). CC BY-NC-SA 4.0 License + Companion Professional Legal Practice Grant.",
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
