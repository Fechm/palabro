export interface Env {
  ASSETS: Fetcher;
  AI: Ai;

  ENVIRONMENT: string;

  // Secretos: wrangler secret put <NOMBRE> · en local, .env
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  INVITE_CODE?: string;
  GEMINI_MODEL?: string;
}

export interface Vars {
  userId: string;
}
