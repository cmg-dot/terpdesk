import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { interpreters, requests, offers } from './schema';
import { desc, eq } from 'drizzle-orm';
import { databaseSslOptions } from './ssl';

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/terpdesk';

async function main() {
  console.log('Seeding offer...');
  const client = postgres(connectionString, { prepare: false, ssl: databaseSslOptions() });
  const db = drizzle(client);

  try {
    const interpreterRows = await db.select().from(interpreters).where(eq(interpreters.email, 'interpreter@example.com')).limit(1);
    const requestRows = await db.select().from(requests).orderBy(desc(requests.createdAt)).limit(1);

    if (!interpreterRows.length || !requestRows.length) {
      console.log('Could not find interpreter or request to seed offer.');
      return;
    }

    const [inserted] = await db.insert(offers).values({
      interpreterId: interpreterRows[0].id,
      requestId: requestRows[0].id,
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000), // expires in 24 hours
    }).returning();
    
    console.log('Successfully seeded offer.');
  } catch (error) {
    console.error('Error seeding offer (code: ' + ((error as { code?: string } | null)?.code ?? 'unknown') + ').');
  } finally {
    await client.end();
  }
}

main();
