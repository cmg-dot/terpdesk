"use server";

import { db } from "@/db";
import { requests, offers, interpreters } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

function resolveRequestTimes(row: { createdAt: Date; data: any }) {
  const rowData = (row.data as any) || {};
  const startsAt = rowData.startsAt || row.createdAt.toISOString();
  let endsAt = rowData.endsAt || rowData.details?.endsAt;

  if (!endsAt && rowData.details?.endDate && rowData.details?.endTime) {
    try {
      endsAt = new Date(`${rowData.details.endDate}T${rowData.details.endTime}`).toISOString();
    } catch (e) {}
  }

  if (!endsAt) {
    endsAt = new Date(new Date(startsAt).getTime() + 3600000).toISOString();
  }

  return { startsAt, endsAt };
}

export async function fetchLiveRequests() {
  const dbRows = await db.select().from(requests).orderBy(desc(requests.createdAt));
  const allOffers = await db.select({
    id: offers.id,
    requestId: offers.requestId,
    interpreterId: offers.interpreterId,
    interpreterName: interpreters.name,
    status: offers.status,
    expiresAt: offers.expiresAt
  })
  .from(offers)
  .leftJoin(interpreters, eq(offers.interpreterId, interpreters.id));
  
  return dbRows.map(row => {
    const requestOffers = allOffers.filter(o => o.requestId === row.id);
    const hasAcceptedOffer = requestOffers.some(o => o.status === 'accepted');
    const { startsAt, endsAt } = resolveRequestTimes(row);
    
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      data: row.data,
      timestamp: row.createdAt.getTime(),
      dateString: row.createdAt.toLocaleDateString(),
      requester: row.data?.requester || { org: row.data?.intake?.program || "General" },
      details: row.data?.details || { format: "Virtual", timeZone: "America/Los_Angeles" },
      onsite: row.data?.onsite || { venue: "No location specified" },
      overview: row.data?.overview,
      prepNotes: row.data?.prepNotes,
      privateNotes: row.data?.privateNotes,
      startsAt,
      endsAt,
      slots: [],
      offers: requestOffers,
      hasAcceptedOffer,
      travelStartTime: row.travelStartTime ? row.travelStartTime.toISOString() : null,
      travelEndTime: row.travelEndTime ? row.travelEndTime.toISOString() : null,
      serviceCompleted: row.serviceCompleted,
      canceledAt: row.canceledAt ? row.canceledAt.toISOString() : null,
      cancelReason: row.cancelReason
    };
  });
}

export async function fetchLiveRequestById(id: string) {
  const dbRows = await db.select().from(requests).where(eq(requests.id, id));
  if (!dbRows || dbRows.length === 0) return null;
  const row = dbRows[0];
  
  const requestOffers = await db.select({
    id: offers.id,
    interpreterId: offers.interpreterId,
    interpreterName: interpreters.name,
    state: offers.status,
    expiresAt: offers.expiresAt
  })
  .from(offers)
  .leftJoin(interpreters, eq(offers.interpreterId, interpreters.id))
  .where(eq(offers.requestId, id));

  const mappedOffers = requestOffers.map(o => ({
    id: o.id,
    interpreterId: o.interpreterId,
    interpreterName: o.interpreterName || 'Unknown Interpreter',
    state: o.state,
    expiresAt: o.expiresAt.toISOString()
  }));

  const { startsAt, endsAt } = resolveRequestTimes(row);

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    data: row.data,
    travelStartTime: row.travelStartTime ? row.travelStartTime.toISOString() : null,
    travelEndTime: row.travelEndTime ? row.travelEndTime.toISOString() : null,
    serviceCompleted: row.serviceCompleted,
    timestamp: row.createdAt.getTime(),
    dateString: row.createdAt.toLocaleDateString(),
    requester: row.data?.requester || { org: row.data?.intake?.program || "General" },
    details: row.data?.details || { format: "Virtual", timeZone: "America/Los_Angeles" },
    onsite: row.data?.onsite || { venue: "No location specified" },
    overview: row.data?.overview,
    prepNotes: row.data?.prepNotes,
    privateNotes: row.data?.privateNotes,
    startsAt,
    endsAt,
    slots: [],
    offers: mappedOffers,
    canceledAt: row.canceledAt ? row.canceledAt.toISOString() : null,
    cancelReason: row.cancelReason
  };
}
