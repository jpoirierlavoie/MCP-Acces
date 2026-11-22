/**
 * Serveur d'autorisation OAuth 2.1 (`SPEC §4.4`, `§9`, portes `G34`, `G35`, `G36`) :
 * - `GET /.well-known/oauth-authorization-server` (RFC 8414) ;
 * - `GET/POST /oauth/authorize` (session `/moi` active vérifiée avant tout appel réseau externe CIMD,
 *   jeton de consentement HMAC liant tous les paramètres de la requête OAuth, PKCE `S256` obligatoire,
 *   `normaliserPorteeOAuth`, clients pré-inscrits `client_oauth` et résolution CIMD anti-SSRF
 *   `fetch(clientId, { redirect: "manual" })` avec rejet explicite des réponses `3xx` + `validerMetadonneesClientCimd`, égalité stricte
 *   `estUriRedirectionAutorisee`, compatibilité CSP `form-action` IPv6 `[::1]`) ;
 * - `POST /oauth/token` (`RL_OAUTH_IP` `60/min` `namespace_id` `"1032"`, validation RFC 8707 `resource`,
 *   consommation atomique immédiate à usage unique de `code_oauth`, révocation sur rejeu de code et
 *   émission d'un `jeton` D1 standard `frapperJeton()`) ;
 * - `POST /oauth/revoke` (RFC 7009, révocation idempotente sans oracle).
 */

import {
  construireServeurAutorisation,
  corsHeaders,
  DUREE_CODE_OAUTH_SECONDES,
  debitAcceptable,
  empreinte,
  estClientIdMetadonneesValide,
  estEtatServi,
  estJetonFrappe,
  estUriRedirectionAutorisee,
  frapperJeton,
  horodatageIsoUtc,
  horodatageUtcMs,
  METHODE_PKCE_S256,
  memeSecret,
  methodeNonPermise,
  normaliserPorteeOAuth,
  origineAutorisee,
  origineInterdite,
  origineRefusee,
  originesAdmises,
  porteeAutorisee,
  porteesCanoniques,
  preflight,
  queueJeton,
  repondreServeurAutorisation,
  sansBarresFinales,
  tropDeRequetes,
  validerMetadonneesClientCimd,
  validerMetadonneesInscriptionDcr,
  verifierDefiPkceS256,
} from "@poirierlavoie/mcp-socle";
import { DUREE_JETON_OAUTH_SECONDES, RESSOURCES_OAUTH_CONNUES, SERVICES_MCP } from "../constantes";
import { boutonsEntete, esc, repondrePageHtml } from "../html/gabarit";
import {
  calculerJetonConsentementOAuth,
  creerIdentifiant,
  emettreInscriptionDcrSansEtat,
  estCoffreConfigure,
  estOrigineFormulaireValide,
  lireFormulaireBorne,
  lireOctetsBornes,
  MAX_OCTETS_CIMD,
  MAX_OCTETS_INSCRIPTION_DCR,
  repondreMethodeNonPermise,
  validerCheminRetourInterne,
  verifierAuthentificationClientDcr,
  verifierClientDcrSansEtat,
  verifierJetonConsentementOAuth,
} from "../securite";
import type { ContextePortail } from "../types";
import { resoudreSessionMoiActive } from "./moi";

interface ClientOAuthResolu {
  readonly clientId: string;
  readonly libelle: string;
  readonly source: "preinscrit" | "cimd" | "dcr";
  readonly empreinteSecret: string | null;
  readonly porteesPermises: readonly string[] | "toutes";
}

interface LigneClientOAuthD1 {
  readonly client_id: string;
  readonly libelle: string;
  readonly empreinte_secret: string | null;
  readonly uris_redirection_json: string;
  readonly portees_permises: string;
  readonly actif: number;
}

const MOTIF_DEFI_PKCE = /^[A-Za-z0-9_-]{43}$/;

function estStateValide(state: string | null): boolean {
  if (state === null) return true;
  if (state.length === 0 || state.length > 512) return false;
  for (let i = 0; i < state.length; i++) {
    const code = state.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

const JETONS_PORTEE_TIERS_IGNORES = new Set(["offline_access", "openid", "profile", "email"]);

function filtrerJetonsPorteeTiers(scopeBrut: string | null): string | null {
  if (scopeBrut === null) return null;
  if (scopeBrut.length > 512) return scopeBrut;
  const jetons = scopeBrut
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0 && !JETONS_PORTEE_TIERS_IGNORES.has(s));
  return jetons.length > 0 ? jetons.join(" ") : "";
}

function clientCimdAcceptePkceSansSecret(
  docJson: unknown,
  methodeSinguliere: "none" | "private_key_jwt",
): boolean {
  if (methodeSinguliere === "none") return true;
  if (typeof docJson !== "object" || docJson === null || Array.isArray(docJson)) {
    return false;
  }
  const brut = (docJson as Record<string, unknown>).token_endpoint_auth_methods_supported;
  if (!Array.isArray(brut) || brut.length === 0 || brut.length > 8) {
    return false;
  }
  return (
    brut.every((m): m is string => m === "none" || m === "private_key_jwt") && brut.includes("none")
  );
}

function normaliserDocInscriptionDcr(docJson: unknown): unknown {
  if (typeof docJson !== "object" || docJson === null || Array.isArray(docJson)) {
    return docJson;
  }
  const obj = docJson as Record<string, unknown>;
  const grants = obj.grant_types;
  if (
    !Array.isArray(grants) ||
    grants.length === 0 ||
    grants.length > 8 ||
    !grants.every((g): g is string => typeof g === "string") ||
    !grants.includes("authorization_code")
  ) {
    return docJson;
  }
  return {
    ...obj,
    grant_types: grants.filter((g) => g === "authorization_code" || g === "refresh_token"),
  };
}

function construireRedirectionOAuth(
  redirectUri: string,
  issuer: string,
  parametres: Record<string, string | undefined>,
): Response {
  const cible = new URL(redirectUri);
  for (const [cle, valeur] of Object.entries(parametres)) {
    if (valeur !== undefined) {
      cible.searchParams.set(cle, valeur);
    }
  }
  cible.searchParams.set("iss", issuer);
  return new Response(null, {
    status: 303,
    headers: {
      Location: cible.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function rendreErreurLocaleAuthorize(statut: number, message: string, method?: string): Response {
  const corps = `<header><div class="bar"><h1>Autorisation OAuth 2.1 refusée</h1>${boutonsEntete(false)}</div><p class="m"><a href="/">← Accueil</a></p></header>
<div class="err">
<p>${esc(message)}</p>
<p class="m">Conformément à OAuth 2.1, aucune redirection automatique n'est effectuée lorsque le client ou l'URI de rappel est invalide.</p>
</div>`;
  return repondrePageHtml({
    titrePage: "Erreur OAuth 2.1 — MCP Accès",
    descriptionMeta: "Requête d'autorisation OAuth 2.1 invalide.",
    corpsHtml: corps,
    statut,
    method,
    formAction: "'none'",
  });
}

type PrevalidationClientSansReseau =
  | { readonly ok: true; readonly mode: "preinscrit"; readonly client: ClientOAuthResolu }
  | { readonly ok: true; readonly mode: "dcr"; readonly client: ClientOAuthResolu }
  | { readonly ok: true; readonly mode: "cimd_en_attente" }
  | { readonly ok: false; readonly message: string };

/**
 * Étape 1 hors réseau : vérifie les clients pré-inscrits en D1, les clients DCR sans état signés
 * HMAC (`dcr1.*`) ou la conformité syntaxique anti-SSRF d'un couple `(clientId, redirectUri)` CIMD
 * AVANT tout appel réseau sortant, afin qu'un visiteur non authentifié ne puisse jamais déclencher
 * un `fetch()` externe.
 */
async function prevaliderClientEtRedirectionSansReseau(
  clientId: string,
  redirectUri: string,
  contexte: ContextePortail,
): Promise<PrevalidationClientSansReseau> {
  if (
    clientId.length === 0 ||
    clientId.length > 2_048 ||
    redirectUri.length === 0 ||
    redirectUri.length > 512
  ) {
    return { ok: false, message: "Paramètres client_id ou redirect_uri manquants." };
  }

  if (clientId.startsWith("dcr1.")) {
    const dcr = await verifierClientDcrSansEtat(contexte.env, clientId);
    if (!dcr) {
      return {
        ok: false,
        message: "Identifiant client OAuth 2.1 dynamique invalide ou non reconnu.",
      };
    }

    const urisHttps = dcr.urisRedirection.filter((u) => u.startsWith("https://"));
    const cheminsBoucle: string[] = [];
    for (const u of dcr.urisRedirection) {
      if (
        u.startsWith("http://127.0.0.1") ||
        u.startsWith("http://localhost") ||
        u.startsWith("http://[::1]")
      ) {
        try {
          const chemin = new URL(u).pathname;
          if (!cheminsBoucle.includes(chemin)) cheminsBoucle.push(chemin);
        } catch {
          // Ignoré
        }
      }
    }

    const uriValide = estUriRedirectionAutorisee(redirectUri, {
      urisExactesAutorisees: urisHttps,
      autoriserBoucleLocale: cheminsBoucle.length > 0,
      ...(cheminsBoucle.length > 0 ? { cheminsBoucleLocale: cheminsBoucle } : {}),
    });
    if (!uriValide) {
      return {
        ok: false,
        message: "L'URI de redirection ne correspond à aucune URI inscrite pour ce client.",
      };
    }

    return {
      ok: true,
      mode: "dcr",
      client: {
        clientId,
        libelle: dcr.libelle,
        source: "dcr",
        empreinteSecret: null,
        porteesPermises: "toutes",
      },
    };
  }

  if (clientId.length > 512) {
    return { ok: false, message: "Paramètre client_id trop long." };
  }

  const preinscrit = await contexte.env.DB_IDENTITE.prepare(
    `SELECT client_id, libelle, empreinte_secret, uris_redirection_json, portees_permises, actif
     FROM client_oauth
     WHERE client_id = ?1
     LIMIT 1`,
  )
    .bind(clientId)
    .first<LigneClientOAuthD1>();

  if (preinscrit) {
    if (preinscrit.actif !== 1) {
      return { ok: false, message: "Ce client OAuth 2.1 est désactivé." };
    }
    let uris: unknown;
    try {
      uris = JSON.parse(preinscrit.uris_redirection_json);
    } catch {
      return { ok: false, message: "Configuration d'URIs du client invalide." };
    }
    if (!Array.isArray(uris) || !uris.every((u): u is string => typeof u === "string")) {
      return { ok: false, message: "Configuration d'URIs du client invalide." };
    }

    const urisHttps = uris.filter((u) => u.startsWith("https://"));
    const cheminsBoucle: string[] = [];
    for (const u of uris) {
      if (
        u.startsWith("http://127.0.0.1") ||
        u.startsWith("http://localhost") ||
        u.startsWith("http://[::1]")
      ) {
        try {
          const chemin = new URL(u).pathname;
          if (!cheminsBoucle.includes(chemin)) cheminsBoucle.push(chemin);
        } catch {
          // Ignoré
        }
      }
    }

    const uriValide = estUriRedirectionAutorisee(redirectUri, {
      urisExactesAutorisees: urisHttps,
      autoriserBoucleLocale: cheminsBoucle.length > 0,
      ...(cheminsBoucle.length > 0 ? { cheminsBoucleLocale: cheminsBoucle } : {}),
    });
    if (!uriValide) {
      return {
        ok: false,
        message: "L'URI de redirection ne correspond à aucune URI autorisée pour ce client.",
      };
    }

    const porteesPermises = preinscrit.portees_permises
      .trim()
      .split(/\s+/)
      .filter((p) => p.length > 0);

    return {
      ok: true,
      mode: "preinscrit",
      client: {
        clientId: preinscrit.client_id,
        libelle: preinscrit.libelle,
        source: "preinscrit",
        empreinteSecret: preinscrit.empreinte_secret,
        porteesPermises,
      },
    };
  }

  if (!estClientIdMetadonneesValide(clientId)) {
    return { ok: false, message: "Identifiant client_id inconnu ou non conforme au format CIMD." };
  }

  // Prévalidation purement locale de `redirect_uri` selon les règles CIMD anti-SSRF (`G36`)
  const uriSyntaxeCimd = validerMetadonneesClientCimd(
    clientId,
    {
      client_id: clientId,
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
    },
    { autoriserBoucleLocale: true },
  );
  if (!uriSyntaxeCimd.ok) {
    return { ok: false, message: uriSyntaxeCimd.motif };
  }

  return { ok: true, mode: "cimd_en_attente" };
}

/**
 * Étape 2 réseau (exécutée UNIQUEMENT après authentification d'un titulaire servi) :
 * récupère et valide le document CIMD distant avec `redirect: "manual"` et rejet explicite des réponses `3xx` (`G36`).
 */
async function resoudreDocumentCimdDistant(
  clientId: string,
  redirectUri: string,
  contexte: ContextePortail,
): Promise<{ ok: true; client: ClientOAuthResolu } | { ok: false; message: string }> {
  let reponseCimd: Response;
  try {
    reponseCimd = await contexte.fetchExterne(clientId, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return {
      ok: false,
      message:
        "Impossible de récupérer le document de métadonnées client (erreur réseau ou délai dépassé).",
    };
  }

  if (
    String(reponseCimd.type) === "opaqueredirect" ||
    reponseCimd.redirected ||
    (reponseCimd.status >= 300 && reponseCimd.status < 400)
  ) {
    await reponseCimd.body?.cancel().catch(() => undefined);
    return {
      ok: false,
      message:
        "Impossible de récupérer le document de métadonnées client (redirection HTTP refusée).",
    };
  }

  if (!reponseCimd.ok) {
    await reponseCimd.body?.cancel().catch(() => undefined);
    return {
      ok: false,
      message: `Le serveur de métadonnées client a répondu HTTP ${reponseCimd.status}.`,
    };
  }

  const octetsCimd = await lireOctetsBornes(reponseCimd.body, MAX_OCTETS_CIMD);
  if (!octetsCimd.ok) {
    return { ok: false, message: "Document de métadonnées client trop volumineux ou illisible." };
  }

  let docJson: unknown;
  try {
    const texte = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      octetsCimd.octets,
    );
    docJson = JSON.parse(texte);
  } catch {
    return { ok: false, message: "Document de métadonnées client JSON invalide." };
  }

  const validation = validerMetadonneesClientCimd(clientId, docJson, {
    autoriserBoucleLocale: true,
  });
  if (!validation.ok) {
    return { ok: false, message: validation.motif };
  }
  if (!clientCimdAcceptePkceSansSecret(docJson, validation.client.tokenEndpointAuthMethod)) {
    return {
      ok: false,
      message:
        "Seule la méthode token_endpoint_auth_method « none » + PKCE S256 est prise en charge pour les clients CIMD.",
    };
  }

  const urisHttps = validation.client.redirectUris.filter((u) => u.startsWith("https://"));
  const cheminsBoucle = validation.client.redirectUris
    .filter((u) => u.startsWith("http://"))
    .map((u) => new URL(u).pathname);

  const uriValide = estUriRedirectionAutorisee(redirectUri, {
    urisExactesAutorisees: urisHttps,
    autoriserBoucleLocale: cheminsBoucle.length > 0,
    ...(cheminsBoucle.length > 0 ? { cheminsBoucleLocale: cheminsBoucle } : {}),
  });
  if (!uriValide) {
    return {
      ok: false,
      message: "L'URI de redirection n'est pas déclarée dans le document CIMD du client.",
    };
  }

  return {
    ok: true,
    client: {
      clientId,
      libelle: validation.client.clientName ?? new URL(clientId).hostname,
      source: "cimd",
      empreinteSecret: null,
      porteesPermises: "toutes",
    },
  };
}

function verifierPorteeClientPermise(
  porteeNormalisee: string,
  porteesClient: readonly string[] | "toutes",
): boolean {
  if (porteesClient === "toutes") return true;
  if (porteesClient.includes("les_deux") || porteesClient.includes(porteeNormalisee)) {
    return true;
  }
  return false;
}

function verifierSousPorteeAutorisee(porteeDemandee: string, porteeAccordee: string): boolean {
  if (porteeAccordee === "les_deux") return true;
  return porteeDemandee === porteeAccordee;
}

function identifiantJetonPourCodeOAuth(codeOAuthId: string): string {
  return `jtn_${codeOAuthId}`;
}

export function gererDecouverteServeurAutorisation(
  request: Request,
  contexte: ContextePortail,
): Response {
  const base = construireServeurAutorisation({
    issuer: contexte.originePortail,
    authorizationEndpoint: `${contexte.originePortail}/oauth/authorize`,
    tokenEndpoint: `${contexte.originePortail}/oauth/token`,
    revocationEndpoint: `${contexte.originePortail}/oauth/revoke`,
    registrationEndpoint: `${contexte.originePortail}/oauth/register`,
    scopesSupported: porteesCanoniques(SERVICES_MCP),
    grantTypesSupported: ["authorization_code"],
    tokenEndpointAuthMethodsSupported: ["none", "client_secret_post", "client_secret_basic"],
    clientIdMetadataDocumentSupported: true,
    serviceDocumentation: `${contexte.originePortail}/gouverne`,
  });
  const meta = {
    ...base,
    authorization_response_iss_parameter_supported: true,
  } as typeof base;
  return repondreServeurAutorisation(request.method, meta);
}

export async function gererRouteRegister(
  request: Request,
  contexte: ContextePortail,
): Promise<Response> {
  const origines = originesAdmises(contexte.env.ALLOWED_ORIGINS);
  if (origineRefusee(request, origines)) {
    return origineInterdite();
  }
  const origin = origineAutorisee(request, origines);
  if (request.method === "OPTIONS") {
    return preflight(origin ?? "*");
  }
  if (request.method !== "POST") {
    return methodeNonPermise(origin);
  }

  const debitOk = await debitAcceptable(contexte.env.RL_OAUTH_IP, contexte.ipClient);
  if (!debitOk) {
    return tropDeRequetes(60, origin);
  }

  if (!estCoffreConfigure(contexte.env)) {
    return repondreJsonOAuth({ error: "temporarily_unavailable" }, 503, origin);
  }

  const ct = (request.headers.get("Content-Type") ?? "").toLowerCase();
  if (!ct.startsWith("application/json")) {
    return repondreJsonOAuth(
      {
        error: "invalid_client_metadata",
        error_description: "En-tête Content-Type application/json requis.",
      },
      415,
      origin,
    );
  }

  const lecture = await lireOctetsBornes(request.body, MAX_OCTETS_INSCRIPTION_DCR);
  if (!lecture.ok) {
    return repondreJsonOAuth(
      {
        error: "invalid_client_metadata",
        error_description:
          lecture.motif === "TROP_GRAND"
            ? "Corps d'inscription trop volumineux."
            : "Lecture du corps interrompue.",
      },
      lecture.motif === "TROP_GRAND" ? 413 : 400,
      origin,
    );
  }

  let docJson: unknown;
  try {
    const texte = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      lecture.octets,
    );
    docJson = JSON.parse(texte);
  } catch {
    return repondreJsonOAuth(
      { error: "invalid_client_metadata", error_description: "Corps JSON invalide." },
      400,
      origin,
    );
  }

  const validation = validerMetadonneesInscriptionDcr(normaliserDocInscriptionDcr(docJson), {
    autoriserBoucleLocale: true,
  });
  if (!validation.ok) {
    return repondreJsonOAuth(
      { error: validation.codeErreur, error_description: validation.motif },
      400,
      origin,
    );
  }

  const creeEpochSec = Math.floor(contexte.maintenant().getTime() / 1_000);
  const emission = await emettreInscriptionDcrSansEtat(
    contexte.env,
    validation.client,
    creeEpochSec,
  );
  if (!emission) {
    return repondreJsonOAuth({ error: "temporarily_unavailable" }, 503, origin);
  }

  return repondreJsonOAuth(
    {
      client_id: emission.clientId,
      client_id_issued_at: creeEpochSec,
      ...(emission.jetonAuthClient
        ? { client_secret: emission.jetonAuthClient, client_secret_expires_at: 0 }
        : {}),
      ...(validation.client.clientName ? { client_name: validation.client.clientName } : {}),
      redirect_uris: [...validation.client.redirectUris],
      grant_types: [...validation.client.grantTypes],
      response_types: [...validation.client.responseTypes],
      token_endpoint_auth_method: validation.client.tokenEndpointAuthMethod,
    },
    201,
    origin,
  );
}

export async function gererRouteAuthorize(
  request: Request,
  url: URL,
  contexte: ContextePortail,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "POST") {
    return repondreMethodeNonPermise(["GET", "HEAD", "POST"]);
  }

  const debitOk = await debitAcceptable(contexte.env.RL_OAUTH_IP, contexte.ipClient);
  if (!debitOk) {
    return tropDeRequetes(60, null);
  }

  let sourceParams: URLSearchParams;
  if (request.method === "POST") {
    if (!estOrigineFormulaireValide(request, url)) {
      return new Response("Origine de formulaire refusée.", { status: 403 });
    }
    const lecture = await lireFormulaireBorne(request);
    if (!lecture.ok) {
      return rendreErreurLocaleAuthorize(lecture.statut, lecture.message);
    }
    sourceParams = lecture.champs;
  } else {
    sourceParams = url.searchParams;
  }

  const clientId = (sourceParams.get("client_id") ?? "").trim();
  const redirectUri = (sourceParams.get("redirect_uri") ?? "").trim();
  const state = sourceParams.get("state");

  if (!estStateValide(state)) {
    return rendreErreurLocaleAuthorize(400, "Paramètre state invalide.", request.method);
  }

  // 1. Prévalidation hors réseau de `client_id` et `redirect_uri` (zéro fetch externe avant auth)
  const prevalidation = await prevaliderClientEtRedirectionSansReseau(
    clientId,
    redirectUri,
    contexte,
  );
  if (!prevalidation.ok) {
    return rendreErreurLocaleAuthorize(400, prevalidation.message, request.method);
  }

  // 2. Authentification de la session `/moi` AVANT toute résolution réseau CIMD
  const session = await resoudreSessionMoiActive(request, url, contexte);
  if (!session) {
    if (request.method === "POST") {
      return rendreErreurLocaleAuthorize(
        401,
        "Votre session /moi a expiré. Veuillez vous reconnecter.",
      );
    }
    const retourAuthorize = validerCheminRetourInterne(`${url.pathname}${url.search}`);
    if (!retourAuthorize) {
      return rendreErreurLocaleAuthorize(400, "Requête d'autorisation trop longue ou mal formée.");
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: `/moi?retour=${encodeURIComponent(retourAuthorize)}`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (!estEtatServi(session.titulaire.etat)) {
    if (session.titulaire.etat === "en_attente") {
      return rendreErreurLocaleAuthorize(
        403,
        "Votre demande d'accès et votre clé API CanLII sont confirmées. Votre dossier est en attente de vérification manuelle au Bottin des avocats avant l'activation des connecteurs législation (lois) et jurisprudence (juris). Le connecteur public outils demeure utilisable immédiatement.",
        request.method,
      );
    }
    return rendreErreurLocaleAuthorize(
      403,
      `Votre compte est présentement à l'état « ${session.titulaire.etat} » et ne peut pas autoriser un client OAuth.`,
      request.method,
    );
  }

  // 3. Résolution complète du client (avec fetch CIMD anti-SSRF uniquement maintenant que le titulaire est authentifié)
  let client: ClientOAuthResolu;
  if (prevalidation.mode === "preinscrit" || prevalidation.mode === "dcr") {
    client = prevalidation.client;
  } else {
    const cimdRes = await resoudreDocumentCimdDistant(clientId, redirectUri, contexte);
    if (!cimdRes.ok) {
      return rendreErreurLocaleAuthorize(400, cimdRes.message, request.method);
    }
    client = cimdRes.client;
  }

  const stateParam = state ?? undefined;

  const responseType = sourceParams.get("response_type");
  if (responseType !== "code") {
    return construireRedirectionOAuth(redirectUri, contexte.originePortail, {
      error: "unsupported_response_type",
      state: stateParam,
    });
  }

  const codeChallenge = (sourceParams.get("code_challenge") ?? "").trim();
  const codeChallengeMethod = (sourceParams.get("code_challenge_method") ?? "").trim();
  if (codeChallengeMethod !== METHODE_PKCE_S256 || !MOTIF_DEFI_PKCE.test(codeChallenge)) {
    return construireRedirectionOAuth(redirectUri, contexte.originePortail, {
      error: "invalid_request",
      error_description: "PKCE S256 obligatoire (RFC 7636 / OAuth 2.1).",
      state: stateParam,
    });
  }

  const resourceBrut = sourceParams.get("resource");
  let resourceNormalisee: string | null = null;
  let porteeImpliciteResource: string | undefined;
  if (resourceBrut !== null && resourceBrut.trim().length > 0) {
    const cleRes = sansBarresFinales(resourceBrut.trim());
    if (!Object.hasOwn(RESSOURCES_OAUTH_CONNUES, cleRes)) {
      return construireRedirectionOAuth(redirectUri, contexte.originePortail, {
        error: "invalid_target",
        state: stateParam,
      });
    }
    resourceNormalisee = cleRes;
    porteeImpliciteResource = RESSOURCES_OAUTH_CONNUES[cleRes];
  }

  const scopeFiltre = filtrerJetonsPorteeTiers(sourceParams.get("scope"));
  const porteeDefautClient =
    client.porteesPermises !== "toutes" &&
    !client.porteesPermises.includes("les_deux") &&
    client.porteesPermises.length === 1
      ? client.porteesPermises[0]
      : undefined;

  const portee = normaliserPorteeOAuth(
    scopeFiltre !== null && scopeFiltre.length > 0
      ? scopeFiltre
      : (porteeImpliciteResource ?? porteeDefautClient ?? null),
    SERVICES_MCP,
  );
  if (!portee || !verifierPorteeClientPermise(portee, client.porteesPermises)) {
    return construireRedirectionOAuth(redirectUri, contexte.originePortail, {
      error: "invalid_scope",
      state: stateParam,
    });
  }
  if (porteeImpliciteResource && !porteeAutorisee(portee, porteeImpliciteResource)) {
    return construireRedirectionOAuth(redirectUri, contexte.originePortail, {
      error: "invalid_scope",
      state: stateParam,
    });
  }

  const maintenant = contexte.maintenant();
  const maintenantMs = maintenant.getTime();
  const parametresConsentement = {
    sessionId: session.sessionId,
    empreinteSession: session.empreinteSession,
    clientId: client.clientId,
    redirectUri,
    portee,
    codeChallenge,
    codeChallengeMethod: METHODE_PKCE_S256,
    state,
    resource: resourceNormalisee,
  };

  if (request.method === "GET" || request.method === "HEAD") {
    const jetonConsentement = await calculerJetonConsentementOAuth(
      contexte.env,
      parametresConsentement,
      maintenantMs,
    );
    if (!jetonConsentement) {
      return rendreErreurLocaleAuthorize(503, "Configuration indisponible.", request.method);
    }

    const urlRedirection = new URL(redirectUri);
    const origineRedirection = urlRedirection.origin;
    // W3C CSP3 `host-source` n'accepte pas les littéraux IPv6 entre crochets (`[::1]`) sous
    // Chromium/WebKit : on émet alors le `scheme-source` valide `http:` pour la boucle locale IPv6.
    const sourceFormAction =
      urlRedirection.protocol === "http:" && urlRedirection.hostname === "[::1]"
        ? "http:"
        : origineRedirection;

    const badgeSourceClient =
      client.source === "cimd"
        ? "métadonnées CIMD vérifiées"
        : client.source === "dcr"
          ? "inscription dynamique OAuth 2.1 vérifiée (sans état)"
          : "client pré-inscrit";
    const identifiantAffiche =
      client.source === "dcr" ? "inscription-dynamique-rfc7591" : client.clientId;

    const corps = `<header><div class="bar"><h1>Autorisation OAuth 2.1</h1>${boutonsEntete(false)}</div><p class="m">Connecté en tant que <strong>Me ${esc(session.titulaire.nom)}</strong> (<code>${esc(session.titulaire.courriel)}</code>)</p></header>
<div class="carte">
<h2>Accorder l'accès à « ${esc(client.libelle)} » ?</h2>
<ul>
<li>Identifiant du client : <code>${esc(identifiantAffiche)}</code> (${badgeSourceClient})</li>
<li>Hôte de rappel : <code>${esc(origineRedirection)}</code></li>
<li>Portée demandée : <strong><code>${esc(portee)}</code></strong></li>
<li>Protection : PKCE <code>S256</code> vérifié</li>
</ul>
<form method="POST" action="/oauth/authorize">
<input type="hidden" name="jeton_consentement" value="${esc(jetonConsentement)}">
<input type="hidden" name="response_type" value="code">
<input type="hidden" name="client_id" value="${esc(client.clientId)}">
<input type="hidden" name="redirect_uri" value="${esc(redirectUri)}">
<input type="hidden" name="scope" value="${esc(portee)}">
<input type="hidden" name="code_challenge" value="${esc(codeChallenge)}">
<input type="hidden" name="code_challenge_method" value="S256">
${state !== null ? `<input type="hidden" name="state" value="${esc(state)}">` : ""}
${resourceNormalisee !== null ? `<input type="hidden" name="resource" value="${esc(resourceNormalisee)}">` : ""}
<div class="btns">
<button type="submit" name="decision" value="autoriser" class="btn">Autoriser l'accès</button>
<button type="submit" name="decision" value="refuser" class="btn-danger">Refuser</button>
</div>
</form>
</div>`;

    return repondrePageHtml({
      titrePage: `Autoriser ${client.libelle} — MCP Accès`,
      descriptionMeta: "Consentement OAuth 2.1.",
      corpsHtml: corps,
      method: request.method,
      formAction: `'self' ${sourceFormAction}`,
    });
  }

  // POST /oauth/authorize : vérification cryptographique de l'intégralité des paramètres consentis
  if (!estCoffreConfigure(contexte.env)) {
    return rendreErreurLocaleAuthorize(503, "Configuration indisponible.");
  }

  const consentementValide = await verifierJetonConsentementOAuth(
    contexte.env,
    sourceParams.get("jeton_consentement"),
    parametresConsentement,
    maintenantMs,
  );
  if (!consentementValide) {
    return rendreErreurLocaleAuthorize(
      403,
      "Jeton de consentement OAuth invalide, altéré ou expiré.",
    );
  }

  if (sourceParams.get("decision") !== "autoriser") {
    return construireRedirectionOAuth(redirectUri, contexte.originePortail, {
      error: "access_denied",
      state: stateParam,
    });
  }

  const maintenantIso = horodatageIsoUtc(maintenant);
  const expireIso = horodatageIsoUtc(new Date(maintenantMs + DUREE_CODE_OAUTH_SECONDES * 1_000));
  const codeClair = frapperJeton();
  const empreinteCode = await empreinte(codeClair);

  await contexte.env.DB_IDENTITE.prepare(
    `INSERT INTO code_oauth (
      id, titulaire_id, empreinte_code, client_id, redirect_uri, portee,
      defi_pkce, methode_pkce, cree_le, expire_le, consomme_le
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'S256', ?8, ?9, NULL)`,
  )
    .bind(
      creerIdentifiant("co"),
      session.titulaire.id,
      empreinteCode,
      client.clientId,
      redirectUri,
      portee,
      codeChallenge,
      maintenantIso,
      expireIso,
    )
    .run();

  return construireRedirectionOAuth(redirectUri, contexte.originePortail, {
    code: codeClair,
    state: stateParam,
  });
}

function decoderFormUrlComp(s: string): string | null {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

function extraireAuthBasicClient(request: Request):
  | { present: false }
  | {
      present: true;
      ok: true;
      candidatsClientId: readonly string[];
      candidatsSecret: readonly string[];
    }
  | { present: true; ok: false } {
  const auth = request.headers.get("Authorization");
  if (!auth) return { present: false };
  if (!/^Basic\s+/i.test(auth.trim())) {
    return { present: true, ok: false };
  }
  const b64 = auth
    .trim()
    .replace(/^Basic\s+/i, "")
    .trim();
  if (b64.length === 0 || b64.length > 4_096) {
    return { present: true, ok: false };
  }
  let decodeUtf8: string;
  try {
    const binaire = atob(b64);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) {
      octets[i] = binaire.charCodeAt(i);
    }
    decodeUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(octets);
  } catch {
    return { present: true, ok: false };
  }
  const idx = decodeUtf8.indexOf(":");
  if (idx < 0) {
    return { present: true, ok: false };
  }
  const idBrut = decodeUtf8.slice(0, idx);
  const secretBrut = decodeUtf8.slice(idx + 1);
  const idForm = decoderFormUrlComp(idBrut);
  const secretForm = decoderFormUrlComp(secretBrut);

  const candidatsClientId = [
    ...new Set([idForm, idBrut].filter((v): v is string => v !== null && v.trim().length > 0)),
  ];
  const candidatsSecret = [
    ...new Set([secretForm, secretBrut].filter((v): v is string => v !== null && v.length > 0)),
  ];
  if (candidatsClientId.length === 0) {
    return { present: true, ok: false };
  }
  return { present: true, ok: true, candidatsClientId, candidatsSecret };
}

function repondreJsonOAuth(
  corps: Record<string, unknown>,
  statut: number,
  origin: string | null,
  entetesExtra: Record<string, string> = {},
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    ...corsHeaders(origin),
    ...entetesExtra,
  };
  return new Response(JSON.stringify(corps), { status: statut, headers });
}

function repondreClientInvalide(origin: string | null, avecBasicChallenge: boolean): Response {
  return repondreJsonOAuth(
    { error: "invalid_client" },
    401,
    origin,
    avecBasicChallenge ? { "WWW-Authenticate": 'Basic realm="oauth"' } : {},
  );
}

async function authentifierClientEndpointOAuth(
  request: Request,
  champs: URLSearchParams,
  contexte: ContextePortail,
  origin: string | null,
  exigerClientId: boolean,
): Promise<{ ok: true; clientId: string } | { ok: false; reponse: Response }> {
  const basic = extraireAuthBasicClient(request);
  if (basic.present && !basic.ok) {
    return { ok: false, reponse: repondreClientInvalide(origin, true) };
  }

  const clientIdCorps = champs.get("client_id");
  const clientSecretCorps = champs.get("client_secret");
  // RFC 6749 §2.3 : interdiction d'employer simultanément Basic et client_secret dans le corps.
  if (basic.present && clientSecretCorps !== null) {
    return {
      ok: false,
      reponse: repondreJsonOAuth({ error: "invalid_request" }, 400, origin),
    };
  }
  if (
    basic.present &&
    basic.ok &&
    clientIdCorps !== null &&
    !basic.candidatsClientId.includes(clientIdCorps.trim())
  ) {
    return {
      ok: false,
      reponse: repondreJsonOAuth({ error: "invalid_request" }, 400, origin),
    };
  }

  const clientId =
    basic.present && basic.ok ? basic.candidatsClientId[0]! : (clientIdCorps ?? "").trim();
  const candidatsSecret =
    basic.present && basic.ok
      ? basic.candidatsSecret
      : clientSecretCorps !== null && clientSecretCorps.length > 0
        ? [clientSecretCorps]
        : [];
  const aFourniSecret =
    basic.present || (clientSecretCorps !== null && clientSecretCorps.length > 0);

  if (clientId.length === 0) {
    if (exigerClientId) {
      return {
        ok: false,
        reponse: repondreJsonOAuth({ error: "invalid_grant" }, 400, origin),
      };
    }
    if (aFourniSecret) {
      return { ok: false, reponse: repondreClientInvalide(origin, basic.present) };
    }
    return { ok: true, clientId: "" };
  }

  if (clientId.startsWith("dcr1.")) {
    const dcr = await verifierClientDcrSansEtat(contexte.env, clientId);
    if (!dcr) {
      return { ok: false, reponse: repondreClientInvalide(origin, basic.present) };
    }
    if (dcr.methodeAuth === "none") {
      if (aFourniSecret) {
        return { ok: false, reponse: repondreClientInvalide(origin, basic.present) };
      }
    } else if (dcr.methodeAuth === "client_secret_basic") {
      if (
        !basic.present ||
        !basic.ok ||
        !(await verifierAuthentificationClientDcr(contexte.env, clientId, candidatsSecret))
      ) {
        return { ok: false, reponse: repondreClientInvalide(origin, true) };
      }
    } else {
      if (
        basic.present ||
        candidatsSecret.length === 0 ||
        !(await verifierAuthentificationClientDcr(contexte.env, clientId, candidatsSecret))
      ) {
        return { ok: false, reponse: repondreClientInvalide(origin, basic.present) };
      }
    }
    return { ok: true, clientId };
  }

  const clientPreinscrit = await contexte.env.DB_IDENTITE.prepare(
    `SELECT actif, empreinte_secret
     FROM client_oauth
     WHERE client_id = ?1
     LIMIT 1`,
  )
    .bind(clientId)
    .first<{ actif: number; empreinte_secret: string | null }>();

  if (clientPreinscrit) {
    if (clientPreinscrit.actif !== 1) {
      return { ok: false, reponse: repondreClientInvalide(origin, basic.present) };
    }
    if (clientPreinscrit.empreinte_secret !== null) {
      if (candidatsSecret.length === 0) {
        return { ok: false, reponse: repondreClientInvalide(origin, basic.present) };
      }
      let secretValide = false;
      for (const candidat of candidatsSecret) {
        const empreinteSoumise = await empreinte(candidat);
        const correspond = await memeSecret(empreinteSoumise, clientPreinscrit.empreinte_secret);
        if (correspond) secretValide = true;
      }
      if (!secretValide) {
        return { ok: false, reponse: repondreClientInvalide(origin, basic.present) };
      }
    } else if (aFourniSecret) {
      return { ok: false, reponse: repondreClientInvalide(origin, basic.present) };
    }
  } else if (aFourniSecret) {
    return { ok: false, reponse: repondreClientInvalide(origin, basic.present) };
  }

  return { ok: true, clientId };
}

export async function gererRouteToken(
  request: Request,
  contexte: ContextePortail,
): Promise<Response> {
  const origines = originesAdmises(contexte.env.ALLOWED_ORIGINS);
  if (origineRefusee(request, origines)) {
    return origineInterdite();
  }
  const origin = origineAutorisee(request, origines);
  if (request.method === "OPTIONS") {
    return preflight(origin ?? "*");
  }
  if (request.method !== "POST") {
    return methodeNonPermise(origin);
  }

  const debitOk = await debitAcceptable(contexte.env.RL_OAUTH_IP, contexte.ipClient);
  if (!debitOk) {
    return tropDeRequetes(60, origin);
  }

  const lecture = await lireFormulaireBorne(request);
  if (!lecture.ok) {
    return repondreJsonOAuth({ error: "invalid_request" }, 400, origin);
  }
  const champs = lecture.champs;

  if (champs.get("grant_type") !== "authorization_code") {
    return repondreJsonOAuth({ error: "unsupported_grant_type" }, 400, origin);
  }

  const authClient = await authentifierClientEndpointOAuth(request, champs, contexte, origin, true);
  if (!authClient.ok) {
    return authClient.reponse;
  }
  const { clientId } = authClient;

  const code = (champs.get("code") ?? "").trim();
  const redirectUri = (champs.get("redirect_uri") ?? "").trim();
  const codeVerifier = (champs.get("code_verifier") ?? "").trim();

  if (!estJetonFrappe(code) || redirectUri.length === 0) {
    return repondreJsonOAuth({ error: "invalid_grant" }, 400, origin);
  }

  const maintenant = contexte.maintenant();
  const maintenantMs = maintenant.getTime();
  const maintenantIso = horodatageIsoUtc(maintenant);
  const empreinteCode = await empreinte(code);

  const codeRow = await contexte.env.DB_IDENTITE.prepare(
    `SELECT
      c.id, c.titulaire_id, c.client_id, c.redirect_uri, c.portee,
      c.defi_pkce, c.methode_pkce, c.expire_le, c.consomme_le,
      t.etat AS titulaire_etat
     FROM code_oauth c
     INNER JOIN titulaire t ON t.id = c.titulaire_id
     WHERE c.empreinte_code = ?1
     LIMIT 1`,
  )
    .bind(empreinteCode)
    .first<{
      id: string;
      titulaire_id: string;
      client_id: string;
      redirect_uri: string;
      portee: string;
      defi_pkce: string;
      methode_pkce: string;
      expire_le: string;
      consomme_le: string | null;
      titulaire_etat: string;
    }>();

  if (!codeRow) {
    await verifierDefiPkceS256("a".repeat(43), "A".repeat(43));
    return repondreJsonOAuth({ error: "invalid_grant" }, 400, origin);
  }

  // OAuth 2.1 §4.1.2 : tout rejeu d'un code déjà consommé révoque immédiatement le jeton qui en était issu.
  if (codeRow.consomme_le !== null) {
    await contexte.env.DB_IDENTITE.prepare(
      `UPDATE jeton
       SET revoque_le = ?2, motif_revoc = 'compromission'
       WHERE id = ?1 AND revoque_le IS NULL`,
    )
      .bind(identifiantJetonPourCodeOAuth(codeRow.id), maintenantIso)
      .run();
    await verifierDefiPkceS256("a".repeat(43), "A".repeat(43));
    return repondreJsonOAuth({ error: "invalid_grant" }, 400, origin);
  }

  const expMs = horodatageUtcMs(codeRow.expire_le);
  if (expMs === null || expMs <= maintenantMs) {
    await verifierDefiPkceS256("a".repeat(43), "A".repeat(43));
    return repondreJsonOAuth({ error: "invalid_grant" }, 400, origin);
  }

  // Consommation atomique immédiate à la première présentation : tout échec ultérieur (PKCE,
  // client_id, redirect_uri, resource ou scope) brûle définitivement le code à usage unique.
  const conso = await contexte.env.DB_IDENTITE.prepare(
    `UPDATE code_oauth
     SET consomme_le = ?2
     WHERE id = ?1 AND consomme_le IS NULL AND expire_le > ?2`,
  )
    .bind(codeRow.id, maintenantIso)
    .run();

  if ((conso.meta?.changes ?? 0) !== 1) {
    await contexte.env.DB_IDENTITE.prepare(
      `UPDATE jeton
       SET revoque_le = ?2, motif_revoc = 'compromission'
       WHERE id = ?1 AND revoque_le IS NULL`,
    )
      .bind(identifiantJetonPourCodeOAuth(codeRow.id), maintenantIso)
      .run();
    await verifierDefiPkceS256("a".repeat(43), "A".repeat(43));
    return repondreJsonOAuth({ error: "invalid_grant" }, 400, origin);
  }

  const pkceOk = await verifierDefiPkceS256(codeVerifier, codeRow.defi_pkce, codeRow.methode_pkce);
  if (
    !pkceOk ||
    codeRow.client_id !== clientId ||
    codeRow.redirect_uri !== redirectUri ||
    !estEtatServi(codeRow.titulaire_etat)
  ) {
    return repondreJsonOAuth({ error: "invalid_grant" }, 400, origin);
  }

  // Validation RFC 8707 `resource` et restriction éventuelle de portée (`scope`) sur /oauth/token
  let porteeFinale = codeRow.portee;
  const scopeTokenFiltre = filtrerJetonsPorteeTiers(champs.get("scope"));
  const aScopeTokenExplicite = scopeTokenFiltre !== null && scopeTokenFiltre.length > 0;
  if (aScopeTokenExplicite) {
    const porteeToken = normaliserPorteeOAuth(scopeTokenFiltre, SERVICES_MCP);
    if (!porteeToken || !verifierSousPorteeAutorisee(porteeToken, codeRow.portee)) {
      return repondreJsonOAuth({ error: "invalid_scope" }, 400, origin);
    }
    porteeFinale = porteeToken;
  }

  const resourceTokenBrut = champs.get("resource");
  if (resourceTokenBrut !== null && resourceTokenBrut.trim().length > 0) {
    const cleRes = sansBarresFinales(resourceTokenBrut.trim());
    if (!Object.hasOwn(RESSOURCES_OAUTH_CONNUES, cleRes)) {
      return repondreJsonOAuth({ error: "invalid_target" }, 400, origin);
    }
    const serviceResource = RESSOURCES_OAUTH_CONNUES[cleRes]!;
    if (!porteeAutorisee(porteeFinale, serviceResource)) {
      return repondreJsonOAuth({ error: "invalid_target" }, 400, origin);
    }
    if (!aScopeTokenExplicite) {
      porteeFinale = serviceResource;
    }
  }

  const accessToken = frapperJeton();
  const empreinteAccess = await empreinte(accessToken);
  const queue = queueJeton(accessToken);
  const expireJetonIso = horodatageIsoUtc(
    new Date(maintenantMs + DUREE_JETON_OAUTH_SECONDES * 1_000),
  );
  let libelleJeton: string;
  if (clientId.startsWith("dcr1.")) {
    const dcr = await verifierClientDcrSansEtat(contexte.env, clientId);
    const nomClient = (dcr?.libelle ?? "Client dynamique").slice(0, 32);
    let hoteRappel = "rappel";
    try {
      hoteRappel = new URL(redirectUri).hostname.slice(0, 20);
    } catch {
      // Ignoré
    }
    libelleJeton = `OAuth 2.1 (${nomClient} — ${hoteRappel})`.slice(0, 64);
  } else {
    libelleJeton = `OAuth 2.1 (${clientId.slice(0, 48)})`;
  }

  await contexte.env.DB_IDENTITE.prepare(
    `INSERT INTO jeton (
      id, titulaire_id, empreinte, queue, libelle, portee, emis_le, expire_le, revoque_le, motif_revoc, vu_le
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL, NULL)`,
  )
    .bind(
      identifiantJetonPourCodeOAuth(codeRow.id),
      codeRow.titulaire_id,
      empreinteAccess,
      queue,
      libelleJeton,
      porteeFinale,
      maintenantIso,
      expireJetonIso,
    )
    .run();

  return repondreJsonOAuth(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: DUREE_JETON_OAUTH_SECONDES,
      scope: porteeFinale,
    },
    200,
    origin,
  );
}

export async function gererRouteRevoke(
  request: Request,
  contexte: ContextePortail,
): Promise<Response> {
  const origines = originesAdmises(contexte.env.ALLOWED_ORIGINS);
  if (origineRefusee(request, origines)) {
    return origineInterdite();
  }
  const origin = origineAutorisee(request, origines);
  if (request.method === "OPTIONS") {
    return preflight(origin ?? "*");
  }
  if (request.method !== "POST") {
    return methodeNonPermise(origin);
  }

  const debitOk = await debitAcceptable(contexte.env.RL_OAUTH_IP, contexte.ipClient);
  if (!debitOk) {
    return tropDeRequetes(60, origin);
  }

  const lecture = await lireFormulaireBorne(request);
  if (!lecture.ok) {
    return repondreJsonOAuth({ error: "invalid_request" }, 400, origin);
  }
  const champs = lecture.champs;

  const authClient = await authentifierClientEndpointOAuth(
    request,
    champs,
    contexte,
    origin,
    false,
  );
  if (!authClient.ok) {
    return authClient.reponse;
  }

  const token = (champs.get("token") ?? "").trim();
  if (estJetonFrappe(token)) {
    const empreinteHex = await empreinte(token);
    const maintenantIso = horodatageIsoUtc(contexte.maintenant());
    await contexte.env.DB_IDENTITE.prepare(
      `UPDATE jeton
       SET revoque_le = ?2, motif_revoc = 'titulaire'
       WHERE empreinte = ?1 AND revoque_le IS NULL`,
    )
      .bind(empreinteHex, maintenantIso)
      .run();
  }

  return repondreJsonOAuth({}, 200, origin);
}
