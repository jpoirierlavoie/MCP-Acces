import {
  creerDepotJetonsD1,
  ecrireEvenementTechniqueD1,
  formaterEvenementTechnique,
  horodatageIsoUtc,
  incrementerCompteurJourD1,
  jourUtc,
  ouvrirCoffre,
  resoudreJeton,
  scellerCoffre,
} from "@poirierlavoie/mcp-socle";
import { beforeEach, describe, expect, it } from "vitest";
import { validerCheminRetourInterne } from "../src/securite";
import {
  CLEF_CANLII_VALIDE_TEST,
  creerAppTest,
  creerBoiteCourriel,
  creerEnvTest,
  creerExecutionContextTest,
  creerFetchSimule,
  extraireCsrfHtml,
  extraireEnteteCookiePair,
  reinitialiserBaseIdentite,
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

    // 1. Claude Code / Claude Desktop (.mcp.json)
    const mcpJson = extraireBlocJson(".mcp.json");
    expect(mcpJson).toEqual({
      mcpServers: {
        lois: {
          type: "http",
          url: "https://legislation.poirierlavoie.ca/mcp",
          headers: { Authorization: authLois },
        },
        juris: {
          type: "http",
          url: "https://jurisprudence.poirierlavoie.ca/mcp",
          headers: { Authorization: authJuris },
        },
        outils: {
          type: "http",
          url: "https://outils.poirierlavoie.ca/mcp",
        },
      },
    });

    // 2. Google Antigravity (mcp_config.json) — contrat exact de verifier.py (url + headers + variables, sans serverUrl ni eager)
    const agyJson = extraireBlocJson("mcp_config.json") as {
      mcpServers: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(agyJson.mcpServers).sort()).toEqual(["juris", "lois", "outils"]);
    for (const [srvName, expUrl, expAuth, expVar] of [
      ["lois", "https://legislation.poirierlavoie.ca/mcp", authLois, "MCP_LEGISLATION_SECRET"],
      [
        "juris",
        "https://jurisprudence.poirierlavoie.ca/mcp",
        authJuris,
        "MCP_JURISPRUDENCE_SECRET",
      ],
    ] as const) {
      const srv = agyJson.mcpServers[srvName]!;
      expect(Object.keys(srv).sort()).toEqual(["headers", "url", "variables"]);
      expect(srv.url).toBe(expUrl);
      expect(srv).not.toHaveProperty("serverUrl");
      expect(srv).not.toHaveProperty("eager");
      expect(srv.headers).toEqual({ Authorization: expAuth });
      const vars = srv.variables as Array<{ name: string; title: string; description: string }>;
      expect(Array.isArray(vars)).toBe(true);
      expect(vars.length).toBeGreaterThanOrEqual(1);
      expect(
        vars.some(
          (v) =>
            v.name === expVar &&
            typeof v.title === "string" &&
            v.title.trim().length > 0 &&
            typeof v.description === "string" &&
            v.description.trim().length > 0,
        ),
      ).toBe(true);
    }
    expect(agyJson.mcpServers.outils).toEqual({
      url: "https://outils.poirierlavoie.ca/mcp",
    });
    expect(Object.keys(agyJson.mcpServers.outils!)).toEqual(["url"]);

    // 3. Gemini CLI (gemini-extension.json)
    const geminiJson = extraireBlocJson("gemini-extension.json") as {
      name: string;
      version: string;
      description: string;
      contextFileName: unknown[];
      settings: Array<{
        name: string;
        description: string;
        envVar: string;
        sensitive: boolean;
      }>;
      mcpServers: Record<string, Record<string, unknown>>;
    };
    expect(geminiJson.name).toBe("droit-civil-quebecois");
    expect(geminiJson.version).toBe("2.1.0");
    expect(geminiJson.description).toContain("Connecteurs « lois », « juris » et « outils »");
    expect(geminiJson.contextFileName).toEqual([]);
    for (const expVar of ["MCP_LEGISLATION_SECRET", "MCP_JURISPRUDENCE_SECRET"]) {
      expect(
        geminiJson.settings.some(
          (s) =>
            s.envVar === expVar &&
            s.sensitive === true &&
            typeof s.name === "string" &&
            s.name.trim().length > 0 &&
            typeof s.description === "string" &&
            s.description.trim().length > 0,
        ),
      ).toBe(true);
    }
    expect(geminiJson.mcpServers).toEqual({
      lois: {
        httpUrl: "https://legislation.poirierlavoie.ca/mcp",
        headers: { Authorization: authLois },
      },
      juris: {
        httpUrl: "https://jurisprudence.poirierlavoie.ca/mcp",
        headers: { Authorization: authJuris },
      },
      outils: {
        httpUrl: "https://outils.poirierlavoie.ca/mcp",
      },
    });
  });
});
