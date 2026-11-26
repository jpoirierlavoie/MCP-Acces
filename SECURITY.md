# Security, Privacy & Professional Secrecy Policy / Politique de sécurité, confidentialité et secret professionnel

> **Français :** Ce dépôt contient `MCP-Acces` (`https://acces.poirierlavoie.ca`), le Worker Cloudflare d'admission, de coffre chiffré CanLII et de serveur d'autorisation OAuth 2.1 adossé à [`@poirierlavoie/mcp-socle`](https://github.com/jpoirierlavoie/MCP-Socle) (`#v0.8.6`) et à la base D1 `mcp-identite`, avec zéro dépendance d'exécution (`dependencies` absente).
> Pour signaler une **vulnérabilité de sécurité** OU un **enjeu de vie privée, de confidentialité ou de secret professionnel / privilège**, **n'ouvrez jamais d'issue publique sur GitHub** — écrivez directement à :
> **Jason Poirier Lavoie, avocat (Québec)** — `jason@poirierlavoie.ca` (accusé de réception sous **72 heures**, divulgation coordonnée).
> **Ne joignez jamais** de documents clients confidentiels, de communications privilégiées ni de jetons/clés actifs à un premier message ; utilisez des scénarios synthétiques.
>
> **English:** To report a **security vulnerability** OR a **privacy, confidentiality, or solicitor-client privilege issue** affecting `MCP-Acces` (`https://acces.poirierlavoie.ca`), **do not open a public GitHub issue** — email the maintainer directly:
> **Jason Poirier Lavoie, Lawyer (Québec)** — `jason@poirierlavoie.ca` (acknowledgement within **72 hours**, coordinated disclosure).
> **Never send** privileged client records, unredacted identifying facts, or live bearer tokens/API keys in an initial disclosure; use synthetic test cases.

---

## Garanties de sécurité et de confidentialité (`MCP-Acces`)

1. **Fermé par défaut (`G21`, `G22`) :** `MCP_ENABLED !== "true"` coupe immédiatement `/demande*`, `/moi*`, `/exploitant`, `/oauth/*` et `/health` tout en préservant `GET /` et les 5 documents publics. Toute absence de `COFFRE_MAITRE_V1` ou `CONSOLE_TOKEN` échoue fermée.
2. **Sas anti-squattage et immunisation contre le préchargement courriel :** `POST /demande` n'écrit jamais dans `titulaire` avant confirmation du courriel (`demande_acces` sans contrainte `UNIQUE`, réponse HTTP 200 neutre sans oracle d'énumération). Les liens de confirmation et liens magiques `/moi/connexion` sont en lecture seule sur `GET` et consommés atomiquement sur `POST`.
3. **Coffre CanLII par enveloppe à fermeture stricte (`G8`, `G9`, `G10`) :** `HKDF-SHA256` + `AES-256-GCM` avec AAD liée (`titulaireId:canlii:version`), empreinte de doublon et repère dérivés par `HMAC-SHA256` sous clé maître, ouverture exclusivement en fermeture `ouvrirCoffre` et expurgation systématique des erreurs via `expurger()`.
4. **Sessions, cookies `__Host-`, CSRF et CSP stricte à nonce :** Cookies `HttpOnly; Secure; SameSite=Lax|Strict` préfixés `__Host-` en HTTPS, jetons CSRF dérivés par `HMAC-SHA256` liés à la session et vérifiés via `memeSecret`, contrôle `Origin`/`Sec-Fetch-Site`, et politique CSP à nonce cryptographique par réponse (`default-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`, zéro actif tiers).
5. **OAuth 2.1 strict + DCR RFC 7591 sans état + PKCE `S256` + CIMD anti-SSRF (`G35`, `G36`) :** Inscription dynamique RFC 7591 sans écriture D1 préalable (jetons `dcr1.*` signés `HMAC-SHA256` sous `COFFRE_MAITRE_V1`), validation préalable de `client_id` et `redirect_uri` avant toute redirection, PKCE `S256` obligatoire à temps constant, résolution CIMD avec `redirect: "manual"` (rejet explicite `3xx`) et rejet de tout littéral IP ou hôte interne, échange atomique à usage unique de `code_oauth`.
6. **Zéro journalisation de contenu et conformité Loi 25 (`G12`, `G13`, `G16`, `G18`, `G25`, `G37`) :** Aucune table de requêtes (`verifierSchemaSansContenuIdentifiant`), `observability.enabled = false` et `invocation_logs = false`, `registre_gouverne` strictement en ajout seul, export JSON et suppression intégrale en cascade (`supprimerCompteTitulaireD1`) dans `/moi`, et purge quotidienne indexée (`purgerRetentionsD1`).
7. **Compte technique isolé d'évaluation d'annuaire (fermé par défaut) :** L'accès évaluateur sans lien courriel sur `/moi` n'est actif que si le secret révocable `EVALUATION_TOKEN` (`>= 32` car., vérifié à temps constant via `memeSecret`) est posé **et** si le compte réservé `tit_evaluation_annuaire` (`0000000`) est provisionné à l'état servi dans `/exploitant` avec sa clé API CanLII scellée au coffre. Ce compte demeure strictement en lecture seule dans `/moi` (émission/révocation manuelle de jetons, lecture/modification/retrait de clé CanLII, bascule `hybride_permis`, export et suppression bloqués en HTTP 403), n'expédie aucun courriel et se révoque immédiatement en un clic ou par `wrangler secret delete EVALUATION_TOKEN`.

---

## Gouvernance Git et chaîne d'approvisionnement

- **Rulesets GitHub actifs (`main-integrity`, `immutable-release-tags`, `main-pr-and-ci`) :** Historique linéaire exigé ; suppression et *fast-forward* bloqués sur `main` et sur les étiquettes de version ; contournement administrateur de `main-pr-and-ci` restreint au mode `pull_request` (aucun `push` direct sur `main` ; toute modification passe par Pull Request validée par `CI`, `CodeQL`, `OSV-Scanner` et `Trivy`).
- **Analyse de secrets et chaîne logistique :** GitHub *Secret Scanning* et *Push Protection* activés (complétés en CI par le balayage `secret` de Trivy), Dependabot (`npm`, `github-actions`), Actions épinglées au SHA complet sous `step-security/harden-runner`, OpenSSF Scorecard et sonde quotidienne de dérive `/health` (`.github/workflows/verifier-deploiement.yml`).
