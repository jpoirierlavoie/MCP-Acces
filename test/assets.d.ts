declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "*.json?raw" {
  const content: string;
  export default content;
}

declare module "*.jsonc?raw" {
  const content: string;
  export default content;
}

declare module "*.sql?raw" {
  const content: string;
  export default content;
}

declare module "*.toml?raw" {
  const content: string;
  export default content;
}

declare module "*.ts?raw" {
  const content: string;
  export default content;
}

declare module "*LICENSE?raw" {
  const content: string;
  export default content;
}

interface ImportMeta {
  readonly glob: <T = unknown>(
    pattern: string | string[],
    options?: { query?: string; import?: string; eager?: boolean },
  ) => Record<string, T>;
}

declare namespace Cloudflare {
  interface Env {
    DB_IDENTITE: D1Database;
  }
}
