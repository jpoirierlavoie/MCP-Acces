/**
 * Primitives de sécurité HTTP du portail `MCP-Acces` :
 * - lecture bornée et fatale UTF-8 des corps `application/x-www-form-urlencoded` et octets ;
 * - cookies `__Host-` `HttpOnly; Secure; SameSite=Lax|Strict` ;
 * - encapsulation stricte des secrets `COFFRE_MAITRE_V1` et `CONSOLE_TOKEN` (`G10` : aucune fonction
 *   exportée ne retourne de secret en clair) ;
 * - jetons CSRF sans état dérivés par `HMAC-SHA256` liés à la session active et vérifiés via `memeSecret` ;
 * - validation anti-redirection ouverte des chemins de retour internes.
 */

import {
  type AnneauMaitresCoffre,
  bearerOf,
  type EntreeCoffreScellee,
  frapperJeton,
  LONGUEUR_MIN_MAITRE_COFFRE,
  memeSecret,
  scellerCoffre,
} from "@poirierlavoie/mcp-socle";
import {
  DUREE_SESSION_EXPLOITANT_SECONDES,
  SECTIONS_BARREAU,
  type SectionBarreau,
  USAGE_COFFRE_CANLII,
  VERSION_COFFRE_COURANTE,
} from "./constantes";
import type { Env } from "./types";

export const MAX_OCTETS_FORMULAIRE = 16_384;
export const MAX_OCTETS_CIMD = 32_768;
export const DUREE_CONSENTEMENT_OAUTH_SECONDES = 600;

const NOM_COOKIE_MOI_HTTPS = "__Host-acces_moi";
const NOM_COOKIE_MOI_HTTP = "acces_moi";
const NOM_COOKIE_EXPLOITANT_HTTPS = "__Host-acces_exploitant";
const NOM_COOKIE_EXPLOITANT_HTTP = "acces_exploitant";

export function repondreMethodeNonPermise(methodesAutorisees: readonly string[]): Response {
  return new Response(null, {
    status: 405,
    headers: { Allow: methodesAutorisees.join(", ") },
  });
}

export function creerIdentifiant(prefixe: string): string {
  return `${prefixe}_${frapperJeton().slice(0, 24)}`;
}

function lireMaitreInterne(env: Env): string | null {
  const brut = env.COFFRE_MAITRE_V1;
  if (typeof brut !== "string") return null;
  const propre = brut.trim();
  return propre.length >= LONGUEUR_MIN_MAITRE_COFFRE ? propre : null;
}

function lireConsoleInterne(env: Env): string | null {
  const brut = env.CONSOLE_TOKEN;
  if (typeof brut !== "string") return null;
  const propre = brut.trim();
  return propre.length >= 32 ? propre : null;
}

export function estCoffreConfigure(env: Env): boolean {
  return lireMaitreInterne(env) !== null;
}

export function estConsoleConfiguree(env: Env): boolean {
  return lireConsoleInterne(env) !== null;
}

export function construireAnneauMaitres(env: Env): AnneauMaitresCoffre {
  const anneau: Record<number, string | undefined> = {};
  if (typeof env.COFFRE_MAITRE_V1 === "string" && env.COFFRE_MAITRE_V1.trim().length > 0) {
    anneau[1] = env.COFFRE_MAITRE_V1.trim();
  }
  if (typeof env.COFFRE_MAITRE_V2 === "string" && env.COFFRE_MAITRE_V2.trim().length > 0) {
    anneau[2] = env.COFFRE_MAITRE_V2.trim();
  }
  return anneau;
}

export async function scellerClefCanliiPourTitulaire(
  env: Env,
  titulaireId: string,
  clefCanlii: string,
): Promise<EntreeCoffreScellee | null> {
  const maitre = lireMaitreInterne(env);
  if (!maitre) return null;
  return await scellerCoffre(clefCanlii, {
    titulaireId,
    usage: USAGE_COFFRE_CANLII,
    version: VERSION_COFFRE_COURANTE,
    maitre,
  });
}

export async function lireOctetsBornes(
  flux: ReadableStream<Uint8Array> | null,
  maxOctets: number,
): Promise<{ ok: true; octets: Uint8Array } | { ok: false; motif: "TROP_GRAND" | "LECTURE" }> {
  if (!flux) {
    return { ok: true, octets: new Uint8Array(0) };
  }
  const lecteur = flux.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await lecteur.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxOctets) {
          await lecteur.cancel().catch(() => {});
          return { ok: false, motif: "TROP_GRAND" };
        }
        morceaux.push(value);
      }
    }
  } catch {
    return { ok: false, motif: "LECTURE" };
  }

  const resultat = new Uint8Array(total);
  let offset = 0;
  for (const m of morceaux) {
    resultat.set(m, offset);
    offset += m.byteLength;
  }
  return { ok: true, octets: resultat };
}

export type ResultatFormulaire =
  | { readonly ok: true; readonly champs: URLSearchParams }
  | { readonly ok: false; readonly statut: 400 | 413 | 415; readonly message: string };

export async function lireFormulaireBorne(
  request: Request,
  maxOctets = MAX_OCTETS_FORMULAIRE,
): Promise<ResultatFormulaire> {
  const ct = (request.headers.get("Content-Type") ?? "").toLowerCase();
  if (!ct.startsWith("application/x-www-form-urlencoded")) {
    return {
      ok: false,
      statut: 415,
      message: "En-tête Content-Type application/x-www-form-urlencoded requis.",
    };
  }
  const cl = request.headers.get("Content-Length");
  if (cl !== null) {
    const n = Number(cl);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, statut: 400, message: "En-tête Content-Length invalide." };
    }
    if (n > maxOctets) {
      return { ok: false, statut: 413, message: "Corps de formulaire trop volumineux." };
    }
  }
  const lecture = await lireOctetsBornes(request.body, maxOctets);
  if (!lecture.ok) {
    return lecture.motif === "TROP_GRAND"
      ? { ok: false, statut: 413, message: "Corps de formulaire trop volumineux." }
      : { ok: false, statut: 400, message: "Lecture du corps interrompue." };
  }
  let texte: string;
  try {
    texte = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(lecture.octets);
  } catch {
    return { ok: false, statut: 400, message: "Encodage UTF-8 invalide." };
  }
  return { ok: true, champs: new URLSearchParams(texte) };
}

/**
 * Vérifie sur tout `POST` de formulaire navigateur que la requête provient de la même origine
 * (`same-origin` uniquement, rejetant à la fois `cross-site` et les sous-domaines voisins `same-site`).
 */
export function estOrigineFormulaireValide(request: Request, urlRequete: URL): boolean {
  const secFetchSiteBrut = request.headers.get("Sec-Fetch-Site");
  const modeFetch = secFetchSiteBrut !== null ? secFetchSiteBrut.trim().toLowerCase() : null;
  if (modeFetch !== null && modeFetch !== "same-origin" && modeFetch !== "none") {
    return false;
  }
  const origin = request.headers.get("Origin");
  if (origin !== null) {
    if (origin === "null") {
      return modeFetch === "same-origin";
    }
    return origin === urlRequete.origin;
  }
  const referer = request.headers.get("Referer");
  if (referer !== null) {
    try {
      return new URL(referer).origin === urlRequete.origin;
    } catch {
      return false;
    }
  }
  return true;
}

export function lireCookies(request: Request): Map<string, string> {
  const carte = new Map<string, string>();
  const brut = request.headers.get("Cookie");
  if (!brut || brut.length > 8_192) return carte;
  for (const segment of brut.split(";")) {
    const idx = segment.indexOf("=");
    if (idx <= 0) continue;
    const nom = segment.slice(0, idx).trim();
    const val = segment.slice(idx + 1).trim();
    if (nom.length > 0 && !carte.has(nom)) {
      carte.set(nom, val);
    }
  }
  return carte;
}

export function lireCookieMoi(request: Request, estHttps: boolean): string | null {
  const cookies = lireCookies(request);
  return cookies.get(estHttps ? NOM_COOKIE_MOI_HTTPS : NOM_COOKIE_MOI_HTTP) ?? null;
}

export function construireCookieMoi(valeur: string, estHttps: boolean, maxAgeSec: number): string {
  const nom = estHttps ? NOM_COOKIE_MOI_HTTPS : NOM_COOKIE_MOI_HTTP;
  const secure = estHttps ? "; Secure" : "";
  return `${nom}=${valeur}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function effacerCookieMoi(estHttps: boolean): string {
  return construireCookieMoi("", estHttps, 0);
}

function lireCookieExploitant(request: Request, estHttps: boolean): string | null {
  const cookies = lireCookies(request);
  return cookies.get(estHttps ? NOM_COOKIE_EXPLOITANT_HTTPS : NOM_COOKIE_EXPLOITANT_HTTP) ?? null;
}

export function construireCookieExploitant(
  valeur: string,
  estHttps: boolean,
  maxAgeSec = DUREE_SESSION_EXPLOITANT_SECONDES,
): string {
  const nom = estHttps ? NOM_COOKIE_EXPLOITANT_HTTPS : NOM_COOKIE_EXPLOITANT_HTTP;
  const secure = estHttps ? "; Secure" : "";
  return `${nom}=${valeur}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

export function effacerCookieExploitant(estHttps: boolean): string {
  return construireCookieExploitant("", estHttps, 0);
}

async function signerHmacHex(materiau: string, contexte: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cle = await crypto.subtle.importKey(
    "raw",
    enc.encode(`${materiau}:${contexte}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cle, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function calculerJetonCsrfMoi(
  env: Env,
  identifiantSession: string,
): Promise<string | null> {
  const maitre = lireMaitreInterne(env);
  if (!maitre) return null;
  return await signerHmacHex(maitre, "csrf-moi-v1", identifiantSession);
}

export async function verifierJetonCsrfMoi(
  env: Env,
  soumis: string | null | undefined,
  identifiantSession: string,
): Promise<boolean> {
  const maitre = lireMaitreInterne(env);
  if (!maitre || typeof soumis !== "string" || !/^[0-9a-f]{64}$/.test(soumis)) {
    await memeSecret("0".repeat(64), "0".repeat(64));
    return false;
  }
  const attendu = await signerHmacHex(maitre, "csrf-moi-v1", identifiantSession);
  return await memeSecret(soumis, attendu);
}

export interface ParametresConsentementOAuth {
  readonly sessionId: string;
  readonly empreinteSession: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly portee: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: string;
  readonly state: string | null;
  readonly resource: string | null;
}

function serialiserConsentementOAuth(
  expireEpochSec: string,
  params: ParametresConsentementOAuth,
): string {
  return JSON.stringify([
    expireEpochSec,
    params.sessionId,
    params.empreinteSession,
    params.clientId,
    params.redirectUri,
    params.portee,
    params.codeChallenge,
    params.codeChallengeMethod,
    params.state ?? "",
    params.resource ?? "",
  ]);
}

export async function calculerJetonConsentementOAuth(
  env: Env,
  params: ParametresConsentementOAuth,
  maintenantMs: number,
  dureeSec = DUREE_CONSENTEMENT_OAUTH_SECONDES,
): Promise<string | null> {
  const maitre = lireMaitreInterne(env);
  if (!maitre) return null;
  const expStr = String(Math.floor(maintenantMs / 1_000) + dureeSec);
  const sig = await signerHmacHex(
    maitre,
    "consentement-oauth-v1",
    serialiserConsentementOAuth(expStr, params),
  );
  return `${expStr}.${sig}`;
}

export async function verifierJetonConsentementOAuth(
  env: Env,
  soumis: string | null | undefined,
  params: ParametresConsentementOAuth,
  maintenantMs: number,
): Promise<boolean> {
  const maitre = lireMaitreInterne(env);
  if (!maitre || typeof soumis !== "string" || soumis.length > 100) {
    await memeSecret("0".repeat(64), "0".repeat(64));
    return false;
  }
  const idx = soumis.indexOf(".");
  if (idx <= 0) {
    await memeSecret("0".repeat(64), "0".repeat(64));
    return false;
  }
  const expStr = soumis.slice(0, idx);
  const sigSoumise = soumis.slice(idx + 1);
  if (!/^\d{10,12}$/.test(expStr) || !/^[0-9a-f]{64}$/.test(sigSoumise)) {
    await memeSecret("0".repeat(64), "0".repeat(64));
    return false;
  }
  const sigAttendue = await signerHmacHex(
    maitre,
    "consentement-oauth-v1",
    serialiserConsentementOAuth(expStr, params),
  );
  const valide = await memeSecret(sigSoumise, sigAttendue);
  if (!valide) return false;
  const expMs = Number(expStr) * 1_000;
  return Number.isFinite(expMs) && expMs > maintenantMs;
}

export async function verifierJetonConsoleSoumis(env: Env, soumis: string): Promise<boolean> {
  const consoleToken = lireConsoleInterne(env);
  if (!consoleToken || soumis.length === 0) {
    await memeSecret("0".repeat(64), "0".repeat(64));
    return false;
  }
  return await memeSecret(soumis, consoleToken);
}

export async function creerEnTeteCookieSessionExploitant(
  env: Env,
  estHttps: boolean,
  maintenantMs: number,
  dureeSec = DUREE_SESSION_EXPLOITANT_SECONDES,
): Promise<string | null> {
  const consoleToken = lireConsoleInterne(env);
  if (!consoleToken) return null;
  const nonce = frapperJeton();
  const expireEpochSec = Math.floor(maintenantMs / 1_000) + dureeSec;
  const charge = `${expireEpochSec}.${nonce}`;
  const sig = await signerHmacHex(consoleToken, "session-exploitant-v1", charge);
  return construireCookieExploitant(`${charge}.${sig}`, estHttps, dureeSec);
}

async function verifierCookieExploitantInterne(
  cookieBrut: string | null,
  consoleToken: string,
  maintenantMs: number,
): Promise<string | null> {
  if (!cookieBrut || cookieBrut.length > 200) {
    await memeSecret("0".repeat(64), "0".repeat(64));
    return null;
  }
  const parties = cookieBrut.split(".");
  if (parties.length !== 3) {
    await memeSecret("0".repeat(64), "0".repeat(64));
    return null;
  }
  const [expStr, nonce, sigSoumise] = parties;
  if (
    !expStr ||
    !nonce ||
    !sigSoumise ||
    !/^\d{10,12}$/.test(expStr) ||
    !/^[A-Za-z0-9_-]{43}$/.test(nonce) ||
    !/^[0-9a-f]{64}$/.test(sigSoumise)
  ) {
    await memeSecret("0".repeat(64), "0".repeat(64));
    return null;
  }
  const charge = `${expStr}.${nonce}`;
  const sigAttendue = await signerHmacHex(consoleToken, "session-exploitant-v1", charge);
  const valide = await memeSecret(sigSoumise, sigAttendue);
  if (!valide) return null;

  const expMs = Number(expStr) * 1_000;
  if (!Number.isFinite(expMs) || expMs <= maintenantMs) return null;
  return charge;
}

export type VerdictAuthExploitant =
  | { readonly ok: true; readonly via: "bearer"; readonly csrf: null }
  | {
      readonly ok: true;
      readonly via: "cookie";
      readonly csrf: string;
      readonly chargeSession: string;
    }
  | { readonly ok: false; readonly jetonBearerInvalide: boolean };

export async function authentifierRequeteExploitant(
  request: Request,
  url: URL,
  env: Env,
  maintenantMs: number,
): Promise<VerdictAuthExploitant> {
  const consoleToken = lireConsoleInterne(env);
  if (!consoleToken) {
    return { ok: false, jetonBearerInvalide: false };
  }
  const bearer = bearerOf(request);
  if (bearer !== null) {
    const ok = await memeSecret(bearer, consoleToken);
    return ok ? { ok: true, via: "bearer", csrf: null } : { ok: false, jetonBearerInvalide: true };
  }

  const estHttps = url.protocol === "https:";
  const cookie = lireCookieExploitant(request, estHttps);
  const charge = await verifierCookieExploitantInterne(cookie, consoleToken, maintenantMs);
  if (charge !== null) {
    const csrf = await signerHmacHex(consoleToken, "csrf-exploitant-v1", charge);
    return { ok: true, via: "cookie", csrf, chargeSession: charge };
  }

  return { ok: false, jetonBearerInvalide: false };
}

export async function verifierJetonCsrfExploitant(
  env: Env,
  soumis: string | null | undefined,
  chargeSession: string,
): Promise<boolean> {
  const consoleToken = lireConsoleInterne(env);
  if (!consoleToken || typeof soumis !== "string" || !/^[0-9a-f]{64}$/.test(soumis)) {
    await memeSecret("0".repeat(64), "0".repeat(64));
    return false;
  }
  const attendu = await signerHmacHex(consoleToken, "csrf-exploitant-v1", chargeSession);
  return await memeSecret(soumis, attendu);
}

const MOTIF_COURRIEL =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function normaliserCourriel(brut: string | null | undefined): string | null {
  if (typeof brut !== "string") return null;
  const propre = brut.trim().toLowerCase();
  if (propre.length < 5 || propre.length > 254) return null;
  const idxArobase = propre.indexOf("@");
  if (idxArobase < 1 || idxArobase > 64) return null;
  if (!MOTIF_COURRIEL.test(propre)) return null;
  return propre;
}

/**
 * Normalise un numéro de membre du Barreau du Québec (ex. `123456-7` ou `1234567` -> `1234567`)
 * afin d'éviter qu'une variante de tiret contourne l'unicité ou crée un doublon.
 */
export function normaliserNumeroMembre(brut: string | null | undefined): string | null {
  if (typeof brut !== "string") return null;
  const rogne = brut.trim();
  if (!/^\d{4,8}(?:-\d)?$/.test(rogne)) return null;
  const chiffres = rogne.replace(/-/g, "");
  if (chiffres.length < 5 || chiffres.length > 9) return null;
  return chiffres;
}

export function validerSectionBarreau(brut: string | null | undefined): SectionBarreau | null {
  if (typeof brut !== "string") return null;
  const propre = brut.trim();
  return (SECTIONS_BARREAU as readonly string[]).includes(propre)
    ? (propre as SectionBarreau)
    : null;
}

const MOTIF_SEPARATEURS_LIGNE = /[\t\r\n\v\f\u0085\u2028\u2029]+/g;
const MOTIF_CONTROLES_ET_INVISIBLES =
  /(?:\p{Cc}|\p{Cf}|\p{Cs}|\u034F|\u115F|\u1160|\u17B4|\u17B5|\u2800|\u3164|\uFFA0)+/gu;
const MOTIF_CARACTERE_VISIBLE_ALPHANUM = /[\p{L}\p{N}]/u;

export function nettoyerLigneTexte(
  brut: string | null | undefined,
  minLongueur: number,
  maxLongueur: number,
): string | null {
  if (typeof brut !== "string") return null;
  const propre = brut
    .replace(MOTIF_SEPARATEURS_LIGNE, " ")
    .replace(MOTIF_CONTROLES_ET_INVISIBLES, "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
  if (propre.length < minLongueur || propre.length > maxLongueur) return null;
  if (propre.length > 0 && !MOTIF_CARACTERE_VISIBLE_ALPHANUM.test(propre)) return null;
  return propre;
}

export function normaliserValiderFormatCanlii(brut: string | null | undefined): string | null {
  if (typeof brut !== "string") return null;
  const propre = brut.trim();
  if (propre.length < 8 || propre.length > 256) return null;
  for (let i = 0; i < propre.length; i++) {
    const code = propre.charCodeAt(i);
    if (code <= 0x20 || code >= 0x7f) return null;
  }
  return propre;
}

/**
 * N'autorise comme cible de redirection post-connexion que `/moi` ou `/oauth/authorize?...` sur la
 * même origine (aucune URL absolue, aucun `//`, aucun `\`, aucun caractère de contrôle).
 */
export function validerCheminRetourInterne(brut: string | null | undefined): string | null {
  if (typeof brut !== "string" || brut.length === 0 || brut.length > 1_500) return null;
  for (let i = 0; i < brut.length; i++) {
    const code = brut.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return null;
  }
  if (!brut.startsWith("/") || brut.startsWith("//") || brut.includes("\\")) return null;
  let u: URL;
  try {
    u = new URL(brut, "https://acces.poirierlavoie.ca");
  } catch {
    return null;
  }
  if (u.origin !== "https://acces.poirierlavoie.ca" || u.hash !== "") return null;
  if (u.pathname === "/moi") return "/moi";
  if (u.pathname === "/oauth/authorize" && u.search.length > 1) {
    return `${u.pathname}${u.search}`;
  }
  return null;
}
