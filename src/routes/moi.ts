/**
 * Console libre-service du titulaire (`/moi` et `/moi/connexion`, `SPEC §3.4`, `§4.2`, `§5`, `§7`, `§9`) :
 * - connexion sans mot de passe par lien magique (`session_portail`, `GET` lecture seule -> `POST` consommation) ;
 * - session par cookie `__Host-acces_moi` (`HttpOnly; Secure; SameSite=Lax`) + jeton CSRF HMAC lié à la session ;
 * - émission (`frapperJeton`, affiché une seule fois) et révocation de jetons (`les_deux`, `legislation`, `jurisprudence`) ;
 * - extraits de configuration prêts à coller (`.mcp.json`, `mcp_config.json`, `gemini-extension.json`, `claude.ai`,
 *   Gemini App / Vertex AI OAuth `/mcp/oauth`, API Gemini Deep Research + préambule `SAFETY-KERNEL`) ;
 * - épreuve en direct, rotation et retrait immédiat (`retirerEntreeCoffreD1`) de la clé CanLII du coffre ;
 * - bascule `hybride_permis` (Workers AI vs FTS5 local) ;
 * - affichage des quotas journaliers UTC (`lireCompteursJourD1`) ;
 * - export JSON de portabilité et suppression intégrale en cascade Loi 25 (`supprimerCompteTitulaireD1`).
 */

import {
  type BinaireD1,
  DUREE_LIEN_PORTAIL_MINUTES,
  DUREE_SESSION_MOI_HEURES,
  debitAcceptable,
  type EtatEntreeCoffre,
  type EtatTitulaire,
  empreinte,
  estEtatServi,
  estJetonFrappe,
  frapperJeton,
  horodatageIsoUtc,
  horodatageUtcMs,
  jourUtc,
  lireCompteursJourD1,
  normaliserPorteeOAuth,
  plafondsPourEtat,
  queueJeton,
  retirerEntreeCoffreD1,
  supprimerCompteTitulaireD1,
  tropDeRequetes,
} from "@poirierlavoie/mcp-socle";
import { eprouverClefCanliiEnDirect, eprouverEntreeScelleeCanlii } from "../canlii";
import {
  PREAMBULE_SAFETY_KERNEL_DEEP_RESEARCH,
  SERVICES_MCP,
  USAGE_COFFRE_CANLII,
} from "../constantes";
import { envoyerCourrielLienMagiqueMoi } from "../courriel";
import { boutonsEntete, esc, repondrePageHtml } from "../html/gabarit";
import {
  calculerJetonCsrfMoi,
  construireAnneauMaitres,
  construireCookieMoi,
  creerIdentifiant,
  effacerCookieMoi,
  estCoffreConfigure,
  estOrigineFormulaireValide,
  lireCookieMoi,
  lireFormulaireBorne,
  nettoyerLigneTexte,
  normaliserCourriel,
  normaliserValiderFormatCanlii,
  repondreMethodeNonPermise,
  scellerClefCanliiPourTitulaire,
  validerCheminRetourInterne,
  verifierJetonCsrfMoi,
} from "../securite";
import type { ContextePortail } from "../types";

export interface SessionMoiActive {
  readonly sessionId: string;
  readonly empreinteSession: string;
  readonly jetonCsrf: string;
  readonly titulaire: {
    readonly id: string;
    readonly cree_le: string;
    readonly etat: EtatTitulaire;
    readonly nom: string;
    readonly numero_membre: string;
    readonly section: string;
    readonly courriel: string;
    readonly cabinet: string | null;
    readonly courriel_verifie_le: string | null;
    readonly attestation_le: string;
    readonly attestation_ver: string;
    readonly cgu_ver: string;
    readonly hybride_permis: number;
    readonly note_admission: string | null;
  };
}

interface LigneSessionJointeD1 {
  readonly session_id: string;
  readonly session_empreinte: string;
  readonly session_expire_le: string;
  readonly session_consomme_le: string | null;
  readonly id: string;
  readonly cree_le: string;
  readonly etat: EtatTitulaire;
  readonly nom: string;
  readonly numero_membre: string;
  readonly section: string;
  readonly courriel: string;
  readonly cabinet: string | null;
  readonly courriel_verifie_le: string | null;
  readonly attestation_le: string;
  readonly attestation_ver: string;
  readonly cgu_ver: string;
  readonly hybride_permis: number;
  readonly note_admission: string | null;
}

function etatPeutGererClefCanlii(etat: EtatTitulaire): boolean {
  return estEtatServi(etat) || etat === "en_attente" || etat === "suspendu";
}

export async function resoudreSessionMoiActive(
  request: Request,
  url: URL,
  contexte: ContextePortail,
): Promise<SessionMoiActive | null> {
  if (!estCoffreConfigure(contexte.env)) return null;

  const estHttps = url.protocol === "https:";
  const cookieJeton = lireCookieMoi(request, estHttps);
  if (!cookieJeton || !estJetonFrappe(cookieJeton)) {
    return null;
  }

  const empreinteSession = await empreinte(cookieJeton);
  const ligne = await contexte.env.DB_IDENTITE.prepare(
    `SELECT
      s.id AS session_id,
      s.empreinte AS session_empreinte,
      s.expire_le AS session_expire_le,
      s.consomme_le AS session_consomme_le,
      t.id AS id,
      t.cree_le AS cree_le,
      t.etat AS etat,
      t.nom AS nom,
      t.numero_membre AS numero_membre,
      t.section AS section,
      t.courriel AS courriel,
      t.cabinet AS cabinet,
      t.courriel_verifie_le AS courriel_verifie_le,
      t.attestation_le AS attestation_le,
      t.attestation_ver AS attestation_ver,
      t.cgu_ver AS cgu_ver,
      t.hybride_permis AS hybride_permis,
      t.note_admission AS note_admission
     FROM session_portail s
     INNER JOIN titulaire t ON t.id = s.titulaire_id
     WHERE s.empreinte = ?1 AND s.type_lien = 'session_moi'
     LIMIT 1`,
  )
    .bind(empreinteSession)
    .first<LigneSessionJointeD1>();

  if (!ligne || ligne.session_consomme_le !== null || ligne.courriel_verifie_le === null) {
    return null;
  }
  const expMs = horodatageUtcMs(ligne.session_expire_le);
  if (expMs === null || expMs <= contexte.maintenant().getTime()) return null;

  const jetonCsrf = await calculerJetonCsrfMoi(
    contexte.env,
    `${ligne.session_id}:${ligne.session_empreinte}`,
  );
  if (!jetonCsrf) return null;

  return {
    sessionId: ligne.session_id,
    empreinteSession: ligne.session_empreinte,
    jetonCsrf,
    titulaire: {
      id: ligne.id,
      cree_le: ligne.cree_le,
      etat: ligne.etat,
      nom: ligne.nom,
      numero_membre: ligne.numero_membre,
      section: ligne.section,
      courriel: ligne.courriel,
      cabinet: ligne.cabinet,
      courriel_verifie_le: ligne.courriel_verifie_le,
      attestation_le: ligne.attestation_le,
      attestation_ver: ligne.attestation_ver,
      cgu_ver: ligne.cgu_ver,
      hybride_permis: ligne.hybride_permis,
      note_admission: ligne.note_admission,
    },
  };
}

function construireExtraitsClientsHtml(originePortail: string): string {
  const varLois = `Bearer \${MCP_LEGISLATION_SECRET}`;
  const varJuris = `Bearer \${MCP_JURISPRUDENCE_SECRET}`;

  const mcpJson = JSON.stringify(
    {
      mcpServers: {
        lois: {
          type: "http",
          url: "https://legislation.poirierlavoie.ca/mcp/oauth",
        },
        juris: {
          type: "http",
          url: "https://jurisprudence.poirierlavoie.ca/mcp/oauth",
        },
        outils: {
          type: "http",
          url: "https://outils.poirierlavoie.ca/mcp",
        },
      },
    },
    null,
    2,
  );

  const antigravityJson = JSON.stringify(
    {
      mcpServers: {
        lois: {
          url: "https://legislation.poirierlavoie.ca/mcp/oauth",
        },
        juris: {
          url: "https://jurisprudence.poirierlavoie.ca/mcp/oauth",
        },
        outils: {
          url: "https://outils.poirierlavoie.ca/mcp",
        },
      },
    },
    null,
    2,
  );

  const geminiExtensionJson = JSON.stringify(
    {
      name: "droit-civil-quebecois",
      version: "3.1.0",
      description:
        "Recherche, analyse, rédaction, administration du litige et déontologie en droit civil et commercial québécois. Connecteurs « lois », « juris » et « outils ».",
      contextFileName: [],
      settings: [],
      mcpServers: {
        lois: {
          httpUrl: "https://legislation.poirierlavoie.ca/mcp/oauth",
        },
        juris: {
          httpUrl: "https://jurisprudence.poirierlavoie.ca/mcp/oauth",
        },
        outils: {
          httpUrl: "https://outils.poirierlavoie.ca/mcp",
        },
      },
    },
    null,
    2,
  );

  const mcpBearerJson = JSON.stringify(
    {
      mcpServers: {
        lois: {
          type: "http",
          url: "https://legislation.poirierlavoie.ca/mcp",
          headers: { Authorization: varLois },
        },
        juris: {
          type: "http",
          url: "https://jurisprudence.poirierlavoie.ca/mcp",
          headers: { Authorization: varJuris },
        },
        outils: {
          type: "http",
          url: "https://outils.poirierlavoie.ca/mcp",
        },
      },
    },
    null,
    2,
  );

  const deepResearchPy = `from google import genai

client = genai.Client()
interaction = client.interactions.create(
    agent="deep-research-preview-04-2026",
    background=True,
    store=True,  # Exigé par l'API : utiliser EXCLUSIVEMENT des questions anonymisées
    tools=[
        {
            "type": "mcp_server",
            "name": "lois",
            "url": "https://legislation.poirierlavoie.ca/mcp",
            "headers": {"Authorization": f"Bearer {MCP_JETON}"},
        },
        {
            "type": "mcp_server",
            "name": "juris",
            "url": "https://jurisprudence.poirierlavoie.ca/mcp",
            "headers": {"Authorization": f"Bearer {MCP_JETON}"},
        },
        {
            "type": "mcp_server",
            "name": "outils",
            "url": "https://outils.poirierlavoie.ca/mcp",
        },
    ],
    input="""${PREAMBULE_SAFETY_KERNEL_DEEP_RESEARCH}""",
)`;

  return `<section id="configurations">
<h2>Configurations clientes prêtes à coller</h2>
<p class="m">Depuis la version <code>3.1.0</code>, <code>.mcp.json</code>, <code>mcp_config.json</code> et <code>gemini-extension.json</code> utilisent OAuth 2.1 (<code>/mcp/oauth</code>) sans clé à coller. Pour les environnements sans navigateur ou l'API Gemini Deep Research, la monture directe <code>/mcp</code> (jeton <code>Bearer</code> de portée <code>les_deux</code> ou <code>?key=</code>, et en-tête optionnel <code>X-Clef-CanLII</code> sur <code>juris</code>) demeure active.</p>

<details>
<summary>1. Claude Code et Claude Desktop (<code>.mcp.json</code> — OAuth 2.1 sans configuration)</summary>
<pre><code>${esc(mcpJson)}</code></pre>
</details>

<details>
<summary>2. Google Antigravity (<code>mcp_config.json</code> — OAuth 2.1 sans configuration)</summary>
<pre><code>${esc(antigravityJson)}</code></pre>
</details>

<details>
<summary>3. Gemini CLI (<code>gemini-extension.json</code> — OAuth 2.1 sans configuration)</summary>
<pre><code>${esc(geminiExtensionJson)}</code></pre>
</details>

<details>
<summary>4. Claude Research (<code>claude.ai</code> / Claude for Work — OAuth 2.1 ou <code>?key=</code>)</summary>
<p><strong>Mode recommandé (OAuth 2.1 + PKCE <code>S256</code> via <code>${esc(originePortail)}</code>) :</strong></p>
<pre><code>https://legislation.poirierlavoie.ca/mcp/oauth
https://jurisprudence.poirierlavoie.ca/mcp/oauth
https://outils.poirierlavoie.ca/mcp</code></pre>
<p><strong>Variante à jeton direct (poser l'URL complète avant la première sonde) :</strong></p>
<pre><code>https://legislation.poirierlavoie.ca/mcp?key=&lt;VOTRE_JETON&gt;
https://jurisprudence.poirierlavoie.ca/mcp?key=&lt;VOTRE_JETON&gt;</code></pre>
</details>

<details>
<summary>5. Gemini App (<code>gemini.google.com</code>) et Vertex AI Gemini Enterprise (OAuth 2.1 <code>/mcp/oauth</code>)</summary>
<p>Ces environnements exigent OAuth 2.1 + PKCE <code>S256</code> (RFC 9728 / RFC 8414) :</p>
<pre><code>Ressource Législation   : https://legislation.poirierlavoie.ca/mcp/oauth
Ressource Jurisprudence : https://jurisprudence.poirierlavoie.ca/mcp/oauth
Serveur d'autorisation  : ${esc(originePortail)}/.well-known/oauth-authorization-server</code></pre>
</details>

<details>
<summary>6. API Gemini Deep Research (<code>deep-research-preview-04-2026</code>) + préambule <code>SAFETY-KERNEL</code></summary>
<p class="m">L'exécution autonome <code>background=True</code> impose <code>store=True</code> et n'injecte pas automatiquement <code>skills/</code> : anonymisez intégralement la question et conservez le préambule <code>SAFETY-KERNEL</code> ci-dessous en tête de <code>input</code> (puis appelez <code>delete</code> sur l'interaction si souhaité).</p>
<pre><code>${esc(deepResearchPy)}</code></pre>
</details>

<details>
<summary>7. Mode sans navigateur / CLI / CI (jeton <code>Bearer</code> direct sur <code>/mcp</code>)</summary>
<p class="m">Pour les scripts automatisés sans flux OAuth interactif. Un jeton de portée <code>les_deux</code> peut alimenter à la fois <code>MCP_LEGISLATION_SECRET</code> et <code>MCP_JURISPRUDENCE_SECRET</code> ; l'en-tête optionnel <code>X-Clef-CanLII</code> peut également être transmis à <code>juris</code> sur <code>/mcp</code>.</p>
<pre><code>${esc(mcpBearerJson)}</code></pre>
</details>
</section>`;
}

function rendrePageConnexionMoi(params: {
  method?: string;
  statut?: number;
  retour?: string | null;
  lienEnvoye?: boolean;
  erreur?: string;
  compteSupprime?: boolean;
}): Response {
  const retourPropre = validerCheminRetourInterne(params.retour);
  let contenu: string;

  if (params.compteSupprime) {
    contenu = `<div class="ok">
<h2>Compte et enregistrements supprimés</h2>
<p>Conformément à la Loi 25, votre fiche de titulaire, vos jetons, votre clé chiffrée du coffre, vos sessions, vos compteurs et vos événements techniques ont été définitivement supprimés de <code>mcp-identite</code>.</p>
</div>`;
  } else if (params.lienEnvoye) {
    contenu = `<div class="ok">
<h2>Vérifiez votre boîte courriel</h2>
<p>Si un compte admissible est associé à cette adresse professionnelle, un lien de connexion à usage unique (valable ${DUREE_LIEN_PORTAIL_MINUTES}&nbsp;minutes) vient d'être envoyé depuis <code>noreply@acces.poirierlavoie.ca</code>.</p>
</div>`;
  } else {
    const banniereOAuth = retourPropre?.startsWith("/oauth/authorize")
      ? `<div class="avert">
<p><strong>Connexion d'un connecteur OAuth 2.1 en cours :</strong> saisissez l'adresse courriel professionnelle rattachée à votre compte admis pour recevoir votre lien magique et poursuivre l'autorisation automatiquement.</p>
<p class="m"><strong>Première visite ?</strong> Les membres actifs du Barreau du Québec doivent d'abord <a href="/demande">déposer une demande d'accès préalable (<code>/demande</code>)</a> avec leur clé API CanLII personnelle avant de pouvoir autoriser <code>lois</code> et <code>juris</code>.</p>
</div>`
      : "";
    contenu = `${banniereOAuth}${params.erreur ? `<div class="err"><p>${esc(params.erreur)}</p></div>` : ""}
<form method="POST" action="/moi" class="carte">
<input type="hidden" name="action" value="demander_lien">
${retourPropre ? `<input type="hidden" name="retour" value="${esc(retourPropre)}">` : ""}
<h2>Connexion sans mot de passe</h2>
<p class="m">Saisissez l'adresse courriel professionnelle rattachée à votre compte du Barreau du Québec pour recevoir un lien de connexion à usage unique.</p>
<div class="champ">
<label for="courriel">Adresse courriel professionnelle</label>
<input id="courriel" name="courriel" type="email" required maxlength="254">
</div>
<p><button type="submit" class="btn">Recevoir mon lien de connexion</button></p>
</form>`;
  }

  return repondrePageHtml({
    titrePage: "Console libre-service (/moi) — MCP Accès",
    descriptionMeta: "Connexion par lien magique à la console libre-service des titulaires.",
    corpsHtml: `<header><div class="bar"><h1>Console libre-service (/moi)</h1>${boutonsEntete(false)}</div><p class="m"><a href="/">← Accueil</a> · <a href="/demande">Déposer une demande</a></p></header>${contenu}`,
    statut: params.statut ?? 200,
    method: params.method,
    formAction: "'self'",
  });
}

async function rendreTableauDeBordMoi(
  session: SessionMoiActive,
  contexte: ContextePortail,
  options: {
    statut?: number;
    method?: string;
    messageSucces?: string;
    messageErreur?: string;
    jetonFrappeUnique?: { clair: string; libelle: string; portee: string };
  } = {},
): Promise<Response> {
  const { titulaire } = session;
  const aujourdhui = jourUtc(contexte.maintenant());

  const [compteurs, jetonsRes, coffreLigne] = await Promise.all([
    lireCompteursJourD1(contexte.env.DB_IDENTITE, titulaire.id, aujourdhui),
    contexte.env.DB_IDENTITE.prepare(
      `SELECT id, queue, libelle, portee, emis_le, expire_le, revoque_le, motif_revoc, vu_le
       FROM jeton
       WHERE titulaire_id = ?1
       ORDER BY emis_le DESC`,
    )
      .bind(titulaire.id)
      .all<{
        id: string;
        queue: string;
        libelle: string;
        portee: string;
        emis_le: string;
        expire_le: string | null;
        revoque_le: string | null;
        motif_revoc: string | null;
        vu_le: string | null;
      }>(),
    contexte.env.DB_IDENTITE.prepare(
      `SELECT repere, pose_le, eprouve_le, etat
       FROM coffre_clef
       WHERE titulaire_id = ?1 AND usage = ?2
       LIMIT 1`,
    )
      .bind(titulaire.id, USAGE_COFFRE_CANLII)
      .first<{
        repere: string;
        pose_le: string;
        eprouve_le: string | null;
        etat: EtatEntreeCoffre;
      }>(),
  ]);

  const estServi = estEtatServi(titulaire.etat);
  const plafonds = estServi
    ? plafondsPourEtat(titulaire.etat)
    : { local: 0, sortant: 0, semantique: 0 };

  const banniereJetonUnique = options.jetonFrappeUnique
    ? `<div class="avert">
<h2>Nouveau jeton émis — copiez-le maintenant (affiché une seule fois)</h2>
<p>Libellé : <strong>${esc(options.jetonFrappeUnique.libelle)}</strong> · Portée : <code>${esc(options.jetonFrappeUnique.portee)}</code></p>
<pre><code>${esc(options.jetonFrappeUnique.clair)}</code></pre>
<p class="m">Seule l'empreinte SHA-256 est conservée en base : ce secret ne pourra plus jamais être réaffiché.</p>
</div>`
    : "";

  const lignesJetons =
    jetonsRes.results.length === 0
      ? `<tr><td colspan="6" class="m">Aucun jeton émis pour le moment.</td></tr>`
      : jetonsRes.results
          .map((j) => {
            const actif = j.revoque_le === null;
            return `<tr>
<td><strong>${esc(j.libelle)}</strong></td>
<td><code>…${esc(j.queue)}</code></td>
<td><code>${esc(j.portee)}</code></td>
<td class="m">${esc(j.emis_le.slice(0, 10))}${j.expire_le ? ` → ${esc(j.expire_le.slice(0, 10))}` : ""}</td>
<td class="m">${actif ? `Actif${j.vu_le ? ` (vu ${esc(j.vu_le)})` : ""}` : `Révoqué (${esc(j.motif_revoc ?? "révoqué")})`}</td>
<td>${
              actif
                ? `<form method="POST" action="/moi">
<input type="hidden" name="csrf" value="${esc(session.jetonCsrf)}">
<input type="hidden" name="action" value="revoquer_jeton">
<input type="hidden" name="jeton_id" value="${esc(j.id)}">
<button type="submit" class="btn-danger">Révoquer</button>
</form>`
                : "—"
            }</td>
</tr>`;
          })
          .join("");

  const corps = `<header>
<div class="bar">
<h1>Console /moi — Me ${esc(titulaire.nom)}</h1>
<div class="btns">
<form method="POST" action="/moi">
<input type="hidden" name="csrf" value="${esc(session.jetonCsrf)}">
<input type="hidden" name="action" value="deconnexion">
<button type="submit" class="btn-sec">Fermer la session</button>
</form>
${boutonsEntete(false)}
</div>
</div>
<p class="m">Barreau n°&nbsp;<code>${esc(titulaire.numero_membre)}</code> (${esc(titulaire.section)}) · <code>${esc(titulaire.courriel)}</code> · État : <strong><code>${esc(titulaire.etat)}</code></strong> · <a href="/">Accueil</a></p>
</header>

${options.messageSucces ? `<div class="ok"><p>${esc(options.messageSucces)}</p></div>` : ""}
${options.messageErreur ? `<div class="err"><p>${esc(options.messageErreur)}</p></div>` : ""}
${banniereJetonUnique}

<section id="quotas-jour">
<h2>Consommation du jour (${esc(aujourdhui)} UTC)</h2>
<div class="tw"><table><thead><tr>
<th>Classe d'outil</th>
<th class="n">Utilisé</th>
<th class="n">Plafond quotidien</th>
</tr></thead><tbody>
<tr><td><code>local</code></td><td class="n">${compteurs.local}</td><td class="n">${plafonds.local}</td></tr>
<tr><td><code>sortant</code> (API CanLII)</td><td class="n">${compteurs.sortant}</td><td class="n">${plafonds.sortant}</td></tr>
<tr><td><code>semantique</code> (Workers AI)</td><td class="n">${compteurs.semantique}</td><td class="n">${plafonds.semantique}</td></tr>
</tbody></table></div>
</section>

<section id="jetons">
<h2>Jetons d'accès MCP</h2>
${
  estServi
    ? `<form method="POST" action="/moi" class="carte">
<input type="hidden" name="csrf" value="${esc(session.jetonCsrf)}">
<input type="hidden" name="action" value="creer_jeton">
<h3>Frapper un nouveau jeton (256 bits)</h3>
<div class="champ">
<label for="libelle_jeton">Libellé du poste ou de l'intégration</label>
<input id="libelle_jeton" name="libelle" type="text" required maxlength="80" placeholder="Poste bureau — Claude Code / Antigravity">
</div>
<div class="champ">
<label for="portee_jeton">Portée d'autorisation</label>
<select id="portee_jeton" name="portee">
<option value="les_deux">les_deux — Législation et Jurisprudence (recommandé)</option>
<option value="legislation">legislation — Législation seulement</option>
<option value="jurisprudence">jurisprudence — Jurisprudence seulement</option>
</select>
</div>
<div class="champ">
<label for="expiration_jeton">Expiration</label>
<select id="expiration_jeton" name="jours_expiration">
<option value="90">90 jours</option>
<option value="30">30 jours</option>
<option value="365">365 jours</option>
<option value="aucune">Sans date d'expiration (révocable à tout moment)</option>
</select>
</div>
<p><button type="submit" class="btn">Frapper le jeton</button></p>
</form>`
    : `<div class="avert"><p>L'émission de nouveaux jetons est désactivée tant que votre compte est à l'état <code>${esc(titulaire.etat)}</code>.</p></div>`
}
<div class="tw"><table><thead><tr>
<th>Libellé</th>
<th>Queue</th>
<th>Portée</th>
<th>Validité</th>
<th>Statut</th>
<th>Action</th>
</tr></thead><tbody>
${lignesJetons}
</tbody></table></div>
</section>

${construireExtraitsClientsHtml(contexte.originePortail)}

<section id="coffre-canlii">
<h2>Coffre chiffré — Clé API CanLII (BYOK)</h2>
<div class="carte">
${
  coffreLigne
    ? `<p>Clé enregistrée : <code>${esc(coffreLigne.repere)}</code> · État : <strong><code>${esc(coffreLigne.etat)}</code></strong> · Posée le ${esc(coffreLigne.pose_le.slice(0, 10))}${coffreLigne.eprouve_le ? ` · Éprouvée le ${esc(coffreLigne.eprouve_le.slice(0, 10))}` : ""}</p>
<div class="btns">
${
  etatPeutGererClefCanlii(titulaire.etat)
    ? `<form method="POST" action="/moi">
<input type="hidden" name="csrf" value="${esc(session.jetonCsrf)}">
<input type="hidden" name="action" value="eprouver_clef">
<button type="submit" class="btn-sec">Éprouver en direct auprès de CanLII</button>
</form>`
    : ""
}
<form method="POST" action="/moi">
<input type="hidden" name="csrf" value="${esc(session.jetonCsrf)}">
<input type="hidden" name="action" value="retirer_clef">
<button type="submit" class="btn-danger">Retirer immédiatement la clé du coffre</button>
</form>
</div>`
    : `<p class="avert">Aucune clé CanLII n'est présentement déposée au coffre : <code>MCP-Jurisprudence</code> répondra <code>[CLEF_ABSENTE]</code> (sauf fourniture locale via <code>X-Clef-CanLII</code>).</p>`
}
${
  etatPeutGererClefCanlii(titulaire.etat)
    ? `<form method="POST" action="/moi">
<input type="hidden" name="csrf" value="${esc(session.jetonCsrf)}">
<input type="hidden" name="action" value="remplacer_clef">
<div class="champ">
<label for="nouvelle_clef_canlii">${coffreLigne ? "Remplacer / faire tourner la clé API CanLII" : "Déposer une clé API CanLII"}</label>
<input id="nouvelle_clef_canlii" name="clef_canlii" type="password" required autocomplete="off" maxlength="256">
</div>
<p><button type="submit" class="btn">Éprouver et sceller au coffre</button></p>
</form>`
    : ""
}
</div>
</section>

<section id="recherche-hybride">
<h2>Recherche législative hybride (Cloudflare Workers AI)</h2>
<div class="carte">
<p>État actuel : <strong>${titulaire.hybride_permis === 1 ? "Activée (recherche lexicale FTS5 + vectorielle Workers AI)" : "Désactivée (recherche lexicale FTS5 locale uniquement, aucun appel à Workers AI)"}</strong></p>
<form method="POST" action="/moi">
<input type="hidden" name="csrf" value="${esc(session.jetonCsrf)}">
<input type="hidden" name="action" value="basculer_hybride">
<input type="hidden" name="hybride_permis" value="${titulaire.hybride_permis === 1 ? "0" : "1"}">
<button type="submit" class="btn-sec">${titulaire.hybride_permis === 1 ? "Désactiver Workers AI (repli FTS5 seul)" : "Réactiver la recherche hybride Workers AI"}</button>
</form>
</div>
</section>

<section id="loi-25">
<h2>Droits Loi 25 — Portabilité et suppression intégrale du compte</h2>
<div class="carte">
<form method="POST" action="/moi">
<input type="hidden" name="csrf" value="${esc(session.jetonCsrf)}">
<input type="hidden" name="action" value="exporter_loi25">
<p><button type="submit" class="btn-sec">Télécharger l'export JSON de mes renseignements personnels</button></p>
</form>
<hr>
<form method="POST" action="/moi">
<input type="hidden" name="csrf" value="${esc(session.jetonCsrf)}">
<input type="hidden" name="action" value="supprimer_compte">
<div class="champ">
<label for="confirmation_suppression">Pour supprimer définitivement votre compte et toutes les données rattachées (irréversible), saisissez <code>SUPPRIMER</code> :</label>
<input id="confirmation_suppression" name="confirmation" type="text" required autocomplete="off" pattern="SUPPRIMER">
</div>
<p><button type="submit" class="btn-danger">Supprimer intégralement mon compte</button></p>
</form>
</div>
</section>`;

  return repondrePageHtml({
    titrePage: `Console /moi — Me ${titulaire.nom}`,
    descriptionMeta: "Gestion libre-service des jetons MCP, du coffre CanLII et des droits Loi 25.",
    corpsHtml: corps,
    statut: options.statut ?? 200,
    method: options.method,
    formAction: "'self'",
  });
}

export async function gererRouteMoi(
  request: Request,
  url: URL,
  contexte: ContextePortail,
): Promise<Response> {
  const session = await resoudreSessionMoiActive(request, url, contexte);

  if (request.method === "GET" || request.method === "HEAD") {
    if (!session) {
      return rendrePageConnexionMoi({
        method: request.method,
        retour: url.searchParams.get("retour"),
      });
    }
    return await rendreTableauDeBordMoi(session, contexte, { method: request.method });
  }

  if (request.method !== "POST") {
    return repondreMethodeNonPermise(["GET", "HEAD", "POST"]);
  }

  if (!estOrigineFormulaireValide(request, url)) {
    return new Response("Origine de formulaire refusée.", { status: 403 });
  }

  const lecture = await lireFormulaireBorne(request);
  if (!lecture.ok) {
    return rendrePageConnexionMoi({
      statut: lecture.statut,
      erreur: lecture.message,
    });
  }

  const champs = lecture.champs;
  const action = champs.get("action") ?? "";

  // Action publique non authentifiée : demande de lien magique
  if (action === "demander_lien") {
    const debitOk = await debitAcceptable(contexte.env.RL_DEMANDE_IP, contexte.ipClient);
    if (!debitOk) {
      return tropDeRequetes(60, null);
    }
    if (!contexte.env.COURRIEL || !estCoffreConfigure(contexte.env)) {
      return rendrePageConnexionMoi({
        statut: 503,
        erreur: "Service de connexion momentanément indisponible.",
      });
    }
    const courriel = normaliserCourriel(champs.get("courriel"));
    const retourValide = validerCheminRetourInterne(champs.get("retour"));
    if (!courriel) {
      return rendrePageConnexionMoi({
        statut: 400,
        retour: retourValide,
        erreur: "Veuillez saisir une adresse courriel valide.",
      });
    }

    const titulaire = await contexte.env.DB_IDENTITE.prepare(
      `SELECT id, nom, courriel, etat, courriel_verifie_le
       FROM titulaire
       WHERE courriel = ?1
       LIMIT 1`,
    )
      .bind(courriel)
      .first<{
        id: string;
        nom: string;
        courriel: string;
        etat: string;
        courriel_verifie_le: string | null;
      }>();

    if (titulaire && titulaire.courriel_verifie_le !== null) {
      const maintenant = contexte.maintenant();
      const maintenantIso = horodatageIsoUtc(maintenant);
      const expireIso = horodatageIsoUtc(
        new Date(maintenant.getTime() + DUREE_LIEN_PORTAIL_MINUTES * 60_000),
      );
      const jetonLien = frapperJeton();
      const empreinteLien = await empreinte(jetonLien);

      await contexte.env.DB_IDENTITE.prepare(
        `INSERT INTO session_portail (
          id, titulaire_id, courriel, type_lien, empreinte, cree_le, expire_le, consomme_le
        ) VALUES (?1, ?2, ?3, 'connexion_moi', ?4, ?5, ?6, NULL)`,
      )
        .bind(
          creerIdentifiant("sp"),
          titulaire.id,
          titulaire.courriel,
          empreinteLien,
          maintenantIso,
          expireIso,
        )
        .run();

      const suffixeRetour = retourValide ? `&retour=${encodeURIComponent(retourValide)}` : "";
      const urlConnexion = `${contexte.originePortail}/moi/connexion?jeton=${encodeURIComponent(jetonLien)}${suffixeRetour}`;
      await envoyerCourrielLienMagiqueMoi(contexte.env, {
        destinataire: titulaire.courriel,
        nom: titulaire.nom,
        urlConnexion,
        dureeMinutes: DUREE_LIEN_PORTAIL_MINUTES,
      });
    }

    return rendrePageConnexionMoi({ lienEnvoye: true });
  }

  // Toutes les autres actions exigent une session active ET un jeton CSRF valide
  if (!session) {
    return rendrePageConnexionMoi({
      statut: 401,
      erreur: "Votre session a expiré. Veuillez demander un nouveau lien de connexion.",
    });
  }

  if (!estCoffreConfigure(contexte.env)) {
    return new Response("Configuration indisponible.", { status: 503 });
  }

  const csrfValide = await verifierJetonCsrfMoi(
    contexte.env,
    champs.get("csrf"),
    `${session.sessionId}:${session.empreinteSession}`,
  );
  if (!csrfValide) {
    return await rendreTableauDeBordMoi(session, contexte, {
      statut: 403,
      messageErreur: "Jeton de protection CSRF invalide ou périmé.",
    });
  }

  const maintenant = contexte.maintenant();
  const maintenantIso = horodatageIsoUtc(maintenant);
  const estHttps = url.protocol === "https:";

  if (action === "deconnexion") {
    await contexte.env.DB_IDENTITE.prepare(
      `UPDATE session_portail SET consomme_le = ?2 WHERE id = ?1 AND consomme_le IS NULL`,
    )
      .bind(session.sessionId, maintenantIso)
      .run();
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/moi",
        "Set-Cookie": effacerCookieMoi(estHttps),
        "Cache-Control": "no-store",
      },
    });
  }

  if (action === "creer_jeton") {
    if (!estEtatServi(session.titulaire.etat)) {
      return await rendreTableauDeBordMoi(session, contexte, {
        statut: 403,
        messageErreur: "Seul un compte actif permet d'émettre un jeton.",
      });
    }
    const libelle = nettoyerLigneTexte(champs.get("libelle"), 1, 80);
    const portee = normaliserPorteeOAuth(champs.get("portee"), SERVICES_MCP);
    const joursBrut = champs.get("jours_expiration") ?? "90";

    if (!libelle || !portee) {
      return await rendreTableauDeBordMoi(session, contexte, {
        statut: 400,
        messageErreur: "Veuillez préciser un libellé valide et une portée reconnue.",
      });
    }

    let expireLe: string | null = null;
    if (joursBrut !== "aucune") {
      const nbJours = Number(joursBrut);
      if (!Number.isInteger(nbJours) || nbJours < 1 || nbJours > 365) {
        return await rendreTableauDeBordMoi(session, contexte, {
          statut: 400,
          messageErreur: "Durée d'expiration invalide.",
        });
      }
      expireLe = horodatageIsoUtc(new Date(maintenant.getTime() + nbJours * 86_400_000));
    }

    const jetonClair = frapperJeton();
    const empreinteHex = await empreinte(jetonClair);
    const queue = queueJeton(jetonClair);

    await contexte.env.DB_IDENTITE.prepare(
      `INSERT INTO jeton (
        id, titulaire_id, empreinte, queue, libelle, portee, emis_le, expire_le, revoque_le, motif_revoc, vu_le
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL, NULL)`,
    )
      .bind(
        creerIdentifiant("jtn"),
        session.titulaire.id,
        empreinteHex,
        queue,
        libelle,
        portee,
        maintenantIso,
        expireLe,
      )
      .run();

    return await rendreTableauDeBordMoi(session, contexte, {
      jetonFrappeUnique: { clair: jetonClair, libelle, portee },
    });
  }

  if (action === "revoquer_jeton") {
    const jetonId = (champs.get("jeton_id") ?? "").trim();
    if (jetonId.length === 0 || jetonId.length > 80) {
      return await rendreTableauDeBordMoi(session, contexte, {
        statut: 400,
        messageErreur: "Identifiant de jeton invalide.",
      });
    }
    await contexte.env.DB_IDENTITE.prepare(
      `UPDATE jeton
       SET revoque_le = ?3, motif_revoc = 'titulaire'
       WHERE id = ?1 AND titulaire_id = ?2 AND revoque_le IS NULL`,
    )
      .bind(jetonId, session.titulaire.id, maintenantIso)
      .run();

    return await rendreTableauDeBordMoi(session, contexte, {
      messageSucces: "Le jeton a été révoqué immédiatement.",
    });
  }

  if (action === "eprouver_clef") {
    if (!etatPeutGererClefCanlii(session.titulaire.etat)) {
      return await rendreTableauDeBordMoi(session, contexte, {
        statut: 403,
        messageErreur:
          "L'épreuve sortante CanLII n'est pas autorisée pour l'état actuel du compte.",
      });
    }
    const entree = await contexte.env.DB_IDENTITE.prepare(
      `SELECT version, iv, chiffre, repere, empreinte_clef, etat
       FROM coffre_clef
       WHERE titulaire_id = ?1 AND usage = ?2
       LIMIT 1`,
    )
      .bind(session.titulaire.id, USAGE_COFFRE_CANLII)
      .first<{
        version: number;
        iv: BinaireD1;
        chiffre: BinaireD1;
        repere: string;
        empreinte_clef: string;
        etat: EtatEntreeCoffre;
      }>();

    if (!entree) {
      return await rendreTableauDeBordMoi(session, contexte, {
        statut: 400,
        messageErreur: "Aucune clé n'est enregistrée dans votre coffre.",
      });
    }

    const resEpreuve = await eprouverEntreeScelleeCanlii(
      session.titulaire.id,
      {
        titulaireId: session.titulaire.id,
        version: entree.version,
        iv: entree.iv,
        chiffre: entree.chiffre,
        repere: entree.repere,
        empreinteClef: entree.empreinte_clef,
        // Autorise la ré-épreuve explicite même si elle avait été marquée refusée auparavant :
        etat: "valide",
      },
      construireAnneauMaitres(contexte.env),
      {
        baseUrl: contexte.env.CANLII_BASE_URL,
        fetchImpl: contexte.fetchExterne,
      },
    );

    if (resEpreuve.ok) {
      await contexte.env.DB_IDENTITE.prepare(
        `UPDATE coffre_clef
         SET etat = 'valide', eprouve_le = ?3
         WHERE titulaire_id = ?1 AND usage = ?2`,
      )
        .bind(session.titulaire.id, USAGE_COFFRE_CANLII, maintenantIso)
        .run();
      return await rendreTableauDeBordMoi(session, contexte, {
        messageSucces: "Épreuve réussie : votre clé API CanLII est valide.",
      });
    }

    if (resEpreuve.categorie === "refusee") {
      await contexte.env.DB_IDENTITE.prepare(
        `UPDATE coffre_clef
         SET etat = 'refusee', eprouve_le = ?3
         WHERE titulaire_id = ?1 AND usage = ?2`,
      )
        .bind(session.titulaire.id, USAGE_COFFRE_CANLII, maintenantIso)
        .run();
    }
    return await rendreTableauDeBordMoi(session, contexte, {
      statut: 400,
      messageErreur: resEpreuve.messagePublic,
    });
  }

  if (action === "remplacer_clef") {
    if (!etatPeutGererClefCanlii(session.titulaire.etat)) {
      return await rendreTableauDeBordMoi(session, contexte, {
        statut: 403,
        messageErreur:
          "Le dépôt d'une nouvelle clé n'est pas autorisé pour l'état actuel du compte.",
      });
    }
    const nouvelleClef = normaliserValiderFormatCanlii(champs.get("clef_canlii"));
    if (!nouvelleClef) {
      return await rendreTableauDeBordMoi(session, contexte, {
        statut: 400,
        messageErreur: "Format de clé API CanLII invalide.",
      });
    }
    const epreuve = await eprouverClefCanliiEnDirect(nouvelleClef, {
      baseUrl: contexte.env.CANLII_BASE_URL,
      fetchImpl: contexte.fetchExterne,
    });
    if (!epreuve.ok) {
      return await rendreTableauDeBordMoi(session, contexte, {
        statut: 400,
        messageErreur: epreuve.messagePublic,
      });
    }

    const scelle = await scellerClefCanliiPourTitulaire(
      contexte.env,
      session.titulaire.id,
      nouvelleClef,
    );
    if (!scelle) {
      return new Response("Configuration indisponible.", { status: 503 });
    }

    await contexte.env.DB_IDENTITE.prepare(
      `INSERT INTO coffre_clef (
        titulaire_id, usage, version, iv, chiffre, repere, empreinte_clef, pose_le, eprouve_le, etat
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 'valide')
      ON CONFLICT(titulaire_id, usage) DO UPDATE SET
        version = excluded.version,
        iv = excluded.iv,
        chiffre = excluded.chiffre,
        repere = excluded.repere,
        empreinte_clef = excluded.empreinte_clef,
        pose_le = excluded.pose_le,
        eprouve_le = excluded.eprouve_le,
        etat = 'valide'`,
    )
      .bind(
        session.titulaire.id,
        USAGE_COFFRE_CANLII,
        scelle.version,
        scelle.iv,
        scelle.chiffre,
        scelle.repere,
        scelle.empreinteClef,
        maintenantIso,
      )
      .run();

    return await rendreTableauDeBordMoi(session, contexte, {
      messageSucces: "Votre clé API CanLII a été éprouvée et scellée au coffre.",
    });
  }

  if (action === "retirer_clef") {
    await retirerEntreeCoffreD1(
      contexte.env.DB_IDENTITE,
      session.titulaire.id,
      USAGE_COFFRE_CANLII,
    );
    return await rendreTableauDeBordMoi(session, contexte, {
      messageSucces: "Votre clé API CanLII a été retirée immédiatement du coffre chiffré.",
    });
  }

  if (action === "basculer_hybride") {
    const nouvelleValeur = champs.get("hybride_permis") === "0" ? 0 : 1;
    await contexte.env.DB_IDENTITE.prepare(`UPDATE titulaire SET hybride_permis = ?2 WHERE id = ?1`)
      .bind(session.titulaire.id, nouvelleValeur)
      .run();

    const sessionMaj: SessionMoiActive = {
      ...session,
      titulaire: { ...session.titulaire, hybride_permis: nouvelleValeur },
    };
    return await rendreTableauDeBordMoi(sessionMaj, contexte, {
      messageSucces:
        nouvelleValeur === 1
          ? "La recherche législative hybride (Workers AI) est activée."
          : "La recherche vectorielle Workers AI est désactivée (repli lexical FTS5 local seul).",
    });
  }

  if (action === "exporter_loi25") {
    const [jetons, coffres, compteurs, evenements, gouverne] = await Promise.all([
      contexte.env.DB_IDENTITE.prepare(
        `SELECT id, queue, libelle, portee, emis_le, expire_le, revoque_le, motif_revoc, vu_le
         FROM jeton WHERE titulaire_id = ?1 ORDER BY emis_le DESC`,
      )
        .bind(session.titulaire.id)
        .all(),
      contexte.env.DB_IDENTITE.prepare(
        `SELECT usage, version, repere, pose_le, eprouve_le, etat
         FROM coffre_clef WHERE titulaire_id = ?1`,
      )
        .bind(session.titulaire.id)
        .all(),
      contexte.env.DB_IDENTITE.prepare(
        `SELECT jour, classe, appels, erreurs, introuvables, sortants
         FROM compteur_jour WHERE titulaire_id = ?1 ORDER BY jour DESC`,
      )
        .bind(session.titulaire.id)
        .all(),
      contexte.env.DB_IDENTITE.prepare(
        `SELECT service, minute, outil, classe, issue, code, ms, sortants, client
         FROM evenement_technique WHERE titulaire_id = ?1 ORDER BY minute DESC LIMIT 1000`,
      )
        .bind(session.titulaire.id)
        .all(),
      contexte.env.DB_IDENTITE.prepare(
        `SELECT le, de, vers, motif, auteur, notifie_le
         FROM registre_gouverne WHERE titulaire_id = ?1 ORDER BY le DESC`,
      )
        .bind(session.titulaire.id)
        .all(),
    ]);

    const exportJson = {
      exporte_le: maintenantIso,
      cadre_legal: "RLRQ, c. P-39.1 (Loi 25)",
      titulaire: session.titulaire,
      jetons: jetons.results,
      coffre_metadonnees: coffres.results,
      compteurs_journaliers: compteurs.results,
      evenements_techniques: evenements.results,
      registre_gouverne: gouverne.results,
    };

    return new Response(JSON.stringify(exportJson, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="export-loi25-mcp-acces.json"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (action === "supprimer_compte") {
    if (champs.get("confirmation") !== "SUPPRIMER") {
      return await rendreTableauDeBordMoi(session, contexte, {
        statut: 400,
        messageErreur: "Veuillez saisir exactement SUPPRIMER pour confirmer la suppression.",
      });
    }
    await supprimerCompteTitulaireD1(contexte.env.DB_IDENTITE, session.titulaire.id);
    const rep = rendrePageConnexionMoi({ compteSupprime: true });
    const headers = new Headers(rep.headers);
    headers.set("Set-Cookie", effacerCookieMoi(estHttps));
    return new Response(rep.body, { status: 200, headers });
  }

  return await rendreTableauDeBordMoi(session, contexte, {
    statut: 400,
    messageErreur: "Action inconnue.",
  });
}

export async function gererRouteConnexionMoi(
  request: Request,
  url: URL,
  contexte: ContextePortail,
): Promise<Response> {
  const maintenant = contexte.maintenant();
  const maintenantMs = maintenant.getTime();
  const maintenantIso = horodatageIsoUtc(maintenant);

  if (request.method === "GET" || request.method === "HEAD") {
    const jeton = (url.searchParams.get("jeton") ?? "").trim();
    const retourValide = validerCheminRetourInterne(url.searchParams.get("retour"));
    if (!estJetonFrappe(jeton)) {
      return rendrePageConnexionMoi({
        statut: 400,
        method: request.method,
        erreur: "Lien de connexion invalide.",
      });
    }

    const empreinteLien = await empreinte(jeton);
    const lien = await contexte.env.DB_IDENTITE.prepare(
      `SELECT s.expire_le, s.consomme_le, t.nom, t.courriel, t.courriel_verifie_le
       FROM session_portail s
       INNER JOIN titulaire t ON t.id = s.titulaire_id
       WHERE s.empreinte = ?1 AND s.type_lien = 'connexion_moi'
       LIMIT 1`,
    )
      .bind(empreinteLien)
      .first<{
        expire_le: string;
        consomme_le: string | null;
        nom: string;
        courriel: string;
        courriel_verifie_le: string | null;
      }>();

    const expMs = lien ? horodatageUtcMs(lien.expire_le) : null;
    if (
      !lien ||
      lien.consomme_le !== null ||
      expMs === null ||
      expMs <= maintenantMs ||
      lien.courriel_verifie_le === null
    ) {
      return rendrePageConnexionMoi({
        statut: 400,
        method: request.method,
        erreur: "Ce lien de connexion est expiré ou a déjà été utilisé.",
      });
    }

    const corps = `<header><div class="bar"><h1>Ouverture de session (/moi)</h1>${boutonsEntete(false)}</div></header>
<div class="carte">
<p>Titulaire : <strong>Me ${esc(lien.nom)}</strong> (<code>${esc(lien.courriel)}</code>)</p>
<form method="POST" action="/moi/connexion">
<input type="hidden" name="jeton" value="${esc(jeton)}">
${retourValide ? `<input type="hidden" name="retour" value="${esc(retourValide)}">` : ""}
<p><button type="submit" class="btn">Ouvrir ma session (${DUREE_SESSION_MOI_HEURES}&nbsp;h)</button></p>
</form>
</div>`;

    return repondrePageHtml({
      titrePage: "Ouverture de session — MCP Accès",
      descriptionMeta: "Confirmation d'ouverture de session libre-service.",
      corpsHtml: corps,
      method: request.method,
      formAction: "'self'",
    });
  }

  if (request.method !== "POST") {
    return repondreMethodeNonPermise(["GET", "HEAD", "POST"]);
  }

  if (!estOrigineFormulaireValide(request, url)) {
    return new Response("Origine de formulaire refusée.", { status: 403 });
  }

  const debitOk = await debitAcceptable(contexte.env.RL_DEMANDE_IP, contexte.ipClient);
  if (!debitOk) {
    return tropDeRequetes(60, null);
  }

  const lecture = await lireFormulaireBorne(request);
  if (!lecture.ok) {
    return rendrePageConnexionMoi({
      statut: lecture.statut,
      erreur: lecture.message,
    });
  }

  const jeton = (lecture.champs.get("jeton") ?? "").trim();
  const retourValide = validerCheminRetourInterne(lecture.champs.get("retour")) ?? "/moi";
  if (!estJetonFrappe(jeton)) {
    return rendrePageConnexionMoi({
      statut: 400,
      erreur: "Lien de connexion invalide.",
    });
  }

  const empreinteLien = await empreinte(jeton);
  const lien = await contexte.env.DB_IDENTITE.prepare(
    `SELECT s.id AS session_id, s.titulaire_id, s.courriel, s.expire_le, s.consomme_le, t.courriel_verifie_le
     FROM session_portail s
     INNER JOIN titulaire t ON t.id = s.titulaire_id
     WHERE s.empreinte = ?1 AND s.type_lien = 'connexion_moi'
     LIMIT 1`,
  )
    .bind(empreinteLien)
    .first<{
      session_id: string;
      titulaire_id: string;
      courriel: string;
      expire_le: string;
      consomme_le: string | null;
      courriel_verifie_le: string | null;
    }>();

  const expMs = lien ? horodatageUtcMs(lien.expire_le) : null;
  if (
    !lien ||
    lien.consomme_le !== null ||
    expMs === null ||
    expMs <= maintenantMs ||
    lien.courriel_verifie_le === null
  ) {
    return rendrePageConnexionMoi({
      statut: 400,
      erreur: "Ce lien de connexion est expiré ou a déjà été utilisé.",
    });
  }

  const conso = await contexte.env.DB_IDENTITE.prepare(
    `UPDATE session_portail
     SET consomme_le = ?2
     WHERE id = ?1 AND type_lien = 'connexion_moi' AND consomme_le IS NULL AND expire_le > ?2`,
  )
    .bind(lien.session_id, maintenantIso)
    .run();

  if ((conso.meta?.changes ?? 0) !== 1) {
    return rendrePageConnexionMoi({
      statut: 400,
      erreur: "Ce lien de connexion vient d'être utilisé.",
    });
  }

  const jetonSession = frapperJeton();
  const empreinteSession = await empreinte(jetonSession);
  const maxAgeSec = DUREE_SESSION_MOI_HEURES * 3_600;
  const expireSessionIso = horodatageIsoUtc(new Date(maintenantMs + maxAgeSec * 1_000));

  await contexte.env.DB_IDENTITE.prepare(
    `INSERT INTO session_portail (
      id, titulaire_id, courriel, type_lien, empreinte, cree_le, expire_le, consomme_le
    ) VALUES (?1, ?2, ?3, 'session_moi', ?4, ?5, ?6, NULL)`,
  )
    .bind(
      creerIdentifiant("sp"),
      lien.titulaire_id,
      lien.courriel,
      empreinteSession,
      maintenantIso,
      expireSessionIso,
    )
    .run();

  const estHttps = url.protocol === "https:";
  return new Response(null, {
    status: 303,
    headers: {
      Location: retourValide,
      "Set-Cookie": construireCookieMoi(jetonSession, estHttps, maxAgeSec),
      "Cache-Control": "no-store",
    },
  });
}
