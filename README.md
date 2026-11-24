# MCP-Acces (`acces.poirierlavoie.ca`)

Portail public d'admission et de gestion des accès pour la suite [`droit-civil-quebecois`](https://github.com/jpoirierlavoie/droit-civil-quebecois). Ce service gratuit, exploité à titre collégial sans engagement de niveau de service (SLA), vérifie l'admissibilité des membres actifs en règle du Barreau du Québec, conserve de façon chiffrée la clé API CanLII personnelle de chaque titulaire (BYOK) et autorise la connexion des assistants IA aux connecteurs [`MCP-Legislation`](https://github.com/jpoirierlavoie/MCP-Legislation) (`lois`) et [`MCP-Jurisprudence`](https://github.com/jpoirierlavoie/MCP-Jurisprudence) (`juris`), sans journaliser le contenu des recherches.

> **In English:** Public admission and access-management portal for the [`droit-civil-quebecois`](https://github.com/jpoirierlavoie/droit-civil-quebecois) suite. Provided free of charge for active members in good standing of the Barreau du Québec, it manages membership verification, encrypted storage of each user's personal CanLII API key (BYOK), self-service access management (`/moi`), and browser OAuth 2.1 authorization for `MCP-Legislation` (`lois`) and `MCP-Jurisprudence` (`juris`), without logging search queries.

---

## Pour les avocats (parcours d'accès)

1. **Demande d'accès (`/demande`) :** fournir votre numéro de membre du Barreau du Québec, votre adresse courriel professionnelle et votre clé API CanLII personnelle. La demande est confirmée par courriel (lien valable 30 minutes), puis vérifiée manuellement au *Bottin des avocats*.
2. **Gestion libre-service (`/moi`) :** une fois le compte activé, gérer vos connexions par navigateur (OAuth 2.1 dans Claude, ChatGPT, Google Antigravity et Gemini), créer ou révoquer des jetons personnels pour scripts ou ligne de commande, mettre à jour ou retirer votre clé CanLII, activer ou désactiver la recherche vectorielle dans `lois`, exporter vos données personnelles (Loi 25) ou supprimer votre compte.
3. **Connecteur public complémentaire :** [`MCP-Outils`](https://github.com/jpoirierlavoie/MCP-Outils) (`https://outils.poirierlavoie.ca/mcp`) demeure accessible publiquement sans compte ni clé.

---

## Surfaces exposées et architecture technique

Socle partagé : [`@poirierlavoie/mcp-socle`](https://github.com/jpoirierlavoie/MCP-Socle) (`#v0.8.4`) et base Cloudflare D1 partagée **`mcp-identite`** (`DB_IDENTITE`).

| Route | Accès | Rôle |
|---|---|---|
| `GET /` | Public (survit au coupe-circuit `MCP_ENABLED`) | Page d'accueil bilingue (FR/EN, navigation inter-connecteurs, schéma JSON-LD, zéro actif tiers) présentant l'admissibilité, les 3 connecteurs, le parcours d'admission et les engagements de confidentialité |
| `GET /robots.txt`, `/sitemap.xml`, `/llms.txt` | Public (survit au coupe-circuit `MCP_ENABLED`) | Fichiers de découverte pour moteurs de recherche et assistants dérivés des constantes du code (`S20`), excluant `/moi`, `/oauth/` et `/exploitant` |
| `GET/POST /demande` & `/demande/confirmer` | Public (`RL_DEMANDE_IP` `10/min`, `namespace_id` `"1031"`) | Admission préalable régie par `MODE_ADMISSION` (`ferme`, `invitation`, `ouvert`), vérification en direct de la clé API CanLII, table d'attente de 30 min avant confirmation du courriel (`noreply@acces.poirierlavoie.ca`) et alerte non bloquante à l'exploitant |
| `GET/POST /moi` & `/moi/connexion` | Titulaire (lien magique `session_portail`, cookie `__Host-acces_moi` `HttpOnly; Secure; SameSite=Lax` + CSRF HMAC) | Création/révocation de jetons `frapperJeton()` (affichés une seule fois, portées `les_deux`, `legislation`, `jurisprudence`), extraits prêts à coller (`.mcp.json`, `mcp_config.json`, `gemini-extension.json`, `claude.ai`, Gemini App/Enterprise `/mcp/oauth`, API Gemini Deep Research + préambule `SAFETY-KERNEL`), vérification/rotation/retrait immédiat de la clé CanLII, préférence `hybride_permis`, quotas du jour, export JSON et suppression intégrale Loi 25 |
| `GET/POST /exploitant` | Exploitant (`CONSOLE_TOKEN` à temps constant via `memeSecret`) | File d'admission vérifiée avec indicateurs non bloquants de partage d'`empreinte_clef` de cabinet et saisie obligatoire de `note_admission` (*Bottin des avocats*), journalisation en ajout seul dans `registre_gouverne` (`G12`), invitations de cohorte, clients OAuth pré-inscrits et indicateurs d'anomalies sans contenu |
| `GET /.well-known/oauth-authorization-server`<br>`POST /oauth/register`<br>`GET/POST /oauth/authorize`<br>`POST /oauth/token`<br>`POST /oauth/revoke` | Clients OAuth 2.1 (`RL_OAUTH_IP` `60/min`, `namespace_id` `"1032"`) | Serveur d'autorisation OAuth 2.1 (RFC 8414, inscription dynamique RFC 7591 sans état signée HMAC sous `COFFRE_MAITRE_V1`, PKCE `S256` obligatoire, clients pré-inscrits `client_oauth` et résolution CIMD anti-SSRF `redirect: "manual"` + rejet `3xx`, échange atomique à usage unique `code_oauth` émettant un `jeton` D1 standard) |
| `GET /cgu`, `/confidentialite`, `/attestation`, `/conformite`, `/gouverne` | Public (survit au coupe-circuit `MCP_ENABLED`) | Cinq documents de gouvernance, dont `/conformite` (`POLITIQUES_RETENTION_IDENTITE`, `S20`/`G18`) et `/gouverne` (`QUOTAS_ACTIF_PAR_DEFAUT` / `QUOTAS_LIMITE_PAR_DEFAUT`, `S20`) dérivés directement des constantes du code |
| `scheduled` (`23 7 * * *`) | Interne Cloudflare | Purges quotidiennes de rétention Loi 25 (`purgerRetentionsD1`, `G16`) |

---

## Vérifications locales (sans réseau ni secret externe)

```powershell
npm.cmd ci
npm.cmd run type-check    # tsc --noEmit
npm.cmd run lint          # biome check .
npm.cmd test              # vitest run (workerd + vrai SQLite D1 mcp-identite)
npm.cmd run audit         # 0 vulnérabilité d'exécution + parité stricte osv-scanner.toml
npx.cmd wrangler deploy --dry-run
```

---

## Déploiement initial de `mcp-identite` et `MCP-Acces` (Phase 2)

1. Créer la base D1 partagée dans la région Est de l'Amérique du Nord (`enam`) et reporter son UUID dans `wrangler.jsonc` :
   ```powershell
   npx.cmd wrangler d1 create mcp-identite --location enam
   ```
2. Activer Cloudflare Email Sending sur `acces.poirierlavoie.ca` (`noreply@acces.poirierlavoie.ca`).
3. Poser les deux secrets maîtres du Worker (au moins 32 caractères aléatoires chacun) :
   ```powershell
   npx.cmd wrangler secret put COFFRE_MAITRE_V1
   npx.cmd wrangler secret put CONSOLE_TOKEN
   ```
4. Basculer `@poirierlavoie/mcp-socle` vers `"github:jpoirierlavoie/MCP-Socle#v0.8.4"` une fois l'étiquette `v0.8.4` poussée sur GitHub, puis déployer (migrations D1 d'abord, puis Worker) :
   ```powershell
   $env:CLOUDFLARE_API_TOKEN = (Get-Content cf.token -Raw).Trim()
   npm.cmd run deploy
   ```

---

## Sécurité, confidentialité et licence

- **Signalement privé :** Voir [`SECURITY.md`](SECURITY.md) (`jason@poirierlavoie.ca`, accusé de réception sous 72 h).
- **Licence :** **Apache-2.0** ([`LICENSE`](LICENSE)) assortie du fichier [`NOTICE`](NOTICE) (création assistée par IA pour l'intérêt public, non-revendication et reconnaissance des sources officielles et données ouvertes dont `CC BY-NC-SA 4.0` REQ/OQLF et CanLII BYOK). Conditions d'usage du service hébergé sur `/cgu`.
