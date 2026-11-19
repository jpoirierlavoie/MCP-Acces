/**
 * Épreuve en direct d'une clé API CanLII (`GET caseBrowse/fr/`) avec expurgation systématique
 * des messages d'erreur (`G9`) et ouverture en fermeture stricte sans retour du clair (`G8`, `G10`).
 */

import {
  type AnneauMaitresCoffre,
  expurger,
  type LigneCoffre,
  ouvrirCoffre,
  sansBarresFinales,
} from "@poirierlavoie/mcp-socle";
import { CANLII_BASE_URL_PAR_DEFAUT, USAGE_COFFRE_CANLII } from "./constantes";
import { lireOctetsBornes } from "./securite";

const MAX_OCTETS_REPONSE_CANLII = 524_288;

export type ResultatEpreuveCanlii =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly categorie: "refusee" | "indisponible" | "coffre_invalide";
      readonly messagePublic: string;
    };

export interface OptionsEpreuveCanlii {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

/**
 * Éprouve en direct une clé API CanLII contre `GET <baseUrl>/caseBrowse/fr/?api_key=...`.
 *
 * Aucune URL ni clé n'est jamais journalisée ; tout message d'exception est filtré par `expurger()`.
 */
export async function eprouverClefCanliiEnDirect(
  clefBrute: string,
  options: OptionsEpreuveCanlii = {},
): Promise<ResultatEpreuveCanlii> {
  const clef = clefBrute.trim();
  if (clef.length < 8 || clef.length > 256) {
    return {
      ok: false,
      categorie: "refusee",
      messagePublic: "Format de clé API CanLII invalide.",
    };
  }

  const base = sansBarresFinales((options.baseUrl ?? CANLII_BASE_URL_PAR_DEFAUT).trim());
  const url = `${base}/caseBrowse/fr/?api_key=${encodeURIComponent(clef)}`;
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  try {
    const res = await fetchFn(url, {
      method: "GET",
      // `workerd` ne prend en charge que `"follow"` et `"manual"` ; `"manual"` empêche toute redirection de fuiter `?api_key=`.
      redirect: "manual",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (
      String(res.type) === "opaqueredirect" ||
      res.redirected ||
      (res.status >= 300 && res.status < 400)
    ) {
      await res.body?.cancel().catch(() => undefined);
      return {
        ok: false,
        categorie: "indisponible",
        messagePublic: `L'API CanLII a renvoyé une redirection HTTP inattendue (statut ${res.status || "3xx"}) qui a été refusée.`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel().catch(() => undefined);
      return {
        ok: false,
        categorie: "refusee",
        messagePublic:
          "La clé API CanLII fournie a été refusée par CanLII (statut 401/403). Vérifiez que la clé est active.",
      };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return {
        ok: false,
        categorie: "indisponible",
        messagePublic: `L'API CanLII n'a pas pu valider la clé pour le moment (statut HTTP ${res.status}). Réessayez ultérieurement.`,
      };
    }

    const lecture = await lireOctetsBornes(res.body, MAX_OCTETS_REPONSE_CANLII);
    if (!lecture.ok) {
      return {
        ok: false,
        categorie: "indisponible",
        messagePublic: "Réponse trop volumineuse ou interrompue reçue lors de l'épreuve CanLII.",
      };
    }

    const texte = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      lecture.octets,
    );
    const json = JSON.parse(texte) as Record<string, unknown>;
    if (
      typeof json !== "object" ||
      json === null ||
      !Object.hasOwn(json, "caseDatabases") ||
      !Array.isArray(json.caseDatabases)
    ) {
      return {
        ok: false,
        categorie: "indisponible",
        messagePublic: "Réponse inattendue reçue lors de l'épreuve CanLII.",
      };
    }

    return { ok: true };
  } catch (err) {
    const detailBrut = err instanceof Error ? err.message : String(err);
    const detailSain = expurger(detailBrut, [clef]);
    return {
      ok: false,
      categorie: "indisponible",
      messagePublic: `Échec de communication avec l'API CanLII (${detailSain.slice(0, 120)}).`,
    };
  }
}

/**
 * Éprouve une entrée déjà scellée en base (`demande_acces` ou `coffre_clef`) via `ouvrirCoffre`
 * afin que la clé en clair ne quitte jamais la fermeture interne (`G8`, `G10`).
 */
export async function eprouverEntreeScelleeCanlii(
  titulaireId: string,
  entree: LigneCoffre | null | undefined,
  maitres: AnneauMaitresCoffre,
  options: OptionsEpreuveCanlii = {},
): Promise<ResultatEpreuveCanlii> {
  const ouverture = await ouvrirCoffre(
    {
      titulaireId,
      usage: USAGE_COFFRE_CANLII,
      entree,
      maitres,
    },
    async (clair) => await eprouverClefCanliiEnDirect(clair, options),
  );

  if (!ouverture.ok) {
    if (ouverture.motif === "REFUSEE") {
      return {
        ok: false,
        categorie: "refusee",
        messagePublic: "La clé enregistrée au coffre est marquée comme refusée.",
      };
    }
    return {
      ok: false,
      categorie: "coffre_invalide",
      messagePublic: "Aucune clé valide n'a pu être ouverte depuis le coffre chiffré.",
    };
  }

  return ouverture.client;
}
