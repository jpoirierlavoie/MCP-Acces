/**
 * Les cinq documents publics de gouvernance et de conformité de `acces.poirierlavoie.ca` (`SPEC §10`) :
 *   1. `/cgu` — Conditions générales d'utilisation & Autorisation de pratique professionnelle ;
 *   2. `/confidentialite` — Politique de confidentialité conforme à la Loi 25 ;
 *   3. `/attestation` — Attestation solennelle d'inscription au Barreau et de clé CanLII ;
 *   4. `/conformite` — Fiche technique de conformité DÉRIVÉE DU CODE (`POLITIQUES_RETENTION_IDENTITE`, `S20`, `G18`) ;
 *   5. `/gouverne` — Registre de gouverne DÉRIVÉ DU CODE (`QUOTAS_ACTIF_PAR_DEFAUT`, `QUOTAS_LIMITE_PAR_DEFAUT`, `S20`).
 */

import {
  DUREE_CODE_OAUTH_SECONDES,
  DUREE_DEMANDE_ACCES_MINUTES,
  DUREE_LIEN_PORTAIL_MINUTES,
  DUREE_SESSION_MOI_HEURES,
  ETATS_TITULAIRE,
  POLITIQUES_RETENTION_IDENTITE,
  QUOTAS_ACTIF_PAR_DEFAUT,
  QUOTAS_LIMITE_PAR_DEFAUT,
  RETENTION_COMPTEURS_JOURS,
  RETENTION_EVENEMENTS_JOURS,
} from "@poirierlavoie/mcp-socle";
import {
  COURRIEL_CONTACT_RESPONSABLE,
  DELAI_RETABLISSEMENT_JOURS_OUVRABLES,
  MOTIFS_GOUVERNE,
  ORIGINE_PORTAIL_PAR_DEFAUT,
  PLAFONDS_DEBIT_ARETE,
  VERSION_ATTESTATION,
  VERSION_CGU,
  VERSION_CONFIDENTIALITE,
} from "../constantes";
import { barreSuite, bi, biP, boutonsEntete, esc, repondrePageHtml } from "./gabarit";

export const CHEMINS_DOCUMENTS_GOUVERNANCE = [
  "/cgu",
  "/confidentialite",
  "/attestation",
  "/conformite",
  "/gouverne",
] as const;

export type CheminDocumentGouvernance = (typeof CHEMINS_DOCUMENTS_GOUVERNANCE)[number];

function barreNavigationPublique(): string {
  return `<p class="m"><a href="/">${bi("Accueil", "Home")}</a> · <a href="/demande">/demande</a> · <a href="/moi">/moi</a> · <a href="/cgu">/cgu</a> · <a href="/confidentialite">/confidentialite</a> · <a href="/attestation">/attestation</a> · <a href="/conformite">/conformite</a> · <a href="/gouverne">/gouverne</a></p>`;
}

function piedDocument(): string {
  return `<footer>
${barreNavigationPublique()}
${biP(
  [`Jason Poirier Lavoie, avocat (Québec) · Contact : ${COURRIEL_CONTACT_RESPONSABLE}`],
  [`Jason Poirier Lavoie, Lawyer (Québec) · Contact: ${COURRIEL_CONTACT_RESPONSABLE}`],
)}
</footer>`;
}

function construireCgu(): { titre: string; titreEn: string; desc: string; corps: string } {
  const corps = `<header>
${barreSuite(true, false)}
<div class="bar">
<h1>${bi("Conditions générales d'utilisation (/cgu)", "Terms of Use (/cgu)")}</h1>
${boutonsEntete(true)}
</div>
<p class="m">${bi(`Version en vigueur : ${VERSION_CGU}`, `Effective version: ${VERSION_CGU}`)}</p>
${barreNavigationPublique()}
</header>

<section id="pratique">
<h2>${bi("1. Licence CC BY-NC-SA 4.0 et Autorisation complémentaire de pratique professionnelle du droit", "1. CC BY-NC-SA 4.0 License & Companion Professional Legal Practice Grant")}</h2>
${biP(
  [
    "Le code source de l'infrastructure MCP (MCP-Socle, MCP-Acces, MCP-Legislation, MCP-Jurisprudence, " +
      "MCP-Outils et le greffon droit-civil-quebecois) est publié sous licence Creative Commons " +
      "Attribution - Pas d'Utilisation Commerciale - Partage dans les Mêmes Conditions 4.0 International " +
      "(identifiant SPDX : CC-BY-NC-SA-4.0).",
    "Conformément aux sections 6(c) et 7(b) de la licence CC BY-NC-SA 4.0, le concédant (Jason Poirier " +
      "Lavoie, avocat) accorde séparément et à titre gratuit aux membres actifs en règle inscrits au " +
      "Tableau de l'Ordre du Barreau du Québec (ainsi qu'aux membres de leur cabinet agissant sous leur " +
      "supervision professionnelle directe) l'autorisation d'utiliser ces logiciels et les connecteurs " +
      "hébergés dans le cours normal de l'exercice professionnel du droit, y compris au sein de mandats " +
      "clients rémunérés.",
    "Demeurent strictement interdits sans entente écrite distincte : toute revente commerciale, " +
      "sous-licence payante, offre logicielle commerciale (« SaaS » ou « LegalTech »), encapsulation " +
      "tarifée, moissonnage de masse ou redistribution contre rémunération à des tiers.",
  ],
  [
    "The MCP infrastructure source code (MCP-Socle, MCP-Acces, MCP-Legislation, MCP-Jurisprudence, " +
      "MCP-Outils, and the droit-civil-quebecois plugin) is published under the Creative Commons " +
      "Attribution-NonCommercial-ShareAlike 4.0 International License (SPDX: CC-BY-NC-SA-4.0).",
    "Pursuant to Sections 6(c) and 7(b) of CC BY-NC-SA 4.0, the Licensor (Jason Poirier Lavoie, Lawyer) " +
      "separately and gratuitously grants active members in good standing of the Barreau du Québec " +
      "(and supervised members of their firm) permission to use this software and the hosted connectors " +
      "in the ordinary course of practising law, including within fee-bearing client mandates.",
    "Strictly prohibited without a separate written agreement: any commercial resale, paid sublicensing, " +
      "commercial SaaS or LegalTech wrapping, fee-gated hosting, bulk harvesting, or commercial " +
      "redistribution to third parties.",
  ],
)}
</section>

<section id="divulgation">
<h2>${bi("2. Divulgation du statut d'avocat plaideur de l'exploitant", "2. Practising-Litigator Operator Disclosure")}</h2>
${biP(
  [
    "Le présent portail et les connecteurs associés sont exploités à titre confraternel par Me Jason " +
      "Poirier Lavoie, avocat plaideur en exercice au Québec, susceptible d'agir dans des dossiers " +
      "impliquant d'autres membres du Barreau. L'architecture technique est conçue en conséquence : " +
      "aucune requête de recherche, aucun argument d'outil MCP et aucun secret en clair n'est " +
      "enregistré, conformément aux garanties vérifiables détaillées sur /conformite.",
    "L'usager s'interdit néanmoins d'inclure tout renseignement couvert par le secret professionnel " +
      "identifiant un client ou une partie dans les champs de recherche libre ou lors de l'emploi " +
      "d'agents autonomes couplés à la recherche web ouverte.",
  ],
  [
    "This portal and its associated connectors are operated collegially by Me Jason Poirier Lavoie, " +
      "an active practising litigator in Québec who may act in matters involving other Barreau members. " +
      "The technical architecture is designed accordingly: no search query, no MCP tool argument, and " +
      "no plaintext secret is ever logged, as detailed and verified on /conformite.",
    "Users must nevertheless never include client-identifying privileged facts in free-text queries or " +
      "when invoking autonomous agents coupled with open-web search.",
  ],
)}
</section>

<section id="garantie">
<h2>${bi("3. Fourniture « TEL QUEL », absence totale de SLA et responsabilité professionnelle", '3. "AS IS" Provision, Zero SLA & Professional Responsibility')}</h2>
${biP(
  [
    "Les services hébergés sont fournis gratuitement, « TELS QUELS » et selon leur disponibilité, " +
      "sans aucune garantie expresse ou implicite d'exactitude, d'exhaustivité ou de continuité, et " +
      "sans aucun engagement de niveau de service (zéro SLA). L'exploitant peut suspendre la maintenance " +
      "ou mettre fin à l'hébergement moyennant un préavis raisonnable affiché sur la page d'accueil.",
    "Chaque avocat demeure seul et entièrement responsable de la vérification indépendante des textes " +
      "législatifs consolidés officiels, de la lecture intégrale des jugements (l'API de CanLII ne " +
      "fournissant que des métadonnées et jamais le texte intégral d'une décision) et du respect de " +
      "ses obligations déontologiques.",
  ],
  [
    'The hosted services are provided free of charge, "AS IS" and as available, without any express or ' +
      "implied warranty of accuracy, completeness, or continuity, and with zero service-level agreement " +
      "(zero SLA). The operator may suspend maintenance or discontinue hosting upon reasonable notice " +
      "posted on the home page.",
    "Each lawyer remains solely and exclusively responsible for independent verification of official " +
      "consolidated statutes, reading full official judgment texts (CanLII's API returns metadata only, " +
      "never full decision text), and complying with all professional ethical duties.",
  ],
)}
</section>

<section id="retablissement">
<h2>${bi(`4. Gouverne des comptes et voie écrite de rétablissement (${DELAI_RETABLISSEMENT_JOURS_OUVRABLES} jours ouvrables)`, `4. Account Governance & Written Reinstatement Procedure (${DELAI_RETABLISSEMENT_JOURS_OUVRABLES} Business Days)`)}</h2>
${biP(
  [
    "Tout changement d'état vers limite, suspendu ou revoque résulte d'une décision humaine motivée " +
      "consignée dans le registre de gouverne et notifiée par courriel au titulaire.",
    `Le titulaire visé peut transmettre ses observations écrites ou solliciter le rétablissement de son compte auprès de ${COURRIEL_CONTACT_RESPONSABLE}. L'exploitant s'engage à examiner la demande et à transmettre une réponse écrite motivée dans un délai maximal de ${DELAI_RETABLISSEMENT_JOURS_OUVRABLES} jours ouvrables.`,
  ],
  [
    "Any transition to limite, suspendu, or revoque is a human decision recorded with a closed reason " +
      "code in the governance log and notified by email to the account holder.",
    `The affected lawyer may submit written observations or request reinstatement by emailing ${COURRIEL_CONTACT_RESPONSABLE}. The operator will review the request and provide a reasoned written response within ${DELAI_RETABLISSEMENT_JOURS_OUVRABLES} business days.`,
  ],
)}
</section>
${piedDocument()}`;

  return {
    titre: "Conditions générales d'utilisation — MCP Accès",
    titreEn: "Terms of Use — MCP Access",
    desc: "Conditions d'utilisation, autorisation de pratique professionnelle du droit, absence de SLA et procédure de rétablissement.",
    corps,
  };
}

function construireConfidentialite(): {
  titre: string;
  titreEn: string;
  desc: string;
  corps: string;
} {
  const corps = `<header>
${barreSuite(true, false)}
<div class="bar">
<h1>${bi("Politique de confidentialité — Loi 25 (/confidentialite)", "Privacy Policy — Law 25 (/confidentialite)")}</h1>
${boutonsEntete(true)}
</div>
<p class="m">${bi(`Version en vigueur : ${VERSION_CONFIDENTIALITE}`, `Effective version: ${VERSION_CONFIDENTIALITE}`)}</p>
${barreNavigationPublique()}
</header>

<section id="responsable">
<h2>${bi("1. Responsable de la protection des renseignements personnels", "1. Person in Charge of the Protection of Personal Information")}</h2>
${biP(
  [
    `Conformément à la Loi sur la protection des renseignements personnels dans le secteur privé (RLRQ, c. P-39.1, « Loi 25 »), le responsable de la protection des renseignements personnels est Me Jason Poirier Lavoie, avocat (${COURRIEL_CONTACT_RESPONSABLE}).`,
  ],
  [
    `Pursuant to Québec's Act respecting the protection of personal information in the private sector (CQLR, c. P-39.1, "Law 25"), the person in charge of the protection of personal information is Me Jason Poirier Lavoie, Lawyer (${COURRIEL_CONTACT_RESPONSABLE}).`,
  ],
)}
</section>

<section id="collecte">
<h2>${bi("2. Renseignements recueillis et finalités exclusives", "2. Information Collected & Exclusive Purposes")}</h2>
${biP(
  [
    "Seuls sont recueillis les renseignements strictement nécessaires à la vérification de " +
      "l'admissibilité professionnelle et à la sécurité d'accès : nom, numéro de membre et section " +
      "régionale du Barreau du Québec, adresse courriel professionnelle, cabinet (facultatif) et " +
      "horodatages d'acceptation de l'attestation et des CGU. Sont également conservés la clé API " +
      "CanLII chiffrée par enveloppe (avec son repère masqué et son empreinte HMAC sous clé maître), " +
      "les empreintes SHA-256 des jetons émis, les compteurs journaliers par classe d'outil et les " +
      "événements techniques sans contenu tronqués à la minute UTC.",
    "Absence totale de collecte du contenu des recherches : ni le texte des requêtes juridiques, ni " +
      "les identifiants d'articles ou d'arrêts consultés, ni les arguments JSON-RPC ne sont enregistrés.",
  ],
  [
    "Only information strictly necessary for professional eligibility verification and access security " +
      "is collected: name, Barreau du Québec member number and regional section, professional email " +
      "address, firm name (optional), and attestation and ToU acceptance timestamps. Also stored are " +
      "the envelope-encrypted CanLII API key (with its masked hint and master-keyed HMAC fingerprint), " +
      "SHA-256 token hashes, daily tool-class counters, and content-free technical events truncated to " +
      "the UTC minute.",
    "Strict absence of query-content collection: neither legal search queries, nor consulted statute " +
      "or case identifiers, nor JSON-RPC arguments are ever recorded.",
  ],
)}
</section>

<section id="droits">
<h2>${bi("3. Droits d'accès, de portabilité, de retrait et de suppression (/moi)", "3. Access, Portability, Withdrawal & Erasure Rights (/moi)")}</h2>
${biP(
  [
    "Depuis le portail libre-service /moi, chaque titulaire exerce directement et sans délai ses " +
      "droits d'exportation intégrale en format structuré JSON et de révocation immédiate de tout jeton " +
      "d'accès. Il peut également y retirer ou remplacer sa clé API CanLII du coffre chiffré, désactiver " +
      "la recherche vectorielle hybride (Workers AI) ou supprimer définitivement en cascade son compte " +
      "et tous les enregistrements rattachés dans mcp-identite.",
  ],
  [
    "Directly within the /moi self-service portal, each account holder may immediately export their " +
      "personal records in structured JSON format and revoke any access token. They may also remove or " +
      "rotate their CanLII API key in the encrypted vault, opt out from Workers AI hybrid vector search, " +
      "or permanently erase their account and all linked records in mcp-identite.",
  ],
)}
</section>
${piedDocument()}`;

  return {
    titre: "Politique de confidentialité (Loi 25) — MCP Accès",
    titreEn: "Privacy Policy (Law 25) — MCP Access",
    desc: "Politique de confidentialité Loi 25, absence de journalisation du contenu des recherches et droits libre-service dans /moi.",
    corps,
  };
}

function construireAttestation(): {
  titre: string;
  titreEn: string;
  desc: string;
  corps: string;
} {
  const corps = `<header>
${barreSuite(true, false)}
<div class="bar">
<h1>${bi("Attestation solennelle du demandeur (/attestation)", "Applicant Solemn Attestation (/attestation)")}</h1>
${boutonsEntete(true)}
</div>
<p class="m">${bi(`Version en vigueur : ${VERSION_ATTESTATION}`, `Effective version: ${VERSION_ATTESTATION}`)}</p>
${barreNavigationPublique()}
</header>

<section id="declaration">
<h2>${bi("Déclaration d'admissibilité et d'usage conforme", "Eligibility & Compliant Use Declaration")}</h2>
${biP(
  [
    "En soumettant une demande d'accès sur /demande, le professionnel atteste solennellement ce qui suit :",
    "1. Inscription active en règle : Je suis actuellement inscrit(e) au Tableau de l'Ordre du Barreau " +
      "du Québec à titre d'avocat(e) en exercice actif et en règle, sans suspension ni limitation " +
      "incompatible, et je m'engage à cesser d'utiliser les connecteurs et à supprimer mon compte dans " +
      "/moi dès la cessation de mon inscription active.",
    "2. Détention légitime d'une clé API CanLII : Je détiens légitimement la clé REST API CanLII " +
      "soumise (à titre individuel ou avec l'autorisation expresse de mon cabinet), et je m'engage à " +
      "respecter les conditions d'utilisation de l'API de CanLII, notamment l'interdiction de tout " +
      "téléchargement massif automatisé.",
    "3. Confidentialité et vérification des sources : J'ai pris connaissance des conditions " +
      "d'utilisation (/cgu) et de la politique de confidentialité (/confidentialite), je n'inclurai " +
      "aucun fait identifiant un client dans une requête transmise à un planificateur web ouvert, et " +
      "je vérifierai systématiquement les sources primaires officielles avant tout acte professionnel.",
  ],
  [
    "By submitting an access application on /demande, the legal professional solemnly attests that:",
    "1. Active enrolment in good standing: I am currently enrolled on the Roll of the Order of the " +
      "Barreau du Québec as an active practising lawyer in good standing, and I undertake to cease " +
      "using the connectors and delete my account in /moi should my active enrolment end.",
    "2. Legitimate CanLII API key holding: I legitimately hold the submitted CanLII REST API key " +
      "(individually or with my firm's express authorization) and agree to comply with CanLII's API " +
      "Terms of Use, including the prohibition on automated bulk downloading.",
    "3. Confidentiality & primary-source verification: I have read the Terms of Use (/cgu) and " +
      "Privacy Policy (/confidentialite), will never include client-identifying facts in queries sent " +
      "to open-web planners, and will independently verify official primary sources before acting.",
  ],
)}
</section>
${piedDocument()}`;

  return {
    titre: "Attestation solennelle — MCP Accès",
    titreEn: "Applicant Solemn Attestation — MCP Access",
    desc: "Attestation solennelle d'inscription active en règle au Barreau du Québec et de détention légitime d'une clé API CanLII.",
    corps,
  };
}

function construireConformite(): {
  titre: string;
  titreEn: string;
  desc: string;
  corps: string;
} {
  const lignesRetention = POLITIQUES_RETENTION_IDENTITE.map(
    (p) => `<tr>
<td><code>${esc(p.table)}</code></td>
<td><code>${esc(p.mode)}</code></td>
<td>${esc(p.conservationMax)}</td>
<td><code>${esc(p.purgeCode)}</code></td>
</tr>`,
  ).join("");

  const corps = `<header>
${barreSuite(true, false)}
<div class="bar">
<h1>${bi("Fiche technique de conformité dérivée du code (/conformite)", "Code-Derived Technical Compliance Sheet (/conformite)")}</h1>
${boutonsEntete(true)}
</div>
${barreNavigationPublique()}
</header>

<section id="garanties">
<h2>${bi("1. Ce que l'exploitant ne peut techniquement pas lire", "1. What the Operator Technically Cannot Read")}</h2>
${biP(
  [
    "1. Aucun contenu de recherche : le schéma SQL est vérifié statiquement par " +
      "verifierSchemaSansContenuIdentifiant (portes G13 et G25), qui interdit search_log, forme_requete " +
      "et toute colonne de texte libre jointe à une identité ou à un horodatage sous-journalier.",
    "2. Observabilité Cloudflare désactivée : wrangler.jsonc maintient observability.enabled = false et " +
      "invocation_logs = false (porte G37) afin qu'aucune URL ni trace d'appel ne soit journalisée.",
    "3. Jetons opaques hachés : les jetons de 256 bits (43 caractères base64url) ne sont affichés " +
      "qu'une seule fois à leur émission ; seule leur empreinte SHA-256 réside en base.",
    "4. Coffre CanLII à fermeture stricte : chaque clé API CanLII est chiffrée via HKDF-SHA256 + " +
      "AES-256-GCM avec donnée additionnelle authentifiée (titulaireId:canlii:version) ; son repère " +
      "visuel et son empreinte de détection de doublon de cabinet sont dérivés par HMAC-SHA256 sous " +
      "clé maître (aucun condensé non salé hors ligne). ouvrirCoffre ne retourne jamais la clé en clair " +
      "et efface son tampon Uint8Array (fill(0)) dès la fermeture terminée (porte G10).",
  ],
  [
    "1. Zero search content: the SQL schema is statically verified by " +
      "verifierSchemaSansContenuIdentifiant (gates G13 and G25), forbidding search_log, forme_requete, " +
      "and any free-text column joined to an identity or sub-daily timestamp.",
    "2. Cloudflare observability disabled: wrangler.jsonc enforces observability.enabled = false and " +
      "invocation_logs = false (gate G37) so no URL or invocation trace is retained.",
    "3. Hashed opaque tokens: 256-bit tokens (43 base64url chars) are displayed only once upon " +
      "issuance; only their SHA-256 digest is stored in D1.",
    "4. Strict-closure CanLII vault: each CanLII API key is encrypted with HKDF-SHA256 + AES-256-GCM " +
      "and AAD bound to titulaireId:canlii:version; its masked hint and shared-firm-key badge digest " +
      "use master-keyed HMAC-SHA256 (zero unsalted offline hash). ouvrirCoffre never returns plaintext " +
      "and zeroes its temporary Uint8Array buffer (fill(0)) in a finally block (gate G10).",
  ],
)}
</section>

<section id="sous-traitants">
<h2>${bi("2. Sous-traitants technologiques et option hybride_permis", "2. Sub-Processors & hybride_permis Opt-Out")}</h2>
${biP(
  [
    "• Cloudflare Workers, D1 (région ENAM — Est de l'Amérique du Nord) et Vectorize : exécution sans " +
      "état et stockage de la base mcp-identite ainsi que des corpus publics.",
    "• Cloudflare Email Sending (noreply@acces.poirierlavoie.ca) : envoi exclusivement transactionnel " +
      "des liens de confirmation, liens magiques /moi, avis d'état de compte et alertes d'admission " +
      "confirmée à l'exploitant.",
    "• Cloudflare Workers AI (@cf/baai/bge-m3) : calcul d'empreinte vectorielle lors d'appels à " +
      "lois.search_text en mode hybride (activé par défaut : hybride_permis = 1). Chaque titulaire peut " +
      "désactiver cette option en un clic dans /moi (hybride_permis = 0), forçant alors la recherche " +
      "lexicale FTS5 purement locale sans appel à Workers AI (décision S19).",
    "• API REST de CanLII : interrogée uniquement par MCP-Jurisprudence lors d'un manqué du cache " +
      "partagé ou sur épreuve explicite, au moyen de la clé BYOK individuelle du titulaire.",
  ],
  [
    "• Cloudflare Workers, D1 (ENAM — Eastern North America), and Vectorize: stateless execution and " +
      "storage for mcp-identite and public legal corpora.",
    "• Cloudflare Email Sending (noreply@acces.poirierlavoie.ca): strictly transactional delivery of " +
      "confirmation links, /moi magic links, account status notices, and confirmed-application alerts " +
      "to the operator.",
    "• Cloudflare Workers AI (@cf/baai/bge-m3): query embedding computation when calling " +
      "lois.search_text in hybrid mode (enabled by default: hybride_permis = 1). Every lawyer can opt " +
      "out in one click inside /moi (hybride_permis = 0), forcing purely local FTS5 lexical search " +
      "with zero Workers AI calls (decision S19).",
    "• CanLII REST API: queried by MCP-Jurisprudence only on shared-cache misses or explicit key " +
      "probes, using the lawyer's own individual BYOK key.",
  ],
)}
</section>

<section id="retention">
<h2 id="h-retention">${bi(`3. Inventaire exhaustif des ${POLITIQUES_RETENTION_IDENTITE.length} tables de mcp-identite (S20, G18)`, `3. Exhaustive Inventory of All ${POLITIQUES_RETENTION_IDENTITE.length} Tables in mcp-identite (S20, G18)`)}</h2>
${biP(
  [
    `Ce tableau est généré dynamiquement depuis POLITIQUES_RETENTION_IDENTITE (@poirierlavoie/mcp-socle) et vérifié contre le schéma SQL réel par verifierCouvertureRetentionSchema : rétention maximale de ${RETENTION_EVENEMENTS_JOURS} jours sur evenement_technique, ${RETENTION_COMPTEURS_JOURS} jours sur compteur_jour, ${DUREE_DEMANDE_ACCES_MINUTES} minutes sur demande_acces, ${DUREE_LIEN_PORTAIL_MINUTES} minutes sur les liens de portail, ${DUREE_SESSION_MOI_HEURES} heures sur session_moi et ${DUREE_CODE_OAUTH_SECONDES} secondes sur code_oauth.`,
  ],
  [
    `This table is dynamically rendered from POLITIQUES_RETENTION_IDENTITE (@poirierlavoie/mcp-socle) and verified against the live SQL schema by verifierCouvertureRetentionSchema: maximum retention of ${RETENTION_EVENEMENTS_JOURS} days on evenement_technique, ${RETENTION_COMPTEURS_JOURS} days on compteur_jour, ${DUREE_DEMANDE_ACCES_MINUTES} minutes on portal links, ${DUREE_SESSION_MOI_HEURES} hours on session_moi, and ${DUREE_CODE_OAUTH_SECONDES} seconds on code_oauth.`,
  ],
)}
<div class="tw" tabindex="0" role="region" aria-labelledby="h-retention"><table><thead><tr>
<th scope="col">${bi("Table D1", "D1 Table")}</th>
<th scope="col">${bi("Régime", "Mode")}</th>
<th scope="col">${bi("Durée maximale de conservation (FR)", "Retention policy (canonical FR)")}</th>
<th scope="col">${bi("Routine de purge", "Purge routine")}</th>
</tr></thead><tbody>
${lignesRetention}
</tbody></table></div>
</section>
${piedDocument()}`;

  return {
    titre: "Fiche de conformité dérivée du code — MCP Accès",
    titreEn: "Code-Derived Compliance Sheet — MCP Access",
    desc: "Inventaire dérivé du code des 11 tables de mcp-identite, durées de rétention Loi 25, sous-traitants et garanties cryptographiques.",
    corps,
  };
}

function construireGouverne(): { titre: string; titreEn: string; desc: string; corps: string } {
  const lignesQuotas = (
    [
      [
        "local",
        QUOTAS_ACTIF_PAR_DEFAUT.local,
        QUOTAS_LIMITE_PAR_DEFAUT.local,
        "Outils lexicaux/structurels lois, outils juris hors réseau (parse_citation) et lectures servies à 100 % depuis le cache D1",
      ],
      [
        "sortant",
        QUOTAS_ACTIF_PAR_DEFAUT.sortant,
        QUOTAS_LIMITE_PAR_DEFAUT.sortant,
        "Tout appel d'outil juris déclenchant au moins une requête sortante vers l'API CanLII (manqué de cache)",
      ],
      [
        "semantique",
        QUOTAS_ACTIF_PAR_DEFAUT.semantique,
        QUOTAS_LIMITE_PAR_DEFAUT.semantique,
        "lois.search_text lorsque le mode vectoriel hybride (Workers AI) est exécuté (hybride_permis = 1)",
      ],
    ] as const
  )
    .map(
      ([classe, actif, limite, desc]) => `<tr>
<td><code>${esc(classe)}</code></td>
<td class="n"><strong>${actif.toLocaleString("fr-CA")}</strong> / jour UTC</td>
<td class="n"><strong>${limite.toLocaleString("fr-CA")}</strong> / jour UTC</td>
<td class="m">${esc(desc)}</td>
</tr>`,
    )
    .join("");

  const lignesDebit = PLAFONDS_DEBIT_ARETE.map(
    (r) => `<tr>
<td><code>${esc(r.worker)}</code></td>
<td><code>${esc(r.liaison)}</code></td>
<td class="n"><code>${esc(r.namespaceId)}</code></td>
<td><code>${esc(r.cle)}</code></td>
<td class="n">${r.limite} / ${r.periodeSec} s</td>
<td class="m">${esc(r.effet)}</td>
</tr>`,
  ).join("");

  const corps = `<header>
${barreSuite(true, false)}
<div class="bar">
<h1>${bi("Registre public de gouverne dérivé du code (/gouverne)", "Code-Derived Public Governance Register (/gouverne)")}</h1>
${boutonsEntete(true)}
</div>
${barreNavigationPublique()}
</header>

<section id="quotas">
<h2 id="h-quotas">${bi("1. Quotas journaliers UTC par classe d'outil (QUOTAS_ACTIF_PAR_DEFAUT / QUOTAS_LIMITE_PAR_DEFAUT)", "1. Daily UTC Quotas by Tool Class (QUOTAS_ACTIF_PAR_DEFAUT / QUOTAS_LIMITE_PAR_DEFAUT)")}</h2>
${biP(
  [
    "Les valeurs ci-dessous proviennent directement des constantes exécutées par les Workers " +
      "(décision S20). Tout dépassement retourne un message structuré [QUOTA_EPUISE] en HTTP 200 " +
      "(isError: true) lisible par l'agent, avec réinitialisation automatique à 00:00 UTC.",
  ],
  [
    "The figures below come directly from the live constants enforced by the Workers (decision S20). " +
      "Exceeding a daily quota returns a structured [QUOTA_EPUISE] tool error over HTTP 200 " +
      "(isError: true), automatically resetting at 00:00 UTC.",
  ],
)}
<div class="tw" tabindex="0" role="region" aria-labelledby="h-quotas"><table><thead><tr>
<th scope="col">${bi("Classe", "Class")}</th>
<th scope="col" class="n">${bi("État actif / surveille", "actif / surveille state")}</th>
<th scope="col" class="n">${bi("État limite", "limite state")}</th>
<th scope="col">${bi("Périmètre exact", "Exact scope")}</th>
</tr></thead><tbody>
${lignesQuotas}
</tbody></table></div>
</section>

<section id="debit">
<h2 id="h-debit">${bi("2. Limiteurs de débit d'arête et isolation Deep Research (S15, G34)", "2. Edge Rate Limiters & Deep Research Shared-IP Isolation (S15, G34)")}</h2>
${biP(
  [
    "Afin que les rafales parallèles de Claude Research et Gemini Deep Research depuis des adresses IP " +
      "infonuagiques partagées ne pénalisent jamais les confrères authentifiés, la quarantaine IP " +
      "(20/min) n'est imputée qu'en cas d'échec d'authentification, avec laissez-passer pré-D1 des " +
      "empreintes SHA-256 actives.",
  ],
  [
    "So parallel bursts from Claude Research and Gemini Deep Research over shared cloud egress IPs " +
      "never penalize authenticated colleagues, the 20/min IP quarantine is charged solely on " +
      "authentication failures, backed by a pre-D1 pass for recently verified SHA-256 token digests.",
  ],
)}
<div class="tw" tabindex="0" role="region" aria-labelledby="h-debit"><table><thead><tr>
<th scope="col">Worker</th>
<th scope="col">${bi("Liaison", "Binding")}</th>
<th scope="col" class="n">namespace_id</th>
<th scope="col">${bi("Clé", "Key")}</th>
<th scope="col" class="n">${bi("Plafond", "Limit")}</th>
<th scope="col">${bi("Effet", "Effect")}</th>
</tr></thead><tbody>
${lignesDebit}
</tbody></table></div>
</section>

<section id="etats">
<h2>${bi("3. États de compte, motifs fermés et absence de coupure algorithmique", "3. Account States, Closed Motives & Human Review")}</h2>
${biP(
  [
    `États possibles (${ETATS_TITULAIRE.length}) : ${ETATS_TITULAIRE.join(", ")}. Seuls les états actif, surveille et limite sont servis par les connecteurs MCP.`,
    `Motifs fermés consignés en ajout seul dans registre_gouverne (${MOTIFS_GOUVERNE.length}) : ${MOTIFS_GOUVERNE.join(", ")}.`,
    `Aucune coupure algorithmique nocturne n'est activée au lancement (décision S16) : toute transition vers limite, suspendu ou revoque relève d'une décision humaine notifiée par courriel avec voie écrite de rétablissement sous ${DELAI_RETABLISSEMENT_JOURS_OUVRABLES} jours ouvrables (${COURRIEL_CONTACT_RESPONSABLE}).`,
  ],
  [
    `Account states (${ETATS_TITULAIRE.length}): ${ETATS_TITULAIRE.join(", ")}. Only actif, surveille, and limite are served by the MCP connectors.`,
    `Closed reason codes logged append-only in registre_gouverne (${MOTIFS_GOUVERNE.length}): ${MOTIFS_GOUVERNE.join(", ")}.`,
    `No automated nocturnal cutoff is active at launch (decision S16): any transition to limite, suspendu, or revoque requires a human decision notified by email with a ${DELAI_RETABLISSEMENT_JOURS_OUVRABLES}-business-day written reinstatement procedure (${COURRIEL_CONTACT_RESPONSABLE}).`,
  ],
)}
</section>
${piedDocument()}`;

  return {
    titre: "Registre public de gouverne dérivé du code — MCP Accès",
    titreEn: "Code-Derived Governance Register — MCP Access",
    desc: "Quotas journaliers, plafonds de débit d'arête Deep Research, états de compte et procédure de rétablissement.",
    corps,
  };
}

export function estCheminGouvernance(pathname: string): pathname is CheminDocumentGouvernance {
  return (CHEMINS_DOCUMENTS_GOUVERNANCE as readonly string[]).includes(pathname);
}

const DOCUMENTS_MEMO: Readonly<
  Record<CheminDocumentGouvernance, { titre: string; titreEn: string; desc: string; corps: string }>
> = {
  "/cgu": construireCgu(),
  "/confidentialite": construireConfidentialite(),
  "/attestation": construireAttestation(),
  "/conformite": construireConformite(),
  "/gouverne": construireGouverne(),
};

export function repondreDocumentGouvernance(
  chemin: CheminDocumentGouvernance,
  method: string,
): Response {
  const doc = DOCUMENTS_MEMO[chemin];
  const urlCanonique = `${ORIGINE_PORTAIL_PAR_DEFAUT}${chemin}`;

  return repondrePageHtml({
    titrePage: doc.titre,
    titrePageEn: doc.titreEn,
    descriptionMeta: doc.desc,
    corpsHtml: doc.corps,
    bilingue: true,
    method,
    formAction: "'none'",
    cachePublicMaxAge: 600,
    urlCanonique,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      url: urlCanonique,
      name: [doc.titre, doc.titreEn],
      description: doc.desc,
      inLanguage: ["fr-CA", "en-CA"],
      isPartOf: { "@id": `${ORIGINE_PORTAIL_PAR_DEFAUT}/#site` },
    },
  });
}
