import "dotenv/config";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { users, userRoleValues } from './schema';

/**
 * Creates (or updates the password of) one login account. Credentials come from the environment so no
 * password is ever written into the repo:
 *   SEED_USER_EMAIL, SEED_USER_PASSWORD (min 10 chars), SEED_USER_NAME, SEED_USER_ROLE=agency|interpreter
 */
const envSchema = z.object({
  SEED_USER_EMAIL: z.string().trim().toLowerCase().email(),
  SEED_USER_PASSWORD: z.string().min(10),
  SEED_USER_NAME: z.string().trim().min(1),
  SEED_USER_ROLE: z.enum(userRoleValues),
});

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/terpdesk';

async function main() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Missing or invalid SEED_USER_* variables:', parsed.error.issues.map((i) => i.path.join('.')).join(', '));
    process.exitCode = 1;
    return;
  }
  const { SEED_USER_EMAIL: email, SEED_USER_PASSWORD: password, SEED_USER_NAME: name, SEED_USER_ROLE: role } = parsed.data;

  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client);
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await db
      .insert(users)
      .values({ email, passwordHash, name, role, accountStatus: 'approved' })
      .onConflictDoUpdate({ target: users.email, set: { passwordHash, name, role, accountStatus: 'approved', updatedAt: new Date() } });
    console.log(`Saved ${role} account.`);
  } finally {
    await client.end();
  }
}

main();
