"use server";

import { requireRole } from "@/lib/auth/guards";
import { logActivity } from "@/lib/requestActivity";
import { db } from "@/db";
import { requests, RequestData } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { isStateProgram } from "@/lib/stateJob";
import { normalizeRequestData } from "@/lib/requestData";

interface CreateRequestPayload {
  title: string;
  startsAt: Date | string;
  endsAt: Date | string;
  data: RequestData;
}

export async function createRequest(payload: CreateRequestPayload) {
  const session = await requireRole("agency");
  // Never taken from the client: a job is a state job exactly when its funding program is ODHH or Apple Health.
  const isStateJob = isStateProgram(payload.data?.intake?.program);
  const startsAtIso = typeof payload.startsAt === 'string' ? payload.startsAt : payload.startsAt.toISOString();
  const endsAtIso = typeof payload.endsAt === 'string' ? payload.endsAt : payload.endsAt.toISOString();

  if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
    throw new Error("The end time must be after the start time.");
  }

  const requestData = normalizeRequestData(payload.data, startsAtIso, endsAtIso);

  const [newRequest] = await db.insert(requests).values({
    title: payload.title,
    status: 'draft',
    isStateJob,
    createdAt: new Date(startsAtIso),
    data: requestData
  }).returning({ id: requests.id });

  await logActivity({ requestId: newRequest.id, kind: "created", audience: "shared", message: "Request created", actorLabel: session.user.name ?? "Agency staff" });

  revalidatePath('/requests');
  revalidatePath('/clients');
  revalidatePath('/dashboard');
  revalidatePath('/calendar');
  revalidatePath('/jobs');
  revalidatePath('/interpreter-home');
  revalidatePath('/interpreter-calendar');
  
  return newRequest.id;
}
