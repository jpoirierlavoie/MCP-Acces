import {
  construireSchemaIdentiteD1,
  POLITIQUES_RETENTION_IDENTITE,
  verifierCouvertureRetentionSchema,
  verifierSchemaSansContenuIdentifiant,
} from "@poirierlavoie/mcp-socle";
import { describe, expect, it } from "vitest";
import claudeMd from "../CLAUDE.md?raw";
import geminiMd from "../GEMINI.md?raw";
import licenseRaw from "../LICENSE?raw";
import migration0001 from "../migrations/0001_initial.sql?raw";
import migration0002 from "../migrations/0002_clients_oauth_initiaux.sql?raw";
import noticeRaw from "../NOTICE?raw";
import osvTomlRaw from "../osv-scanner.toml?raw";
import pkgRaw from "../package.json?raw";
import readmeMd from "../README.md?raw";
import securityMd from "../SECURITY.md?raw";
import { PLAFONDS_DEBIT_ARETE, SERVICES_MCP } from "../src/constantes";
import wranglerRaw from "../wrangler.jsonc?raw";

const SOURCES_TS = import.meta.glob<string>("../src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

const TESTS_TS = import.meta.glob<string>("./**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

const SCRIPTS_MJS = import.meta.glob<string>("../scripts/**/*.mjs", {
  query: "?raw",
  import: "default",
  eager: true,
});

function sansCommentairesTs(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function parserJsonc(brut: string): Record<string, unknown> {
  const sansCommentaires = brut
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
  return JSON.parse(sansCommentaires) as Record<string, unknown>;
}

describe("G1 & G2 — Gouvernance, parité documentaire et licence", () => {
  it("package.json déclare mcp-acces, licence Apache-2.0 et zéro dépendance d'exécution", () => {
    const pkg = JSON.parse(pkgRaw) as {
      name: string;
      license: string;
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    expect(pkg.name).toBe("mcp-acces");
    expect(pkg.license).toBe("Apache-2.0");
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    expect(pkg.scripts?.["type-check"]).toBe("tsc --noEmit");
    expect(pkg.scripts?.lint).toBe("biome check .");
    expect(pkg.scripts?.test).toBe("vitest run");
    expect(pkg.scripts?.audit).toBe("node scripts/verifier-audit.mjs");

    const blocsOsv = osvTomlRaw.split(/\[\[\s*IgnoredVulns\s*\]\]/g).slice(1);
    for (const bloc of blocsOsv) {
      const mId = /(?:^|\n)\s*id\s*=\s*"([^"]+)"/.exec(bloc);
      const mReason = /(?:^|\n)\s*reason\s*=\s*"([^"]+)"/.exec(bloc);
      expect(mId?.[1]).toMatch(/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
      expect(mReason?.[1]).toMatch(/^\d{4}-\d{2}-\d{2}\s*:\s*.{20,}/);
    }
  });

  it("CLAUDE.md et GEMINI.md sont identiques octet pour octet et sous 24 000 octets UTF-8", () => {
    expect(claudeMd).toBe(geminiMd);
    const taille = new TextEncoder().encode(geminiMd).byteLength;
    expect(taille).toBeGreaterThan(1_000);
    expect(taille).toBeLessThan(24_000);
    expect(geminiMd).toContain("# MCP-Acces");
    expect(geminiMd).toContain("#v0.8.5");
    expect(geminiMd).not.toContain("#v0.8.4");
    expect(geminiMd).not.toContain("#v0.8.3");
    expect(geminiMd).not.toContain("#v0.8.2");
    expect(securityMd).toContain("#v0.8.5");
    expect(securityMd).not.toContain("#v0.8.4");
    expect(securityMd).not.toContain("#v0.8.3");
    expect(readmeMd).toContain("#v0.8.5");
    expect(readmeMd).not.toContain("#v0.8.4");
    expect(readmeMd).not.toContain(".github/workflows/deploy.yml");
  });

  it("LICENSE conserve Apache-2.0 et NOTICE porte les attributions officielles", () => {
    expect(licenseRaw).toContain("Apache License");
    expect(licenseRaw).toContain("Version 2.0, January 2004");
    expect(noticeRaw).toContain("Apache-2.0");
    expect(noticeRaw).toContain("LégisQuébec");
    expect(noticeRaw).toContain("CanLII");
    expect(noticeRaw).toContain("CC BY-NC-SA 4.0");
    expect(noticeRaw).toContain("GLEIF");
    expect(noticeRaw).toContain("CC0 1.0");
    expect(noticeRaw).toContain("Valet");
    expect(noticeRaw).toContain("Statistique Canada");
    expect(noticeRaw).toContain("Statistics Canada");
    expect(noticeRaw).toContain("T-15.01, r. 2");
  });

  it("README.md et SECURITY.md ne référencent aucun ancien nom de dépôt retiré", () => {
    for (const doc of [readmeMd, securityMd, claudeMd, geminiMd]) {
      expect(doc).not.toContain("MCP-Jurisprudence-Quebec");
      expect(doc).not.toContain("MCP-Legislation-Quebec");
      expect(doc).not.toContain("MCP-Socle-Juridique");
      expect(doc).not.toContain("pratique-civile-outils");
    }

    for (const [nom, texte] of Object.entries({
      "CLAUDE.md": claudeMd,
      "GEMINI.md": geminiMd,
      "README.md": readmeMd,
      "SECURITY.md": securityMd,
      LICENSE: licenseRaw,
      NOTICE: noticeRaw,
      "package.json": pkgRaw,
      "wrangler.jsonc": wranglerRaw,
      "osv-scanner.toml": osvTomlRaw,
      "0001_initial.sql": migration0001,
      "0002_clients_oauth_initiaux.sql": migration0002,
      ...SOURCES_TS,
      ...TESTS_TS,
      ...SCRIPTS_MJS,
    })) {
      expect(texte.startsWith("\uFEFF"), `${nom} ne doit pas porter de BOM UTF-8`).toBe(false);
      expect(texte.includes("\r"), `${nom} doit être en LF pur sans CR`).toBe(false);
    }
  });
});

describe("G13, G18 & G25 — Parité exacte des migrations D1 mcp-identite avec MCP-Socle", () => {
  it("migrations/0001_initial.sql coïncide octet pour octet avec construireSchemaIdentiteD1(['legislation','jurisprudence'])", () => {
    const attendu = construireSchemaIdentiteD1(SERVICES_MCP).trim();
    expect(migration0001.trim()).toBe(attendu);
    expect(verifierSchemaSansContenuIdentifiant(migration0001)).toEqual([]);
    expect(verifierCouvertureRetentionSchema(migration0001, POLITIQUES_RETENTION_IDENTITE)).toEqual(
      [],
    );
  });
});

describe("G9, G10, G12 & G33 — Gardes statiques du code source", () => {
  it("aucun console.*, aucun Math.random, aucune fonction retournant un secret clair et aucun UPDATE/DELETE sur registre_gouverne", () => {
    const signatureSensibleRendantString =
      /export\s+(?:async\s+)?function\s+[A-Za-z0-9_]*(?:clef|key|secret)[A-Za-z0-9_]*\s*(?:<[^>]*>)?\s*\([^)]*\)\s*:\s*(?:Promise<\s*string(?!\s*\[)\s*>|string(?!\s*\[))/i;

    for (const [chemin, contenu] of Object.entries(SOURCES_TS)) {
      const nu = sansCommentairesTs(contenu);
      expect(nu, `${chemin} ne doit pas appeler console.*`).not.toMatch(/\bconsole\./);
      expect(nu, `${chemin} ne doit pas appeler Math.random`).not.toMatch(/\bMath\.random\b/);
      expect(nu, `${chemin} viole G10`).not.toMatch(signatureSensibleRendantString);
      expect(nu, `${chemin} ne doit pas exporter dechiffrer*`).not.toMatch(
        /\bexport\s+(?:async\s+)?function\s+dechiffrer/i,
      );
      expect(nu, `${chemin} viole G12 (UPDATE registre_gouverne)`).not.toMatch(
        /\bUPDATE\s+["`[]?registre_gouverne\b/i,
      );
      expect(nu, `${chemin} viole G12 (DELETE registre_gouverne)`).not.toMatch(
        /\bDELETE\s+FROM\s+["`[]?registre_gouverne\b/i,
      );
      expect(
        nu,
        `${chemin} ne doit pas utiliser redirect: "error" (non pris en charge par workerd)`,
      ).not.toMatch(/\bredirect\s*:\s*["']error["']/);
    }

    for (const sql of [migration0001, migration0002]) {
      expect(sql).not.toMatch(/\bUPDATE\s+["`[]?registre_gouverne\b/i);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\s+["`[]?registre_gouverne\b/i);
    }
  });
});

describe("G34 & G37 — Configuration Wrangler (observability désactivée et namespace_id distincts)", () => {
  it("épingle observability=false, invocation_logs=false, workers_dev=false, send_email et namespace_id 1031/1032", () => {
    const cfg = parserJsonc(wranglerRaw) as {
      workers_dev: boolean;
      observability: {
        enabled: boolean;
        logs: { enabled: boolean; invocation_logs: boolean };
      };
      send_email: Array<{ name: string }>;
      d1_databases: Array<{ binding: string; database_name: string }>;
      ratelimits: Array<{
        name: string;
        namespace_id: string;
        simple: { limit: number; period: number };
      }>;
      triggers: { crons: string[] };
    };

    expect(cfg.workers_dev).toBe(false);
    expect(cfg.observability.enabled).toBe(false);
    expect(cfg.observability.logs.enabled).toBe(false);
    expect(cfg.observability.logs.invocation_logs).toBe(false);

    expect(cfg.send_email).toEqual([{ name: "COURRIEL" }]);
    expect(cfg.d1_databases[0]?.binding).toBe("DB_IDENTITE");
    expect(cfg.d1_databases[0]?.database_name).toBe("mcp-identite");
    expect(cfg.triggers.crons.length).toBeGreaterThan(0);

    expect(cfg.ratelimits).toEqual([
      { name: "RL_DEMANDE_IP", namespace_id: "1031", simple: { limit: 10, period: 60 } },
      { name: "RL_OAUTH_IP", namespace_id: "1032", simple: { limit: 60, period: 60 } },
    ]);

    const tousLesIds = PLAFONDS_DEBIT_ARETE.map((r) => r.namespaceId);
    expect(new Set(tousLesIds).size).toBe(tousLesIds.length);
    expect(tousLesIds).toContain("1031");
    expect(tousLesIds).toContain("1032");
  });
});
