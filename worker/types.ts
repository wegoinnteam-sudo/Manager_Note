// Cloudflare Worker environment bindings & secrets.
// Non-secret values come from wrangler.toml [vars]; secrets are set via
// `wrangler secret put <NAME>` and never committed.

export interface Env {
  // Bindings
  DB: D1Database;
  ASSETS: Fetcher;
  BACKUP_BUCKET: R2Bucket;

  // Non-secret config (wrangler.toml [vars])
  ENABLE_R2_BACKUP: string; // "true" | "false"
  MAX_UPLOAD_MB: string;
  DEMO_MODE: string; // "true" | "false"
  GOOGLE_DRIVE_FOLDER_ID: string;
  GOOGLE_DRIVE_SHARED_DRIVE_ID: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_ALLOWED_EMAILS: string; // comma-separated, who may log in at all
  GOOGLE_INITIAL_ADMIN_EMAILS: string; // comma-separated, promoted to admin on first login
  GOOGLE_OAUTH_CLIENT_ID: string;
  OAUTH_REDIRECT_BASE_URL: string; // e.g. https://handoff.example.com (no trailing slash)

  // Secrets (wrangler secret put)
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REFRESH_TOKEN?: string;
  SESSION_SECRET?: string;
}

export type Role = "admin" | "editor" | "viewer";

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
}

export interface AppVariables {
  user: AuthedUser | null;
  teamId: string;
}

export type AppBindings = { Bindings: Env; Variables: AppVariables };
