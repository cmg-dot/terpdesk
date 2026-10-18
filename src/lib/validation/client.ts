import { z } from "zod";
import { clientTypeValues } from "@/db/schema";
import type { ClientType } from "@/db/schema";

export type { ClientType };

/** Accepts exactly the four canonical client types. */
export const clientTypeSchema = z.enum(clientTypeValues);

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  organization: "Organization",
  individual: "Individual",
  state_agency: "State Agency",
  private_hospital: "Private Hospital",
};

/** Dropdown options in display order. */
export const CLIENT_TYPE_OPTIONS: { value: ClientType; label: string }[] = clientTypeValues.map((value) => ({
  value,
  label: CLIENT_TYPE_LABELS[value],
}));

export const clientTypeFromLabel = (label: string): ClientType =>
  CLIENT_TYPE_OPTIONS.find((o) => o.label === label)?.value ?? "organization";

/**
 * Maps whatever is stored (including the legacy free-text values "Organization", "Individual" and
 * "Individual requesting service") to a canonical type. Reads always go through this, so old rows keep
 * working without a data migration.
 */
export const normalizeClientType = (raw: unknown): ClientType => {
  const text = typeof raw === "string" ? raw.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  if ((clientTypeValues as readonly string[]).includes(text)) return text as ClientType;
  if (text.includes("individual")) return "individual";
  if (text.includes("state")) return "state_agency";
  if (text.includes("hospital")) return "private_hospital";
  return "organization";
};

export type BadgeTone = "blue" | "purple" | "green" | "amber";

export const CLIENT_TYPE_TONES: Record<ClientType, BadgeTone> = {
  organization: "blue",
  individual: "purple",
  state_agency: "green",
  private_hospital: "amber",
};

/** A state agency client (or one named for ODHH) routes new requests into the ODHH state-job workflow. */
export const isStateAgencyClient = (client: { name?: string | null; type?: unknown }): boolean =>
  normalizeClientType(client.type) === "state_agency" || /odhh/i.test(client.name ?? "");
