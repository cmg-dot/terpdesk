import { Lock } from "lucide-react";

/**
 * The line that opens the CEUs & renewals tab. Deliberately not the mint "Visible to your agency" banner the Credentials tab opens with:
 * a neutral surface, a lock, and the opposite promise, so the two tabs never read as the same kind of page.
 */
export function CeuPrivateBanner() {
  return (
    <p
      data-ceu-private=""
      className="flex items-start gap-2.5 rounded-2xl border border-l-4 border-[var(--banner-edge)] border-l-[var(--accent)] bg-[var(--surface)] px-4 py-3 text-[13px] leading-relaxed text-[var(--forest)]"
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold">Private to you. Agencies never see this.</span> Your renewal cycles and CEU log are not shared with any agency, are
        not part of your credentials, and work even if you have no agency yet. Please keep client names and patient details out of what you write here.
      </span>
    </p>
  );
}
