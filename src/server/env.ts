export interface Env {
  ASSETS: Fetcher;
  AI: Ai;

  ENVIRONMENT: string;

  // Secretos: wrangler secret put <NOMBRE> · en local, .dev.vars
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
}

export interface Vars {
  userId: string;
}
