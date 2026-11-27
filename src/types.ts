import type { BaseD1Minimale, Limiteur } from "@poirierlavoie/mcp-socle";

export interface Env {
  DB_IDENTITE: D1Database & BaseD1Minimale;
  COURRIEL?: SendEmail;
  RL_DEMANDE_IP?: Limiteur;
  RL_OAUTH_IP?: Limiteur;

  COFFRE_MAITRE_V1?: string;
  COFFRE_MAITRE_V2?: string;
  CONSOLE_TOKEN?: string;
  EVALUATION_TOKEN?: string;

  MCP_ENABLED?: string;
  MODE_ADMISSION?: string;
  ORIGINE_PORTAIL?: string;
  EXPEDITEUR_COURRIEL?: string;
  CANLII_BASE_URL?: string;
  COMMIT?: string;
  ALLOWED_ORIGINS?: string;
}

export interface OptionsGestionnaireAcces {
  fetchExterne?: typeof fetch;
  horloge?: () => Date;
}

export interface ContextePortail {
  readonly env: Env;
  readonly ctx: ExecutionContext;
  readonly fetchExterne: typeof fetch;
  readonly maintenant: () => Date;
  readonly originePortail: string;
  readonly ipClient: string;
}
