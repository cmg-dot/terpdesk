import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Mail, MapPin, Phone } from "lucide-react";
import { AvailabilitySection } from "@/components/interpreters/detail/AvailabilitySection";
import { SharedCredentialsSection } from "@/components/interpreters/detail/SharedCredentialsSection";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";
import { loadAgencyInterpreterView } from "@/lib/agencyInterpreterView";
import { requireRole } from "@/lib/auth/guards";
import { PROFILE_TIME_ZONES } from "@/lib/validation/interpreterProfile";

export const metadata = { title: "Interpreter | terpDESK" };
export const dynamic = "force-dynamic";

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1 border-b border-gray-100 py-3 last:border-b-0 sm:flex-row sm:justify-between sm:gap-6">
    <dt className="text-[14px] text-[var(--sage)]">{label}</dt>
    <dd className="text-[14px] font-medium text-[var(--ink)] sm:text-right">{children}</dd>
  </div>
);

const NOT_SET = <span className="text-gray-400">Not set</span>;

export default async function AgencyInterpreterPage({ params }: { params: { interpreterId: string } }) {
  // The middleware already limits /interpreters to agency staff; this is the server-side check for the data.
  await requireRole("agency");
  // Staff accounts have no agency of their own yet, so the workspace's single agency is used.
  const view = await loadAgencyInterpreterView(DEFAULT_AGENCY_ID, params.interpreterId);
  // Not on this agency's roster (or not a valid id): behave as if the page does not exist.
  if (!view) notFound();

  const zoneLabel = PROFILE_TIME_ZONES.find((z) => z.value === view.timeZone)?.label ?? view.timeZone;
  const formats = [view.takesInPerson && "In person", view.takesVirtual && "Virtual"].filter(Boolean).join(" · ");
  const location = [view.city, view.stateOrRegion].filter(Boolean).join(", ");

  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-6 p-6 pb-24 antialiased">
      <Link href="/interpreters" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--sage)] hover:text-[var(--ink)]">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to interpreters
      </Link>

      <section className="flex flex-col items-start gap-5 rounded-2xl border border-gray-200 bg-white p-6 sm:flex-row sm:items-center">
        <ProfileAvatar photoUrl={view.photoUrl} name={view.name} />
        <div className="min-w-0 space-y-1">
          <h1 className="text-[26px] font-semibold tracking-tight text-[var(--ink)]">{view.name}</h1>
          <p className="inline-flex items-center gap-1.5 text-[14px] text-gray-600">
            <MapPin className="h-4 w-4 text-gray-400" aria-hidden="true" />
            {location || "Location not set"}
          </p>
          <p className="text-[12px] text-gray-500">{view.isRegistered ? "Registered app user" : "Shadow / external profile"}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-lg font-semibold text-[var(--ink)]">How they work</h2>
        <dl>
          <Row label="Service area">{view.serviceArea || NOT_SET}</Row>
          <Row label="Time zone">{zoneLabel}</Row>
          <Row label="Formats">{formats || "Not taking work right now"}</Row>
        </dl>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="mb-2 text-lg font-semibold text-[var(--ink)]">Contact</h2>
        {view.contact ? (
          <dl>
            <Row label="Work email">
              {view.contact.workEmail ? (
                <a href={`mailto:${view.contact.workEmail}`} className="inline-flex items-center gap-1.5 hover:underline">
                  <Mail className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                  {view.contact.workEmail}
                </a>
              ) : (
                NOT_SET
              )}
            </Row>
            <Row label="Work phone">
              {view.contact.workPhone ? (
                <a href={`tel:${view.contact.workPhone}`} className="inline-flex items-center gap-1.5 hover:underline">
                  <Phone className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                  {view.contact.workPhone}
                </a>
              ) : (
                NOT_SET
              )}
            </Row>
          </dl>
        ) : (
          <p className="inline-flex items-start gap-2 rounded-xl bg-stone-50 px-4 py-3 text-[13px] text-gray-600">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
            This interpreter keeps their contact details private. Reach them through job offers and the details on file
            for dispatch.
          </p>
        )}
      </section>

      <SharedCredentialsSection credentials={view.credentials} />

      <AvailabilitySection days={view.days} sharesAvailability={view.sharesAvailability} timeZoneLabel={zoneLabel} />
    </div>
  );
}
