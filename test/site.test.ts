import {
  POLITIQUES_RETENTION_IDENTITE,
  QUOTAS_ACTIF_PAR_DEFAUT,
  QUOTAS_LIMITE_PAR_DEFAUT,
} from "@poirierlavoie/mcp-socle";
import { beforeEach, describe, expect, it } from "vitest";
import { SECTIONS_ACCUEIL } from "../src/html/accueil";
import { CHEMINS_DOCUMENTS_GOUVERNANCE } from "../src/html/gouvernance";
import worker from "../src/index";
import {
  creerEnvTest,
  creerExecutionContextTest,
  reinitialiserBaseIdentite,
  SECRET_CONSOLE_TEST,
  SECRET_MAITRE_TEST,
} from "./helpers";

async function demander(
  chemin: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    env?: ReturnType<typeof creerEnvTest>;
  } = {},
): Promise<Response> {
  const ctx = creerExecutionContextTest();
  const req = new Request(`https://acces.poirierlavoie.ca${chemin}`, {
    method: opts.method ?? "GET",
    headers: opts.headers,
  });
  const res = await worker.fetch(req, opts.env ?? creerEnvTest(), ctx);
  await ctx.attendre();
  return res;
}

describe("Pages publiques, CSP stricte, bilinguisme et coupe-circuit G22", () => {
  beforeEach(async () => {
    await reinitialiserBaseIdentite();
  });

  it("GET /, HEAD /, POST / (405) et routes inconnues (404)", async () => {
    const getRes = await demander("/");
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("Content-Type")).toMatch(/^text\/html/);
    const html = await getRes.text();
    expect(html.startsWith("<!doctype html>")).toBe(true);

    const headRes = await demander("/", { method: "HEAD" });
    expect(headRes.status).toBe(200);
    expect(await headRes.text()).toBe("");

    const postRes = await demander("/", { method: "POST" });
    expect(postRes.status).toBe(405);
    expect(postRes.headers.get("Allow")).toBe("GET, HEAD");

    for (const inconnu of [
      "/inconnu",
      "/mcp",
      "/favicon.ico",
      "/.well-known/oauth-protected-resource",
    ]) {
      expect((await demander(inconnu)).status, inconnu).toBe(404);
    }
  });

  it("G22 : MCP_ENABLED !== 'true' coupe toutes les routes opérationnelles mais préserve GET / et les 5 documents publics", async () => {
    for (const valeurCoupe of ["false", "", undefined]) {
      const envCoupe = creerEnvTest({ MCP_ENABLED: valeurCoupe });
      expect((await demander("/", { env: envCoupe })).status).toBe(200);
      for (const doc of CHEMINS_DOCUMENTS_GOUVERNANCE) {
        expect((await demander(doc, { env: envCoupe })).status, doc).toBe(200);
      }

      for (const operationnelle of [
        "/health",
        "/.well-known/oauth-authorization-server",
        "/demande",
        "/demande/confirmer",
        "/moi",
        "/moi/connexion",
        "/exploitant",
        "/oauth/register",
        "/oauth/authorize",
        "/oauth/token",
        "/oauth/revoke",
      ]) {
        expect((await demander(operationnelle, { env: envCoupe })).status, operationnelle).toBe(
          404,
        );
      }
    }

    const santeOk = await demander("/health");
    expect(santeOk.status).toBe(200);
    expect(await santeOk.json()).toEqual({ status: "ok", commit: "testsha" });
  });

  it("applique une CSP stricte à nonce, zéro CORS, zéro secret, zéro tiers, zéro couleur en dur et parité bilingue", async () => {
    for (const chemin of ["/", ...CHEMINS_DOCUMENTS_GOUVERNANCE]) {
      const res = await demander(chemin, { headers: { Origin: "https://claude.ai" } });
      expect(res.status, chemin).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin"), chemin).toBeNull();
      expect(res.headers.get("X-Content-Type-Options"), chemin).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options"), chemin).toBe("DENY");

      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("form-action 'none'");
      expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9_-]{43}'/);

      const html = await res.text();
      expect(html).not.toContain(SECRET_MAITRE_TEST);
      expect(html).not.toContain(SECRET_CONSOLE_TEST);
      expect(html).not.toMatch(/<script[^>]+src=/i);
      expect(html).not.toMatch(/<link[^>]+stylesheet/i);
      expect(html).not.toContain("@import");

      // Parité bilingue exacte sur les pages publiques
      const fr = (html.match(/data-l="fr"/g) ?? []).length;
      const en = (html.match(/data-l="en"/g) ?? []).length;
      expect(fr, `${chemin} parité FR/EN`).toBe(en);
      expect(fr).toBeGreaterThan(4);

      // Symétrie des thèmes CSS et absence de couleur en dur hors CLAIR/SOMBRE
      const css = html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
      const sansJeux = css.replace(/^[\s\S]*?html\.t-dark\{[^}]*\}/, "");
      expect(sansJeux).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(sansJeux).not.toMatch(/\b(rgba?|hsla?)\(/i);
      const vars = (bloc: string) => [...bloc.matchAll(/(--[a-z-]+):/g)].map((m) => m[1]).sort();
      const clair = /html\.t-light\{([^}]*)\}/.exec(css)?.[1] ?? "";
      const sombre = /html\.t-dark\{([^}]*)\}/.exec(css)?.[1] ?? "";
      expect(vars(clair)).toEqual(vars(sombre));
    }

    const htmlAccueil = await (await demander("/")).text();
    for (const s of SECTIONS_ACCUEIL) {
      expect(htmlAccueil).toContain(`<a href="#${s.id}"`);
      expect(htmlAccueil).toContain(`<h2 id="${s.id}"`);
    }
  });

  it("S20 & G18 : /conformite, /gouverne et /cgu reflètent exactement les constantes du code et les clauses requises", async () => {
    const conformiteHtml = await (await demander("/conformite")).text();
    for (const p of POLITIQUES_RETENTION_IDENTITE) {
      expect(conformiteHtml).toContain(`<code>${p.table}</code>`);
      expect(conformiteHtml).toContain(`<code>${p.purgeCode}</code>`);
    }
    expect(conformiteHtml).toContain("Workers AI");
    expect(conformiteHtml).toContain("hybride_permis");
    expect(conformiteHtml).toContain("alertes d&#39;admission confirmée à l&#39;exploitant");
    expect(conformiteHtml).toContain("confirmed-application alerts to the operator");

    const gouverneHtml = await (await demander("/gouverne")).text();
    expect(gouverneHtml).toContain(QUOTAS_ACTIF_PAR_DEFAUT.local.toLocaleString("fr-CA"));
    expect(gouverneHtml).toContain(String(QUOTAS_ACTIF_PAR_DEFAUT.sortant));
    expect(gouverneHtml).toContain(String(QUOTAS_ACTIF_PAR_DEFAUT.semantique));
    expect(gouverneHtml).toContain(String(QUOTAS_LIMITE_PAR_DEFAUT.local));
    expect(gouverneHtml).toContain("1031");
    expect(gouverneHtml).toContain("1032");

    const cguHtml = await (await demander("/cgu")).text();
    expect(cguHtml).toContain("Autorisation complémentaire de pratique professionnelle du droit");
    expect(cguHtml).toContain("avocat plaideur en exercice");
    expect(cguHtml).toContain("zéro SLA");
    expect(cguHtml).toContain("5 jours ouvrables");
  });
});
