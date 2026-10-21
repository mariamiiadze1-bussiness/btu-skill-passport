// Server-side environment variables (see .env.example).
declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL?: string;
    ADMIN_EMAIL?: string;
    ADMIN_PASSWORD?: string;
    SEED_STUDENT_PASSWORD?: string;
    PGLITE_DIR?: string;
    ALLOWED_EMAIL_DOMAIN?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    APP_URL?: string;
    ISSUER_PRIVATE_KEY?: string;
    ISSUER_DID?: string;
    ANCHOR_PROVIDER?: string;
    ANCHOR_CHAIN?: string;
    ANCHOR_RPC_URL?: string;
    REGISTRY_SOURCE?: string;
    GOOGLE_SHEETS_SPREADSHEET_ID?: string;
    GOOGLE_SHEETS_TAB?: string;
    GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
    EMAIL_DOMAIN_REWRITE?: string;
    SYNC_WEBHOOK_SECRET?: string;
    CRON_SECRET?: string;
    VERCEL?: string;
    NODE_ENV?: string;
  }
}
