import type { PositionId } from "@/lib/positions";
import { buildVerificationPdfData } from "@/lib/verificationPdf/build";
import { loadVerificationFacts } from "@/lib/verificationPdf/load";
import { renderVerificationPdf } from "@/lib/verificationPdf/render";

export type VerificationPdfOutcome = { ok: true; bytes: Uint8Array } | { ok: false; reason: "not_found" | "signature_unavailable" };

/**
 * The Independent Contractor Invoice for one position of one non-state job, as PDF bytes. The caller must already have checked
 * that the viewer is agency staff: this does no authorization. SERVER ONLY.
 */
export async function generateVerificationPdf(requestId: string, position: PositionId): Promise<VerificationPdfOutcome> {
  const loaded = await loadVerificationFacts(requestId, position);
  if (!loaded.ok) return loaded;
  return { ok: true, bytes: await renderVerificationPdf(buildVerificationPdfData(loaded.facts)) };
}
