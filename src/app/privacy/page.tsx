import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { privacyPolicy } from "@/lib/legal/privacyPolicy";

export const metadata: Metadata = {
  title: "Privacy Policy | terpDESK",
  description: "How terpDESK collects, uses, discloses, and retains personal information.",
};

/** Public page (no sign-in): /privacy is not under any role-protected path. */
export default function PrivacyPage() {
  return <LegalPage document={privacyPolicy} current="privacy" />;
}
