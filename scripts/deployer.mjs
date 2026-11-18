#!/usr/bin/env node
/**
 * Déploiement de production de `MCP-Acces` (`acces.poirierlavoie.ca`) :
 *   1. Arbre git propre obligatoire (le Worker annonce `COMMIT` sur `/health`).
 *   2. Vérification que `database_id` réel de `mcp-identite` a été renseigné dans `wrangler.jsonc`.
 *   3. Migrations D1 `mcp-identite` D'ABORD (`--remote`), puis déploiement du Worker avec `--var COMMIT:<sha>`.
 *
 * `CLOUDFLARE_API_TOKEN` est lu directement par `wrangler` dans l'environnement et n'est jamais
 * affiché ni passé en argument de ligne de commande.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function git(...args) {
  return execFileSync("git", args, { cwd: RACINE, encoding: "utf8" }).trim();
}

function echouer(titre, ...details) {
  console.error(`\n✘ ${titre}`);
  for (const d of details) console.error(`  ${d}`);
  console.error("");
  process.exit(1);
}

const sale = git("status", "--porcelain");
if (sale) {
  echouer(
    "L'arbre de travail n'est pas propre — déploiement refusé.",
    "Le Worker annonce son commit sur /health. Committer les changements d'abord.",
    ...sale
      .split("\n")
      .slice(0, 10)
      .map((l) => `    ${l}`),
  );
}

const wranglerRaw = readFileSync(resolve(RACINE, "wrangler.jsonc"), "utf8");
if (wranglerRaw.includes("00000000-0000-0000-0000-000000000000")) {
  echouer(
    "L'identifiant D1 `database_id` de `mcp-identite` est encore un gabarit local.",
    "Créer d'abord la base D1 distante : npx wrangler d1 create mcp-identite --location enam",
    "Puis reporter son UUID dans `wrangler.jsonc` et committer.",
  );
}

const commit = git("rev-parse", "--short", "HEAD");
const branche = git("rev-parse", "--abbrev-ref", "HEAD");
const surMain = branche === "main" || process.env.GITHUB_REF === "refs/heads/main";
if (!surMain) {
  console.warn(`⚠ Branche « ${branche} » et non « main ».\n`);
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
  echouer(
    "CLOUDFLARE_API_TOKEN est absent de l'environnement.",
    "PowerShell : $env:CLOUDFLARE_API_TOKEN = (Get-Content cf.token -Raw).Trim()",
  );
}

function lancer(etape, cmd, args) {
  console.log(`\n── ${etape}\n   ${cmd} ${args.join(" ")}\n`);
  const r = spawnSync(cmd, args, {
    cwd: RACINE,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return r.status ?? 1;
}

if (
  lancer("Migrations D1 mcp-identite (production)", "npx", [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "mcp-identite",
    "--remote",
  ]) !== 0
) {
  echouer("Les migrations D1 ont échoué — le Worker n'a PAS été déployé.");
}

if (
  lancer(`Déploiement du Worker MCP-Acces (commit ${commit})`, "npx", [
    "wrangler",
    "deploy",
    "--var",
    `COMMIT:${commit}`,
  ]) !== 0
) {
  echouer("Le déploiement du Worker a échoué après l'application des migrations.");
}

console.log(`\n✔ En ligne : commit ${commit} sur https://acces.poirierlavoie.ca/health\n`);
