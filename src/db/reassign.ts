import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { interpreters, offers } from './schema';
import { eq } from 'drizzle-orm';
import { databaseSslOptions } from './ssl';

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/terpdesk';

async function main() {
  console.log('Reassigning interpreter email...');
  const client = postgres(connectionString, { prepare: false, ssl: databaseSslOptions() });
  const db = drizzle(client);

  try {
    const updated = await db.update(interpreters)
      .set({ email: 'dale.fictional@example.com' })
      .where(eq(interpreters.email, 'interpreter@example.com'))
      .returning();

    if (updated.length) {
      console.log('Successfully updated interpreter email.');
    } else {
      console.log('No interpreter found with email interpreter@example.com (may already be updated).');
    }
  } catch (error) {
    console.error('Error reassigning interpreter (code: ' + ((error as { code?: string } | null)?.code ?? 'unknown') + ').');
  } finally {
    await client.end();
  }
}

main();
