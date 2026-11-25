import {
  calculerDefiPkceS256,
  creerDepotJetonsD1,
  ecrireEvenementTechniqueD1,
  formaterEvenementTechnique,
  frapperJeton,
  horodatageIsoUtc,
  incrementerCompteurJourD1,
  jourUtc,
  ouvrirCoffre,
  resoudreJeton,
  scellerCoffre,
} from "@poirierlavoie/mcp-socle";
import { beforeEach, describe, expect, it } from "vitest";
import { COURRIEL_EVALUATION_PAR_DEFAUT, ID_TITULAIRE_EVALUATION } from "../src/constantes";
import { validerCheminRetourInterne } from "../src/securite";
import {
  CLEF_CANLII_VALIDE_TEST,
  creerAppTest,
  creerBoiteCourriel,
  creerEnvTest,
  creerExecutionContextTest,
  creerFetchSimule,
  creerLimiteurFenetre,
  extraireCsrfHtml,
  extraireEnteteCookiePair,
  extraireJetonConsentementHtml,
  reinitialiserBaseIdentite,
  SECRET_CONSOLE_TEST,
  SECRET_EVALUATION_TEST,
  SECRET_MAITRE_TEST,
} from "./helpers";

const CLEF_ROTATION_TEST = "canlii_nouvelle_clef_rotation_valide_2026_xyz";

async function insererTitulaireActif(db: D1Database, titulaireId = "tit_actif_1"): Promise<void> {
  const maintenantIso = horodatageIsoUtc();
  const scelle = await scellerCoffre(CLEF_CANLII_VALIDE_TEST, {
    titulaireId,
    usage: "canlii",
    version: 1,
    maitre: SECRET_MAITRE_TEST,
  });

  await db.batch([
    db
      .prepare(
        `INSERT INTO titulaire (
          id, cree_le, etat, nom, numero_membre, section, courriel, cabinet,
          courriel_verifie_le, attestation_le, attestation_ver, cgu_ver, hybride_permis, note_admission
        ) VALUES (?1, ?2, 'actif', 'Jean Gagnon', '1999123', 'Québec', 'jgagnon@cabinet.qc.ca', 'Gagnon Avocats', ?2, ?2, '2026-11-18', '2026-11-18', 1, 'Vérifié au Bottin')`,
      )
      .bind(titulaireId, maintenantIso),
    db
      .prepare(
        `INSERT INTO coffre_clef (
          titulaire_id, usage, version, iv, chiffre, repere, empreinte_clef, pose_le, eprouve_le, etat
        ) VALUES (?1, 'canlii', ?2, ?3, ?4, ?5, ?6, ?7, ?7, 'valide')`,
      )
      .bind(
        titulaireId,
        scelle.version,
        scelle.iv,
        scelle.chiffre,
        scelle.repere,
        scelle.empreinteClef,
        maintenantIso,
      ),
  ]);
}

describe("/moi — Lien magique, CSRF, jetons, configurations Deep Research, coffre et Loi 25", () => {
  beforeEach(async () => {
    await reinitialiserBaseIdentite();
  });

  it("authentifie par lien magique (immunisé GET SafeLinks), protège par CSRF, gère jetons, clé CanLII, hybride_permis, quotas et Loi 25", async () => {
    const db = await reinitialiserBaseIdentite();
    await insererTitulaireActif(db, "tit_moi_1");

    // Pré-remplir des compteurs et un événement technique pour éprouver l'affichage et l'export Loi 25
    await incrementerCompteurJourD1(db, {
      titulaireId: "tit_moi_1",
      jour: jourUtc(),
      classe: "local",
    });
    await incrementerCompteurJourD1(db, {
      titulaireId: "tit_moi_1",
      jour: jourUtc(),
      classe: "sortant",
      sortants: 2,
    });
    await ecrireEvenementTechniqueD1(
      db,
      formaterEvenementTechnique({
        titulaireId: "tit_moi_1",
        jetonId: "jtn_init",
        service: "jurisprudence",
        outil: "verify_citations",
        classe: "sortant",
        issue: "ok",
        ms: 120,
        sortants: 2,
      }),
    );

    const boite = creerBoiteCourriel();
    const envTest = creerEnvTest({ COURRIEL: boite });
    const app = creerAppTest({
      fetchExterne: creerFetchSimule({
        clefsCanliiValides: [CLEF_CANLII_VALIDE_TEST, CLEF_ROTATION_TEST],
      }),
    });

    // 1. Demande de lien magique sur courriel inconnu -> même réponse neutre 200, aucun courriel envoyé
    const resInconnu = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          action: "demander_lien",
          courriel: "inconnu@exemple.ca",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resInconnu.status).toBe(200);
    expect(boite.messages.length).toBe(0);

    // 2. Demande de lien magique sur le titulaire actif
    const resLien = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          action: "demander_lien",
          courriel: "jgagnon@cabinet.qc.ca",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resLien.status).toBe(200);
    expect(boite.messages.length).toBe(1);

    const mUrl =
      /https:\/\/acces\.poirierlavoie\.ca(\/moi\/connexion\?jeton=[A-Za-z0-9_-]{43})/.exec(
        boite.dernier().text,
      );
    expect(mUrl?.[1]).toBeDefined();
    const jetonMagique = new URL(`https://acces.poirierlavoie.ca${mUrl![1]!}`).searchParams.get(
      "jeton",
    )!;

    // GET ne consomme pas le lien magique
    const resGetLien = await app.fetch(
      new Request(`https://acces.poirierlavoie.ca${mUrl![1]!}`, { method: "GET" }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resGetLien.status).toBe(200);

    // POST consomme le lien et émet le cookie __Host-acces_moi
    const resPostLien = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ jeton: jetonMagique }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resPostLien.status).toBe(303);
    expect(resPostLien.headers.get("Location")).toBe("/moi");
    const setCookieBrut = resPostLien.headers.get("Set-Cookie") ?? "";
    expect(setCookieBrut).toContain("__Host-acces_moi=");
    expect(setCookieBrut).toContain("HttpOnly");
    expect(setCookieBrut).toContain("Secure");
    expect(setCookieBrut).toContain("SameSite=Lax");
    const cookieSession = extraireEnteteCookiePair(resPostLien);

    // Rejeu du lien magique refusé
    const resRejeuLien = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ jeton: jetonMagique }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRejeuLien.status).toBe(400);

    // 3. Ouverture du tableau de bord /moi : extraits clients + préambule SAFETY-KERNEL + quotas
    const resMoi = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        headers: { Cookie: cookieSession },
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resMoi.status).toBe(200);
    const htmlMoi = await resMoi.text();
    expect(htmlMoi).toContain(".mcp.json");
    expect(htmlMoi).toContain("mcp_config.json");
    expect(htmlMoi).toContain("gemini-extension.json");
    expect(htmlMoi).toContain("/mcp/oauth");
    expect(htmlMoi).toContain("deep-research-preview-04-2026");
    expect(htmlMoi).toContain("[RATIO / PAR. X À INSÉRER APRÈS LECTURE DE");
    expect(htmlMoi).not.toContain(CLEF_CANLII_VALIDE_TEST);
    const csrf = extraireCsrfHtml(htmlMoi);

    // 4. Tentative POST sans CSRF valide -> 403
    const resSansCsrf = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieSession,
        },
        body: new URLSearchParams({
          action: "creer_jeton",
          libelle: "Poste pirate",
          portee: "les_deux",
          csrf: "0".repeat(64),
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resSansCsrf.status).toBe(403);

    // 5. Frapper un jeton `legislation` (affiché une seule fois, jamais sur le GET suivant)
    const resCreerJeton = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieSession,
        },
        body: new URLSearchParams({
          csrf,
          action: "creer_jeton",
          libelle: "Poste Claude Code",
          portee: "legislation",
          jours_expiration: "90",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resCreerJeton.status).toBe(200);
    const htmlApresCreation = await resCreerJeton.text();
    const mJetonClair = /<pre><code>([A-Za-z0-9_-]{43})<\/code><\/pre>/.exec(htmlApresCreation);
    expect(mJetonClair?.[1]).toBeDefined();
    const jetonClair = mJetonClair![1]!;

    // Au rechargement GET, le jeton complet a disparu (seule la queue de 6 car. subsiste)
    const htmlRechargement = await (
      await app.fetch(
        new Request("https://acces.poirierlavoie.ca/moi", {
          headers: { Cookie: cookieSession },
        }),
        envTest,
        creerExecutionContextTest(),
      )
    ).text();
    expect(htmlRechargement).not.toContain(jetonClair);
    expect(htmlRechargement).toContain(`…${jetonClair.slice(-6)}`);

    // Le jeton émis résout bien sur `legislation` et est refusé sur `jurisprudence`
    const depot = creerDepotJetonsD1(db);
    expect(
      (await resoudreJeton(depot, [jetonClair], { service: "legislation" }))?.titulaireId,
    ).toBe("tit_moi_1");
    expect(await resoudreJeton(depot, [jetonClair], { service: "jurisprudence" })).toBeNull();

    // 6. Bascule `hybride_permis` (1 -> 0) reflétée dans `resoudreJeton`
    const resHybride = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieSession,
        },
        body: new URLSearchParams({
          csrf,
          action: "basculer_hybride",
          hybride_permis: "0",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resHybride.status).toBe(200);
    expect(
      (await resoudreJeton(depot, [jetonClair], { service: "legislation" }))?.hybridePermis,
    ).toBe(false);

    // 7. Révocation du jeton -> `resoudreJeton` rend immédiatement `null`
    const jetonRow = await db
      .prepare("SELECT id FROM jeton WHERE titulaire_id = 'tit_moi_1' LIMIT 1")
      .first<{ id: string }>();
    const resRevoquer = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieSession,
        },
        body: new URLSearchParams({
          csrf,
          action: "revoquer_jeton",
          jeton_id: jetonRow!.id,
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRevoquer.status).toBe(200);
    expect(await resoudreJeton(depot, [jetonClair], { service: "legislation" })).toBeNull();

    // 8. Épreuve en direct, rotation puis retrait immédiat (`retirerEntreeCoffreD1`, G8) de la clé CanLII
    const resEprouver = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieSession,
        },
        body: new URLSearchParams({ csrf, action: "eprouver_clef" }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resEprouver.status).toBe(200);
    expect(await resEprouver.text()).toContain("Épreuve réussie");

    const resRotation = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieSession,
        },
        body: new URLSearchParams({
          csrf,
          action: "remplacer_clef",
          clef_canlii: CLEF_ROTATION_TEST,
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRotation.status).toBe(200);

    const resRetirer = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieSession,
        },
        body: new URLSearchParams({ csrf, action: "retirer_clef" }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRetirer.status).toBe(200);
    const coffreApresRetrait = await db
      .prepare("SELECT * FROM coffre_clef WHERE titulaire_id = 'tit_moi_1'")
      .first();
    expect(coffreApresRetrait).toBeNull();
    expect(
      await ouvrirCoffre(
        {
          titulaireId: "tit_moi_1",
          usage: "canlii",
          entree: null,
          maitres: { 1: SECRET_MAITRE_TEST },
        },
        (c) => c,
      ),
    ).toEqual({ ok: false, motif: "ABSENTE" });

    // 9. Export Loi 25 en JSON (sans blobs chiffrés ni empreintes secrètes)
    const resExport = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieSession,
        },
        body: new URLSearchParams({ csrf, action: "exporter_loi25" }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resExport.status).toBe(200);
    expect(resExport.headers.get("Content-Disposition")).toContain("export-loi25-mcp-acces.json");
    const jsonExport = (await resExport.json()) as {
      titulaire: { id: string; courriel: string };
      compteurs_journaliers: unknown[];
      evenements_techniques: unknown[];
    };
    expect(jsonExport.titulaire.id).toBe("tit_moi_1");
    expect(jsonExport.compteurs_journaliers.length).toBe(2);
    expect(jsonExport.evenements_techniques.length).toBe(1);

    // 10. Suppression intégrale du compte Loi 25 (`supprimerCompteTitulaireD1`)
    const resSupprSansMot = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieSession,
        },
        body: new URLSearchParams({
          csrf,
          action: "supprimer_compte",
          confirmation: "non",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resSupprSansMot.status).toBe(400);

    const resSupprOk = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieSession,
        },
        body: new URLSearchParams({
          csrf,
          action: "supprimer_compte",
          confirmation: "SUPPRIMER",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resSupprOk.status).toBe(200);

    for (const table of [
      "titulaire",
      "jeton",
      "coffre_clef",
      "session_portail",
      "compteur_jour",
      "evenement_technique",
    ]) {
      const reste = await db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).first<{ n: number }>();
      expect(reste?.n, table).toBe(0);
    }
  });

  it("bloque toute redirection ouverte sur le paramètre retour de /moi", () => {
    for (const malveillant of [
      "https://attaquant.exemple/phish",
      "//attaquant.exemple/phish",
      "/\\attaquant.exemple",
      "/exploitant",
      "/oauth/authorize#fragment",
      "/oauth/authorize",
      "javascript:alert(1)",
    ]) {
      expect(validerCheminRetourInterne(malveillant), malveillant).toBeNull();
    }
    expect(validerCheminRetourInterne("/moi")).toBe("/moi");
    expect(validerCheminRetourInterne("/oauth/authorize?client_id=claude-web")).toBe(
      "/oauth/authorize?client_id=claude-web",
    );
  });

  it("garantit les droits Loi 25 (connexion /moi, export JSON, retrait de clé et suppression) aux comptes en_attente, revoque et refuse sans autoriser la frappe de jeton", async () => {
    const db = await reinitialiserBaseIdentite();
    await insererTitulaireActif(db, "tit_revoque_1");
    await db.prepare("UPDATE titulaire SET etat = 'revoque' WHERE id = 'tit_revoque_1'").run();

    const boite = creerBoiteCourriel();
    const envTest = creerEnvTest({ COURRIEL: boite });
    const app = creerAppTest({ fetchExterne: creerFetchSimule() });

    const resLien = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          action: "demander_lien",
          courriel: "jgagnon@cabinet.qc.ca",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resLien.status).toBe(200);
    const jetonMagique = /jeton=([A-Za-z0-9_-]{43})/.exec(boite.dernier().text)![1]!;

    const resSession = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ jeton: jetonMagique }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resSession.status).toBe(303);
    const cookie = extraireEnteteCookiePair(resSession);

    const htmlMoi = await (
      await app.fetch(
        new Request("https://acces.poirierlavoie.ca/moi", { headers: { Cookie: cookie } }),
        envTest,
        creerExecutionContextTest(),
      )
    ).text();
    const csrf = extraireCsrfHtml(htmlMoi);

    // Frappe de jeton et épreuve sortante CanLII interdites (403) pour un compte `revoque`
    const resFrappeInterdite = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookie,
        },
        body: new URLSearchParams({
          csrf,
          action: "creer_jeton",
          libelle: "Interdit",
          portee: "les_deux",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resFrappeInterdite.status).toBe(403);

    const resEpreuveInterdite = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookie,
        },
        body: new URLSearchParams({ csrf, action: "eprouver_clef" }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resEpreuveInterdite.status).toBe(403);

    // Retrait immédiat de la clé du coffre, export Loi 25 et suppression du compte autorisés !
    const resRetraitOk = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookie,
        },
        body: new URLSearchParams({ csrf, action: "retirer_clef" }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRetraitOk.status).toBe(200);

    const resExportOk = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookie,
        },
        body: new URLSearchParams({ csrf, action: "exporter_loi25" }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resExportOk.status).toBe(200);
    const jsonExport = (await resExportOk.json()) as {
      titulaire: { note_admission: string | null };
    };
    expect(jsonExport.titulaire.note_admission).toBe("Vérifié au Bottin");

    const resSupprOk = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookie,
        },
        body: new URLSearchParams({
          csrf,
          action: "supprimer_compte",
          confirmation: "SUPPRIMER",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resSupprOk.status).toBe(200);
    expect(
      (await db.prepare("SELECT COUNT(*) AS n FROM titulaire").first<{ n: number }>())?.n,
    ).toBe(0);
  });

  it("épingle les extraits .mcp.json, mcp_config.json (Antigravity) et gemini-extension.json sur le schéma strict de verifier.py", async () => {
    const db = await reinitialiserBaseIdentite();
    await insererTitulaireActif(db, "tit_extraits_1");

    const boite = creerBoiteCourriel();
    const envTest = creerEnvTest({ COURRIEL: boite });
    const app = creerAppTest({ fetchExterne: creerFetchSimule() });

    await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          action: "demander_lien",
          courriel: "jgagnon@cabinet.qc.ca",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    const jetonMagique = /jeton=([A-Za-z0-9_-]{43})/.exec(boite.dernier().text)![1]!;
    const resSession = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ jeton: jetonMagique }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    const cookie = extraireEnteteCookiePair(resSession);

    const htmlMoi = await (
      await app.fetch(
        new Request("https://acces.poirierlavoie.ca/moi", { headers: { Cookie: cookie } }),
        envTest,
        creerExecutionContextTest(),
      )
    ).text();

    expect(htmlMoi).not.toContain("serverUrl");

    function decoderHtml(s: string): string {
      return s
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    }

    function extraireBlocJson(resume: string): Record<string, unknown> {
      const motif = new RegExp(
        `<summary>[^<]*<code>${resume.replace(".", "\\.")}</code>[^<]*</summary>\\s*<pre><code>([\\s\\S]*?)</code></pre>`,
      );
      const m = motif.exec(htmlMoi);
      expect(m?.[1], `Extrait ${resume} introuvable`).toBeDefined();
      return JSON.parse(decoderHtml(m![1]!)) as Record<string, unknown>;
    }

    const authLois = "Bearer $" + "{MCP_LEGISLATION_SECRET}";
    const authJuris = "Bearer $" + "{MCP_JURISPRUDENCE_SECRET}";

    // 1. Claude Code / Claude Desktop (.mcp.json — OAuth 2.1 sans configuration)
    const mcpJson = extraireBlocJson(".mcp.json");
    expect(mcpJson).toEqual({
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
    });

    // 2. Google Antigravity (mcp_config.json — OAuth 2.1 sans configuration)
    const agyJson = extraireBlocJson("mcp_config.json") as {
      mcpServers: Record<string, Record<string, unknown>>;
    };
    expect(agyJson).toEqual({
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
    });

    // 3. Gemini CLI (gemini-extension.json — OAuth 2.1 sans configuration)
    const geminiJson = extraireBlocJson("gemini-extension.json") as {
      name: string;
      version: string;
      description: string;
      contextFileName: unknown[];
      settings: unknown[];
      mcpServers: Record<string, Record<string, unknown>>;
    };
    expect(geminiJson.name).toBe("droit-civil-quebecois");
    expect(geminiJson.version).toBe("3.2.0");
    expect(geminiJson.description).toContain("Connecteurs « lois », « juris » et « outils »");
    expect(geminiJson.contextFileName).toEqual([]);
    expect(geminiJson.settings).toEqual([]);
    expect(geminiJson.mcpServers).toEqual({
      lois: {
        httpUrl: "https://legislation.poirierlavoie.ca/mcp/oauth",
      },
      juris: {
        httpUrl: "https://jurisprudence.poirierlavoie.ca/mcp/oauth",
      },
      outils: {
        httpUrl: "https://outils.poirierlavoie.ca/mcp",
      },
    });

    // Mode sans navigateur / CLI / CI (Bearer /mcp) toujours documenté
    expect(htmlMoi).toContain("Mode sans navigateur / CLI / CI");
    expect(htmlMoi).toContain(authLois);
    expect(htmlMoi).toContain(authJuris);

    // Encadré d'accueil /demande lorsque /moi est appelé depuis /oauth/authorize
    const resConnexionOAuth = await app.fetch(
      new Request(
        "https://acces.poirierlavoie.ca/moi?retour=%2Foauth%2Fauthorize%3Fclient_id%3Dclaude-web",
      ),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resConnexionOAuth.status).toBe(200);
    const htmlConnexionOAuth = await resConnexionOAuth.text();
    expect(htmlConnexionOAuth).toContain('href="/demande"');
    expect(htmlConnexionOAuth).toContain("Connexion d'un connecteur OAuth 2.1 en cours");
  });

  it("isole le compte d'évaluation d'annuaire (fermé par défaut, OAuth 2.1 PKCE complet, /moi lecture seule et révocation 1 clic)", async () => {
    const db = await reinitialiserBaseIdentite();
    const boite = creerBoiteCourriel();
    const app = creerAppTest({ fetchExterne: creerFetchSimule() });

    // 1. Fermé par défaut sans EVALUATION_TOKEN valide (absent ou < 32 car.)
    for (const secretOff of [undefined, "", "trop_court"]) {
      const envOff = creerEnvTest({ COURRIEL: boite, EVALUATION_TOKEN: secretOff });
      const htmlSansSecret = await (
        await app.fetch(
          new Request("https://acces.poirierlavoie.ca/moi"),
          envOff,
          creerExecutionContextTest(),
        )
      ).text();
      expect(htmlSansSecret).not.toContain('id="carte-evaluation"');

      const resPostOff = await app.fetch(
        new Request("https://acces.poirierlavoie.ca/moi", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            action: "connexion_evaluation",
            courriel_evaluation: COURRIEL_EVALUATION_PAR_DEFAUT,
            mot_de_passe_evaluation: SECRET_EVALUATION_TEST,
          }).toString(),
        }),
        envOff,
        creerExecutionContextTest(),
      );
      expect(resPostOff.status).toBe(403);
    }

    // 2. Provisionnement du compte via /exploitant avec état 'limite'
    const envEval = creerEnvTest({
      COURRIEL: boite,
      EVALUATION_TOKEN: SECRET_EVALUATION_TEST,
      RL_DEMANDE_IP: creerLimiteurFenetre(10),
    });
    const resProvision = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/exploitant", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SECRET_CONSOLE_TEST}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          action: "provisionner_evaluation",
          courriel_evaluation: COURRIEL_EVALUATION_PAR_DEFAUT,
          etat_initial: "limite",
          clef_canlii: CLEF_CANLII_VALIDE_TEST,
        }).toString(),
      }),
      envEval,
      creerExecutionContextTest(),
    );
    expect(resProvision.status).toBe(200);
    expect(boite.messages).toHaveLength(0);

    // 3. demander_lien sur evaluation@poirierlavoie.ca répond neutre 200 sans envoyer de courriel
    const resMagicNeutre = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          action: "demander_lien",
          courriel: COURRIEL_EVALUATION_PAR_DEFAUT,
        }).toString(),
      }),
      envEval,
      creerExecutionContextTest(),
    );
    expect(resMagicNeutre.status).toBe(200);
    expect(boite.messages).toHaveLength(0);

    // 4. Parcours complet OAuth 2.1 + PKCE S256 pour un évaluateur (claude-web)
    const codeVerifier = `${frapperJeton()}${frapperJeton().slice(0, 10)}`;
    const codeChallenge = await calculerDefiPkceS256(codeVerifier);
    const redirectUri = "https://claude.ai/api/mcp/auth_callback";
    const urlAuthorize =
      "https://acces.poirierlavoie.ca/oauth/authorize?" +
      new URLSearchParams({
        response_type: "code",
        client_id: "claude-web",
        redirect_uri: redirectUri,
        scope: "les_deux",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state: "rev_state_1",
      }).toString();

    const resRedirMoi = await app.fetch(
      new Request(urlAuthorize),
      envEval,
      creerExecutionContextTest(),
    );
    expect(resRedirMoi.status).toBe(303);
    const retourLocation = resRedirMoi.headers.get("Location")!;
    expect(retourLocation).toMatch(/^\/moi\?retour=/);
    const retourDecoded = new URL(
      `https://acces.poirierlavoie.ca${retourLocation}`,
    ).searchParams.get("retour")!;

    const htmlLoginEval = await (
      await app.fetch(
        new Request(`https://acces.poirierlavoie.ca${retourLocation}`),
        envEval,
        creerExecutionContextTest(),
      )
    ).text();
    expect(htmlLoginEval).toContain('id="carte-evaluation"');

    // Mauvais secret / mauvais courriel -> 401
    for (const mauvais of [
      { courriel: COURRIEL_EVALUATION_PAR_DEFAUT, mdp: "mauvais_mot_de_passe_000000000000" },
      { courriel: "autre@exemple.ca", mdp: SECRET_EVALUATION_TEST },
    ]) {
      const resEchec = await app.fetch(
        new Request("https://acces.poirierlavoie.ca/moi", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            action: "connexion_evaluation",
            courriel_evaluation: mauvais.courriel,
            mot_de_passe_evaluation: mauvais.mdp,
            retour: retourDecoded,
          }).toString(),
        }),
        envEval,
        creerExecutionContextTest(),
      );
      expect(resEchec.status).toBe(401);
    }

    // Connexion nominale -> 303 vers /oauth/authorize?... + cookie __Host-acces_moi
    const resLoginEval = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          action: "connexion_evaluation",
          courriel_evaluation: COURRIEL_EVALUATION_PAR_DEFAUT,
          mot_de_passe_evaluation: SECRET_EVALUATION_TEST,
          retour: retourDecoded,
        }).toString(),
      }),
      envEval,
      creerExecutionContextTest(),
    );
    expect(resLoginEval.status).toBe(303);
    expect(resLoginEval.headers.get("Location")).toBe(retourDecoded);
    const cookieEval = extraireEnteteCookiePair(resLoginEval);
    expect(cookieEval).toContain("__Host-acces_moi=");

    // Écran de consentement OAuth 2.1 + échange /oauth/token
    const resConsent = await app.fetch(
      new Request(urlAuthorize, { headers: { Cookie: cookieEval } }),
      envEval,
      creerExecutionContextTest(),
    );
    expect(resConsent.status).toBe(200);
    const htmlConsent = await resConsent.text();
    expect(htmlConsent).toContain("Autoriser l'accès / Allow access");
    const jetonConsent = extraireJetonConsentementHtml(htmlConsent);

    const resApprove = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieEval,
        },
        body: new URLSearchParams({
          jeton_consentement: jetonConsent,
          decision: "autoriser",
          response_type: "code",
          client_id: "claude-web",
          redirect_uri: redirectUri,
          scope: "les_deux",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
          state: "rev_state_1",
        }).toString(),
      }),
      envEval,
      creerExecutionContextTest(),
    );
    expect(resApprove.status).toBe(303);
    const codeAuth = new URL(resApprove.headers.get("Location")!).searchParams.get("code")!;

    const resToken = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://claude.ai",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "claude-web",
          code: codeAuth,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }).toString(),
      }),
      envEval,
      creerExecutionContextTest(),
    );
    expect(resToken.status).toBe(200);
    const tokenPayload = (await resToken.json()) as { access_token: string };
    const depot = creerDepotJetonsD1(db);
    const resolu = await resoudreJeton(depot, [tokenPayload.access_token], {
      service: "jurisprudence",
    });
    expect(resolu).toMatchObject({
      titulaireId: ID_TITULAIRE_EVALUATION,
      etat: "limite",
      portee: "les_deux",
    });

    // 5. /moi en lecture seule : formulaires d'écriture absents et rejetés en 403 si forgés
    const resDash = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", { headers: { Cookie: cookieEval } }),
      envEval,
      creerExecutionContextTest(),
    );
    expect(resDash.status).toBe(200);
    const htmlDash = await resDash.text();
    expect(htmlDash).toContain("Session d'évaluation d'annuaire en lecture seule");
    for (const actionMasquee of [
      "creer_jeton",
      "revoquer_jeton",
      "eprouver_clef",
      "remplacer_clef",
      "retirer_clef",
      "basculer_hybride",
      "exporter_loi25",
      "supprimer_compte",
    ]) {
      expect(htmlDash).not.toContain(`value="${actionMasquee}"`);
    }

    const csrfEval = extraireCsrfHtml(htmlDash);
    const actionsInterdites: Array<Record<string, string>> = [
      { action: "creer_jeton", libelle: "Bypass", portee: "les_deux" },
      { action: "revoquer_jeton", jeton_id: "jtn_x" },
      { action: "eprouver_clef" },
      { action: "remplacer_clef", clef_canlii: CLEF_CANLII_VALIDE_TEST },
      { action: "retirer_clef" },
      { action: "basculer_hybride", hybride_permis: "0" },
      { action: "exporter_loi25" },
      { action: "supprimer_compte", confirmation: "SUPPRIMER" },
    ];
    for (const actionInterdite of actionsInterdites) {
      const res403 = await app.fetch(
        new Request("https://acces.poirierlavoie.ca/moi", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: cookieEval,
          },
          body: new URLSearchParams({ csrf: csrfEval, ...actionInterdite }).toString(),
        }),
        envEval,
        creerExecutionContextTest(),
      );
      expect(res403.status, actionInterdite.action).toBe(403);
    }

    // 6. Limitation de débit RL_DEMANDE_IP sur connexion_evaluation (429 après dépassement)
    const rlStrict = creerLimiteurFenetre(2);
    const envRl = creerEnvTest({
      COURRIEL: boite,
      EVALUATION_TOKEN: SECRET_EVALUATION_TEST,
      RL_DEMANDE_IP: rlStrict,
    });
    for (let i = 0; i < 2; i++) {
      const resTmp = await app.fetch(
        new Request("https://acces.poirierlavoie.ca/moi", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "CF-Connecting-IP": "198.51.100.77",
          },
          body: new URLSearchParams({
            action: "connexion_evaluation",
            courriel_evaluation: COURRIEL_EVALUATION_PAR_DEFAUT,
            mot_de_passe_evaluation: "mauvais_mot_de_passe_000000000000",
          }).toString(),
        }),
        envRl,
        creerExecutionContextTest(),
      );
      expect(resTmp.status).toBe(401);
    }
    const res429 = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "CF-Connecting-IP": "198.51.100.77",
        },
        body: new URLSearchParams({
          action: "connexion_evaluation",
          courriel_evaluation: COURRIEL_EVALUATION_PAR_DEFAUT,
          mot_de_passe_evaluation: SECRET_EVALUATION_TEST,
        }).toString(),
      }),
      envRl,
      creerExecutionContextTest(),
    );
    expect(res429.status).toBe(429);

    // 7. Déconnexion permise pendant la session lecture seule, puis suspension dans /exploitant coupant reconnexion et jeton OAuth sans courriel
    const resLogout = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieEval,
        },
        body: new URLSearchParams({ csrf: csrfEval, action: "deconnexion" }).toString(),
      }),
      envEval,
      creerExecutionContextTest(),
    );
    expect(resLogout.status).toBe(303);

    const resSuspend = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/exploitant", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SECRET_CONSOLE_TEST}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          action: "changer_etat",
          titulaire_id: ID_TITULAIRE_EVALUATION,
          vers: "suspendu",
          motif: "demande_titulaire",
        }).toString(),
      }),
      envEval,
      creerExecutionContextTest(),
    );
    expect(resSuspend.status).toBe(200);
    expect(boite.messages).toHaveLength(0);
    expect(
      await resoudreJeton(depot, [tokenPayload.access_token], { service: "jurisprudence" }),
    ).toBeNull();

    // Reconnexion refusée une fois suspendu (401)
    const resReconnSuspendu = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/moi", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          action: "connexion_evaluation",
          courriel_evaluation: COURRIEL_EVALUATION_PAR_DEFAUT,
          mot_de_passe_evaluation: SECRET_EVALUATION_TEST,
        }).toString(),
      }),
      envEval,
      creerExecutionContextTest(),
    );
    expect(resReconnSuspendu.status).toBe(401);
  });
});
