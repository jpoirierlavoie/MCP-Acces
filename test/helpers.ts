import { env } from "cloudflare:workers";
import type { Limiteur } from "@poirierlavoie/mcp-socle";
import migration0001 from "../migrations/0001_initial.sql?raw";
import migration0002 from "../migrations/0002_clients_oauth_initiaux.sql?raw";
import { creerGestionnaireAcces } from "../src/index";
import type { Env } from "../src/types";

export interface CourrielCapture {
  from: string | EmailAddress;
  to?: string | EmailAddress | Array<string | EmailAddress>;
  replyTo?: string | EmailAddress;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export const SECRET_MAITRE_TEST = "maitre_test_v1_au_moins_trente_deux_caracteres_ok_012345";
export const SECRET_CONSOLE_TEST = "console_token_test_au_moins_trente_deux_caracteres_012345";
export const SECRET_EVALUATION_TEST = "evaluation_secret_test_au_moins_trente_deux_caracteres_0123";
export const CLEF_CANLII_VALIDE_TEST = "canlii_clef_individuelle_valide_2026_abcd";

export function decouperInstructionsSql(sql: string): string[] {
  const sansCommentaires = sql.replace(/--.*$/gm, "").trim();
  const instructions: string[] = [];
  let courant = "";
  let dansChaine = false;

  for (let i = 0; i < sansCommentaires.length; i++) {
    const ch = sansCommentaires[i]!;
    if (ch === "'") {
      courant += ch;
      if (dansChaine && sansCommentaires[i + 1] === "'") {
        courant += "'";
        i++;
      } else {
        dansChaine = !dansChaine;
      }
      continue;
    }
    if (ch === ";" && !dansChaine) {
      if (courant.trim().length > 0) {
        instructions.push(courant.trim());
      }
      courant = "";
      continue;
    }
    courant += ch;
  }
  if (courant.trim().length > 0) {
    instructions.push(courant.trim());
  }
  return instructions;
}

export async function reinitialiserBaseIdentite(): Promise<D1Database> {
  const db = env.DB_IDENTITE;
  const tablesInverse = [
    "registre_gouverne",
    "evenement_technique",
    "compteur_jour",
    "code_oauth",
    "client_oauth",
    "session_portail",
    "coffre_clef",
    "jeton",
    "demande_acces",
    "invitation_acces",
    "titulaire",
  ];
  await db.batch(tablesInverse.map((nom) => db.prepare(`DROP TABLE IF EXISTS "${nom}"`)));
  const stmts = [
    db.prepare("PRAGMA foreign_keys = ON"),
    ...decouperInstructionsSql(migration0001).map((s) => db.prepare(s)),
    ...decouperInstructionsSql(migration0002).map((s) => db.prepare(s)),
  ];
  await db.batch(stmts);
  return db;
}

export function creerBoiteCourriel(): SendEmail & {
  readonly messages: CourrielCapture[];
  dernier(): CourrielCapture;
} {
  const messages: CourrielCapture[] = [];
  return {
    messages,
    async send(entree: EmailMessage | EmailMessageBuilder): Promise<EmailSendResult> {
      if (!("subject" in entree)) {
        throw new Error("Envoi MIME brut non attendu dans les tests MCP-Acces.");
      }
      if (
        typeof entree.text !== "string" ||
        !entree.text.trim() ||
        typeof entree.html !== "string" ||
        !entree.html.trim()
      ) {
        throw new Error("Tout courriel sortant doit inclure les versions text et html.");
      }
      messages.push({
        from: entree.from,
        to: entree.to,
        replyTo: entree.replyTo,
        subject: entree.subject,
        text: entree.text,
        html: entree.html,
        headers: entree.headers,
      });
      return { messageId: `msg_${messages.length}` };
    },
    dernier() {
      const m = messages.at(-1);
      if (!m) throw new Error("Aucun courriel envoyé.");
      return m;
    },
  };
}

export function creerLimiteurFenetre(
  plafond: number,
): Limiteur & { compteur(cle: string): number } {
  const comptes = new Map<string, number>();
  return {
    async limit({ key }) {
      const prochain = (comptes.get(key) ?? 0) + 1;
      comptes.set(key, prochain);
      return { success: prochain <= plafond };
    },
    compteur(cle: string) {
      return comptes.get(cle) ?? 0;
    },
  };
}

export function creerExecutionContextTest(): ExecutionContext & { attendre(): Promise<void> } {
  const promesses: Promise<unknown>[] = [];
  const base: Pick<ExecutionContext, "waitUntil" | "passThroughOnException" | "props"> & {
    attendre(): Promise<void>;
  } = {
    waitUntil(p: Promise<unknown>) {
      promesses.push(p);
    },
    passThroughOnException() {},
    props: {},
    async attendre() {
      await Promise.all(promesses);
    },
  };
  return base as ExecutionContext & { attendre(): Promise<void> };
}

export function creerEnvTest(surcharges: Partial<Env> = {}): Env {
  return {
    DB_IDENTITE: env.DB_IDENTITE,
    COURRIEL: creerBoiteCourriel(),
    RL_DEMANDE_IP: creerLimiteurFenetre(10),
    RL_OAUTH_IP: creerLimiteurFenetre(60),
    COFFRE_MAITRE_V1: SECRET_MAITRE_TEST,
    CONSOLE_TOKEN: SECRET_CONSOLE_TEST,
    MCP_ENABLED: "true",
    MODE_ADMISSION: "ouvert",
    ORIGINE_PORTAIL: "https://acces.poirierlavoie.ca",
    EXPEDITEUR_COURRIEL: "noreply@acces.poirierlavoie.ca",
    CANLII_BASE_URL: "https://api.canlii.org/v1",
    COMMIT: "testsha",
    ALLOWED_ORIGINS: "",
    ...surcharges,
  };
}

export function creerFetchSimule(
  options: {
    clefsCanliiValides?: readonly string[];
    erreurReseauCanlii?: string;
    redirectionCanlii?: string;
    documentsCimd?: Record<string, { statut?: number; redirection?: string; corps?: unknown }>;
    appels?: Array<{ url: string; init?: RequestInit }>;
  } = {},
): typeof fetch {
  const valides = new Set(options.clefsCanliiValides ?? [CLEF_CANLII_VALIDE_TEST]);
  return async (entree: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const reqValidee = new Request(entree, init);
    const urlStr = reqValidee.url;
    options.appels?.push({ url: urlStr, init });

    const u = new URL(urlStr);
    if (u.origin === "https://api.canlii.org" && u.pathname === "/v1/caseBrowse/fr/") {
      if (options.redirectionCanlii) {
        return Response.redirect(options.redirectionCanlii, 302);
      }
      if (options.erreurReseauCanlii) {
        throw new Error(`${options.erreurReseauCanlii} (${urlStr})`);
      }
      const clef = u.searchParams.get("api_key") ?? "";
      if (!valides.has(clef)) {
        return new Response(JSON.stringify({ error: "API key invalid" }), { status: 403 });
      }
      return new Response(
        JSON.stringify({ caseDatabases: [{ databaseId: "qcca", jurisdiction: "qc" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (options.documentsCimd && Object.hasOwn(options.documentsCimd, urlStr)) {
      const spec = options.documentsCimd[urlStr]!;
      if (spec.redirection) {
        return Response.redirect(spec.redirection, 302);
      }
      return new Response(JSON.stringify(spec.corps ?? {}), {
        status: spec.statut ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Appel réseau externe non simulé : ${urlStr}`);
  };
}

export function extraireCsrfHtml(html: string): string {
  const m = /name="csrf"\s+value="([0-9a-f]{64})"/.exec(html);
  if (!m?.[1]) throw new Error("Jeton CSRF introuvable dans le HTML.");
  return m[1];
}

export function extraireJetonConsentementHtml(html: string): string {
  const m = /name="jeton_consentement"\s+value="(\d{10,12}\.[0-9a-f]{64})"/.exec(html);
  if (!m?.[1]) throw new Error("Jeton de consentement OAuth introuvable dans le HTML.");
  return m[1];
}

export function extraireEnteteCookiePair(res: Response): string {
  const sc = res.headers.get("Set-Cookie");
  if (!sc) throw new Error("En-tête Set-Cookie absent.");
  return sc.split(";", 1)[0]!;
}

export function creerAppTest(options?: Parameters<typeof creerGestionnaireAcces>[0]) {
  return creerGestionnaireAcces(options);
}
