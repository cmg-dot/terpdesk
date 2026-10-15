"use server";

import { db } from "@/db";
import { interpreters } from "@/db/schema";
import { asc } from "drizzle-orm";

export async function getInterpreters() {
  return await db.select().from(interpreters).orderBy(asc(interpreters.name));
}


