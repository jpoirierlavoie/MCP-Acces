/**
 * Point d'entrée du Worker `MCP-Acces` (`https://acces.poirierlavoie.ca`, `SPEC §4`, `§9`, `§10`) :
 * - pages publiques survivant au coupe-circuit `MCP_ENABLED` (`G22`) : `GET /`, `/cgu`,
 *   `/confidentialite`, `/attestation`, `/conformite` (`S20`/`G18`), `/gouverne` (`S20`) ;
 * - point de santé `/health` (`reponseSante`) ;
 * - admission préalable `/demande` et `/demande/confirmer` ;
 * - console libre-service `/moi` et `/moi/connexion` ;
 * - console d'exploitation `/exploitant` ;
 * - serveur d'autorisation OAuth 2.1 (`/.well-known/oauth-authorization-server`, `/oauth/register`,
 *   `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`) ;
 * - tâche planifiée quotidienne `scheduled` exécutant `purgerRetentionsD1` (`G16`).
 *
 * Aucune URL de requête ni aucun secret n'est jamais journalisé (`G9`).
 */

import {
  CHEMIN_SERVEUR_AUTORISATION,
  drapeau,
  purgerRetentionsD1,
  reponseSante,
  sansBarresFinales,
} from "@poirierlavoie/mcp-socle";
import { ORIGINE_PORTAIL_PAR_DEFAUT } from "./constantes";
import { repondrePageAccueil } from "./html/accueil";
import { estCheminGouvernance, repondreDocumentGouvernance } from "./html/gouvernance";
import { gererRouteConfirmationDemande, gererRouteDemande } from "./routes/demande";
import { gererRouteExploitant } from "./routes/exploitant";
import { gererRouteConnexionMoi, gererRouteMoi } from "./routes/moi";
import {
  gererDecouverteServeurAutorisation,
  gererRouteAuthorize,
  gererRouteRegister,
  gererRouteRevoke,
  gererRouteToken,
} from "./routes/oauth";
import { repondreMethodeNonPermise } from "./securite";
import type { ContextePortail, Env, OptionsGestionnaireAcces } from "./types";

function resoudreOriginePortail(env: Env): string {
  const brut = typeof env.ORIGINE_PORTAIL === "string" ? env.ORIGINE_PORTAIL.trim() : "";
  if (brut.startsWith("https://")) {
    try {
      const u = new URL(brut);
      if (u.protocol === "https:" && u.username === "" && u.password === "") {
        return sansBarresFinales(u.origin);
      }
    } catch {
      // Repli sur la constante canonique
    }
  }
  return ORIGINE_PORTAIL_PAR_DEFAUT;
}

function extraireIpClient(request: Request): string {
  const cfIp = request.headers.get("CF-Connecting-IP");
  return cfIp && cfIp.trim().length > 0 ? cfIp.trim() : "local";
}

const nonTrouve = () => new Response("Not found", { status: 404 });

export function creerGestionnaireAcces(options: OptionsGestionnaireAcces = {}) {
  const fetchExterne =
    options.fetchExterne ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const maintenant = options.horloge ?? (() => new Date());

  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(request.url);
      const { pathname } = url;

      // 1. Pages publiques qui survivent toujours au coupe-circuit `MCP_ENABLED` (`G22`)
      if (pathname === "/") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return repondreMethodeNonPermise(["GET", "HEAD"]);
        }
        return repondrePageAccueil(request.method);
      }

      if (estCheminGouvernance(pathname)) {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return repondreMethodeNonPermise(["GET", "HEAD"]);
        }
        return repondreDocumentGouvernance(pathname, request.method);
      }

      // 2. Coupe-circuit global fermé par défaut (`MCP_ENABLED !== "true"` => 404 partout ailleurs)
      const actif = drapeau(env.MCP_ENABLED, false);
      if (pathname === "/health") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return actif ? repondreMethodeNonPermise(["GET", "HEAD"]) : nonTrouve();
        }
        return reponseSante({ actif, commit: env.COMMIT });
      }

      if (!actif) {
        return nonTrouve();
      }

      const contexte: ContextePortail = {
        env,
        ctx,
        fetchExterne,
        maintenant,
        originePortail: resoudreOriginePortail(env),
        ipClient: extraireIpClient(request),
      };

      if (pathname === CHEMIN_SERVEUR_AUTORISATION) {
        return gererDecouverteServeurAutorisation(request, contexte);
      }
      if (pathname === "/demande") {
        return await gererRouteDemande(request, url, contexte);
      }
      if (pathname === "/demande/confirmer") {
        return await gererRouteConfirmationDemande(request, url, contexte);
      }
      if (pathname === "/moi") {
        return await gererRouteMoi(request, url, contexte);
      }
      if (pathname === "/moi/connexion") {
        return await gererRouteConnexionMoi(request, url, contexte);
      }
      if (pathname === "/exploitant") {
        return await gererRouteExploitant(request, url, contexte);
      }
      if (pathname === "/oauth/register") {
        return await gererRouteRegister(request, contexte);
      }
      if (pathname === "/oauth/authorize") {
        return await gererRouteAuthorize(request, url, contexte);
      }
      if (pathname === "/oauth/token") {
        return await gererRouteToken(request, contexte);
      }
      if (pathname === "/oauth/revoke") {
        return await gererRouteRevoke(request, contexte);
      }

      return nonTrouve();
    },

    async scheduled(
      _controller: ScheduledController,
      env: Env,
      ctx: ExecutionContext,
    ): Promise<void> {
      ctx.waitUntil(purgerRetentionsD1(env.DB_IDENTITE, maintenant()));
    },
  };
}

export default creerGestionnaireAcces();
