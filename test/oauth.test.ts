import {
  CHEMIN_SERVEUR_AUTORISATION,
  calculerDefiPkceS256,
  creerDepotJetonsD1,
  ecrireEvenementTechniqueD1,
  empreinte,
  formaterEvenementTechnique,
  frapperJeton,
  horodatageIsoUtc,
  incrementerCompteurJourD1,
  resoudreJeton,
} from "@poirierlavoie/mcp-socle";
import { beforeEach, describe, expect, it } from "vitest";
import { creerGestionnaireAcces } from "../src/index";
import {
  creerEnvTest,
  creerExecutionContextTest,
  creerFetchSimule,
  creerLimiteurFenetre,
  extraireCsrfHtml,
  extraireJetonConsentementHtml,
  reinitialiserBaseIdentite,
} from "./helpers";

async function creerSessionMoiDirecte(
  db: D1Database,
  titulaireId = "tit_oauth_1",
  etat: "actif" | "suspendu" = "actif",
): Promise<string> {
  const maintenantIso = horodatageIsoUtc();
  const expireIso = horodatageIsoUtc(new Date(Date.now() + 3_600_000));
  const jetonSession = frapperJeton();

  await db.batch([
    db
      .prepare(
        `INSERT INTO titulaire (
          id, cree_le, etat, nom, numero_membre, section, courriel, cabinet,
          courriel_verifie_le, attestation_le, attestation_ver, cgu_ver, hybride_permis, note_admission
        ) VALUES (?1, ?2, ?3, 'Claire Morin', '2016789', 'Hull', 'cmorin@cabinet.qc.ca', NULL, ?2, ?2, '2026-11-18', '2026-11-18', 1, 'Bottin OK')`,
      )
      .bind(titulaireId, maintenantIso, etat),
    db
      .prepare(
        `INSERT INTO session_portail (
          id, titulaire_id, courriel, type_lien, empreinte, cree_le, expire_le, consomme_le
        ) VALUES (?1, ?2, 'cmorin@cabinet.qc.ca', 'session_moi', ?3, ?4, ?5, NULL)`,
      )
      .bind(
        `sp_${titulaireId}`,
        titulaireId,
        await empreinte(jetonSession),
        maintenantIso,
        expireIso,
      ),
  ]);

  return `__Host-acces_moi=${jetonSession}`;
}

describe("OAuth 2.1 (RFC 8414, PKCE S256 G35, CIMD anti-SSRF G36, code_oauth atomique, /oauth/revoke) et Cron G16", () => {
  beforeEach(async () => {
    await reinitialiserBaseIdentite();
  });

  it("sert la fiche RFC 8414 /.well-known/oauth-authorization-server", async () => {
    const app = creerGestionnaireAcces({ fetchExterne: creerFetchSimule() });
    const res = await app.fetch(
      new Request(`https://acces.poirierlavoie.ca${CHEMIN_SERVEUR_AUTORISATION}`),
      creerEnvTest(),
      creerExecutionContextTest(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const doc = (await res.json()) as {
      issuer: string;
      authorization_endpoint: string;
      token_endpoint: string;
      revocation_endpoint: string;
      registration_endpoint: string;
      code_challenge_methods_supported: string[];
      client_id_metadata_document_supported: boolean;
      authorization_response_iss_parameter_supported: boolean;
      scopes_supported: string[];
    };
    expect(doc.issuer).toBe("https://acces.poirierlavoie.ca");
    expect(doc.authorization_endpoint).toBe("https://acces.poirierlavoie.ca/oauth/authorize");
    expect(doc.token_endpoint).toBe("https://acces.poirierlavoie.ca/oauth/token");
    expect(doc.revocation_endpoint).toBe("https://acces.poirierlavoie.ca/oauth/revoke");
    expect(doc.registration_endpoint).toBe("https://acces.poirierlavoie.ca/oauth/register");
    expect(doc.code_challenge_methods_supported).toEqual(["S256"]);
    expect(doc.client_id_metadata_document_supported).toBe(true);
    expect(doc.authorization_response_iss_parameter_supported).toBe(true);
    expect(doc.scopes_supported).toEqual([
      "tous",
      "les_deux",
      "jurisprudence",
      "legislation",
      "outils",
      "jurisprudence legislation",
      "jurisprudence outils",
      "legislation outils",
    ]);
  });

  it("exécute le flux complet OAuth 2.1 + PKCE S256 (claude-web), bloque le rejeu de code_oauth et permet /oauth/revoke", async () => {
    const db = await reinitialiserBaseIdentite();
    const cookieMoi = await creerSessionMoiDirecte(db, "tit_oauth_claude");
    const app = creerGestionnaireAcces({ fetchExterne: creerFetchSimule() });
    const envTest = creerEnvTest();

    const codeVerifier = `${frapperJeton()}${frapperJeton().slice(0, 10)}`;
    const codeChallenge = await calculerDefiPkceS256(codeVerifier);
    const redirectUri = "https://claude.ai/api/mcp/auth_callback";

    const urlAuthorize =
      `https://acces.poirierlavoie.ca/oauth/authorize?` +
      new URLSearchParams({
        response_type: "code",
        client_id: "claude-web",
        redirect_uri: redirectUri,
        scope: "legislation jurisprudence outils",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state: "etat_xyz_123",
      }).toString();

    const resNonConnecte = await app.fetch(
      new Request(urlAuthorize),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resNonConnecte.status).toBe(303);
    expect(resNonConnecte.headers.get("Location")).toMatch(/^\/moi\?retour=/);

    const resConsent = await app.fetch(
      new Request(urlAuthorize, { headers: { Cookie: cookieMoi } }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resConsent.status).toBe(200);
    expect(resConsent.headers.get("Content-Security-Policy")).toContain(
      "form-action 'self' https://claude.ai",
    );
    const htmlConsent = await resConsent.text();
    expect(htmlConsent).toContain("tous");
    const jetonConsentement = extraireJetonConsentementHtml(htmlConsent);

    const htmlMoi = await (
      await app.fetch(
        new Request("https://acces.poirierlavoie.ca/moi", { headers: { Cookie: cookieMoi } }),
        envTest,
        creerExecutionContextTest(),
      )
    ).text();
    const csrfMoi = extraireCsrfHtml(htmlMoi);

    const resCsrfMoiReutilise = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieMoi,
        },
        body: new URLSearchParams({
          jeton_consentement: csrfMoi,
          decision: "autoriser",
          response_type: "code",
          client_id: "claude-web",
          redirect_uri: redirectUri,
          scope: "les_deux",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
          state: "etat_xyz_123",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resCsrfMoiReutilise.status).toBe(403);

    for (const mutation of [
      { redirect_uri: "https://claude.com/api/mcp/auth_callback" },
      { scope: "legislation" },
      {
        client_id: "google-vertex-gemini",
        redirect_uri: "https://vertexaisearch.cloud.google.com/oauth-redirect",
      },
      { state: "etat_altere" },
      { code_challenge: "B".repeat(43) },
    ]) {
      const resMutee = await app.fetch(
        new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: cookieMoi,
          },
          body: new URLSearchParams({
            jeton_consentement: jetonConsentement,
            decision: "autoriser",
            response_type: "code",
            client_id: "claude-web",
            redirect_uri: redirectUri,
            scope: "tous",
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            state: "etat_xyz_123",
            ...mutation,
          }).toString(),
        }),
        envTest,
        creerExecutionContextTest(),
      );
      expect(resMutee.status, JSON.stringify(mutation)).toBe(403);
    }

    const resApprouver = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieMoi,
        },
        body: new URLSearchParams({
          jeton_consentement: jetonConsentement,
          decision: "autoriser",
          response_type: "code",
          client_id: "claude-web",
          redirect_uri: redirectUri,
          scope: "tous",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
          state: "etat_xyz_123",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resApprouver.status).toBe(303);
    const urlRappel = new URL(resApprouver.headers.get("Location")!);
    expect(`${urlRappel.origin}${urlRappel.pathname}`).toBe(redirectUri);
    expect(urlRappel.searchParams.get("state")).toBe("etat_xyz_123");
    const codeBrulable = urlRappel.searchParams.get("code")!;
    expect(codeBrulable).toHaveLength(43);

    const resMauvaisPkce = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://claude.ai",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "claude-web",
          code: codeBrulable,
          redirect_uri: redirectUri,
          code_verifier: `${frapperJeton()}${frapperJeton().slice(0, 10)}`,
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resMauvaisPkce.status).toBe(400);

    const resApresEchecPkce = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://claude.ai",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "claude-web",
          code: codeBrulable,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resApresEchecPkce.status).toBe(400);

    const resApprouver2 = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieMoi,
        },
        body: new URLSearchParams({
          jeton_consentement: jetonConsentement,
          decision: "autoriser",
          response_type: "code",
          client_id: "claude-web",
          redirect_uri: redirectUri,
          scope: "tous",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
          state: "etat_xyz_123",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    const codeAutorisation = new URL(resApprouver2.headers.get("Location")!).searchParams.get(
      "code",
    )!;

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
          code: codeAutorisation,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resToken.status).toBe(200);
    expect(resToken.headers.get("Access-Control-Allow-Origin")).toBe("https://claude.ai");
    expect(resToken.headers.get("Cache-Control")).toBe("no-store");
    const corpsToken = (await resToken.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
      scope: string;
    };
    expect(corpsToken.token_type).toBe("Bearer");
    expect(corpsToken.scope).toBe("tous");
    expect(corpsToken.access_token).toHaveLength(43);

    const depot = creerDepotJetonsD1(db);
    expect(
      (await resoudreJeton(depot, [corpsToken.access_token], { service: "legislation" }))
        ?.titulaireId,
    ).toBe("tit_oauth_claude");
    expect(
      (await resoudreJeton(depot, [corpsToken.access_token], { service: "jurisprudence" }))
        ?.titulaireId,
    ).toBe("tit_oauth_claude");
    expect(
      (await resoudreJeton(depot, [corpsToken.access_token], { service: "outils" }))?.titulaireId,
    ).toBe("tit_oauth_claude");

    // Rétrocompatibilité 'les_deux' : accepté comme équivalent à 'tous' à la résolution
    const hashCompat = await empreinte("jeton_compat_les_deux_2026_1234567890abcdef");
    await db
      .prepare(
        `INSERT INTO jeton (id, titulaire_id, empreinte, queue, libelle, portee, emis_le)
         VALUES ('jtn_compat_ld', 'tit_oauth_claude', ?1, 'abcdef', 'Ancien jeton', 'les_deux', '2026-11-18T00:00:00.000Z')`,
      )
      .bind(hashCompat)
      .run();
    expect(
      (
        await resoudreJeton(depot, ["jeton_compat_les_deux_2026_1234567890abcdef"], {
          service: "outils",
        })
      )?.titulaireId,
    ).toBe("tit_oauth_claude");

    const resRejeuCode = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "claude-web",
          code: codeAutorisation,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRejeuCode.status).toBe(400);
    expect(
      await resoudreJeton(depot, [corpsToken.access_token], { service: "legislation" }),
    ).toBeNull();
    const motifCompromission = await db
      .prepare("SELECT motif_revoc FROM jeton WHERE empreinte = ?1")
      .bind(await empreinte(corpsToken.access_token))
      .first<{ motif_revoc: string | null }>();
    expect(motifCompromission?.motif_revoc).toBe("compromission");

    const resApprouver3 = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieMoi,
        },
        body: new URLSearchParams({
          jeton_consentement: jetonConsentement,
          decision: "autoriser",
          response_type: "code",
          client_id: "claude-web",
          redirect_uri: redirectUri,
          scope: "les_deux",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
          state: "etat_xyz_123",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    const codePourRevoc = new URL(resApprouver3.headers.get("Location")!).searchParams.get("code")!;
    const resTokenPourRevoc = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "claude-web",
          code: codePourRevoc,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    const jetonARevoquer = ((await resTokenPourRevoc.json()) as { access_token: string })
      .access_token;
    expect(
      (await resoudreJeton(depot, [jetonARevoquer], { service: "legislation" }))?.titulaireId,
    ).toBe("tit_oauth_claude");

    const resRevoke = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: jetonARevoquer }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRevoke.status).toBe(200);
    expect(await resoudreJeton(depot, [jetonARevoquer], { service: "legislation" })).toBeNull();
  });

  it("G34, G35 & G36 : rejette plain PKCE, redirect_uri non enregistrée sans rediriger, cibles SSRF CIMD, redirections CIMD et applique RL_OAUTH_IP 60/min", async () => {
    const db = await reinitialiserBaseIdentite();
    const cookieMoi = await creerSessionMoiDirecte(db, "tit_oauth_cimd");
    const appelsExternes: Array<{ url: string; init?: RequestInit }> = [];

    const clientIdCimdValide = "https://client-juridique.exemple.ca/oauth/metadata.json";
    const clientIdCimdRedir = "https://redir.exemple.ca/oauth/metadata.json";

    const app = creerGestionnaireAcces({
      fetchExterne: creerFetchSimule({
        appels: appelsExternes,
        documentsCimd: {
          [clientIdCimdValide]: {
            corps: {
              client_id: clientIdCimdValide,
              client_name: "Intégration CIMD Valide",
              redirect_uris: ["https://client-juridique.exemple.ca/oauth/callback"],
              token_endpoint_auth_method: "none",
            },
          },
          [clientIdCimdRedir]: {
            redirection: "http://169.254.169.254/latest/meta-data/",
          },
        },
      }),
    });
    const envTest = creerEnvTest();
    const defi = await calculerDefiPkceS256(`${frapperJeton()}${frapperJeton().slice(0, 8)}`);

    const resMauvaiseUri = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
          new URLSearchParams({
            response_type: "code",
            client_id: "claude-web",
            redirect_uri: "https://attaquant.exemple/vol",
            code_challenge: defi,
            code_challenge_method: "S256",
          }).toString(),
        { headers: { Cookie: cookieMoi } },
      ),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resMauvaiseUri.status).toBe(400);
    expect(resMauvaiseUri.headers.get("Location")).toBeNull();

    const resPlain = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
          new URLSearchParams({
            response_type: "code",
            client_id: "claude-web",
            redirect_uri: "https://claude.ai/api/mcp/auth_callback",
            code_challenge: defi,
            code_challenge_method: "plain",
          }).toString(),
        { headers: { Cookie: cookieMoi } },
      ),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resPlain.status).toBe(303);
    expect(resPlain.headers.get("Location")).toContain("error=invalid_request");

    for (const ssrfClientId of [
      "https://127.0.0.1/oauth/client.json",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/oauth/client.json",
      "https://intranet.local/oauth/client.json",
      "http://client-juridique.exemple.ca/oauth/client.json",
    ]) {
      const resSsrf = await app.fetch(
        new Request(
          `https://acces.poirierlavoie.ca/oauth/authorize?` +
            new URLSearchParams({
              response_type: "code",
              client_id: ssrfClientId,
              redirect_uri: "https://client-juridique.exemple.ca/oauth/callback",
              code_challenge: defi,
              code_challenge_method: "S256",
            }).toString(),
          { headers: { Cookie: cookieMoi } },
        ),
        envTest,
        creerExecutionContextTest(),
      );
      expect(resSsrf.status, ssrfClientId).toBe(400);
    }
    expect(appelsExternes).toHaveLength(0);

    const resCimdSansSession = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
          new URLSearchParams({
            response_type: "code",
            client_id: clientIdCimdValide,
            redirect_uri: "https://client-juridique.exemple.ca/oauth/callback",
            code_challenge: defi,
            code_challenge_method: "S256",
          }).toString(),
      ),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resCimdSansSession.status).toBe(303);
    expect(resCimdSansSession.headers.get("Location")).toMatch(/^\/moi\?retour=/);
    expect(appelsExternes).toHaveLength(0);

    const resCimdRedir = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
          new URLSearchParams({
            response_type: "code",
            client_id: clientIdCimdRedir,
            redirect_uri: "https://redir.exemple.ca/callback",
            code_challenge: defi,
            code_challenge_method: "S256",
          }).toString(),
        { headers: { Cookie: cookieMoi } },
      ),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resCimdRedir.status).toBe(400);
    expect(appelsExternes[0]?.init?.redirect).toBe("manual");
    expect(appelsExternes).toHaveLength(1);
    expect(await resCimdRedir.text()).toContain("redirection HTTP refusée");

    const resCimdOk = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
          new URLSearchParams({
            response_type: "code",
            client_id: clientIdCimdValide,
            redirect_uri: "https://client-juridique.exemple.ca/oauth/callback",
            resource: "https://jurisprudence.poirierlavoie.ca/mcp/oauth",
            code_challenge: defi,
            code_challenge_method: "S256",
          }).toString(),
        { headers: { Cookie: cookieMoi } },
      ),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resCimdOk.status).toBe(200);
    const htmlCimd = await resCimdOk.text();
    expect(htmlCimd).toContain("Intégration CIMD Valide");
    expect(htmlCimd).toContain("jurisprudence");

    const resOrigineInterdite = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://domaine-inconnu.exemple",
        },
        body: "grant_type=authorization_code",
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resOrigineInterdite.status).toBe(403);
    expect(resOrigineInterdite.headers.get("Access-Control-Allow-Origin")).toBeNull();

    const rlOAuth = creerLimiteurFenetre(2);
    const envLim = creerEnvTest({ RL_OAUTH_IP: rlOAuth });
    for (let i = 0; i < 2; i++) {
      expect(
        (
          await app.fetch(
            new Request("https://acces.poirierlavoie.ca/oauth/token", {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "CF-Connecting-IP": "203.0.113.99",
              },
              body: "grant_type=client_credentials",
            }),
            envLim,
            creerExecutionContextTest(),
          )
        ).status,
      ).toBe(400);
    }
    const res429 = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "CF-Connecting-IP": "203.0.113.99",
        },
        body: "grant_type=client_credentials",
      }),
      envLim,
      creerExecutionContextTest(),
    );
    expect(res429.status).toBe(429);
  });

  it("G16 : le déclencheur planifié `scheduled` exécute `purgerRetentionsD1` sur les 6 tables éphémères/90j sans altérer les données actives", async () => {
    const db = await reinitialiserBaseIdentite();
    const horloge = () => new Date("2026-11-18T08:00:00.000Z");
    const app = creerGestionnaireAcces({ fetchExterne: creerFetchSimule(), horloge });

    await creerSessionMoiDirecte(db, "tit_cron_1");

    const passeIso = "2026-11-18T07:00:00.000Z";
    const futurIso = "2026-11-19T08:00:00.000Z";

    await db.batch([
      db
        .prepare(
          `INSERT INTO demande_acces (id, empreinte_jeton, invitation_id, nom, numero_membre, section, courriel, cabinet, attestation_le, attestation_ver, cgu_ver, cree_le, expire_le, consomme_le)
         VALUES
          ('da_exp', 'h_da_exp', NULL, 'Expirée', '111111', 'Montréal', 'a@b.ca', NULL, ?1, 'v1', 'v1', ?1, ?1, NULL),
          ('da_ok', 'h_da_ok', NULL, 'Active', '222222', 'Montréal', 'c@b.ca', NULL, ?1, 'v1', 'v1', ?1, ?2, NULL)`,
        )
        .bind(passeIso, futurIso),

      db
        .prepare(
          `INSERT INTO invitation_acces (id, empreinte_code, courriel_cible, cohorte, cree_le, expire_le, consomme_le, titulaire_id)
         VALUES
          ('ia_exp', 'h_ia_exp', NULL, NULL, ?1, ?1, NULL, NULL),
          ('ia_ok', 'h_ia_ok', NULL, NULL, ?1, ?2, NULL, NULL)`,
        )
        .bind(passeIso, futurIso),

      db
        .prepare(
          `INSERT INTO code_oauth (id, titulaire_id, empreinte_code, client_id, redirect_uri, portee, defi_pkce, methode_pkce, cree_le, expire_le, consomme_le)
         VALUES
          ('co_exp', 'tit_cron_1', 'h_co_exp', 'claude-web', 'https://claude.ai/api/mcp/auth_callback', 'les_deux', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'S256', ?1, ?1, NULL),
          ('co_ok', 'tit_cron_1', 'h_co_ok', 'claude-web', 'https://claude.ai/api/mcp/auth_callback', 'les_deux', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'S256', ?1, ?2, NULL)`,
        )
        .bind(passeIso, futurIso),
    ]);

    await incrementerCompteurJourD1(db, {
      titulaireId: "tit_cron_1",
      jour: "2026-08-01",
      classe: "local",
    });
    await incrementerCompteurJourD1(db, {
      titulaireId: "tit_cron_1",
      jour: "2026-11-17",
      classe: "local",
    });
    await ecrireEvenementTechniqueD1(
      db,
      formaterEvenementTechnique({
        titulaireId: "tit_cron_1",
        jetonId: "jtn_1",
        service: "legislation",
        horodatage: new Date("2026-08-01T10:00:00.000Z"),
        outil: "get_article",
        classe: "local",
        issue: "ok",
      }),
    );
    await ecrireEvenementTechniqueD1(
      db,
      formaterEvenementTechnique({
        titulaireId: "tit_cron_1",
        jetonId: "jtn_1",
        service: "legislation",
        horodatage: new Date("2026-11-17T10:00:00.000Z"),
        outil: "get_article",
        classe: "local",
        issue: "ok",
      }),
    );

    const ctx = creerExecutionContextTest();
    await app.scheduled({} as ScheduledController, creerEnvTest(), ctx);
    await ctx.attendre();

    expect(
      (await db.prepare("SELECT id FROM demande_acces").all<{ id: string }>()).results.map(
        (r) => r.id,
      ),
    ).toEqual(["da_ok"]);
    expect(
      (await db.prepare("SELECT id FROM invitation_acces").all<{ id: string }>()).results.map(
        (r) => r.id,
      ),
    ).toEqual(["ia_ok"]);
    expect(
      (await db.prepare("SELECT id FROM code_oauth").all<{ id: string }>()).results.map(
        (r) => r.id,
      ),
    ).toEqual(["co_ok"]);
    expect(
      (await db.prepare("SELECT jour FROM compteur_jour").all<{ jour: string }>()).results.map(
        (r) => r.jour,
      ),
    ).toEqual(["2026-11-17"]);
    expect(
      (
        await db.prepare("SELECT minute FROM evenement_technique").all<{ minute: string }>()
      ).results.map((r) => r.minute),
    ).toEqual(["2026-11-17T10:00"]);

    for (const reqPurge of [
      "DELETE FROM evenement_technique WHERE minute < '2026-08-20T00:00'",
      "DELETE FROM compteur_jour WHERE jour < '2026-08-20'",
      "DELETE FROM demande_acces WHERE expire_le <= '2026-11-18T08:00:00.000Z'",
      "DELETE FROM session_portail WHERE expire_le <= '2026-11-18T08:00:00.000Z'",
      "DELETE FROM code_oauth WHERE expire_le <= '2026-11-18T08:00:00.000Z'",
    ]) {
      const plan = await db.prepare(`EXPLAIN QUERY PLAN ${reqPurge}`).all<{ detail: string }>();
      const resume = plan.results.map((p) => p.detail).join(" | ");
      expect(resume, reqPurge).toContain("SEARCH");
      expect(resume, reqPurge).not.toMatch(/\bSCAN\b/);
    }
  });

  it("gère la boucle locale CLI RFC 8252, les clients confidentiels Basic/RFC 6749 §2.3, le refus utilisateur et la suspension avant échange", async () => {
    const db = await reinitialiserBaseIdentite();
    const cookieMoi = await creerSessionMoiDirecte(db, "tit_oauth_cli");
    const app = creerGestionnaireAcces({ fetchExterne: creerFetchSimule() });
    const envTest = creerEnvTest();

    const secretConfidentiel = "secret+gemini%25enterprise_2026";
    await db
      .prepare(
        `INSERT INTO client_oauth (client_id, libelle, empreinte_secret, uris_redirection_json, portees_permises, actif, cree_le)
         VALUES ('gemini-enterprise-ws', 'Gemini Enterprise', ?1, '["https://vertexaisearch.cloud.google.com/oauth-redirect"]', 'les_deux legislation jurisprudence', 1, '2026-11-18T00:00:00.000Z')`,
      )
      .bind(await empreinte(secretConfidentiel))
      .run();

    const verifier = `${frapperJeton()}${frapperJeton().slice(0, 12)}`;
    const defi = await calculerDefiPkceS256(verifier);

    const resPort80 = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
          new URLSearchParams({
            response_type: "code",
            client_id: "cli-boucle-locale",
            redirect_uri: "http://127.0.0.1:80/callback",
            code_challenge: defi,
            code_challenge_method: "S256",
          }).toString(),
        { headers: { Cookie: cookieMoi } },
      ),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resPort80.status).toBe(400);

    const resIpv6Consent = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
          new URLSearchParams({
            response_type: "code",
            client_id: "cli-boucle-locale",
            redirect_uri: "http://[::1]:54321/callback",
            code_challenge: defi,
            code_challenge_method: "S256",
          }).toString(),
        { headers: { Cookie: cookieMoi } },
      ),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resIpv6Consent.status).toBe(200);
    const cspIpv6 = resIpv6Consent.headers.get("Content-Security-Policy") ?? "";
    expect(cspIpv6).toContain("form-action 'self' http:;");
    expect(cspIpv6).not.toContain("[::1]");

    const resCliConsent = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
          new URLSearchParams({
            response_type: "code",
            client_id: "cli-boucle-locale",
            redirect_uri: "http://127.0.0.1:54321/callback",
            code_challenge: defi,
            code_challenge_method: "S256",
            state: "s1",
          }).toString(),
        { headers: { Cookie: cookieMoi } },
      ),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resCliConsent.status).toBe(200);
    const consentCli = extraireJetonConsentementHtml(await resCliConsent.text());

    const resRefusUsager = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieMoi,
        },
        body: new URLSearchParams({
          jeton_consentement: consentCli,
          decision: "refuser",
          response_type: "code",
          client_id: "cli-boucle-locale",
          redirect_uri: "http://127.0.0.1:54321/callback",
          scope: "les_deux",
          code_challenge: defi,
          code_challenge_method: "S256",
          state: "s1",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRefusUsager.status).toBe(303);
    expect(resRefusUsager.headers.get("Location")).toBe(
      "http://127.0.0.1:54321/callback?error=access_denied&state=s1&iss=https%3A%2F%2Facces.poirierlavoie.ca",
    );

    const resConfGet = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
          new URLSearchParams({
            response_type: "code",
            client_id: "gemini-enterprise-ws",
            redirect_uri: "https://vertexaisearch.cloud.google.com/oauth-redirect",
            scope: "les_deux",
            code_challenge: defi,
            code_challenge_method: "S256",
          }).toString(),
        { headers: { Cookie: cookieMoi } },
      ),
      envTest,
      creerExecutionContextTest(),
    );
    const consentConf = extraireJetonConsentementHtml(await resConfGet.text());

    const resConfAutoriser = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieMoi,
        },
        body: new URLSearchParams({
          jeton_consentement: consentConf,
          decision: "autoriser",
          response_type: "code",
          client_id: "gemini-enterprise-ws",
          redirect_uri: "https://vertexaisearch.cloud.google.com/oauth-redirect",
          scope: "les_deux",
          code_challenge: defi,
          code_challenge_method: "S256",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resConfAutoriser.status).toBe(303);
    const codeConf = new URL(resConfAutoriser.headers.get("Location")!).searchParams.get("code")!;

    const resSecretSurPublic = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "claude-web",
          client_secret: "inattendu",
          code: codeConf,
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          code_verifier: verifier,
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resSecretSurPublic.status).toBe(401);

    const resSansSecret = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "gemini-enterprise-ws",
          code: codeConf,
          redirect_uri: "https://vertexaisearch.cloud.google.com/oauth-redirect",
          code_verifier: verifier,
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resSansSecret.status).toBe(401);

    const basicHeaderBrut = `Basic ${btoa(`gemini-enterprise-ws:${secretConfidentiel}`)}`;
    const resDoubleAuth = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: basicHeaderBrut,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_secret: secretConfidentiel,
          code: codeConf,
          redirect_uri: "https://vertexaisearch.cloud.google.com/oauth-redirect",
          code_verifier: verifier,
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resDoubleAuth.status).toBe(400);

    const resBasicOk = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: basicHeaderBrut,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: codeConf,
          redirect_uri: "https://vertexaisearch.cloud.google.com/oauth-redirect",
          code_verifier: verifier,
          resource: "https://legislation.poirierlavoie.ca/mcp/oauth",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resBasicOk.status).toBe(200);
    const jsonBasicOk = (await resBasicOk.json()) as { scope: string; access_token: string };
    expect(jsonBasicOk.scope).toBe("legislation");

    const resCodeResInconnue = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieMoi,
        },
        body: new URLSearchParams({
          jeton_consentement: consentConf,
          decision: "autoriser",
          response_type: "code",
          client_id: "gemini-enterprise-ws",
          redirect_uri: "https://vertexaisearch.cloud.google.com/oauth-redirect",
          scope: "les_deux",
          code_challenge: defi,
          code_challenge_method: "S256",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    const codeResInconnue = new URL(resCodeResInconnue.headers.get("Location")!).searchParams.get(
      "code",
    )!;
    const resTargetInvalide = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: basicHeaderBrut,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: codeResInconnue,
          redirect_uri: "https://vertexaisearch.cloud.google.com/oauth-redirect",
          code_verifier: verifier,
          resource: "https://inconnu.exemple.ca/mcp/oauth",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resTargetInvalide.status).toBe(400);
    expect(((await resTargetInvalide.json()) as { error: string }).error).toBe("invalid_target");

    const resCliSansState = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
          new URLSearchParams({
            response_type: "code",
            client_id: "cli-boucle-locale",
            redirect_uri: "http://127.0.0.1:54321/callback",
            code_challenge: defi,
            code_challenge_method: "S256",
          }).toString(),
        { headers: { Cookie: cookieMoi } },
      ),
      envTest,
      creerExecutionContextTest(),
    );
    const consentCliSansState = extraireJetonConsentementHtml(await resCliSansState.text());

    const resCodeAvantSusp = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieMoi,
        },
        body: new URLSearchParams({
          jeton_consentement: consentCliSansState,
          decision: "autoriser",
          response_type: "code",
          client_id: "cli-boucle-locale",
          redirect_uri: "http://127.0.0.1:54321/callback",
          scope: "les_deux",
          code_challenge: defi,
          code_challenge_method: "S256",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    const codeAvantSusp = new URL(resCodeAvantSusp.headers.get("Location")!).searchParams.get(
      "code",
    )!;
    await db.prepare("UPDATE titulaire SET etat = 'suspendu' WHERE id = 'tit_oauth_cli'").run();

    const resEchangeSuspendu = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "cli-boucle-locale",
          code: codeAvantSusp,
          redirect_uri: "http://127.0.0.1:54321/callback",
          code_verifier: verifier,
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resEchangeSuspendu.status).toBe(400);
  });

  it("exécute RFC 7591 POST /oauth/register sans état (public loopback /oauth-callback et confidentiels), rejette altérations et SSRF, et explique l'attente Bottin", async () => {
    const db = await reinitialiserBaseIdentite();
    const cookieMoi = await creerSessionMoiDirecte(db, "tit_oauth_dcr");
    const app = creerGestionnaireAcces({ fetchExterne: creerFetchSimule() });
    const envTest = creerEnvTest();

    const clientsAvant = (
      await db.prepare("SELECT COUNT(*) AS n FROM client_oauth").first<{ n: number }>()
    )?.n;

    const resSsrf = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["https://169.254.169.254/latest/meta-data"],
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resSsrf.status).toBe(400);
    expect(((await resSsrf.json()) as { error: string }).error).toBe("invalid_redirect_uri");

    const resBadGrant = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          grant_types: ["client_credentials"],
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resBadGrant.status).toBe(400);
    expect(((await resBadGrant.json()) as { error: string }).error).toBe("invalid_client_metadata");

    const resRegAntigravityRemote = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Antigravity Cloud",
          redirect_uris: ["https://antigravity.google.com/oauth/callback"],
          grant_types: ["authorization_code"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRegAntigravityRemote.status).toBe(201);
    const resRegPublic = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Antigravity IDE",
          redirect_uris: ["http://127.0.0.1:54321/oauth-callback"],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resRegPublic.status).toBe(201);
    const metaPublic = (await resRegPublic.json()) as {
      client_id: string;
      client_secret?: string;
      grant_types: string[];
      response_types: string[];
      token_endpoint_auth_method: string;
    };
    expect(metaPublic.client_id.startsWith("dcr1.")).toBe(true);
    expect(metaPublic.client_secret).toBeUndefined();
    expect(metaPublic.grant_types).toEqual(["authorization_code"]);
    expect(metaPublic.response_types).toEqual(["code"]);
    expect(metaPublic.token_endpoint_auth_method).toBe("none");

    const clientsApres = (
      await db.prepare("SELECT COUNT(*) AS n FROM client_oauth").first<{ n: number }>()
    )?.n;
    expect(clientsApres).toBe(clientsAvant);

    const verifier = `${frapperJeton()}${frapperJeton().slice(0, 12)}`;
    const defi = await calculerDefiPkceS256(verifier);

    const resAltere = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
          new URLSearchParams({
            response_type: "code",
            client_id: `${metaPublic.client_id.slice(0, -1)}${metaPublic.client_id.endsWith("0") ? "1" : "0"}`,
            redirect_uri: "http://127.0.0.1:54321/oauth-callback",
            code_challenge: defi,
            code_challenge_method: "S256",
          }).toString(),
        { headers: { Cookie: cookieMoi } },
      ),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resAltere.status).toBe(400);

    const urlAuthDcr =
      `https://acces.poirierlavoie.ca/oauth/authorize?` +
      new URLSearchParams({
        response_type: "code",
        client_id: metaPublic.client_id,
        redirect_uri: "http://127.0.0.1:54321/oauth-callback",
        scope: "les_deux",
        code_challenge: defi,
        code_challenge_method: "S256",
        state: "st_dcr",
      }).toString();

    const resGetDcr = await app.fetch(
      new Request(urlAuthDcr, { headers: { Cookie: cookieMoi } }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resGetDcr.status).toBe(200);
    const htmlDcr = await resGetDcr.text();
    expect(htmlDcr).toContain("Antigravity IDE");
    expect(htmlDcr).toContain("inscription dynamique OAuth 2.1 vérifiée");
    const consentDcr = extraireJetonConsentementHtml(htmlDcr);

    const resPostDcr = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieMoi,
        },
        body: new URLSearchParams({
          jeton_consentement: consentDcr,
          decision: "autoriser",
          response_type: "code",
          client_id: metaPublic.client_id,
          redirect_uri: "http://127.0.0.1:54321/oauth-callback",
          scope: "les_deux",
          code_challenge: defi,
          code_challenge_method: "S256",
          state: "st_dcr",
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resPostDcr.status).toBe(303);
    const codeDcr = new URL(resPostDcr.headers.get("Location")!).searchParams.get("code")!;

    const resTokenDcr = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: metaPublic.client_id,
          code: codeDcr,
          redirect_uri: "http://127.0.0.1:54321/oauth-callback",
          code_verifier: verifier,
        }).toString(),
      }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resTokenDcr.status).toBe(200);
    const jsonTokenDcr = (await resTokenDcr.json()) as { access_token: string; scope: string };
    expect(jsonTokenDcr.scope).toBe("tous");

    const depot = creerDepotJetonsD1(db);
    expect(
      (await resoudreJeton(depot, [jsonTokenDcr.access_token], { service: "legislation" }))
        ?.titulaireId,
    ).toBe("tit_oauth_dcr");
    expect(
      (await resoudreJeton(depot, [jsonTokenDcr.access_token], { service: "outils" }))?.titulaireId,
    ).toBe("tit_oauth_dcr");

    const jetonLigne = await db
      .prepare("SELECT libelle FROM jeton WHERE titulaire_id = 'tit_oauth_dcr' LIMIT 1")
      .first<{ libelle: string }>();
    expect(jetonLigne?.libelle).toContain("Antigravity IDE");
    expect(jetonLigne?.libelle).not.toContain("dcr1.");

    for (const methode of ["client_secret_post", "client_secret_basic"] as const) {
      const resRegConf = await app.fetch(
        new Request("https://acces.poirierlavoie.ca/oauth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_name: `Client ${methode}`,
            redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
            token_endpoint_auth_method: methode,
          }),
        }),
        envTest,
        creerExecutionContextTest(),
      );
      expect(resRegConf.status).toBe(201);
      const regConf = (await resRegConf.json()) as { client_id: string; client_secret: string };
      expect(regConf.client_secret.startsWith("dcrsec1.")).toBe(true);

      const urlAuthConf =
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
        new URLSearchParams({
          response_type: "code",
          client_id: regConf.client_id,
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          scope: "legislation",
          code_challenge: defi,
          code_challenge_method: "S256",
        }).toString();
      const consentConf = extraireJetonConsentementHtml(
        await (
          await app.fetch(
            new Request(urlAuthConf, { headers: { Cookie: cookieMoi } }),
            envTest,
            creerExecutionContextTest(),
          )
        ).text(),
      );
      const resAuthConf = await app.fetch(
        new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieMoi },
          body: new URLSearchParams({
            jeton_consentement: consentConf,
            decision: "autoriser",
            response_type: "code",
            client_id: regConf.client_id,
            redirect_uri: "https://claude.ai/api/mcp/auth_callback",
            scope: "legislation",
            code_challenge: defi,
            code_challenge_method: "S256",
          }).toString(),
        }),
        envTest,
        creerExecutionContextTest(),
      );
      const codeConf = new URL(resAuthConf.headers.get("Location")!).searchParams.get("code")!;

      const headersOk: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };
      const corpsOk: Record<string, string> = {
        grant_type: "authorization_code",
        code: codeConf,
        redirect_uri: "https://claude.ai/api/mcp/auth_callback",
        code_verifier: verifier,
      };
      if (methode === "client_secret_basic") {
        headersOk.Authorization = `Basic ${btoa(`${regConf.client_id}:${regConf.client_secret}`)}`;
      } else {
        corpsOk.client_id = regConf.client_id;
        corpsOk.client_secret = regConf.client_secret;
      }

      const resSansSec = await app.fetch(
        new Request("https://acces.poirierlavoie.ca/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: regConf.client_id,
            code: codeConf,
            redirect_uri: "https://claude.ai/api/mcp/auth_callback",
            code_verifier: verifier,
          }).toString(),
        }),
        envTest,
        creerExecutionContextTest(),
      );
      expect(resSansSec.status).toBe(401);

      const resConfOk = await app.fetch(
        new Request("https://acces.poirierlavoie.ca/oauth/token", {
          method: "POST",
          headers: headersOk,
          body: new URLSearchParams(corpsOk).toString(),
        }),
        envTest,
        creerExecutionContextTest(),
      );
      expect(resConfOk.status, methode).toBe(200);
    }

    await db.prepare("UPDATE titulaire SET etat = 'en_attente' WHERE id = 'tit_oauth_dcr'").run();
    const resAttente = await app.fetch(
      new Request(urlAuthDcr, { headers: { Cookie: cookieMoi } }),
      envTest,
      creerExecutionContextTest(),
    );
    expect(resAttente.status).toBe(403);
    const htmlAttente = await resAttente.text();
    expect(htmlAttente).toContain("Bottin des avocats");
    expect(htmlAttente).toContain("outils");
    expect(htmlAttente).not.toContain("demeure utilisable immédiatement");
  });

  it("prend en charge Claude OAuth 2.1 (CIMD SEP-3149, RFC 9207 iss, filtrage offline_access/OIDC, CORS et DCR grant_types)", async () => {
    const db = await reinitialiserBaseIdentite();
    const cookieMoi = await creerSessionMoiDirecte(db, "tit_oauth_claude");
    const claudeClientId = "https://claude.ai/oauth/client.json";
    const claudeRedirect = "https://claude.ai/api/mcp/auth_callback";
    const sansNoneClientId = "https://sans-none.exemple.org/oauth/client.json";

    const app = creerGestionnaireAcces({
      fetchExterne: creerFetchSimule({
        documentsCimd: {
          [claudeClientId]: {
            corps: {
              client_id: claudeClientId,
              client_name: "Claude",
              redirect_uris: [claudeRedirect],
              token_endpoint_auth_method: "private_key_jwt",
              token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
            },
          },
          [sansNoneClientId]: {
            corps: {
              client_id: sansNoneClientId,
              client_name: "Strict Private Key Only",
              redirect_uris: ["https://sans-none.exemple.org/callback"],
              token_endpoint_auth_method: "private_key_jwt",
              token_endpoint_auth_methods_supported: ["private_key_jwt"],
            },
          },
        },
      }),
    });
    const envClaude = creerEnvTest({
      ALLOWED_ORIGINS: "https://claude.ai,https://claude.com",
    });

    const verifier = `${frapperJeton()}${frapperJeton().slice(0, 10)}`;
    const defi = await calculerDefiPkceS256(verifier);

    const urlAuth =
      `https://acces.poirierlavoie.ca/oauth/authorize?` +
      new URLSearchParams({
        response_type: "code",
        client_id: claudeClientId,
        redirect_uri: claudeRedirect,
        scope: "legislation offline_access openid profile email",
        resource: "https://legislation.poirierlavoie.ca/mcp/oauth",
        code_challenge: defi,
        code_challenge_method: "S256",
        state: "cl_state_1",
      }).toString();

    const resGet = await app.fetch(
      new Request(urlAuth, { headers: { Cookie: cookieMoi } }),
      envClaude,
      creerExecutionContextTest(),
    );
    expect(resGet.status).toBe(200);
    const htmlConsent = await resGet.text();
    expect(htmlConsent).toContain("Claude");
    expect(htmlConsent).toContain("<code>legislation</code>");
    const jetonConsent = extraireJetonConsentementHtml(htmlConsent);

    const resPost = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieMoi },
        body: new URLSearchParams({
          jeton_consentement: jetonConsent,
          decision: "autoriser",
          response_type: "code",
          client_id: claudeClientId,
          redirect_uri: claudeRedirect,
          scope: "legislation",
          resource: "https://legislation.poirierlavoie.ca/mcp/oauth",
          code_challenge: defi,
          code_challenge_method: "S256",
          state: "cl_state_1",
        }).toString(),
      }),
      envClaude,
      creerExecutionContextTest(),
    );
    expect(resPost.status).toBe(303);
    const urlRappel = new URL(resPost.headers.get("Location")!);
    expect(`${urlRappel.origin}${urlRappel.pathname}`).toBe(claudeRedirect);
    expect(urlRappel.searchParams.get("iss")).toBe("https://acces.poirierlavoie.ca");
    expect(urlRappel.searchParams.get("state")).toBe("cl_state_1");
    const code = urlRappel.searchParams.get("code")!;

    const resToken = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://claude.ai",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: claudeClientId,
          code,
          redirect_uri: claudeRedirect,
          code_verifier: verifier,
          scope: "offline_access",
          resource: "https://legislation.poirierlavoie.ca/mcp/oauth",
        }).toString(),
      }),
      envClaude,
      creerExecutionContextTest(),
    );
    expect(resToken.status).toBe(200);
    expect(resToken.headers.get("Access-Control-Allow-Origin")).toBe("https://claude.ai");
    const tokenDoc = (await resToken.json()) as { access_token: string; scope: string };
    expect(tokenDoc.scope).toBe("legislation");
    expect(tokenDoc.access_token).toHaveLength(43);

    const resSansNone = await app.fetch(
      new Request(
        `https://acces.poirierlavoie.ca/oauth/authorize?` +
          new URLSearchParams({
            response_type: "code",
            client_id: sansNoneClientId,
            redirect_uri: "https://sans-none.exemple.org/callback",
            code_challenge: defi,
            code_challenge_method: "S256",
          }).toString(),
        { headers: { Cookie: cookieMoi } },
      ),
      envClaude,
      creerExecutionContextTest(),
    );
    expect(resSansNone.status).toBe(400);

    const resDcr = await app.fetch(
      new Request("https://acces.poirierlavoie.ca/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Claude DCR",
          redirect_uris: [claudeRedirect],
          token_endpoint_auth_method: "none",
          grant_types: [
            "authorization_code",
            "refresh_token",
            "urn:ietf:params:oauth:grant-type:jwt-bearer",
          ],
        }),
      }),
      envClaude,
      creerExecutionContextTest(),
    );
    expect(resDcr.status).toBe(201);
    const dcrDoc = (await resDcr.json()) as { grant_types: string[] };
    expect(dcrDoc.grant_types).toEqual(["authorization_code"]);
  });
});
