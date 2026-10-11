"use server";

import { db } from "@/db";
import { requests, RequestData } from "@/db/schema";
import { revalidatePath } from "next/cache";

interface CreateRequestPayload {
  title: string;
  startsAt: Date;
  endsAt: Date;
  data: RequestData;
}

export async function createRequest(payload: CreateRequestPayload) {
  const requestData: RequestData = {
    ...payload.data,
    startsAt: payload.startsAt.toISOString(),
    endsAt: payload.endsAt.toISOString(),
    details: {
      ...(payload.data?.details || {}),
      startsAt: payload.startsAt.toISOString(),
      endsAt: payload.endsAt.toISOString(),
    }
  };

  const [newRequest] = await db.insert(requests).values({
    title: payload.title,
    status: 'draft',
    createdAt: payload.startsAt,
    data: requestData
  }).returning({ id: requests.id });

  revalidatePath('/requests');
  revalidatePath('/dashboard');
  
  return newRequest.id;
}
