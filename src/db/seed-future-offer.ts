import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { interpreters, requests, offers } from './schema';
import { eq } from 'drizzle-orm';
import { databaseSslOptions } from './ssl';

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/terpdesk';

async function main() {
  console.log('Seeding future offer...');
  const client = postgres(connectionString, { prepare: false, ssl: databaseSslOptions() });
  const db = drizzle(client);

  try {
    const interpreterRows = await db.select().from(interpreters).where(eq(interpreters.email, 'dale.fictional@example.com')).limit(1);
    
    if (!interpreterRows.length) {
      console.log('Could not find the seed interpreter.');
      return;
    }

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);

    // Create a new request in the future
    const [newRequest] = await db.insert(requests).values({
      title: 'Future Medical Appointment',
      status: 'draft',
      createdAt: futureDate,
      updatedAt: futureDate,
      data: { brief: {}, intake: { program: 'General' } }
    }).returning();

    // Create a pending offer for it
    const [inserted] = await db.insert(offers).values({
      interpreterId: interpreterRows[0].id,
      requestId: newRequest.id,
      status: 'pending',
      expiresAt: new Date(futureDate.getTime() - 86400000), // expires 1 day before
    }).returning();
    
    console.log('Successfully seeded future offer.');
  } catch (error) {
    console.error('Error seeding offer (code: ' + ((error as { code?: string } | null)?.code ?? 'unknown') + ').');
  } finally {
    await client.end();
  }
}

main();
