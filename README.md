# MCP-Acces (`acces.poirierlavoie.ca`)

Portail public d'admission et de gestion des accès pour la suite [`droit-civil-quebecois`](https://github.com/jpoirierlavoie/droit-civil-quebecois). Ce service gratuit, exploité à titre collégial sans engagement de niveau de service (SLA), vérifie l'admissibilité des membres actifs en règle du Barreau du Québec, conserve de façon chiffrée la clé API CanLII personnelle de chaque titulaire lorsqu'elle est fournie (BYOK) et autorise la connexion des assistants IA aux trois connecteurs [`MCP-Legislation`](https://github.com/jpoirierlavoie/MCP-Legislation) (`lois`), [`MCP-Jurisprudence`](https://github.com/jpoirierlavoie/MCP-Jurisprudence) (`juris`) et [`MCP-Outils`](https://github.com/jpoirierlavoie/MCP-Outils) (`outils`), sans journaliser le contenu des recherches.

> **In English:** Public admission and access-management portal for the [`droit-civil-quebecois`](https://github.com/jpoirierlavoie/droit-civil-quebecois) suite. Provided free of charge for active members in good standing of the Barreau du Québec, it manages membership verification, optional encrypted storage of each user's personal CanLII API key (BYOK — required only for live outbound CanLII lookups in `juris`), self-service access management (`/moi`), and browser OAuth 2.1 authorization for `MCP-Legislation` (`lois`), `MCP-Jurisprudence` (`juris`), and `MCP-Outils` (`outils`), without logging search queries.

---

## Pour les avocats (parcours d'accès)

1. **Demande d'accès (`/demande`) :** fournir votre numéro de membre du Barreau du Québec et votre adresse courriel professionnelle (une clé API CanLII personnelle est facultative — vous pouvez la demander gratuitement sur `canlii.org` pour activer les recherches CanLII dans `juris`, ou la saisir plus tard dans `/moi` ; `lois` et `outils` fonctionnent sans clé CanLII). La demande est confirmée par courriel (lien valable 30 minutes), puis vérifiée manuellement au *Bottin des avocats*.
2. **Connexion dans votre assistant IA :** une fois le compte activé, connectez les trois connecteurs (`lois`, `juris`, `outils`) dans Claude, ChatGPT, Gemini ou Antigravity directement via votre navigateur (OAuth 2.1 sur `/mcp/oauth`, portée universelle `tous` rétrocompatible avec `les_deux`, et portées par service `legislation`, `jurisprudence`, `outils`) — sans aucun jeton ni fichier technique à copier.
3. **Gestion libre-service (`/moi`) :** gérer vos connexions actives, ajouter, mettre à jour ou retirer votre clé CanLII, activer ou désactiver la recherche sémantique (par sens) dans `lois`, créer au besoin des jetons personnels universels (`tous`) pour `/mcp` (jeton `Bearer` en script ou ligne de commande ; refus uniforme `404` sans jeton valide), exporter vos données personnelles (Loi 25) ou supprimer votre compte.

---

## Surfaces exposées et architecture technique

Socle partagé : [`@poirierlavoie/mcp-socle`](https://github.com/jpoirierlavoie/MCP-Socle) (`#v0.8.8`) et base Cloudflare D1 partagée **`mcp-identite`** (`DB_IDENTITE`).

| Route | Accès | Rôle |
|---|---|---|
| `GET /` | Public (reste en ligne si `MCP_ENABLED=false`) | Page d'accueil bilingue FR/EN (navigation inter-connecteurs, schéma JSON-LD, zéro actif tiers) présentant l'admissibilité, les 3 connecteurs, le parcours d'admission et les engagements de confidentialité |
| `GET /robots.txt`, `/sitemap.xml`, `/llms.txt` | Public (reste en ligne si `MCP_ENABLED=false`) | Fichiers de découverte pour moteurs de recherche et assistants dérivés des constantes du code, excluant `/moi`, `/oauth/` et `/exploitant` |
| `GET/POST /demande` & `/demande/confirmer` | Public (limité par IP à `10/min`, `RL_DEMANDE_IP` `"1031"`) | Admission préalable régie par `MODE_ADMISSION` (`ferme`, `invitation`, `ouvert`), vérification en direct de la clé API CanLII lorsqu'elle est fournie (facultative), file d'attente de 30 min avant confirmation du courriel (`noreply@acces.poirierlavoie.ca`) et avis non bloquant à l'exploitant |
| `GET/POST /moi` & `/moi/connexion` | Titulaire (lien magique par courriel, cookie `__Host-acces_moi` `HttpOnly; Secure; SameSite=Lax` + CSRF HMAC) ; ou accès évaluateur d'annuaire si `EVALUATION_TOKEN` est posé | Tableau de bord libre-service : gestion de la clé CanLII, préférence de recherche hybride (`hybride_permis`), consommation du jour, création/révocation de jetons personnels universels (`tous`), guides de configuration par plateforme (dont API Gemini Deep Research + préambule `SAFETY-KERNEL`), export JSON et suppression intégrale Loi 25 |
| `GET/POST /exploitant` | Exploitant (`CONSOLE_TOKEN` à temps constant) | File d'admission vérifiée au *Bottin des avocats* avec indicateurs de clé partagée de cabinet et saisie obligatoire du motif, journalisation en ajout seul dans `registre_gouverne`, invitations de cohorte, clients OAuth pré-inscrits, gestion du compte d'évaluation d'annuaire et indicateurs d'anomalies sans contenu |
| `GET /.well-known/oauth-authorization-server`<br>`POST /oauth/register`<br>`GET/POST /oauth/authorize`<br>`POST /oauth/token`<br>`POST /oauth/revoke` | Clients OAuth 2.1 (limité par IP à `60/min`, `RL_OAUTH_IP` `"1032"`) | Serveur d'autorisation OAuth 2.1 : découverte RFC 8414, inscription dynamique RFC 7591 sans état signée HMAC, PKCE `S256` obligatoire, clients pré-inscrits et métadonnées CIMD anti-SSRF (sans redirection `3xx`), échange atomique à usage unique émettant un jeton D1 standard |
| `GET /cgu`, `/confidentialite`, `/attestation`, `/conformite`, `/gouverne` | Public (reste en ligne si `MCP_ENABLED=false`) | Cinq documents de gouvernance, dont `/conformite` (rétention Loi 25 et chiffrement) et `/gouverne` (quotas journaliers et plafonds de débit) dérivés directement des constantes du code |
| `scheduled` (`23 7 * * *`) | Interne Cloudflare | Purges quotidiennes automatiques de rétention Loi 25 |

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

## Déploiement et configuration Cloudflare (opérateur)

1. Créer la base D1 partagée dans la région Est de l'Amérique du Nord (`enam`) et reporter son UUID dans `wrangler.jsonc` :
   ```powershell
   npx.cmd wrangler d1 create mcp-identite --location enam
   ```
2. Activer Cloudflare Email Sending sur `acces.poirierlavoie.ca` (`noreply@acces.poirierlavoie.ca`).
3. Poser les deux secrets maîtres du Worker (au moins 32 caractères aléatoires chacun) et, facultativement pendant l'examen d'admission aux annuaires, le secret révocable `EVALUATION_TOKEN` (avant de provisionner `tit_evaluation_annuaire` dans `/exploitant`) :
   ```powershell
   npx.cmd wrangler secret put COFFRE_MAITRE_V1
   npx.cmd wrangler secret put CONSOLE_TOKEN
   # Facultatif (examen annuaires Claude / OpenAI / Google uniquement) :
   # npx.cmd wrangler secret put EVALUATION_TOKEN
   ```
4. Déployer manuellement depuis un poste autorisé (migrations D1 d'abord via `scripts/deployer.mjs`, puis Worker via `npm.cmd run deploy` — aucun `CLOUDFLARE_API_TOKEN` n'est stocké en CI ; la sonde quotidienne `.github/workflows/verifier-deploiement.yml` vérifie l'alignement de `/health` sur `main`) :
   ```powershell
   $env:CLOUDFLARE_API_TOKEN = (Get-Content cf.token -Raw).Trim()
   npm.cmd run deploy
   ```

---

## Sécurité, confidentialité et licence

- **Signalement privé :** Voir [`SECURITY.md`](SECURITY.md) (`jason@poirierlavoie.ca`, accusé de réception sous 72 h).
- **Licence :** **Apache-2.0** ([`LICENSE`](LICENSE)) assortie du fichier [`NOTICE`](NOTICE) (création assistée par IA pour l'intérêt public, non-revendication et reconnaissance des sources officielles et données ouvertes dont `CC BY-NC-SA 4.0` REQ/OQLF et CanLII BYOK). Conditions d'usage du service hébergé sur `/cgu`.
