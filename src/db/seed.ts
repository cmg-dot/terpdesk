import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { interpreters } from './schema';

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/terpdesk';

async function main() {
  console.log('Seeding database...');
  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client);

  try {
    const [inserted] = await db.insert(interpreters).values({
      name: 'Test Interpreter',
      email: 'interpreter@example.com',
      phone: '555-0101',
    }).returning();
    
    console.log('Successfully seeded interpreter.');
  } catch (error) {
    console.error('Error seeding data (code: ' + ((error as { code?: string } | null)?.code ?? 'unknown') + ').');
  } finally {
    await client.end();
  }
}

main();
