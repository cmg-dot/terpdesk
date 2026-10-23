import { defineConfig } from "drizzle-kit";
import { databaseSslOptions } from "./src/db/ssl";

/**
 * drizzle-kit only accepts a TLS options object together with host fields (not with a plain `url`), so DATABASE_URL
 * is split into its parts here. The connection uses the same TLS policy as the app (src/db/ssl.ts): encrypted, with
 * the server certificate verified.
 */
function credentialsFromUrl(raw: string | undefined) {
  if (!raw) throw new Error("DATABASE_URL is not set.");
  const url = new URL(raw.trim().replace(/^["']|["']$/g, ""));
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    ssl: databaseSslOptions(),
  };
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: credentialsFromUrl(process.env.DATABASE_URL),
  out: "./src/db/migrations",
});
