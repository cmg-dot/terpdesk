import "dotenv/config";
import { backfillAppointmentNotes } from "@/lib/appointmentNoteBackfill";

/**
 * Restores the Appointment Note of the DSHS jobs the old rule left blank (see src/lib/appointmentNoteBackfill.ts).
 *
 *   npx tsx scripts/backfill-appointment-notes.ts                       rehearsal on the six jobs: changes nothing
 *   npx tsx scripts/backfill-appointment-notes.ts 202787804 202787802   rehearsal on the jobs named
 *   npx tsx scripts/backfill-appointment-notes.ts --apply --confirm-db=<database name>
 *
 * It runs against the database in DATABASE_URL and prints that database's NAME first. Writing needs both --apply and the name typed
 * back with --confirm-db, so a wrong DATABASE_URL cannot be written to by accident. Only blank preparation notes are filled.
 */

const DEFAULT_SRNS = ["202787802", "202787803", "202787804", "202787805", "202787807", "202787811"];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const confirm = args.find((a) => a.startsWith("--confirm-db="))?.slice("--confirm-db=".length);
  const named = args.filter((a) => /^\d{6,12}$/.test(a));
  const srns = named.length > 0 ? named : DEFAULT_SRNS;
  const databaseName = new URL((process.env.DATABASE_URL ?? "").trim().replace(/^["']|["']$/g, "")).pathname.replace(/^\//, "");
  console.log(`Database: ${databaseName}`);
  if (apply && confirm !== databaseName) {
    console.error(`Refusing to write: pass --confirm-db=${databaseName} to confirm this is the database you mean.`);
    process.exit(1);
  }
  console.log(apply ? "Mode: APPLY (changes are saved)" : "Mode: rehearsal (every change is rolled back)");
  for (const row of await backfillAppointmentNotes(srns, apply)) console.log(`${row.srn}: ${row.outcome}`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Backfill failed:", error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
