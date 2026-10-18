"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { interpreters } from "@/db/schema";
import { asc } from "drizzle-orm";

export async function getInterpreters() {
  await requireRole("agency");
  return await db.select().from(interpreters).orderBy(asc(interpreters.name));
}


