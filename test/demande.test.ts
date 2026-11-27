import {
  type BinaireD1,
  empreinte,
  frapperJeton,
  horodatageIsoUtc,
  ouvrirCoffre,
} from "@poirierlavoie/mcp-socle";
import { beforeEach, describe, expect, it } from "vitest";
import { COURRIEL_CONTACT_RESPONSABLE, NUMERO_MEMBRE_EVALUATION } from "../src/constantes";
import { creerGestionnaireAcces } from "../src/index";
import {
  CLEF_CANLII_VALIDE_TEST,
  creerBoiteCourriel,
  creerEnvTest,
  creerExecutionContextTest,
  creerFetchSimule,
  creerLimiteurFenetre,
  reinitialiserBaseIdentite,
  SECRET_CONSOLE_TEST,
  SECRET_MAITRE_TEST,
} from "./helpers";

function construireCorpsDemande(surcharges: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    nom: "Marie Tremblay",
    numero_membre: "201845-3",
    section: "Montréal",
    courriel: "mtremblay@cabinet-exemple.ca",
    cabinet: "Tremblay & Associés",
    clef_canlii: CLEF_CANLII_VALIDE_TEST,
    attestation_acceptee: "oui",
    cgu_acceptees: "oui",
    ...surcharges,
  };
  return new URLSearchParams(base).toString();
}

describe("/demande & /demande/confirmer — Admission, sas anti-squattage, CanLII et coffre", () => {
  beforeEach(async () => {
    await reinitialiserBaseIdentite();
  });

  it("fermé par défaut sur MODE_ADMISSION ('ferme' ou absent) et rejette les requêtes cross-site", async () => {
    const app = creerGestionnaireAcces({ fetchExterne: creerFetchSimule() });
    for (const mode of ["ferme", undefined, "inconnu"]) {
      const envFerme = creerEnvTest({ MODE_ADMISSION: mode });
      const ctx = creerExecutionContextTest();
      const res = await app.fetch(
        new Request("https://acces.poirierlavoie.ca/demande", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Origin: "https://acces.poirierlavoie.ca",
          },
          body: construireCorpsDemande(),
        }),
        envFerme,
        ctx,
      );
      expect(res.status).toBe(403);
    }

    const resCrossSite = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://attaquant.exemple",
        },
        body: construireCorpsDemande(),
      }),
      creerEnvTest(),
      creerExecutionContextTest(),
    );
    expect(resCrossSite.status).toBe(403);

    const resSecFetchCross = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Sec-Fetch-Site": "cross-site",
        },
        body: construireCorpsDemande(),
      }),
      creerEnvTest(),
      creerExecutionContextTest(),
    );
    expect(resSecFetchCross.status).toBe(403);

    const res415 = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      creerEnvTest(),
      creerExecutionContextTest(),
    );
    expect(res415.status).toBe(415);

    const res413 = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `nom=${"a".repeat(20_000)}`,
      }),
      creerEnvTest(),
      creerExecutionContextTest(),
    );
    expect(res413.status).toBe(413);

    const resUtf8Invalide = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new Uint8Array([0x6e, 0x6f, 0x6d, 0x3d, 0xff, 0xfe]),
      }),
      creerEnvTest(),
      creerExecutionContextTest(),
    );
    expect(resUtf8Invalide.status).toBe(400);
  });

  it("applique RL_DEMANDE_IP à 10/min (429 à la 11e requête)", async () => {
    const app = creerGestionnaireAcces({ fetchExterne: creerFetchSimule() });
    const rl = creerLimiteurFenetre(10);
    const envLim = creerEnvTest({ RL_DEMANDE_IP: rl });

    for (let i = 1; i <= 10; i++) {
      const res = await app.fetch(
        new Request("https://acces.poirierlavoie.ca/demande", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "CF-Connecting-IP": "198.51.100.42",
          },
          body: construireCorpsDemande({ nom: "" }),
        }),
        envLim,
        creerExecutionContextTest(),
      );
      expect(res.status).toBe(400);
    }

    const onzieme = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "CF-Connecting-IP": "198.51.100.42",
        },
        body: construireCorpsDemande(),
      }),
      envLim,
      creerExecutionContextTest(),
    );
    expect(onzieme.status).toBe(429);
    expect(onzieme.headers.get("Retry-After")).toBe("60");
  });

  it("G9 : refuse une clé CanLII invalide et expurge toute clé des messages d'erreur réseau", async () => {
    const boite = creerBoiteCourriel();
    const envTest = creerEnvTest({ COURRIEL: boite });
    const appRefus = creerGestionnaireAcces({
      fetchExterne: creerFetchSimule({ clefsCanliiValides: [] }),
    });

    const resRefus = await appRefus.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande({ clef_canlii: "clef_invalide_secret_xyz" }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRefus.status).toBe(400);
    const htmlRefus = await resRefus.text();
    expect(htmlRefus).toContain("401/403");
    expect(htmlRefus).not.toContain("clef_invalide_secret_xyz");
    expect(boite.messages.length).toBe(0);

    const secretFuitant = "clef_ultra_secrete_canlii_9999";
    const appErreur = creerGestionnaireAcces({
      fetchExterne: creerFetchSimule({ erreurReseauCanlii: "Échec DNS amont" }),
    });
    const resErreur = await appErreur.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande({ clef_canlii: secretFuitant }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resErreur.status).toBe(400);
    const htmlErreur = await resErreur.text();
    expect(htmlErreur).not.toContain(secretFuitant);
    expect(htmlErreur).toContain("[EXPURGE]");

    const appelsCanlii: Array<{ url: string; init?: RequestInit }> = [];
    const secretRedir = "clef_canlii_redir_protegee_2026";
    const appRedir = creerGestionnaireAcces({
      fetchExterne: creerFetchSimule({
        appels: appelsCanlii,
        redirectionCanlii: "https://autre-hote.exemple/vol",
      }),
    });
    const resRedir = await appRedir.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande({ clef_canlii: secretRedir }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRedir.status).toBe(400);
    const htmlRedir = await resRedir.text();
    expect(htmlRedir).toContain("redirection HTTP inattendue");
    expect(htmlRedir).not.toContain(secretRedir);
    expect(boite.messages.length).toBe(0);
    expect(appelsCanlii).toHaveLength(1);
    expect(appelsCanlii[0]?.init?.redirect).toBe("manual");
  });

  it("empêche le squattage d'un numéro du Barreau avant confirmation courriel, survit au préchargement GET SafeLinks et scelle le coffre (G8, G10)", async () => {
    const db = await reinitialiserBaseIdentite();
    const boite = creerBoiteCourriel();
    const envTest = creerEnvTest({ COURRIEL: boite, MODE_ADMISSION: "ouvert" });
    const app = creerGestionnaireAcces({ fetchExterne: creerFetchSimule() });

    const resSquat = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande({
          nom: "Usurpateur",
          numero_membre: "201845-3",
          courriel: "squatteur@autre-domaine.ca",
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resSquat.status).toBe(200);

    const nbTitulairesAvant = await db
      .prepare("SELECT COUNT(*) AS n FROM titulaire")
      .first<{ n: number }>();
    expect(nbTitulairesAvant?.n).toBe(0);

    const resVraie = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande({
          nom: "Marie Tremblay",
          numero_membre: "2018453",
          courriel: "mtremblay@cabinet-exemple.ca",
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resVraie.status).toBe(200);
    expect(boite.messages.length).toBe(2);

    const courrielVraie = boite.dernier();
    expect(courrielVraie.from).toEqual({
      name: "Accès MCP — Droit civil québécois",
      email: "noreply@acces.poirierlavoie.ca",
    });
    const mUrl =
      /https:\/\/acces\.poirierlavoie\.ca(\/demande\/confirmer\?jeton=[A-Za-z0-9_-]{43})/.exec(
        courrielVraie.text,
      );
    expect(mUrl?.[1]).toBeDefined();
    const cheminConfirmer = mUrl![1]!;
    const jetonConfirmation = new URL(
      `https://acces.poirierlavoie.ca${cheminConfirmer}`,
    ).searchParams.get("jeton")!;

    const resSafeLinks = await app.fetch(
      new Request(`https://acces.poirierlavoie.ca${cheminConfirmer}`, { method: "GET" }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resSafeLinks.status).toBe(200);
    expect(await resSafeLinks.text()).toContain("Confirmer mon courriel");
    expect(
      (await db.prepare("SELECT COUNT(*) AS n FROM titulaire").first<{ n: number }>())?.n,
    ).toBe(0);

    const resConfirmer = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande/confirmer", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ jeton: jetonConfirmation }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resConfirmer.status).toBe(200);
    expect(await resConfirmer.text()).toContain("en_attente");

    const resRejeu = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande/confirmer", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ jeton: jetonConfirmation }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRejeu.status).toBe(400);

    const titulaire = await db
      .prepare("SELECT id, etat, numero_membre, courriel_verifie_le FROM titulaire LIMIT 1")
      .first<{ id: string; etat: string; numero_membre: string; courriel_verifie_le: string }>();
    expect(titulaire?.etat).toBe("en_attente");
    expect(titulaire?.numero_membre).toBe("2018453");
    expect(titulaire?.courriel_verifie_le).toBeTruthy();

    const coffre = await db
      .prepare(
        "SELECT version, iv, chiffre, repere, empreinte_clef, etat FROM coffre_clef WHERE titulaire_id = ?1",
      )
      .bind(titulaire!.id)
      .first<{
        version: number;
        iv: BinaireD1;
        chiffre: BinaireD1;
        repere: string;
        empreinte_clef: string;
        etat: "valide" | "refusee" | "inconnue";
      }>();
    expect(coffre?.etat).toBe("valide");

    const ouvert = await ouvrirCoffre(
      {
        titulaireId: titulaire!.id,
        usage: "canlii",
        entree: {
          titulaireId: titulaire!.id,
          version: coffre!.version,
          iv: coffre!.iv,
          chiffre: coffre!.chiffre,
          repere: coffre!.repere,
          empreinteClef: coffre!.empreinte_clef,
          etat: coffre!.etat,
        },
        maitres: { 1: SECRET_MAITRE_TEST },
      },
      (clair) => clair === CLEF_CANLII_VALIDE_TEST,
    );
    expect(ouvert).toEqual({ ok: true, client: true, provenance: "coffre" });

    // Demande sans clé API CanLII : autorisée et confirmée sans entrée coffre_clef
    const resSansClef = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://acces.poirierlavoie.ca",
        },
        body: construireCorpsDemande({
          nom: "Jean SansClef",
          numero_membre: "202011-4",
          courriel: "jsansclef@cabinet-exemple.ca",
          clef_canlii: "",
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resSansClef.status).toBe(200);
    const lienSansClef =
      /https:\/\/acces\.poirierlavoie\.ca\/demande\/confirmer\?jeton=([A-Za-z0-9_-]+)/.exec(
        boite.dernier().text,
      );
    expect(lienSansClef?.[1]).toBeDefined();
    const resConfSansClef = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande/confirmer", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://acces.poirierlavoie.ca",
        },
        body: new URLSearchParams({ jeton: lienSansClef![1]! }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resConfSansClef.status).toBe(200);
    const titSansClef = await db
      .prepare("SELECT id, etat FROM titulaire WHERE numero_membre = '2020114'")
      .first<{ id: string; etat: string }>();
    expect(titSansClef?.etat).toBe("en_attente");
    const coffreSansClef = await db
      .prepare("SELECT COUNT(*) AS n FROM coffre_clef WHERE titulaire_id = ?1")
      .bind(titSansClef!.id)
      .first<{ n: number }>();
    expect(coffreSansClef?.n).toBe(0);

    const resDoublon = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resDoublon.status).toBe(200);
    expect(await resDoublon.text()).toContain("Vérifiez votre boîte courriel");
    expect(boite.dernier().subject).toContain("existe déjà");
  });

  it("valide le mode 'invitation' (code valide, courriel verrouillé et consommation unique)", async () => {
    const db = await reinitialiserBaseIdentite();
    const boite = creerBoiteCourriel();
    const envInvitation = creerEnvTest({ COURRIEL: boite, MODE_ADMISSION: "invitation" });
    const maintenant = new Date("2026-11-18T12:00:00.000Z");
    const app = creerGestionnaireAcces({
      fetchExterne: creerFetchSimule(),
      horloge: () => maintenant,
    });

    const codeInvitation = frapperJeton();
    await db
      .prepare(
        `INSERT INTO invitation_acces (id, empreinte_code, courriel_cible, cohorte, cree_le, expire_le, consomme_le, titulaire_id)
         VALUES ('inv_1', ?1, 'invite@cabinet.qc.ca', 'cohorte-1', ?2, ?3, NULL, NULL)`,
      )
      .bind(
        await empreinte(codeInvitation),
        horodatageIsoUtc(maintenant),
        horodatageIsoUtc(new Date(maintenant.getTime() + 86_400_000)),
      )
      .run();

    const resMauvaisCourriel = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande({
          courriel: "autre@cabinet.qc.ca",
          code_invitation: codeInvitation,
        }),
      }),
      envInvitation,
      creerExecutionContextTest(),
    );
    expect(resMauvaisCourriel.status).toBe(400);

    const resBon = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande({
          courriel: "invite@cabinet.qc.ca",
          code_invitation: codeInvitation,
        }),
      }),
      envInvitation,
      creerExecutionContextTest(),
    );
    expect(resBon.status).toBe(200);
    const mJeton = /jeton=([A-Za-z0-9_-]{43})/.exec(boite.dernier().text);
    expect(mJeton?.[1]).toBeDefined();

    const resConf = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande/confirmer", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ jeton: mJeton![1]! }).toString(),
      }),
      envInvitation,
      creerExecutionContextTest(),
    );
    expect(resConf.status).toBe(200);

    const invApres = await db
      .prepare("SELECT consomme_le, titulaire_id FROM invitation_acces WHERE id = 'inv_1'")
      .first<{ consomme_le: string | null; titulaire_id: string | null }>();
    expect(invApres?.consomme_le).toBeTruthy();
    expect(invApres?.titulaire_id).toBeTruthy();
  });

  it("préserve le bouton de réessai (503) en cas d'indisponibilité transitoire CanLII à la confirmation et gère les courses concurrentes", async () => {
    const db = await reinitialiserBaseIdentite();
    const boite = creerBoiteCourriel();
    const envTest = creerEnvTest({ COURRIEL: boite, MODE_ADMISSION: "ouvert" });
    let enPanne = true;

    const app = creerGestionnaireAcces({
      fetchExterne: async (entree, init) => {
        if (enPanne) {
          return new Response("Service Unavailable", { status: 503 });
        }
        return await creerFetchSimule()(entree, init);
      },
    });

    enPanne = false;
    await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    const jeton = /jeton=([A-Za-z0-9_-]{43})/.exec(boite.dernier().text)![1]!;

    enPanne = true;
    const resPanne = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande/confirmer", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ jeton }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resPanne.status).toBe(503);
    expect(await resPanne.text()).toContain(`value="${jeton}"`);

    enPanne = false;
    const [r1, r2] = await Promise.all([
      app.fetch(
        new Request("https://acces.poirierlavoie.ca/demande/confirmer", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ jeton }).toString(),
        }),
        envTest,
        creerExecutionContextTest(),
      ),
      app.fetch(
        new Request("https://acces.poirierlavoie.ca/demande/confirmer", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ jeton }).toString(),
        }),
        envTest,
        creerExecutionContextTest(),
      ),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 400]);
    expect(
      (await db.prepare("SELECT COUNT(*) AS n FROM titulaire").first<{ n: number }>())?.n,
    ).toBe(1);
  });

  it("n'alerte l'exploitant qu'après POST /demande/confirmer (jamais sur POST /demande), sans secret, et survit à un échec COURRIEL.send", async () => {
    const db = await reinitialiserBaseIdentite();
    const boite = creerBoiteCourriel();
    const envTest = creerEnvTest({ COURRIEL: boite, MODE_ADMISSION: "ouvert" });
    const app = creerGestionnaireAcces({ fetchExterne: creerFetchSimule() });

    const alertesExploitant = () =>
      boite.messages.filter((m) => m.to === COURRIEL_CONTACT_RESPONSABLE);

    const resDemande = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande({
          nom: "Claire <Bélanger>",
          numero_membre: "202011-9",
          section: "Québec",
          courriel: "cbelanger@cabinet-quebec.ca",
          cabinet: "Bélanger & Co",
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resDemande.status).toBe(200);
    expect(boite.messages.length).toBe(1);
    expect(boite.dernier().to).toBe("cbelanger@cabinet-quebec.ca");
    expect(alertesExploitant().length).toBe(0);

    const jeton1 = /jeton=([A-Za-z0-9_-]{43})/.exec(boite.dernier().text)![1]!;

    const resGetConf = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/demande/confirmer?jeton=${encodeURIComponent(jeton1)}`,
        { method: "GET" },
      ),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resGetConf.status).toBe(200);
    expect(alertesExploitant().length).toBe(0);

    const resPostConf = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande/confirmer", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ jeton: jeton1 }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resPostConf.status).toBe(200);
    expect(alertesExploitant().length).toBe(1);

    const alerte = alertesExploitant()[0]!;
    expect(alerte.from).toEqual({
      name: "Accès MCP — Droit civil québécois",
      email: "noreply@acces.poirierlavoie.ca",
    });
    expect(alerte.to).toBe("jason@poirierlavoie.ca");
    expect(alerte.subject).toContain("Claire <Bélanger>");
    expect(alerte.subject).toContain("2020119");
    expect(alerte.subject).not.toMatch(/[\r\n]/);

    expect(alerte.text).toContain("Claire <Bélanger>");
    expect(alerte.text).toContain("2020119");
    expect(alerte.text).toContain("Québec");
    expect(alerte.text).toContain("cbelanger@cabinet-quebec.ca");
    expect(alerte.text).toContain("Bélanger & Co");
    expect(alerte.text).toContain("https://acces.poirierlavoie.ca/exploitant");

    expect(alerte.html).toContain("Claire &lt;Bélanger&gt;");
    expect(alerte.html).not.toContain("<Bélanger>");
    expect(alerte.html).toContain("2020119");
    expect(alerte.html).toContain("Québec");
    expect(alerte.html).toContain("cbelanger@cabinet-quebec.ca");
    expect(alerte.html).toContain("Bélanger &amp; Co");
    expect(alerte.html).toContain('href="https://acces.poirierlavoie.ca/exploitant"');

    const coffre1 = await db
      .prepare("SELECT repere, empreinte_clef FROM coffre_clef LIMIT 1")
      .first<{ repere: string; empreinte_clef: string }>();
    for (const secretInterdit of [
      CLEF_CANLII_VALIDE_TEST,
      jeton1,
      coffre1!.repere,
      coffre1!.empreinte_clef,
      SECRET_MAITRE_TEST,
      SECRET_CONSOLE_TEST,
    ]) {
      expect(alerte.subject).not.toContain(secretInterdit);
      expect(alerte.text).not.toContain(secretInterdit);
      expect(alerte.html).not.toContain(secretInterdit);
    }

    const resRejeu = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande/confirmer", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ jeton: jeton1 }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRejeu.status).toBe(400);
    expect(alertesExploitant().length).toBe(1);

    const resDoublon = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande({
          nom: "Claire <Bélanger>",
          numero_membre: "202011-9",
          section: "Québec",
          courriel: "cbelanger@cabinet-quebec.ca",
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resDoublon.status).toBe(200);
    expect(alertesExploitant().length).toBe(1);

    const resDemande2 = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande({
          nom: "Luc Roy",
          numero_membre: "202199-1",
          section: "Hull",
          courriel: "lroy@pratique-solo.qc.ca",
          cabinet: "",
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resDemande2.status).toBe(200);
    const jeton2 = /jeton=([A-Za-z0-9_-]{43})/.exec(boite.dernier().text)![1]!;

    const envCourrielEnPanne = creerEnvTest({
      MODE_ADMISSION: "ouvert",
      COURRIEL: {
        async send() {
          throw new Error("Panne transitoire Cloudflare Email Sending");
        },
      },
    });

    const resConfMalgrePanne = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande/confirmer", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ jeton: jeton2 }).toString(),
      }),
      envCourrielEnPanne,
      creerExecutionContextTest(),
    );
    expect(resConfMalgrePanne.status).toBe(200);
    expect(await resConfMalgrePanne.text()).toContain("en_attente");

    const titulaire2 = await db
      .prepare("SELECT id, etat, cabinet FROM titulaire WHERE numero_membre = '2021991'")
      .first<{ id: string; etat: string; cabinet: string | null }>();
    expect(titulaire2).toEqual({
      id: expect.any(String),
      etat: "en_attente",
      cabinet: null,
    });
    const coffre2 = await db
      .prepare("SELECT etat FROM coffre_clef WHERE titulaire_id = ?1")
      .bind(titulaire2!.id)
      .first<{ etat: string }>();
    expect(coffre2?.etat).toBe("valide");
  });

  it("neutralise les caractères Unicode invisibles/bidi/C1, garantit le rappel déterministe sur collision OR et n'alerte pas sur 409", async () => {
    const db = await reinitialiserBaseIdentite();
    const boite = creerBoiteCourriel();
    const envTest = creerEnvTest({ COURRIEL: boite, MODE_ADMISSION: "ouvert" });
    const app = creerGestionnaireAcces({ fetchExterne: creerFetchSimule() });

    const alertesExploitant = () =>
      boite.messages.filter((m) => m.to === COURRIEL_CONTACT_RESPONSABLE);

    const casInvalides: Array<Record<string, string>> = [
      { nom: "\u200B\u200B\u200B" },
      { nom: "\u2800\u2800\u2800" },
      { nom: "123456" },
      { cabinet: "\u200B\u2060" },
      { courriel: "avocat\u202E@cabinet.qc.ca" },
      { courriel: "avocat\u200B@cabinet.qc.ca" },
      { courriel: "avocat\x85@cabinet.qc.ca" },
      { courriel: ".avocat.@cabinet.qc.ca" },
      { courriel: "avocat@-cabinet.qc.ca" },
    ];
    for (const invalide of casInvalides) {
      const resInv = await app.fetch(
        new Request("https://acces.poirierlavoie.ca/demande", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: construireCorpsDemande(invalide),
        }),
        envTest,
        creerExecutionContextTest(),
      );
      expect(resInv.status, JSON.stringify(invalide)).toBe(400);
    }
    expect(boite.messages).toHaveLength(0);

    const entetesAvocat1 = {
      "Content-Type": "application/x-www-form-urlencoded",
      "CF-Connecting-IP": "198.51.100.21",
    };
    const entetesAvocat2 = {
      "Content-Type": "application/x-www-form-urlencoded",
      "CF-Connecting-IP": "198.51.100.22",
    };
    const resBidi = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: entetesAvocat1,
        body: construireCorpsDemande({
          nom: "Jean\u200B \u202E9-999999\x85Be\u0301langer",
          numero_membre: "202311-4",
          section: "Montréal",
          courriel: "jbelanger@cabinet-mtl.ca",
          cabinet: "Étude\u2028\u2066Bélanger\u2069",
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resBidi.status).toBe(200);
    const jetonBidi = /jeton=([A-Za-z0-9_-]{43})/.exec(boite.dernier().text)![1]!;

    const resConcurrente = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: entetesAvocat2,
        body: construireCorpsDemande({
          nom: "Jean Bélanger",
          numero_membre: "2023114",
          section: "Montréal",
          courriel: "jbelanger2@cabinet-mtl.ca",
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resConcurrente.status).toBe(200);
    const jetonConcurrent = /jeton=([A-Za-z0-9_-]{43})/.exec(boite.dernier().text)![1]!;

    const resConf1 = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande/confirmer", {
        method: "POST",
        headers: entetesAvocat1,
        body: new URLSearchParams({ jeton: jetonBidi }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resConf1.status).toBe(200);
    expect(alertesExploitant()).toHaveLength(1);
    const alerte = alertesExploitant()[0]!;
    expect(alerte.subject).toContain("Me Jean 9-999999 Bélanger");
    expect(alerte.subject).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    expect(alerte.text).toContain("Étude Bélanger");
    expect(alerte.text.replace(/\n/g, "")).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    expect(alerte.html.replace(/\n/g, "")).not.toMatch(/[\p{Cc}\p{Cf}]/u);

    const resConf409 = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande/confirmer", {
        method: "POST",
        headers: entetesAvocat2,
        body: new URLSearchParams({ jeton: jetonConcurrent }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resConf409.status).toBe(409);
    expect(alertesExploitant()).toHaveLength(1);

    const maintenantIso = horodatageIsoUtc();
    await db
      .prepare(
        `INSERT INTO titulaire (
          id, cree_le, etat, nom, numero_membre, section, courriel, cabinet,
          courriel_verifie_le, attestation_le, attestation_ver, cgu_ver, hybride_permis, note_admission
        ) VALUES ('tit_second', ?1, 'actif', 'Anne Côté', '2024998', 'Québec', 'acote@cabinet-qc.ca', NULL, ?1, ?1, '2026-11-18', '2026-11-18', 1, 'Bottin OK')`,
      )
      .bind(maintenantIso)
      .run();

    const nbMessagesAvant = boite.messages.length;
    const resCollisionOr = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "CF-Connecting-IP": "198.51.100.23",
        },
        body: construireCorpsDemande({
          nom: "Anne Côté",
          numero_membre: "202311-4",
          courriel: "acote@cabinet-qc.ca",
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resCollisionOr.status).toBe(200);
    expect(boite.messages.length).toBe(nbMessagesAvant + 1);
    expect(boite.dernier().to).toBe("acote@cabinet-qc.ca");
    expect(boite.dernier().subject).toContain("existe déjà");
    expect(alertesExploitant()).toHaveLength(1);
  });

  it("rejette le numéro technique réservé 0000000 sur /demande sans envoyer de courriel", async () => {
    const boite = creerBoiteCourriel();
    const envTest = creerEnvTest({ COURRIEL: boite, MODE_ADMISSION: "ouvert" });
    const app = creerGestionnaireAcces({ fetchExterne: creerFetchSimule() });

    const res = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/demande", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: construireCorpsDemande({ numero_membre: NUMERO_MEMBRE_EVALUATION }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(res.status).toBe(400);
    expect(boite.messages).toHaveLength(0);
  });
});
