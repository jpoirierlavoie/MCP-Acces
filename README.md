# MCP-Acces (`acces.poirierlavoie.ca`)

Portail d'admission du Barreau du Québec, coffre chiffré BYOK de clés API CanLII, console libre-service (`/moi`), console d'exploitation (`/exploitant`) et serveur d'autorisation **OAuth 2.1 + PKCE `S256`** pour les connecteurs [`MCP-Legislation`](https://github.com/jpoirierlavoie/MCP-Legislation) (`lois`) et [`MCP-Jurisprudence`](https://github.com/jpoirierlavoie/MCP-Jurisprudence) (`juris`), adossé au socle partagé [`@poirierlavoie/mcp-socle`](https://github.com/jpoirierlavoie/MCP-Socle) (`#v0.8.3`) et à la base Cloudflare D1 partagée **`mcp-identite`** (`DB_IDENTITE`).

---

## Surfaces exposées

| Route | Accès | Rôle |
|---|---|---|
| `GET /` | Public (survit au coupe-circuit `MCP_ENABLED`) | Page d'accueil bilingue (FR/EN, identité visuelle Georgia, navigation inter-connecteurs, schéma JSON-LD, zéro actif tiers) présentant les 3 connecteurs, l'admissibilité, le prérequis BYOK CanLII et l'architecture sans journalisation de contenu |
| `GET /robots.txt`, `/sitemap.xml`, `/llms.txt` | Public (survit au coupe-circuit `MCP_ENABLED`) | Fichiers de découverte pour moteurs de recherche et agents IA dérivés des constantes du code (`S20`), excluant `/moi`, `/oauth/` et `/exploitant` |
| `GET/POST /demande` & `/demande/confirmer` | Public (`RL_DEMANDE_IP` `10/min`, `namespace_id` `"1031"`) | Admission préalable régie par `MODE_ADMISSION` (`ferme`, `invitation`, `ouvert`), épreuve en direct de la clé API CanLII (`caseBrowse/fr/`), sas anti-squattage `demande_acces` (30 min), promotion atomique après confirmation du courriel (`noreply@acces.poirierlavoie.ca`) et alerte non bloquante à l'exploitant |
| `GET/POST /moi` & `/moi/connexion` | Titulaire (lien magique `session_portail`, cookie `__Host-acces_moi` `HttpOnly; Secure; SameSite=Lax` + CSRF HMAC) | Frappe/révocation de jetons `frapperJeton()` (affichés une seule fois, portées `les_deux`, `legislation`, `jurisprudence`), extraits prêts à coller (`.mcp.json`, `mcp_config.json`, `gemini-extension.json`, `claude.ai`, Gemini App/Enterprise `/mcp/oauth`, API Gemini Deep Research + préambule `SAFETY-KERNEL`), épreuve/rotation/retrait immédiat de la clé CanLII, bascule `hybride_permis`, quotas du jour, export JSON et suppression intégrale Loi 25 |
| `GET/POST /exploitant` | Exploitant (`CONSOLE_TOKEN` à temps constant via `memeSecret`) | File d'admission vérifiée avec badges non bloquants de partage d'`empreinte_clef` de cabinet et capture obligatoire de `note_admission` (*Bottin des avocats*), transitions d'état journalisées en ajout seul dans `registre_gouverne` (`G12`), invitations de cohorte, clients OAuth pré-inscrits et indicateurs d'anomalies sans contenu |
| `GET /.well-known/oauth-authorization-server`<br>`POST /oauth/register`<br>`GET/POST /oauth/authorize`<br>`POST /oauth/token`<br>`POST /oauth/revoke` | Clients OAuth 2.1 (`RL_OAUTH_IP` `60/min`, `namespace_id` `"1032"`) | Serveur d'autorisation OAuth 2.1 (RFC 8414, inscription dynamique RFC 7591 sans état signée HMAC sous `COFFRE_MAITRE_V1`, PKCE `S256` obligatoire, clients pré-inscrits `client_oauth` et résolution CIMD anti-SSRF `redirect: "manual"` + rejet `3xx`, échange atomique à usage unique `code_oauth` émettant un `jeton` D1 standard) |
| `GET /cgu`, `/confidentialite`, `/attestation`, `/conformite`, `/gouverne` | Public (survit au coupe-circuit `MCP_ENABLED`) | Cinq documents de gouvernance, dont `/conformite` (`POLITIQUES_RETENTION_IDENTITE`, `S20`/`G18`) et `/gouverne` (`QUOTAS_ACTIF_PAR_DEFAUT` / `QUOTAS_LIMITE_PAR_DEFAUT`, `S20`) dérivés directement des constantes du code |
| `scheduled` (`23 7 * * *`) | Interne Cloudflare | Exécution quotidienne des purges indexées de rétention Loi 25 (`purgerRetentionsD1`, `G16`) |

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
4. Basculer `@poirierlavoie/mcp-socle` vers `"github:jpoirierlavoie/MCP-Socle#v0.8.3"` une fois l'étiquette `v0.8.3` poussée sur GitHub, puis déployer (migrations D1 d'abord, puis Worker) :
   ```powershell
   $env:CLOUDFLARE_API_TOKEN = (Get-Content cf.token -Raw).Trim()
   npm.cmd run deploy
   ```

---

## Sécurité, confidentialité et licence

- **Signalement privé :** Voir [`SECURITY.md`](SECURITY.md) (`jason@poirierlavoie.ca`, accusé de réception sous 72 h).
- **Licence :** Creative Commons Attribution - Pas d'Utilisation Commerciale - Partage dans les Mêmes Conditions 4.0 International (`CC-BY-NC-SA-4.0`) accompagnée de l'**Autorisation complémentaire de pratique professionnelle du droit** pour les membres actifs en règle du Barreau du Québec — voir [`LICENSE`](LICENSE) et `/cgu`.
