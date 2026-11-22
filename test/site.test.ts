import {
  POLITIQUES_RETENTION_IDENTITE,
  QUOTAS_ACTIF_PAR_DEFAUT,
  QUOTAS_LIMITE_PAR_DEFAUT,
} from "@poirierlavoie/mcp-socle";
import { beforeEach, describe, expect, it } from "vitest";
import { SECTIONS_ACCUEIL } from "../src/html/accueil";
import { CHEMINS_DECOUVERTE_PUBLIQUE } from "../src/html/decouverte";
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

describe("Pages publiques, CSP stricte, bilinguisme, découverte et coupe-circuit G22", () => {
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

  it("G22 : MCP_ENABLED !== 'true' coupe toutes les routes opérationnelles mais préserve GET /, la découverte et les 5 documents publics", async () => {
    for (const valeurCoupe of ["false", "", undefined]) {
      const envCoupe = creerEnvTest({ MCP_ENABLED: valeurCoupe });
      expect((await demander("/", { env: envCoupe })).status).toBe(200);
      for (const dec of CHEMINS_DECOUVERTE_PUBLIQUE) {
        expect((await demander(dec, { env: envCoupe })).status, dec).toBe(200);
      }
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

  it("sert /robots.txt, /sitemap.xml et /llms.txt sans secret ni CORS (GET, HEAD, 405)", async () => {
    for (const chemin of CHEMINS_DECOUVERTE_PUBLIQUE) {
      const res = await demander(chemin, { headers: { Origin: "https://claude.ai" } });
      expect(res.status, chemin).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin"), chemin).toBeNull();
      expect(res.headers.get("X-Content-Type-Options"), chemin).toBe("nosniff");

      const head = await demander(chemin, { method: "HEAD" });
      expect(head.status, `${chemin} HEAD`).toBe(200);
      expect(await head.text(), `${chemin} HEAD body`).toBe("");

      const post = await demander(chemin, { method: "POST" });
      expect(post.status, `${chemin} POST`).toBe(405);
    }

    const robots = await (await demander("/robots.txt")).text();
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Disallow: /moi");
    expect(robots).toContain("Disallow: /oauth/");
    expect(robots).toContain("Sitemap: https://acces.poirierlavoie.ca/sitemap.xml");

    const sitemap = await (await demander("/sitemap.xml")).text();
    expect(sitemap).toContain("<loc>https://acces.poirierlavoie.ca/</loc>");
    expect(sitemap).toContain("<loc>https://acces.poirierlavoie.ca/cgu</loc>");
    expect(sitemap).not.toContain("/demande");

    const llms = await (await demander("/llms.txt")).text();
    expect(llms).toContain("https://legislation.poirierlavoie.ca/");
    expect(llms).toContain("https://jurisprudence.poirierlavoie.ca/");
    expect(llms).toContain("https://outils.poirierlavoie.ca/");
    expect(llms).toContain(String(QUOTAS_ACTIF_PAR_DEFAUT.local));
    expect(llms).not.toContain(SECRET_MAITRE_TEST);
    expect(llms).not.toContain(SECRET_CONSOLE_TEST);
  });

  it("applique une CSP stricte à nonce, zéro CORS, zéro secret, zéro tiers, zéro id dupliqué, JSON-LD valide et parité bilingue", async () => {
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

      // Aucun attribut id="..." dupliqué dans le document
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!);
      expect(new Set(ids).size, `${chemin} ids uniques`).toBe(ids.length);

      // Barre de navigation inter-connecteurs et lien d'évitement clavier
      expect(html, `${chemin} barre suite`).toContain('<nav class="suite"');
      expect(html, `${chemin} lien lois`).toContain('href="https://legislation.poirierlavoie.ca/"');
      expect(html, `${chemin} lien juris`).toContain(
        'href="https://jurisprudence.poirierlavoie.ca/"',
      );
      expect(html, `${chemin} lien outils`).toContain('href="https://outils.poirierlavoie.ca/"');
      expect(html, `${chemin} saut clavier`).toContain('href="#contenu-principal"');
      expect(html, `${chemin} canonical`).toContain(
        `<link rel="canonical" href="https://acces.poirierlavoie.ca${chemin}">`,
      );
      expect(html, `${chemin} titre EN`).toMatch(/<title data-fr="[^"]+" data-en="[^"]+">/);

      // Schéma JSON-LD valide
      const ldMatch =
        /<script type="application\/ld\+json" nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html);
      expect(ldMatch, `${chemin} JSON-LD`).not.toBeNull();
      const ld = JSON.parse(ldMatch![1]!) as Record<string, unknown>;
      expect(ld["@context"]).toBe("https://schema.org");

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
    expect(htmlAccueil).toContain('href="/" aria-current="page"');
    expect(SECTIONS_ACCUEIL[1]?.id).toBe("connecteurs");
    for (const s of SECTIONS_ACCUEIL) {
      expect(htmlAccueil).toContain(`<a href="#${s.id}"`);
      expect(htmlAccueil).toContain(`<section id="${s.id}"`);
    }

    // /demande porte la barre de suite, le bilinguisme FR/EN et les attributs autocomplete,
    // tandis que /moi et /exploitant demeurent épurés sans barre de suite.
    const htmlDemande = await (
      await demander("/demande", { env: creerEnvTest({ MODE_ADMISSION: "ouvert" }) })
    ).text();
    expect(htmlDemande).toContain('<nav class="suite"');
    expect(htmlDemande).toContain('<meta name="robots" content="noindex">');
    expect(htmlDemande).toMatch(/<title data-fr="[^"]+" data-en="[^"]+">/);
    expect(htmlDemande).toContain('autocomplete="name"');
    expect(htmlDemande).toContain('autocomplete="email"');
    expect(htmlDemande).toContain('autocomplete="organization"');
    const frDemande = (htmlDemande.match(/data-l="fr"/g) ?? []).length;
    const enDemande = (htmlDemande.match(/data-l="en"/g) ?? []).length;
    expect(frDemande).toBe(enDemande);

    const htmlMoi = await (await demander("/moi")).text();
    expect(htmlMoi).not.toContain('<nav class="suite"');
    const htmlExploitant = await (await demander("/exploitant")).text();
    expect(htmlExploitant).not.toContain('<nav class="suite"');
  });

  it("S20 & G18 : /conformite, /gouverne et /cgu reflètent exactement les constantes du code et les clauses requises", async () => {
    const conformiteHtml = await (await demander("/conformite")).text();
    expect(conformiteHtml).not.toContain('aria-current="page"');
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
