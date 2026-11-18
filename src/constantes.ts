/**
 * Constantes canoniques du portail `MCP-Acces` (`acces.poirierlavoie.ca`).
 *
 * Conformément à la décision `S20`, les pages publiques `/conformite` et `/gouverne` dérivent
 * directement de ces constantes et de celles exportées par `@poirierlavoie/mcp-socle` : aucune
 * valeur numérique de quota, de débit ou de rétention n'est recopiée à la main en prose.
 */

export const SERVICES_MCP = ["legislation", "jurisprudence"] as const;
export type ServiceMcp = (typeof SERVICES_MCP)[number];

export const USAGE_COFFRE_CANLII = "canlii";
export const VERSION_COFFRE_COURANTE = 1;

export const VERSION_CGU = "2026-11-18";
export const VERSION_CONFIDENTIALITE = "2026-11-18";
export const VERSION_ATTESTATION = "2026-11-18";

export const COURRIEL_CONTACT_RESPONSABLE = "jason@poirierlavoie.ca";
export const EXPEDITEUR_PAR_DEFAUT = "noreply@acces.poirierlavoie.ca";
export const ORIGINE_PORTAIL_PAR_DEFAUT = "https://acces.poirierlavoie.ca";
export const CANLII_BASE_URL_PAR_DEFAUT = "https://api.canlii.org/v1";

/** Délai maximal d'examen contradictoire d'une demande écrite de rétablissement (`/cgu`, §10). */
export const DELAI_RETABLISSEMENT_JOURS_OUVRABLES = 5;

/** Durée de vie par défaut d'un jeton émis par échange OAuth 2.1 : 90 jours (en secondes). */
export const DUREE_JETON_OAUTH_SECONDES = 90 * 86_400;

/** Durée de validité d'une session navigateur d'exploitation (`/exploitant`) : 4 heures. */
export const DUREE_SESSION_EXPLOITANT_SECONDES = 4 * 3_600;

/** Durée de validité par défaut d'un code d'invitation de cohorte : 14 jours. */
export const DUREE_INVITATION_DEFAUT_JOURS = 14;

/** Les 15 sections régionales officielles du Barreau du Québec. */
export const SECTIONS_BARREAU = [
  "Abitibi-Témiscamingue",
  "Arthabaska",
  "Bas-Saint-Laurent—Gaspésie—Îles-de-la-Madeleine",
  "Bedford",
  "Côte-Nord",
  "Hull",
  "Laurentides-Lanaudière",
  "Laval",
  "Longueuil",
  "Mauricie",
  "Montréal",
  "Québec",
  "Richelieu",
  "Saguenay—Lac-Saint-Jean",
  "Saint-François",
] as const;

export type SectionBarreau = (typeof SECTIONS_BARREAU)[number];

/** Motifs fermés de transition d'état autorisés par `CHECK (motif IN (...))` dans `registre_gouverne`. */
export const MOTIFS_GOUVERNE = [
  "admission",
  "refus_admission",
  "quota_repete",
  "anomalie_debit",
  "clef_invalide",
  "demande_titulaire",
  "manquement_cgu",
  "retablissement",
] as const;

export type MotifGouverne = (typeof MOTIFS_GOUVERNE)[number];

export interface RegleDebitArete {
  readonly worker: "MCP-Legislation" | "MCP-Jurisprudence" | "MCP-Acces";
  readonly liaison: string;
  readonly namespaceId: string;
  readonly cle: string;
  readonly limite: number;
  readonly periodeSec: number;
  readonly effet: string;
}

/**
 * Inventaire complet des limiteurs d'arête inter-dépôts (`SPEC §6.1`, porte `G34`), exposé
 * dynamiquement sur `/gouverne` (`S20`).
 */
export const PLAFONDS_DEBIT_ARETE: readonly RegleDebitArete[] = [
  {
    worker: "MCP-Legislation",
    liaison: "RL_PRE_AUTH_IP",
    namespaceId: "1011",
    cle: "CF-Connecting-IP",
    limite: 600,
    periodeSec: 60,
    effet: "404 (/mcp) ou 429 (/mcp/oauth) avant lecture D1",
  },
  {
    worker: "MCP-Legislation",
    liaison: "RL_ECHEC_IP",
    namespaceId: "1012",
    cle: "CF-Connecting-IP (échecs seuls)",
    limite: 20,
    periodeSec: 60,
    effet: "Quarantaine mémoire 60 s de l'IP fautive",
  },
  {
    worker: "MCP-Legislation",
    liaison: "RL_ECHECS_GLOBAL",
    namespaceId: "1013",
    cle: '"echecs" (échecs seuls)',
    limite: 300,
    periodeSec: 60,
    effet: "Disjoncteur d'incident distribué",
  },
  {
    worker: "MCP-Legislation",
    liaison: "RL_TITULAIRE",
    namespaceId: "1014",
    cle: "titulaire_id",
    limite: 300,
    periodeSec: 60,
    effet: "429 + Retry-After: 60",
  },
  {
    worker: "MCP-Legislation",
    liaison: "RL_TITULAIRE_LIMITE",
    namespaceId: "1015",
    cle: "titulaire_id",
    limite: 20,
    periodeSec: 60,
    effet: "429 + Retry-After: 300",
  },
  {
    worker: "MCP-Jurisprudence",
    liaison: "RL_PRE_AUTH_IP",
    namespaceId: "1021",
    cle: "CF-Connecting-IP",
    limite: 600,
    periodeSec: 60,
    effet: "404 (/mcp) ou 429 (/mcp/oauth) avant lecture D1",
  },
  {
    worker: "MCP-Jurisprudence",
    liaison: "RL_ECHEC_IP",
    namespaceId: "1022",
    cle: "CF-Connecting-IP (échecs seuls)",
    limite: 20,
    periodeSec: 60,
    effet: "Quarantaine mémoire 60 s de l'IP fautive",
  },
  {
    worker: "MCP-Jurisprudence",
    liaison: "RL_ECHECS_GLOBAL",
    namespaceId: "1023",
    cle: '"echecs" (échecs seuls)',
    limite: 300,
    periodeSec: 60,
    effet: "Disjoncteur d'incident distribué",
  },
  {
    worker: "MCP-Jurisprudence",
    liaison: "RL_TITULAIRE",
    namespaceId: "1024",
    cle: "titulaire_id",
    limite: 180,
    periodeSec: 60,
    effet: "429 + Retry-After: 60",
  },
  {
    worker: "MCP-Jurisprudence",
    liaison: "RL_TITULAIRE_LIMITE",
    namespaceId: "1025",
    cle: "titulaire_id",
    limite: 20,
    periodeSec: 60,
    effet: "429 + Retry-After: 300",
  },
  {
    worker: "MCP-Acces",
    liaison: "RL_DEMANDE_IP",
    namespaceId: "1031",
    cle: "CF-Connecting-IP",
    limite: 10,
    periodeSec: 60,
    effet: "429 sur POST /demande*, liens magiques et connexion console",
  },
  {
    worker: "MCP-Acces",
    liaison: "RL_OAUTH_IP",
    namespaceId: "1032",
    cle: "CF-Connecting-IP",
    limite: 60,
    periodeSec: 60,
    effet: "429 sur /oauth/authorize, /oauth/token et /oauth/revoke",
  },
] as const;

/** Ressources MCP OAuth 2.1 reconnues pour le paramètre optionnel `resource` (RFC 8707). */
export const RESSOURCES_OAUTH_CONNUES: Readonly<Record<string, ServiceMcp>> = {
  "https://legislation.poirierlavoie.ca/mcp/oauth": "legislation",
  "https://legislation.poirierlavoie.ca/mcp": "legislation",
  "https://jurisprudence.poirierlavoie.ca/mcp/oauth": "jurisprudence",
  "https://jurisprudence.poirierlavoie.ca/mcp": "jurisprudence",
} as const;

/**
 * Préambule `SAFETY-KERNEL` obligatoire pour tout appel autonome à l'API Gemini Deep Research
 * (`SPEC §3.4`, `store=True` / `background=True`).
 */
export const PREAMBULE_SAFETY_KERNEL_DEEP_RESEARCH = `CONTRAINTES IMPÉRATIVES (DROIT CIVIL QUÉBÉCOIS — PALIER 2/3) :
1. Confidentialité : Requête entièrement anonymisée; n'inclure aucun nom de partie, numéro de dossier ni fait identifiant dans aucune recherche web ou requête \`query\`.
2. Sources primaires obligatoires : Ne citer aucun article de loi sans l'avoir lu via le serveur \`lois\` (\`get_article\` / \`get_articles\`) en relevant sa date de consolidation. Ne citer aucun arrêt sans l'authentifier via \`juris\` (\`verify_citations\`, \`citator\` / \`subsequent_history\`).
3. Étanchéité bijuridique : Exclure tout droit étranger (\`.fr\`, Belgique, Suisse; art. 1240, 2224, 1641) et tout calque de common law (*duty of care*, *consideration*, *estoppel*, dommages punitifs sans loi habilitante sous l'art. 1621 C.c.Q.).
4. Lecture intégrale des arrêts : N'énoncer un ratio ou paragraphe d'arrêt que si le texte intégral officiel a été consulté en session. Sinon, laisser explicitement le marqueur :
   [RATIO / PAR. X À INSÉRER APRÈS LECTURE DE <citation + lien CanLII>]
5. Méthode : Vérifier d'abord les verrous préalables (prescription, déchéance, avis préalable, compétence), puis exposer le fondement législatif, la jurisprudence vérifiée avec statut de lecture, et l'attaque adverse la plus forte.

QUESTION JURIDIQUE ANONYMISÉE :
<Insérer ici la question de droit abstraitement formulée>`;
