import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { CONTACT_VISIBILITY_OPTIONS, PROFILE_TIME_ZONES } from "@/lib/validation/interpreterProfile";
import type { MyProfile } from "@/lib/validation/interpreterProfile";

const NOT_SET = <span className="text-gray-400">Not set</span>;

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-2xl border border-gray-200 bg-white p-6">
    <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">{title}</h2>
    <dl>{children}</dl>
  </section>
);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1 border-b border-gray-100 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
    <dt className="shrink-0 text-[14px] text-[var(--sage)]">{label}</dt>
    <dd className="text-[14px] font-medium text-[var(--ink)] sm:text-right break-words">{children}</dd>
  </div>
);

const zoneLabel = (value: string): string => PROFILE_TIME_ZONES.find((z) => z.value === value)?.label ?? value;

const workModes = (p: MyProfile): string => {
  if (p.takesInPerson && p.takesVirtual) return "In person and virtual";
  if (p.takesInPerson) return "In person only";
  if (p.takesVirtual) return "Virtual only";
  return "Not taking work right now";
};

/** Read-only "Overview" of the interpreter's profile. */
export const ProfileOverviewView = ({ profile }: { profile: MyProfile }) => {
  const displayName = profile.preferredName || profile.fullName;

  return (
    <div className="space-y-6">
      <section className="flex flex-col items-start gap-5 rounded-2xl border border-gray-200 bg-white p-6 sm:flex-row sm:items-center">
        <ProfileAvatar photoUrl={profile.photoUrl} name={displayName} />
        <div className="min-w-0 space-y-1">
          <h2 className="text-[22px] font-semibold text-[var(--ink)]">{displayName || "Your name"}</h2>
          {profile.preferredName && profile.fullName && profile.preferredName !== profile.fullName && (
            <p className="text-[13px] text-[var(--sage)]">Account name: {profile.fullName}</p>
          )}
          <p className="text-[14px] text-gray-600">
            {[profile.city, profile.stateOrRegion].filter(Boolean).join(", ") || "Location not set"}
          </p>
        </div>
      </section>

      <Section title="About you">
        <Row label="Preferred name">{profile.preferredName || NOT_SET}</Row>
        <Row label="Sign-in email">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
            {profile.signInEmail}
          </span>
        </Row>
        <Row label="Short bio">
          {profile.shortBio ? <span className="block whitespace-pre-line sm:text-left">{profile.shortBio}</span> : NOT_SET}
        </Row>
      </Section>

      <Section title="Where and how you work">
        <Row label="City">{profile.city || NOT_SET}</Row>
        <Row label="State or region">{profile.stateOrRegion || NOT_SET}</Row>
        <Row label="Service area">{profile.serviceArea || NOT_SET}</Row>
        <Row label="Time zone">{zoneLabel(profile.timeZone)}</Row>
        <Row label="Takes work">{workModes(profile)}</Row>
      </Section>

      <Section title="Contact details">
        <Row label="Work email">{profile.workEmail || NOT_SET}</Row>
        <Row label="Work phone">{profile.workPhone || NOT_SET}</Row>
        <Row label="Who can see these details">
          {CONTACT_VISIBILITY_OPTIONS.find((o) => o.value === profile.contactVisibility)?.label ?? "Only me"}
        </Row>
      </Section>
    </div>
  );
};
