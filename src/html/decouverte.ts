/**
 * Fichiers publics de découverte pour moteurs de recherche et agents IA (`/robots.txt`,
 * `/sitemap.xml` et `/llms.txt`) sur `acces.poirierlavoie.ca`.
 *
 * Purs, sans lecture de secret ni d'état de requête ; survivent au coupe-circuit `MCP_ENABLED` (`G22`)
 * et dérivent leurs constantes directement du code (`S20`).
 */

import { POLITIQUES_RETENTION_IDENTITE, QUOTAS_ACTIF_PAR_DEFAUT } from "@poirierlavoie/mcp-socle";
import {
  COURRIEL_CONTACT_RESPONSABLE,
  DELAI_RETABLISSEMENT_JOURS_OUVRABLES,
  ORIGINE_PORTAIL_PAR_DEFAUT,
  VERSION_CGU,
} from "../constantes";
import { CHEMINS_DOCUMENTS_GOUVERNANCE } from "./gouvernance";

export const CHEMINS_DECOUVERTE_PUBLIQUE = ["/robots.txt", "/sitemap.xml", "/llms.txt"] as const;

export type CheminDecouvertePublique = (typeof CHEMINS_DECOUVERTE_PUBLIQUE)[number];

export function estCheminDecouvertePublique(
  pathname: string,
): pathname is CheminDecouvertePublique {
  return (CHEMINS_DECOUVERTE_PUBLIQUE as readonly string[]).includes(pathname);
}

const ROBOTS_TXT = [
  "User-agent: *",
  "Allow: /",
  "Allow: /demande",
  "Allow: /cgu",
  "Allow: /confidentialite",
  "Allow: /attestation",
  "Allow: /conformite",
  "Allow: /gouverne",
  "Disallow: /demande/confirmer",
  "Disallow: /moi",
  "Disallow: /exploitant",
  "Disallow: /oauth/",
  `Sitemap: ${ORIGINE_PORTAIL_PAR_DEFAUT}/sitemap.xml`,
  "",
].join("\n");

const URLS_SITEMAP = [
  `${ORIGINE_PORTAIL_PAR_DEFAUT}/`,
  ...CHEMINS_DOCUMENTS_GOUVERNANCE.map((c) => `${ORIGINE_PORTAIL_PAR_DEFAUT}${c}`),
];

const SITEMAP_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...URLS_SITEMAP.map((u) => `  <url><loc>${u}</loc></url>`),
  "</urlset>",
  "",
].join("\n");

const LLMS_TXT = [
  "# MCP Accès — Droit civil québécois (Québec Civil Law MCP Suite)",
  "",
  "> Admission portal, encrypted BYOK CanLII API key vault, and OAuth 2.1 authorization server for the `droit-civil-quebecois` legal AI plugin reserved for active members in good standing of the Barreau du Québec.",
  "",
  "## Ecosystem & Connectors (32 MCP tools across 3 servers)",
  "",
  "- [MCP Accès (Admission & OAuth 2.1 Portal)](https://acces.poirierlavoie.ca/): Barreau du Québec admission (`/demande`), self-service token & privacy console (`/moi`), and public governance.",
  "- [MCP Législation (`lois`, 10 tools)](https://legislation.poirierlavoie.ca/): Read-only official verbatim legislation of Québec and Canada, court practice directives, and AMF policy statements. Server Card: https://legislation.poirierlavoie.ca/mcp/server-card",
  "- [MCP Jurisprudence (`juris`, 10 tools)](https://jurisprudence.poirierlavoie.ca/): Read-only Canadian case-law citation verification, decision metadata, and citator lists backed by CanLII (strict individual BYOK CanLII key). Server Card: https://jurisprudence.poirierlavoie.ca/mcp/server-card",
  "- [MCP Outils (`outils`, 12 tools — Public, no account required)](https://outils.poirierlavoie.ca/): Deterministic C.C.P. deadlines, art. 1619 C.C.Q. legal interest, court file numbers & courthouses, business registries (REQ/RBQ/OPC/RENA/Corporations Canada), civic addresses (RQA), and bijural terminology. Public endpoint: `https://outils.poirierlavoie.ca/mcp` · Server Card: https://outils.poirierlavoie.ca/mcp/server-card",
  "- [Plugin Repository (`droit-civil-quebecois`)](https://github.com/jpoirierlavoie/droit-civil-quebecois): 10 skills, 59 reference sheets, and 4 Python stdlib verification scripts for Claude and Google Gemini / Antigravity.",
  "",
  "## Eligibility, Privacy & Quotas (derived from live code)",
  "",
  `- Eligibility: Active practicing lawyers on the Roll of the Barreau du Québec (\`lois\` and \`juris\`); \`outils\` is public.`,
  `- Zero query-content logging: Cloudflare invocation logs disabled; ${POLITIQUES_RETENTION_IDENTITE.length} D1 identity tables verified statically without query text.`,
  `- Daily UTC quotas (active state): local=${QUOTAS_ACTIF_PAR_DEFAUT.local}/day, outbound CanLII=${QUOTAS_ACTIF_PAR_DEFAUT.sortant}/day, hybrid vector=${QUOTAS_ACTIF_PAR_DEFAUT.semantique}/day.`,
  `- License: CC-BY-NC-SA-4.0 + Companion Professional Legal Practice Grant (ToU v. ${VERSION_CGU}, ${DELAI_RETABLISSEMENT_JOURS_OUVRABLES}-business-day written reinstatement procedure).`,
  "",
  "## Public Governance Documents",
  "",
  `- [Apply for Access](${ORIGINE_PORTAIL_PAR_DEFAUT}/demande)`,
  `- [Terms of Use (/cgu)](${ORIGINE_PORTAIL_PAR_DEFAUT}/cgu)`,
  `- [Privacy Policy — Law 25 (/confidentialite)](${ORIGINE_PORTAIL_PAR_DEFAUT}/confidentialite)`,
  `- [Applicant Solemn Attestation (/attestation)](${ORIGINE_PORTAIL_PAR_DEFAUT}/attestation)`,
  `- [Code-Derived Compliance Sheet (/conformite)](${ORIGINE_PORTAIL_PAR_DEFAUT}/conformite)`,
  `- [Code-Derived Governance Register (/gouverne)](${ORIGINE_PORTAIL_PAR_DEFAUT}/gouverne)`,
  `- Contact: mailto:${COURRIEL_CONTACT_RESPONSABLE}`,
  "",
].join("\n");

export function repondreDecouvertePublique(
  chemin: CheminDecouvertePublique,
  method: string,
): Response {
  const { corps, type } =
    chemin === "/robots.txt"
      ? { corps: ROBOTS_TXT, type: "text/plain; charset=utf-8" }
      : chemin === "/sitemap.xml"
        ? { corps: SITEMAP_XML, type: "application/xml; charset=utf-8" }
        : { corps: LLMS_TXT, type: "text/markdown; charset=utf-8" };

  const headers = {
    "Content-Type": type,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "public, max-age=600",
  };

  return method === "HEAD"
    ? new Response(null, { status: 200, headers })
    : new Response(corps, { status: 200, headers });
}
