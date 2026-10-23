import { rootCertificates } from "node:tls";
import { RDS_GLOBAL_CA_BUNDLE } from "./certs/rdsCaBundle";

/**
 * TLS policy for every PostgreSQL connection (the app, drizzle-kit and the db scripts).
 *
 * The connection is always encrypted AND the server certificate is always verified (`rejectUnauthorized: true`,
 * including the hostname check), so traffic can be neither read nor redirected to an impostor. Passed as an explicit
 * object, it overrides any `sslmode` written in DATABASE_URL, so the URL cannot weaken it.
 *
 * Trusted authorities: Node's built-in public roots, the Amazon RDS roots (RDS certificates are not in Node's list),
 * and optionally DATABASE_CA_CERT (a PEM, for a provider with its own CA; "\n" escapes are accepted).
 *
 * Only for a local database without TLS: DATABASE_SSL=disable, which is ignored when NODE_ENV is "production"
 * (that includes every Vercel deployment, previews too).
 */

export interface DatabaseSslOptions {
  rejectUnauthorized: true;
  ca: string[];
}

export function databaseSslOptions(): DatabaseSslOptions | false {
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction && process.env.DATABASE_SSL?.trim().toLowerCase() === "disable") return false;

  const extra = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
  return {
    rejectUnauthorized: true,
    ca: [...rootCertificates, RDS_GLOBAL_CA_BUNDLE, ...(extra ? [extra] : [])],
  };
}
