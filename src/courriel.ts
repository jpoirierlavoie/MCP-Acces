import {
  COURRIEL_CONTACT_RESPONSABLE,
  DELAI_RETABLISSEMENT_JOURS_OUVRABLES,
  EXPEDITEUR_PAR_DEFAUT,
  type MotifGouverne,
} from "./constantes";
import { esc } from "./html/gabarit";
import { nettoyerLigneTexte, normaliserCourriel } from "./securite";
import type { Env } from "./types";

const NOM_EXPEDITEUR = "Accès MCP — Droit civil québécois";

function envelopperHtmlCourriel(titre: string, paragraphesHtml: readonly string[]): string {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>${esc(titre)}</title></head>
<body style="margin:0;padding:24px;background:#fdfcfa;color:#111;font:16px/1.6 Georgia,'Times New Roman',serif">
<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e0da;border-radius:6px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px;color:#111">${esc(titre)}</h1>
${paragraphesHtml.join("\n")}
<hr style="border:0;border-top:1px solid #e2e0da;margin:24px 0 12px">
<p style="font-size:13px;color:#666;margin:0">Jason Poirier Lavoie, avocat (Québec) · Portail d'accès MCP (${esc(COURRIEL_CONTACT_RESPONSABLE)})</p>
</div>
</body>
</html>`;
}

async function envoyerCourrielTransactionnel(
  env: Env,
  params: {
    destinataire: string;
    sujet: string;
    texte: string;
    paragraphesHtml: readonly string[];
  },
): Promise<boolean> {
  if (!env.COURRIEL) {
    return false;
  }
  const expediteur = normaliserCourriel(env.EXPEDITEUR_COURRIEL) ?? EXPEDITEUR_PAR_DEFAUT;
  const sujetPropre = nettoyerLigneTexte(params.sujet, 1, 998);
  if (!sujetPropre) {
    return false;
  }
  try {
    await env.COURRIEL.send({
      from: { name: NOM_EXPEDITEUR, email: expediteur },
      to: params.destinataire,
      replyTo: COURRIEL_CONTACT_RESPONSABLE,
      subject: sujetPropre,
      text: params.texte,
      html: envelopperHtmlCourriel(sujetPropre, params.paragraphesHtml),
    });
    return true;
  } catch {
    return false;
  }
}

export async function envoyerCourrielConfirmationDemande(
  env: Env,
  params: {
    destinataire: string;
    nom: string;
    urlConfirmation: string;
    dureeMinutes: number;
  },
): Promise<boolean> {
  const sujet = "Confirmation de votre demande d'accès — Connecteurs MCP";
  const texte = [
    `Bonjour Me ${params.nom},`,
    "",
    "Une demande d'accès aux connecteurs MCP (lois, juris et outils) a été déposée avec cette adresse courriel.",
    `Pour confirmer votre adresse courriel et soumettre votre demande à la vérification au Bottin des avocats (lien valable ${params.dureeMinutes} minutes) :`,
    params.urlConfirmation,
    "",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message : aucune inscription ne sera créée.",
  ].join("\n");

  const paragraphesHtml = [
    `<p>Bonjour Me ${esc(params.nom)},</p>`,
    `<p>Une demande d'accès aux connecteurs MCP (<code>lois</code>, <code>juris</code> et <code>outils</code>) a été déposée avec cette adresse courriel.</p>`,
    `<p><a href="${esc(params.urlConfirmation)}" style="color:#7a2e1d;font-weight:700">Confirmer mon adresse courriel</a> (lien à usage unique valable ${params.dureeMinutes}&nbsp;minutes).</p>`,
    `<p style="font-size:13px;color:#666">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message : aucune inscription ne sera créée.</p>`,
  ];

  return await envoyerCourrielTransactionnel(env, {
    destinataire: params.destinataire,
    sujet,
    texte,
    paragraphesHtml,
  });
}

export async function envoyerCourrielAlerteNouvelleDemande(
  env: Env,
  params: {
    nom: string;
    numeroMembre: string;
    section: string;
    courriel: string;
    cabinet?: string | null;
    originePortail: string;
  },
): Promise<boolean> {
  const urlExploitant = `${params.originePortail}/exploitant`;
  const sujet = `Demande d'accès confirmée en attente — Me ${params.nom} (Barreau ${params.numeroMembre})`;

  const lignesFiche = [
    `- Nom : Me ${params.nom}`,
    `- Numéro du Barreau : ${params.numeroMembre}`,
    `- Section : ${params.section}`,
    `- Courriel vérifié : ${params.courriel}`,
    ...(params.cabinet ? [`- Cabinet : ${params.cabinet}`] : []),
  ];

  const texte = [
    "Une demande d'accès confirmée (adresse courriel vérifiée) est en attente de vérification manuelle au Bottin des avocats :",
    "",
    ...lignesFiche,
    "",
    `Statuer dans la console d'exploitation : ${urlExploitant}`,
  ].join("\n");

  const itemsHtml = [
    `<li><strong>Nom :</strong> Me ${esc(params.nom)}</li>`,
    `<li><strong>Numéro du Barreau :</strong> <code>${esc(params.numeroMembre)}</code></li>`,
    `<li><strong>Section :</strong> ${esc(params.section)}</li>`,
    `<li><strong>Courriel vérifié :</strong> <code>${esc(params.courriel)}</code></li>`,
    ...(params.cabinet ? [`<li><strong>Cabinet :</strong> ${esc(params.cabinet)}</li>`] : []),
  ].join("\n");

  const paragraphesHtml = [
    `<p>Une demande d'accès confirmée (adresse courriel vérifiée) est en attente de vérification manuelle au <em>Bottin des avocats</em> :</p>`,
    `<ul>\n${itemsHtml}\n</ul>`,
    `<p><a href="${esc(urlExploitant)}" style="color:#7a2e1d;font-weight:700">Ouvrir la console d'exploitation (/exploitant)</a></p>`,
  ];

  return await envoyerCourrielTransactionnel(env, {
    destinataire: COURRIEL_CONTACT_RESPONSABLE,
    sujet,
    texte,
    paragraphesHtml,
  });
}

export async function envoyerCourrielRappelCompteExistant(
  env: Env,
  params: {
    destinataire: string;
    etat: string;
    originePortail: string;
  },
): Promise<boolean> {
  const urlMoi = `${params.originePortail}/moi`;
  const sujet = "Votre dossier d'accès MCP existe déjà";
  const detail =
    params.etat === "en_attente"
      ? `Votre demande est déjà confirmée et en attente de vérification manuelle au Bottin des avocats. Vous pouvez néanmoins consulter l'état de votre dossier ou exercer vos droits Loi 25 dans votre console libre-service : ${urlMoi}`
      : `Un compte (état : ${params.etat}) est déjà rattaché à cette adresse. Vous pouvez accéder à votre console libre-service : ${urlMoi}`;

  const texte = ["Bonjour,", "", detail].join("\n");
  const paragraphesHtml = [
    `<p>Bonjour,</p>`,
    `<p>${esc(detail)}</p>`,
    `<p><a href="${esc(urlMoi)}" style="color:#7a2e1d">${esc(urlMoi)}</a></p>`,
  ];

  return await envoyerCourrielTransactionnel(env, {
    destinataire: params.destinataire,
    sujet,
    texte,
    paragraphesHtml,
  });
}

export async function envoyerCourrielLienMagiqueMoi(
  env: Env,
  params: {
    destinataire: string;
    nom: string;
    urlConnexion: string;
    dureeMinutes: number;
  },
): Promise<boolean> {
  const sujet = "Lien de connexion à votre console /moi — Accès MCP";
  const texte = [
    `Bonjour Me ${params.nom},`,
    "",
    `Voici votre lien de connexion à usage unique vers votre console /moi (valable ${params.dureeMinutes} minutes) :`,
    params.urlConnexion,
    "",
    "Ne transférez jamais ce courriel.",
  ].join("\n");

  const paragraphesHtml = [
    `<p>Bonjour Me ${esc(params.nom)},</p>`,
    `<p><a href="${esc(params.urlConnexion)}" style="color:#7a2e1d;font-weight:700">Ouvrir ma session /moi</a> (lien à usage unique valable ${params.dureeMinutes}&nbsp;minutes).</p>`,
    `<p style="font-size:13px;color:#666">Ne transférez jamais ce courriel.</p>`,
  ];

  return await envoyerCourrielTransactionnel(env, {
    destinataire: params.destinataire,
    sujet,
    texte,
    paragraphesHtml,
  });
}

export async function envoyerCourrielDecisionGouverne(
  env: Env,
  params: {
    destinataire: string;
    nom: string;
    vers: string;
    motif: MotifGouverne;
    originePortail: string;
  },
): Promise<boolean> {
  const urlMoi = `${params.originePortail}/moi`;
  const urlCgu = `${params.originePortail}/cgu`;

  if (
    params.vers === "actif" &&
    (params.motif === "admission" || params.motif === "retablissement")
  ) {
    const sujet =
      params.motif === "admission"
        ? "Accès approuvé — Connecteurs MCP (lois, juris et outils)"
        : "Compte rétabli — Connecteurs MCP (lois, juris et outils)";
    const texte = [
      `Bonjour Me ${params.nom},`,
      "",
      params.motif === "admission"
        ? "Votre inscription au Tableau de l'Ordre a été vérifiée et votre accès aux connecteurs MCP est maintenant actif."
        : "Votre accès aux connecteurs MCP a été rétabli à l'état actif.",
      `Ouvrez votre console libre-service pour émettre votre jeton ou autoriser vos clients OAuth 2.1 : ${urlMoi}`,
    ].join("\n");
    const paragraphesHtml = [
      `<p>Bonjour Me ${esc(params.nom)},</p>`,
      `<p>${esc(
        params.motif === "admission"
          ? "Votre inscription au Tableau de l'Ordre a été vérifiée et votre accès aux connecteurs MCP est maintenant actif."
          : "Votre accès aux connecteurs MCP a été rétabli à l'état actif.",
      )}</p>`,
      `<p><a href="${esc(urlMoi)}" style="color:#7a2e1d;font-weight:700">Accéder à la console /moi</a></p>`,
    ];
    return await envoyerCourrielTransactionnel(env, {
      destinataire: params.destinataire,
      sujet,
      texte,
      paragraphesHtml,
    });
  }

  const sujet = `Mise à jour de l'état de votre compte MCP (${params.vers})`;
  const texte = [
    `Bonjour Me ${params.nom},`,
    "",
    `L'état de votre compte sur ${params.originePortail} est passé à « ${params.vers} » (motif enregistré : ${params.motif}).`,
    `Conformément aux conditions d'utilisation (${urlCgu}), vous disposez d'une voie écrite de rétablissement en écrivant à ${COURRIEL_CONTACT_RESPONSABLE} (réponse motivée sous ${DELAI_RETABLISSEMENT_JOURS_OUVRABLES} jours ouvrables).`,
  ].join("\n");
  const paragraphesHtml = [
    `<p>Bonjour Me ${esc(params.nom)},</p>`,
    `<p>L'état de votre compte est passé à <strong>${esc(params.vers)}</strong> (motif enregistré : <code>${esc(params.motif)}</code>).</p>`,
    `<p>Conformément aux <a href="${esc(urlCgu)}" style="color:#7a2e1d">conditions d'utilisation</a>, toute demande écrite d'explication ou de rétablissement adressée à <a href="mailto:${esc(COURRIEL_CONTACT_RESPONSABLE)}" style="color:#7a2e1d">${esc(COURRIEL_CONTACT_RESPONSABLE)}</a> reçoit une réponse sous ${DELAI_RETABLISSEMENT_JOURS_OUVRABLES}&nbsp;jours ouvrables.</p>`,
  ];
  return await envoyerCourrielTransactionnel(env, {
    destinataire: params.destinataire,
    sujet,
    texte,
    paragraphesHtml,
  });
}
