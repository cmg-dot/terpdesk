"use server";

import { db } from "@/db";
import { requests, offers, interpreters } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function fetchInterpreterOffers(interpreterEmail: string = 'interpreter@example.com') {
  // Find interpreter by email
  const interpreterRows = await db.select().from(interpreters).where(eq(interpreters.email, interpreterEmail));
  if (!interpreterRows.length) return [];
  const interpreter = interpreterRows[0];

  // Join offers with requests
  const offersData = await db.select({
    offer: offers,
    request: requests,
  })
  .from(offers)
  .innerJoin(requests, eq(offers.requestId, requests.id))
  .where(eq(offers.interpreterId, interpreter.id));

  return offersData.map(row => {
    const rowData = (row.request.data as any) || {};
    const startsAt = rowData.startsAt || row.request.createdAt.toISOString();
    let endsAt = rowData.endsAt || rowData.details?.endsAt;

    if (!endsAt && rowData.details?.endDate && rowData.details?.endTime) {
      try {
        endsAt = new Date(`${rowData.details.endDate}T${rowData.details.endTime}`).toISOString();
      } catch (e) {}
    }

    if (!endsAt) {
      endsAt = new Date(new Date(startsAt).getTime() + 3600000).toISOString();
    }

    return {
      id: row.offer.id,
      requestId: row.request.id,
      title: row.request.title,
      startsAt,
      endsAt,
      status: row.offer.status,
      requestStatus: row.request.status,
      agencyName: "Fictional Agency", // Placeholder
      interpreterId: row.offer.interpreterId,
      program: rowData?.intake?.program || "General",
      timeZone: rowData?.details?.timeZone || "America/Los_Angeles",
      hoursSubmission: rowData?.hoursSubmission || null,
      travelStartTime: row.request.travelStartTime ? row.request.travelStartTime.toISOString() : null,
      travelEndTime: row.request.travelEndTime ? row.request.travelEndTime.toISOString() : null,
      serviceCompleted: row.request.serviceCompleted,
    };
  });
}
