/**
 * Parcours d'admission préalable sur `/demande` et `/demande/confirmer` (`SPEC §4.3`, `§5.1`, `§9`) :
 * - modes `MODE_ADMISSION` (`ferme` par défaut, `invitation`, `ouvert`) ;
 * - limitation d'arête `RL_DEMANDE_IP` (`10/min`, `namespace_id` `"1031"`) ;
 * - épreuve en direct de la clé API CanLII (`caseBrowse/fr/`) avec expurgation stricte (`G9`, `G10`) ;
 * - sas `demande_acces` sans contrainte `UNIQUE` empêchant tout squattage de numéro du Barreau ;
 * - confirmation courriel en deux temps (`GET` lecture seule -> `POST` consommation atomique, immunisée
 *   contre les analyseurs d'hyperliens d'entreprise de type SafeLinks / Proofpoint).
 */

import {
  type BinaireD1,
  DUREE_DEMANDE_ACCES_MINUTES,
  debitAcceptable,
  empreinte,
  estJetonFrappe,
  frapperJeton,
  horodatageIsoUtc,
  horodatageUtcMs,
  resoudreModeAdmission,
  tropDeRequetes,
} from "@poirierlavoie/mcp-socle";
import { eprouverClefCanliiEnDirect, eprouverEntreeScelleeCanlii } from "../canlii";
import {
  SECTIONS_BARREAU,
  USAGE_COFFRE_CANLII,
  VERSION_ATTESTATION,
  VERSION_CGU,
} from "../constantes";
import {
  envoyerCourrielAlerteNouvelleDemande,
  envoyerCourrielConfirmationDemande,
  envoyerCourrielRappelCompteExistant,
} from "../courriel";
import { barreSuite, bi, boutonsEntete, esc, repondrePageHtml } from "../html/gabarit";
import {
  construireAnneauMaitres,
  creerIdentifiant,
  estCoffreConfigure,
  estOrigineFormulaireValide,
  lireFormulaireBorne,
  nettoyerLigneTexte,
  normaliserCourriel,
  normaliserNumeroMembre,
  normaliserValiderFormatCanlii,
  repondreMethodeNonPermise,
  scellerClefCanliiPourTitulaire,
  validerSectionBarreau,
} from "../securite";
import type { ContextePortail } from "../types";

interface LigneInvitationD1 {
  readonly id: string;
  readonly courriel_cible: string | null;
  readonly expire_le: string;
  readonly consomme_le: string | null;
  readonly titulaire_id: string | null;
}

interface LigneDemandeAccesD1 {
  readonly id: string;
  readonly invitation_id: string | null;
  readonly nom: string;
  readonly numero_membre: string;
  readonly section: string;
  readonly courriel: string;
  readonly cabinet: string | null;
  readonly attestation_le: string;
  readonly attestation_ver: string;
  readonly cgu_ver: string;
  readonly coffre_version: number | null;
  readonly coffre_iv: BinaireD1 | null;
  readonly coffre_chiffre: BinaireD1 | null;
  readonly coffre_repere: string | null;
  readonly coffre_empreinte: string | null;
  readonly expire_le: string;
  readonly consomme_le: string | null;
}

const ERREURS_DEMANDE_EN: Readonly<Record<string, string>> = {
  "Les nouvelles admissions sont actuellement fermées.":
    "New access applications are currently closed.",
  "Le portail d'admission n'est pas entièrement configuré (fermé par défaut).":
    "The admission portal is not fully configured (closed by default).",
  "Veuillez indiquer votre nom complet (2 à 120 caractères).":
    "Please enter your full name (2 to 120 characters).",
  "Format de numéro de membre du Barreau du Québec invalide.":
    "Invalid Barreau du Québec member number format.",
  "Veuillez sélectionner une section régionale officielle du Barreau du Québec.":
    "Please select an official Barreau du Québec regional section.",
  "Adresse courriel professionnelle invalide.": "Invalid professional email address.",
  "Le nom du cabinet est invalide ou dépasse la longueur maximale autorisée (160 caractères).":
    "Firm name is invalid or exceeds the maximum length (160 characters).",
  "Veuillez fournir une clé REST API CanLII valide.": "Please provide a valid CanLII REST API key.",
  "L'acceptation de l'attestation solennelle et des conditions d'utilisation est requise.":
    "Acceptance of the solemn attestation and terms of use is required.",
  "Code d'invitation absent ou invalide.": "Missing or invalid invitation code.",
  "Code d'invitation invalide, expiré ou réservé à une autre adresse.":
    "Invitation code is invalid, expired, or reserved for another email address.",
  "Configuration du coffre indisponible.": "Vault configuration unavailable.",
};

function rendrePageFormulaireDemande(params: {
  mode: "ferme" | "invitation" | "ouvert";
  method?: string;
  statut?: number;
  erreur?: string;
  messageSuccesNeutre?: boolean;
  valeurs?: {
    nom?: string;
    numeroMembre?: string;
    section?: string;
    courriel?: string;
    cabinet?: string;
    codeInvitation?: string;
  };
}): Response {
  const optionsSections = SECTIONS_BARREAU.map((s) => {
    const sel = params.valeurs?.section === s ? " selected" : "";
    return `<option value="${esc(s)}"${sel}>${esc(s)}</option>`;
  }).join("");

  let contenuPrincipal: string;
  if (params.messageSuccesNeutre) {
    contenuPrincipal = `<div class="ok" role="status">
<h2>${bi("Vérifiez votre boîte courriel professionnelle", "Check your professional email inbox")}</h2>
<p><span data-l="fr">Si votre demande est recevable, un lien de confirmation à usage unique (valable ${DUREE_DEMANDE_ACCES_MINUTES}&nbsp;minutes) vient d'être expédié depuis <code>noreply@acces.poirierlavoie.ca</code>.</span><span data-l="en" lang="en">If your application is eligible, a single-use confirmation link (valid for ${DUREE_DEMANDE_ACCES_MINUTES}&nbsp;minutes) has just been sent from <code>noreply@acces.poirierlavoie.ca</code>.</span></p>
<p class="m"><span data-l="fr">Votre numéro de membre du Barreau n'est engagé qu'après confirmation du courriel. Une fois votre courriel confirmé, votre inscription active sera vérifiée manuellement au <em>Bottin des avocats</em> avant activation.</span><span data-l="en" lang="en">Your Barreau member number is only reserved once your email is confirmed. After confirmation, active enrolment will be manually verified against the <em>Bottin des avocats</em> before activation.</span></p>
</div>`;
  } else if (params.mode === "ferme") {
    contenuPrincipal = `<div class="avert">
<h2>${bi("Admissions temporairement fermées", "Applications temporarily closed")}</h2>
<p><span data-l="fr">Le dépôt de nouvelles demandes d'accès est présentement fermé. Les titulaires déjà inscrits conservent pleinement accès à leur espace libre-service <a href="/moi"><code>/moi</code></a>.</span><span data-l="en" lang="en">New access applications are currently closed. Already admitted members retain full access to their <a href="/moi"><code>/moi</code></a> self-service portal.</span></p>
</div>`;
  } else {
    const champInvitation =
      params.mode === "invitation"
        ? `<div class="champ">
<label for="code_invitation">${bi("Code d'invitation de cohorte (requis)", "Cohort invitation code (required)")}</label>
<p id="aide-invitation" class="m">${bi("Le déploiement initial est ouvert par cohorte sur invitation.", "Initial rollout is open by cohort invitation.")}</p>
<input id="code_invitation" name="code_invitation" type="text" required autocomplete="off" aria-describedby="aide-invitation" value="${esc(params.valeurs?.codeInvitation ?? "")}">
</div>`
        : "";

    const msgErrEn = params.erreur ? (ERREURS_DEMANDE_EN[params.erreur] ?? params.erreur) : "";
    contenuPrincipal = `${params.erreur ? `<div class="err" role="alert"><p><strong>${bi("Demande incomplète :", "Incomplete application:")}</strong> ${bi(params.erreur, msgErrEn)}</p></div>` : ""}
<form method="POST" action="/demande" class="carte">
${champInvitation}
<div class="champ">
<label for="nom">${bi("Nom complet tel qu'inscrit au Tableau de l'Ordre", "Full name as enrolled on the Roll of the Order")}</label>
<input id="nom" name="nom" type="text" required autocomplete="name" maxlength="120" value="${esc(params.valeurs?.nom ?? "")}">
</div>
<div class="champ">
<label for="numero_membre">${bi("Numéro de membre du Barreau du Québec (ex. 123456-7)", "Barreau du Québec member number (e.g. 123456-7)")}</label>
<input id="numero_membre" name="numero_membre" type="text" required autocomplete="off" maxlength="16" value="${esc(params.valeurs?.numeroMembre ?? "")}">
</div>
<div class="champ">
<label for="section">${bi("Section régionale du Barreau", "Barreau regional section")}</label>
<select id="section" name="section" required>
<option value="">— Section / Regional section —</option>
${optionsSections}
</select>
</div>
<div class="champ">
<label for="courriel">${bi("Adresse courriel professionnelle", "Professional email address")}</label>
<input id="courriel" name="courriel" type="email" inputmode="email" required autocomplete="email" maxlength="254" value="${esc(params.valeurs?.courriel ?? "")}">
</div>
<div class="champ">
<label for="cabinet">${bi("Cabinet ou organisme (facultatif)", "Firm or organization (optional)")}</label>
<input id="cabinet" name="cabinet" type="text" autocomplete="organization" maxlength="160" value="${esc(params.valeurs?.cabinet ?? "")}">
</div>
<div class="champ">
<label for="clef_canlii">${bi("Clé REST API CanLII personnelle ou de cabinet (obligatoire — BYOK)", "Personal or firm CanLII REST API key (mandatory — BYOK)")}</label>
<p id="aide-canlii" class="m"><span data-l="fr">Vérifiée auprès de CanLII lors de l'envoi, puis conservée sous forme chiffrée. Jamais enregistrée ni journalisée en clair (détails techniques sur <code>/conformite</code>).</span><span data-l="en" lang="en">Verified with CanLII upon submission, then stored encrypted. Never saved or logged in plaintext (technical details on <code>/conformite</code>).</span></p>
<input id="clef_canlii" name="clef_canlii" type="password" required autocomplete="off" aria-describedby="aide-canlii" maxlength="256">
</div>
<div class="case">
<input id="attestation_acceptee" name="attestation_acceptee" type="checkbox" value="oui" required>
<label for="attestation_acceptee"><span data-l="fr">Je souscris à l'<a href="/attestation">attestation solennelle</a> (v.&nbsp;${esc(VERSION_ATTESTATION)}) : je suis inscrit(e) actif(ve) en règle au Barreau du Québec et je détiens légitimement cette clé API CanLII.</span><span data-l="en" lang="en">I subscribe to the <a href="/attestation">solemn attestation</a> (v.&nbsp;${esc(VERSION_ATTESTATION)}): I am an active member in good standing of the Barreau du Québec and legitimately hold this CanLII API key.</span></label>
</div>
<div class="case">
<input id="cgu_acceptees" name="cgu_acceptees" type="checkbox" value="oui" required>
<label for="cgu_acceptees"><span data-l="fr">J'accepte les <a href="/cgu">conditions générales d'utilisation</a> (v.&nbsp;${esc(VERSION_CGU)}) et j'ai pris connaissance de la <a href="/confidentialite">politique de confidentialité</a>.</span><span data-l="en" lang="en">I accept the <a href="/cgu">terms of use</a> (v.&nbsp;${esc(VERSION_CGU)}) and have read the <a href="/confidentialite">privacy policy</a>.</span></label>
</div>
<p><button type="submit" class="btn">${bi("Vérifier ma clé CanLII et recevoir mon lien de confirmation", "Verify my CanLII key & send confirmation link")}</button></p>
</form>`;
  }

  const corps = `<header>
${barreSuite(true, false)}
<div class="bar">
<h1>${bi("Demande d'accès (/demande)", "Access Application (/demande)")}</h1>
${boutonsEntete(true)}
</div>
<p class="m"><a href="/">${bi("← Retour à l'accueil", "← Back to portal")}</a> · <a href="/moi">${bi("Espace /moi", "Portal /moi")}</a> · <a href="/conformite">/conformite</a></p>
</header>
${contenuPrincipal}`;

  return repondrePageHtml({
    titrePage: "Demande d'accès — MCP Accès (Barreau du Québec)",
    titrePageEn: "Access Application — MCP Access (Barreau du Québec)",
    descriptionMeta:
      "Formulaire de demande d'accès réservé aux membres actifs en règle du Barreau du Québec (clé API CanLII requise).",
    corpsHtml: corps,
    bilingue: true,
    noindex: true,
    statut: params.statut ?? 200,
    method: params.method,
    formAction: "'self'",
  });
}

export async function gererRouteDemande(
  request: Request,
  url: URL,
  contexte: ContextePortail,
): Promise<Response> {
  const mode = resoudreModeAdmission(contexte.env.MODE_ADMISSION);

  if (request.method === "GET" || request.method === "HEAD") {
    const codeInvitationInitial = url.searchParams.get("invitation") ?? "";
    return rendrePageFormulaireDemande({
      mode,
      method: request.method,
      valeurs: codeInvitationInitial ? { codeInvitation: codeInvitationInitial } : undefined,
    });
  }

  if (request.method !== "POST") {
    return repondreMethodeNonPermise(["GET", "HEAD", "POST"]);
  }

  if (!estOrigineFormulaireValide(request, url)) {
    return new Response("Origine de formulaire refusée.", { status: 403 });
  }

  if (mode === "ferme") {
    return rendrePageFormulaireDemande({
      mode: "ferme",
      statut: 403,
      erreur: "Les nouvelles admissions sont actuellement fermées.",
    });
  }

  const debitOk = await debitAcceptable(contexte.env.RL_DEMANDE_IP, contexte.ipClient);
  if (!debitOk) {
    return tropDeRequetes(60, null);
  }

  if (!estCoffreConfigure(contexte.env) || !contexte.env.COURRIEL) {
    return rendrePageFormulaireDemande({
      mode,
      statut: 503,
      erreur: "Le portail d'admission n'est pas entièrement configuré (fermé par défaut).",
    });
  }

  const lecture = await lireFormulaireBorne(request);
  if (!lecture.ok) {
    return rendrePageFormulaireDemande({
      mode,
      statut: lecture.statut,
      erreur: lecture.message,
    });
  }

  const champs = lecture.champs;
  const nomBrut = champs.get("nom") ?? "";
  const numeroBrut = champs.get("numero_membre") ?? "";
  const sectionBrute = champs.get("section") ?? "";
  const courrielBrut = champs.get("courriel") ?? "";
  const cabinetBrut = champs.get("cabinet") ?? "";
  const codeInvitationBrut = (champs.get("code_invitation") ?? "").trim();

  const valeursSaisies = {
    nom: nomBrut.slice(0, 120),
    numeroMembre: numeroBrut.slice(0, 16),
    section: sectionBrute,
    courriel: courrielBrut.slice(0, 254),
    cabinet: cabinetBrut.slice(0, 160),
    codeInvitation: codeInvitationBrut.slice(0, 64),
  };

  const nom = nettoyerLigneTexte(nomBrut, 2, 120);
  const numeroMembre = normaliserNumeroMembre(numeroBrut);
  const section = validerSectionBarreau(sectionBrute);
  const courriel = normaliserCourriel(courrielBrut);
  const cabinet = cabinetBrut.trim().length > 0 ? nettoyerLigneTexte(cabinetBrut, 1, 160) : null;
  const clefCanlii = normaliserValiderFormatCanlii(champs.get("clef_canlii"));
  const attestationOk = champs.get("attestation_acceptee") === "oui";
  const cguOk = champs.get("cgu_acceptees") === "oui";

  if (!nom || !/\p{L}/u.test(nom)) {
    return rendrePageFormulaireDemande({
      mode,
      statut: 400,
      erreur: "Veuillez indiquer votre nom complet (2 à 120 caractères).",
      valeurs: valeursSaisies,
    });
  }
  if (!numeroMembre) {
    return rendrePageFormulaireDemande({
      mode,
      statut: 400,
      erreur: "Format de numéro de membre du Barreau du Québec invalide.",
      valeurs: valeursSaisies,
    });
  }
  if (!section) {
    return rendrePageFormulaireDemande({
      mode,
      statut: 400,
      erreur: "Veuillez sélectionner une section régionale officielle du Barreau du Québec.",
      valeurs: valeursSaisies,
    });
  }
  if (!courriel) {
    return rendrePageFormulaireDemande({
      mode,
      statut: 400,
      erreur: "Adresse courriel professionnelle invalide.",
      valeurs: valeursSaisies,
    });
  }
  if (cabinetBrut.trim().length > 0 && cabinet === null) {
    return rendrePageFormulaireDemande({
      mode,
      statut: 400,
      erreur:
        "Le nom du cabinet est invalide ou dépasse la longueur maximale autorisée (160 caractères).",
      valeurs: valeursSaisies,
    });
  }
  if (!clefCanlii) {
    return rendrePageFormulaireDemande({
      mode,
      statut: 400,
      erreur: "Veuillez fournir une clé REST API CanLII valide.",
      valeurs: valeursSaisies,
    });
  }
  if (!attestationOk || !cguOk) {
    return rendrePageFormulaireDemande({
      mode,
      statut: 400,
      erreur:
        "L'acceptation de l'attestation solennelle et des conditions d'utilisation est requise.",
      valeurs: valeursSaisies,
    });
  }

  const maintenant = contexte.maintenant();
  const maintenantMs = maintenant.getTime();
  const maintenantIso = horodatageIsoUtc(maintenant);

  let invitationId: string | null = null;
  if (mode === "invitation") {
    if (!estJetonFrappe(codeInvitationBrut)) {
      return rendrePageFormulaireDemande({
        mode,
        statut: 400,
        erreur: "Code d'invitation absent ou invalide.",
        valeurs: valeursSaisies,
      });
    }
    const empreinteInvitation = await empreinte(codeInvitationBrut);
    const inv = await contexte.env.DB_IDENTITE.prepare(
      `SELECT id, courriel_cible, expire_le, consomme_le, titulaire_id
       FROM invitation_acces
       WHERE empreinte_code = ?1
       LIMIT 1`,
    )
      .bind(empreinteInvitation)
      .first<LigneInvitationD1>();

    const expMs = inv ? horodatageUtcMs(inv.expire_le) : null;
    const courrielCompatible =
      !inv?.courriel_cible || inv.courriel_cible.trim().toLowerCase() === courriel;
    if (
      !inv ||
      inv.consomme_le !== null ||
      inv.titulaire_id !== null ||
      expMs === null ||
      expMs <= maintenantMs ||
      !courrielCompatible
    ) {
      return rendrePageFormulaireDemande({
        mode,
        statut: 400,
        erreur: "Code d'invitation invalide, expiré ou réservé à une autre adresse.",
        valeurs: valeursSaisies,
      });
    }
    invitationId = inv.id;
  }

  // Épreuve en direct de la clé API CanLII avant toute écriture en base.
  const epreuve = await eprouverClefCanliiEnDirect(clefCanlii, {
    baseUrl: contexte.env.CANLII_BASE_URL,
    fetchImpl: contexte.fetchExterne,
  });
  if (!epreuve.ok) {
    return rendrePageFormulaireDemande({
      mode,
      statut: 400,
      erreur: epreuve.messagePublic,
      valeurs: valeursSaisies,
    });
  }

  // Vérification sans oracle d'énumération : si le courriel ou le numéro de membre appartient déjà
  // à un titulaire confirmé, on répond exactement la même page neutre HTTP 200.
  const existant = await contexte.env.DB_IDENTITE.prepare(
    `SELECT id, courriel, etat
     FROM titulaire
     WHERE courriel = ?1 OR numero_membre = ?2
     ORDER BY CASE WHEN courriel = ?1 THEN 0 ELSE 1 END
     LIMIT 1`,
  )
    .bind(courriel, numeroMembre)
    .first<{ id: string; courriel: string; etat: string }>();

  if (existant) {
    if (existant.courriel === courriel) {
      await envoyerCourrielRappelCompteExistant(contexte.env, {
        destinataire: courriel,
        etat: existant.etat,
        originePortail: contexte.originePortail,
      });
    }
    return rendrePageFormulaireDemande({
      mode,
      messageSuccesNeutre: true,
    });
  }

  const demandeId = creerIdentifiant("tit");
  const jetonConfirmation = frapperJeton();
  const empreinteJeton = await empreinte(jetonConfirmation);
  const expireLeIso = horodatageIsoUtc(
    new Date(maintenantMs + DUREE_DEMANDE_ACCES_MINUTES * 60_000),
  );

  const scelle = await scellerClefCanliiPourTitulaire(contexte.env, demandeId, clefCanlii);
  if (!scelle) {
    return rendrePageFormulaireDemande({
      mode,
      statut: 503,
      erreur: "Configuration du coffre indisponible.",
    });
  }

  await contexte.env.DB_IDENTITE.prepare(
    `INSERT INTO demande_acces (
      id, empreinte_jeton, invitation_id, nom, numero_membre, section, courriel, cabinet,
      attestation_le, attestation_ver, cgu_ver,
      coffre_version, coffre_iv, coffre_chiffre, coffre_repere, coffre_empreinte,
      cree_le, expire_le, consomme_le
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
      ?9, ?10, ?11,
      ?12, ?13, ?14, ?15, ?16,
      ?17, ?18, NULL
    )`,
  )
    .bind(
      demandeId,
      empreinteJeton,
      invitationId,
      nom,
      numeroMembre,
      section,
      courriel,
      cabinet,
      maintenantIso,
      VERSION_ATTESTATION,
      VERSION_CGU,
      scelle.version,
      scelle.iv,
      scelle.chiffre,
      scelle.repere,
      scelle.empreinteClef,
      maintenantIso,
      expireLeIso,
    )
    .run();

  const urlConfirmation = `${contexte.originePortail}/demande/confirmer?jeton=${encodeURIComponent(jetonConfirmation)}`;
  await envoyerCourrielConfirmationDemande(contexte.env, {
    destinataire: courriel,
    nom,
    urlConfirmation,
    dureeMinutes: DUREE_DEMANDE_ACCES_MINUTES,
  });

  return rendrePageFormulaireDemande({
    mode,
    messageSuccesNeutre: true,
  });
}

function rendrePageConfirmationDemande(params: {
  statut: number;
  method?: string;
  jetonValide?: string;
  nomDemandeur?: string;
  courrielDemandeur?: string;
  succes?: boolean;
  erreur?: string;
}): Response {
  let bloc: string;
  if (params.succes) {
    bloc = `<div class="ok">
<h2>Adresse courriel confirmée et clé CanLII scellée</h2>
<p>Votre demande est maintenant enregistrée en file d'admission (état <code>en_attente</code>).</p>
<p>L'exploitant procédera à la vérification manuelle de votre inscription active au <em>Bottin des avocats</em> du Barreau du Québec. Vous recevrez un courriel dès l'activation de votre compte pour émettre votre premier jeton dans <a href="/moi"><code>/moi</code></a>.</p>
</div>`;
  } else if (params.jetonValide) {
    bloc = `${params.erreur ? `<div class="err"><p>${esc(params.erreur)}</p></div>` : ""}
<div class="carte">
<h2>Confirmer votre demande d'accès</h2>
<p>Demandeur : <strong>Me ${esc(params.nomDemandeur ?? "")}</strong> (<code>${esc(params.courrielDemandeur ?? "")}</code>)</p>
<p class="m">Cette étape protège votre lien contre l'ouverture anticipée par les filtres antispam de messagerie.</p>
<form method="POST" action="/demande/confirmer">
<input type="hidden" name="jeton" value="${esc(params.jetonValide)}">
<p><button type="submit" class="btn">Confirmer mon courriel et soumettre ma demande</button></p>
</form>
</div>`;
  } else {
    bloc = `<div class="err">
<h2>Confirmation impossible</h2>
<p>${esc(params.erreur ?? "Ce lien de confirmation est invalide, expiré ou a déjà été utilisé.")}</p>
<p><a href="/demande">Déposer une nouvelle demande</a></p>
</div>`;
  }

  return repondrePageHtml({
    titrePage: "Confirmation de demande — MCP Accès",
    descriptionMeta: "Confirmation d'adresse courriel et scellement de clé API CanLII.",
    corpsHtml: `<header><div class="bar"><h1>Confirmation de demande</h1>${boutonsEntete(false)}</div><p class="m"><a href="/">← Accueil</a></p></header>${bloc}`,
    statut: params.statut,
    method: params.method,
    formAction: "'self'",
  });
}

export async function gererRouteConfirmationDemande(
  request: Request,
  url: URL,
  contexte: ContextePortail,
): Promise<Response> {
  const maintenant = contexte.maintenant();
  const maintenantMs = maintenant.getTime();
  const maintenantIso = horodatageIsoUtc(maintenant);

  if (request.method === "GET" || request.method === "HEAD") {
    const jeton = (url.searchParams.get("jeton") ?? "").trim();
    if (!estJetonFrappe(jeton)) {
      return rendrePageConfirmationDemande({
        statut: 400,
        method: request.method,
      });
    }
    const empreinteJeton = await empreinte(jeton);
    const demande = await contexte.env.DB_IDENTITE.prepare(
      `SELECT nom, courriel, expire_le, consomme_le
       FROM demande_acces
       WHERE empreinte_jeton = ?1
       LIMIT 1`,
    )
      .bind(empreinteJeton)
      .first<{ nom: string; courriel: string; expire_le: string; consomme_le: string | null }>();

    const expMs = demande ? horodatageUtcMs(demande.expire_le) : null;
    if (!demande || demande.consomme_le !== null || expMs === null || expMs <= maintenantMs) {
      return rendrePageConfirmationDemande({
        statut: 400,
        method: request.method,
      });
    }

    return rendrePageConfirmationDemande({
      statut: 200,
      method: request.method,
      jetonValide: jeton,
      nomDemandeur: demande.nom,
      courrielDemandeur: demande.courriel,
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

  const maitres = construireAnneauMaitres(contexte.env);
  if (!estCoffreConfigure(contexte.env)) {
    return rendrePageConfirmationDemande({
      statut: 503,
      erreur: "Configuration du coffre indisponible (fermé par défaut).",
    });
  }

  const lecture = await lireFormulaireBorne(request);
  if (!lecture.ok) {
    return rendrePageConfirmationDemande({
      statut: lecture.statut,
      erreur: lecture.message,
    });
  }

  const jeton = (lecture.champs.get("jeton") ?? "").trim();
  if (!estJetonFrappe(jeton)) {
    return rendrePageConfirmationDemande({ statut: 400 });
  }

  const empreinteJeton = await empreinte(jeton);
  const demande = await contexte.env.DB_IDENTITE.prepare(
    `SELECT
      id, invitation_id, nom, numero_membre, section, courriel, cabinet,
      attestation_le, attestation_ver, cgu_ver,
      coffre_version, coffre_iv, coffre_chiffre, coffre_repere, coffre_empreinte,
      expire_le, consomme_le
     FROM demande_acces
     WHERE empreinte_jeton = ?1
     LIMIT 1`,
  )
    .bind(empreinteJeton)
    .first<LigneDemandeAccesD1>();

  const expMs = demande ? horodatageUtcMs(demande.expire_le) : null;
  if (
    !demande ||
    demande.consomme_le !== null ||
    expMs === null ||
    expMs <= maintenantMs ||
    demande.coffre_version === null ||
    demande.coffre_iv === null ||
    demande.coffre_chiffre === null ||
    demande.coffre_repere === null ||
    demande.coffre_empreinte === null
  ) {
    return rendrePageConfirmationDemande({ statut: 400 });
  }

  if (demande.invitation_id !== null) {
    const inv = await contexte.env.DB_IDENTITE.prepare(
      `SELECT id, courriel_cible, expire_le, consomme_le, titulaire_id
       FROM invitation_acces
       WHERE id = ?1
       LIMIT 1`,
    )
      .bind(demande.invitation_id)
      .first<LigneInvitationD1>();
    const expInvMs = inv ? horodatageUtcMs(inv.expire_le) : null;
    if (
      !inv ||
      inv.consomme_le !== null ||
      inv.titulaire_id !== null ||
      expInvMs === null ||
      expInvMs <= maintenantMs
    ) {
      return rendrePageConfirmationDemande({
        statut: 400,
        erreur: "Le code d'invitation associé à cette demande a expiré ou a déjà été utilisé.",
      });
    }
  }

  // Contre-épreuve en direct de la clé scellée via `ouvrirCoffre` (G8, G10).
  const epreuve = await eprouverEntreeScelleeCanlii(
    demande.id,
    {
      titulaireId: demande.id,
      version: demande.coffre_version,
      iv: demande.coffre_iv,
      chiffre: demande.coffre_chiffre,
      repere: demande.coffre_repere,
      empreinteClef: demande.coffre_empreinte,
      etat: "valide",
    },
    maitres,
    {
      baseUrl: contexte.env.CANLII_BASE_URL,
      fetchImpl: contexte.fetchExterne,
    },
  );

  if (!epreuve.ok) {
    if (epreuve.categorie === "indisponible") {
      return rendrePageConfirmationDemande({
        statut: 503,
        jetonValide: jeton,
        nomDemandeur: demande.nom,
        courrielDemandeur: demande.courriel,
        erreur: epreuve.messagePublic,
      });
    }
    return rendrePageConfirmationDemande({
      statut: 400,
      erreur: epreuve.messagePublic,
    });
  }

  // Consommation atomique du sas avant insertion dans `titulaire`.
  const conso = await contexte.env.DB_IDENTITE.prepare(
    `UPDATE demande_acces
     SET consomme_le = ?2
     WHERE id = ?1 AND consomme_le IS NULL AND expire_le > ?2`,
  )
    .bind(demande.id, maintenantIso)
    .run();

  if ((conso.meta?.changes ?? 0) !== 1) {
    return rendrePageConfirmationDemande({ statut: 400 });
  }

  try {
    const instructions: D1PreparedStatement[] = [
      contexte.env.DB_IDENTITE.prepare(
        `INSERT INTO titulaire (
          id, cree_le, etat, nom, numero_membre, section, courriel, cabinet,
          courriel_verifie_le, attestation_le, attestation_ver, cgu_ver, hybride_permis, note_admission
        ) VALUES (?1, ?2, 'en_attente', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, NULL)`,
      ).bind(
        demande.id,
        maintenantIso,
        demande.nom,
        demande.numero_membre,
        demande.section,
        demande.courriel,
        demande.cabinet,
        maintenantIso,
        demande.attestation_le,
        demande.attestation_ver,
        demande.cgu_ver,
      ),
      contexte.env.DB_IDENTITE.prepare(
        `INSERT INTO coffre_clef (
          titulaire_id, usage, version, iv, chiffre, repere, empreinte_clef, pose_le, eprouve_le, etat
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 'valide')`,
      ).bind(
        demande.id,
        USAGE_COFFRE_CANLII,
        demande.coffre_version,
        demande.coffre_iv,
        demande.coffre_chiffre,
        demande.coffre_repere,
        demande.coffre_empreinte,
        maintenantIso,
      ),
    ];

    if (demande.invitation_id !== null) {
      instructions.push(
        contexte.env.DB_IDENTITE.prepare(
          `UPDATE invitation_acces
           SET consomme_le = ?2, titulaire_id = ?3
           WHERE id = ?1 AND consomme_le IS NULL AND titulaire_id IS NULL AND expire_le > ?2`,
        ).bind(demande.invitation_id, maintenantIso, demande.id),
      );
    }

    const resultats = await contexte.env.DB_IDENTITE.batch(instructions);
    if (demande.invitation_id !== null && (resultats[2]?.meta?.changes ?? 0) !== 1) {
      await contexte.env.DB_IDENTITE.batch([
        contexte.env.DB_IDENTITE.prepare(`DELETE FROM coffre_clef WHERE titulaire_id = ?1`).bind(
          demande.id,
        ),
        contexte.env.DB_IDENTITE.prepare(`DELETE FROM titulaire WHERE id = ?1`).bind(demande.id),
      ]);
      return rendrePageConfirmationDemande({
        statut: 400,
        erreur: "Ce code d'invitation vient d'être consommé ou d'expirer.",
      });
    }
  } catch {
    return rendrePageConfirmationDemande({
      statut: 409,
      erreur:
        "Un dossier actif ou en attente est déjà associé à ce numéro du Barreau ou à cette adresse courriel.",
    });
  }

  try {
    await envoyerCourrielAlerteNouvelleDemande(contexte.env, {
      nom: demande.nom,
      numeroMembre: demande.numero_membre,
      section: demande.section,
      courriel: demande.courriel,
      cabinet: demande.cabinet,
      originePortail: contexte.originePortail,
    });
  } catch {
    // Notification à l'exploitant strictement non bloquante : la demande confirmée demeure en base.
  }

  return rendrePageConfirmationDemande({
    statut: 200,
    succes: true,
  });
}
