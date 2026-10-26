import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { termsAndConditions } from "@/lib/legal/termsAndConditions";

export const metadata: Metadata = {
  title: "Terms & Conditions | terpDESK",
  description: "The terms that govern access to and use of terpDESK.",
};

/** Public page (no sign-in): /terms is not under any role-protected path. */
export default function TermsPage() {
  return <LegalPage document={termsAndConditions} current="terms" />;
}
