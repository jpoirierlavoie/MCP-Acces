# MCP-Acces — Architecture, principes et consignes de travail

Portail d'admission du Barreau du Québec, coffre BYOK de clés API CanLII, console libre-service (`/moi`), console d'exploitation (`/exploitant`) et serveur d'autorisation OAuth 2.1 (`https://acces.poirierlavoie.ca`), adossé au socle partagé `@poirierlavoie/mcp-socle` (`#v0.8.2`) et à la base Cloudflare D1 `mcp-identite` (`DB_IDENTITE`). Ce document gouverne de manière identique Claude et Gemini / Antigravity (`CLAUDE.md` et `GEMINI.md` doivent rester identiques octet pour octet et sous 24 000 octets UTF-8 LF).

---

## 1. Rôle architectural dans le cadre global

```
             ┌────────────────────────────────────────────────────────┐
             │      droit-civil-quebecois (Plugin Cadre v3.0.1)       │
             └──────┬───────────────────────┬──────────────────┬──────┘
                    │                       │                  │
        (serveur `lois`, 10 outils)  (serveur `juris`, 10)  (serveur `outils`, 12)
                    │                       │                  │
                    ▼                       ▼                  ▼
         ┌─────────────────────┐ ┌─────────────────────┐ ┌──────────────────────────┐
         │   MCP-Legislation   │ │  MCP-Jurisprudence  │ │        MCP-Outils        │
         │ `/mcp` & `/mcp/oauth│ │ `/mcp` & `/mcp/oauth│ │   (Worker public, D1     │
         └──────────┬──────────┘ └──────────┬──────────┘ │   lecture seule, 0 secret│
                    │                       │            └──────────────────────────┘
                    ├───────────┬───────────┴───────────────┐
                    │           ▼ (base D1 `DB_IDENTITE`)   ▼
                    │    ┌──────────────┐          ┌────────────────────┐
                    │    │ mcp-identite │◄─────────┤     MCP-Acces      │
                    │    │  (11 tables) │          │ acces.poirier...ca │
                    │    └──────────────┘          │ /demande /moi OAuth│
                    └───────────┬──────────────────┴────────┬───────────┘
                                ▼ (`#v0.8.2`, zéro dep prod)▼
                 ┌──────────────────────────────────────────────┐
                 │                  MCP-Socle                   │
                 └──────────────────────────────────────────────┘
```

- **Isolation des responsabilités (`S21`) :** `MCP-Acces` concentre toutes les routes HTML interactives, les formulaires, les liens magiques, l'envoi transactionnel Cloudflare Email Sending (`send_email`, `noreply@acces.poirierlavoie.ca`), la console d'approbation humaine (`/exploitant`) et les flux OAuth 2.1 (`/oauth/*`), laissant `MCP-Legislation` et `MCP-Jurisprudence` 100 % sans état JSON-RPC.
- **Source unique du schéma D1 (`mcp-identite`) :** `migrations/0001_initial.sql` correspond octet pour octet à `construireSchemaIdentiteD1(["legislation", "jurisprudence"])` exporté par `@poirierlavoie/mcp-socle` (parité épinglée par `test/doc.test.ts`).

---

## 2. Arborescence du dépôt

```text
src/
├── index.ts              routage strict, coupe-circuit MCP_ENABLED (G22), cron purgerRetentionsD1 (G16)
├── types.ts              interfaces Env (DB_IDENTITE, COURRIEL: SendEmail, RL_DEMANDE_IP, RL_OAUTH_IP)
├── constantes.ts         versions des politiques, sections du Barreau, plafonds d'arête (S20), SAFETY-KERNEL
├── securite.ts           cookies __Host-, CSRF HMAC temps constant, lecture de formulaires bornée UTF-8 fatale
├── canlii.ts             sonde en direct caseBrowse/fr/ avec expurger() (G9) et ouvrirCoffre (G8, G10)
├── courriel.ts           envois transactionnels via liaison send_email (texte + HTML échappé)
├── html/
│   ├── gabarit.ts        identité visuelle Georgia (CLAIR/SOMBRE symétriques), CSP à nonce unique, bi/biP
│   ├── accueil.ts        GET / bilingue (FR/EN)
│   └── gouvernance.ts    /cgu, /confidentialite, /attestation, /conformite (S20/G18), /gouverne (S20)
└── routes/
    ├── demande.ts        GET/POST /demande et /demande/confirmer (sas anti-squattage, coffre et alerte exploitant)
    ├── moi.ts            GET/POST /moi et /moi/connexion (liens magiques, jetons, coffre, Loi 25)
    ├── exploitant.ts     GET/POST /exploitant (CONSOLE_TOKEN, badge empreinte_clef, registre_gouverne G12)
    └── oauth.ts          RFC 8414, /oauth/authorize, /oauth/token, /oauth/revoke (PKCE S256 + CIMD G35/G36)
```

---

## 3. Invariants critiques et portes de sécurité

1. **Zéro dépendance d'exécution (`G1`) :** `package.json` ne déclare aucune `dependencies`. Tout le code repose sur les API Web Standards de Cloudflare Workers et `@poirierlavoie/mcp-socle` (`#v0.8.2` empaqueté au build).
2. **Fermé par défaut (`G21`, `G22`) :** `MCP_ENABLED !== "true"` renvoie `404` sur toutes les routes opérationnelles (`/demande*`, `/moi*`, `/exploitant`, `/oauth/*`, `/.well-known/*`, `/health`) mais conserve `200` sur `GET /` et les 5 documents publics. L'absence de `COFFRE_MAITRE_V1` ou `CONSOLE_TOKEN` échoue systématiquement fermée.
3. **Zéro journalisation de contenu et d'invocation (`G9`, `G13`, `G25`, `G37`) :** Aucun `console.*` dans `src/` ; `observability.enabled = false` et `invocation_logs = false` dans `wrangler.jsonc` ; `verifierSchemaSansContenuIdentifiant` = `[]`.
4. **Coffre à fermeture stricte (`G8`, `G10`) :** Aucune fonction exportée ne retourne une clé déchiffrée en clair ; toute ré-épreuve d'une entrée scellée passe par `ouvrirCoffre`.
5. **Registre de gouverne en ajout seul (`G12`) :** Aucun `UPDATE` ni `DELETE` sur `registre_gouverne` dans le code applicatif (seule la suppression intégrale d'un compte Loi 25 via `supprimerCompteTitulaireD1` cascade depuis `titulaire`).
6. **Documentation dérivée du code (`S20`, `G18`) :** `/conformite` dérive de `POLITIQUES_RETENTION_IDENTITE` et `/gouverne` dérive de `QUOTAS_ACTIF_PAR_DEFAUT`, `QUOTAS_LIMITE_PAR_DEFAUT` et `PLAFONDS_DEBIT_ARETE`.
7. **Limiteurs à `namespace_id` distincts (`G34`) :** `"1031"` (`RL_DEMANDE_IP`, `10/60 s`) et `"1032"` (`RL_OAUTH_IP`, `60/60 s`).
8. **OAuth 2.1 sans redirection ouverte ni SSRF (`G35`, `G36`) :** Validation de `client_id` et `redirect_uri` avant toute redirection, résolution réseau CIMD réservée aux titulaires authentifiés (`redirect: "manual"` avec rejet explicite des réponses `3xx`), jeton de consentement HMAC liant tous les paramètres OAuth, PKCE `S256` obligatoire, validation RFC 8707 `resource`, consommation atomique immédiate et révocation sur rejeu de `code_oauth`.
9. **Secrets locaux :** Ne jamais lire, afficher ni committer `cf.token`, `*.token`, `.dev.vars`, `mcp.url` ou `.env*`.
10. **Gouvernance Git (`main-pr-and-ci`) :** Le contournement administrateur du ruleset `main-pr-and-ci` est restreint à `pull_request` — **ne jamais pousser directement sur `main`** ; travailler sur une branche dédiée, ouvrir une Pull Request, attendre le passage des contrôles requis (`CI`, `CodeQL`, `OSV-Scanner`, `Trivy`), puis fusionner par *squash* (`gh pr merge --squash --delete-branch`).

---

## 4. Commandes de vérification (PowerShell Windows)

```powershell
npm.cmd ci
npm.cmd run type-check    # npx.cmd tsc --noEmit
npm.cmd run lint          # npx.cmd biome check .
npm.cmd test              # npx.cmd vitest run (workerd + D1)
npm.cmd run audit         # 0 vulnérabilité d'exécution + parité osv-scanner.toml
npx.cmd wrangler deploy --dry-run
```

---

## 5. Évaluation d'impact obligatoire (4 axes)

**Aucune tâche touchant `MCP-Acces` n'est terminée tant que son impact n'a pas été évalué et explicitement rapporté sur chacun des quatre axes ci-dessous** (« non touché » doit être vérifié et énoncé, jamais omis) :

| # | Axe d'impact | Éléments à inspecter | Ce qui impose une action |
|---|---|---|---|
| 1 | **Code, routes, migrations D1 et gardes (`src/`, `migrations/`, `test/`)** | `src/routes/*`, `migrations/0001_initial.sql` (= `construireSchemaIdentiteD1`), `test/` (`workerd` + D1) | Toute modification du parcours `/demande`, de `/moi`, de `/exploitant`, du coffre, d'OAuth 2.1 ou du schéma `mcp-identite` |
| 2 | **`README.md`, sécurité, licence et Wrangler** | `README.md`, `SECURITY.md`, `LICENSE` (`CC-BY-NC-SA-4.0` + autorisation de pratique), `wrangler.jsonc`, `CLAUDE.md` === `GEMINI.md` | Tout changement de secret, de liaison (`send_email`, `ratelimits`), d'`observability`, de licence ou de procédure de déploiement |
| 3 | **Pages publiques HTML (`GET /` et les 5 documents `/cgu`, `/confidentialite`, `/attestation`, `/conformite`, `/gouverne`)** | `src/html/*`, `test/site.test.ts` (CSP, absence de CORS, parité bilingue, dérivation `S20`/`G18`) | Toute évolution des conditions d'admission, de la rétention Loi 25, des sous-traitants, des quotas ou de l'identité visuelle |
| 4 | **Impacts inter-dépôts (`Cross-repository`)** | **`MCP-Socle`** (`#v0.8.2`), **`MCP-Legislation`**, **`MCP-Jurisprudence`**, **`MCP-Outils`** et **`droit-civil-quebecois`** | Maintenir la cohérence exacte de `DB_IDENTITE`, des portées (`les_deux`, `legislation`, `jurisprudence`), des extraits clients `/moi` et de l'ordre de migration Phases 1 -> 2 -> 3 -> 4 |
