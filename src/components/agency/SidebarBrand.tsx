import Image from "next/image";
import { HandHelping } from "lucide-react";
import { AGENCY_LOGO_SRC, DEFAULT_AGENCY_NAME } from "@/lib/agency";

/**
 * The top of the agency navigation. Both brands are rendered and CSS shows one (see .brand-default / .brand-asl in
 * themes.css), so picking a theme in Settings swaps the logo instantly, with no flash and no client state.
 *   dark  = the coloured desktop sidebar        light = the white mobile menu
 */
type Tone = "dark" | "light";

const TERPDESK_TEXT: Record<Tone, string> = { dark: "text-white", light: "text-[var(--forest)]" };

export const SidebarBrand = ({ tone }: { tone: Tone }) => (
  <>
    <div className="brand-default">
      <div className="mb-1 flex items-center gap-3">
        <Image src="/terpdesk-mark.png" alt="terpDESK Logo" width={32} height={32} className="h-8 w-8 rounded-full object-contain" priority />
        <span className={`text-[22px] font-semibold ${TERPDESK_TEXT[tone]}`}>terpDESK</span>
      </div>
      {tone === "dark" && <span className="text-[13px] text-[var(--sidebar-muted)]">{DEFAULT_AGENCY_NAME}</span>}
    </div>
    <div className="brand-asl">
      <AgencyLogo tone={tone} />
      {tone === "dark" && <span className="mt-1 block text-[12px] text-[var(--sidebar-muted)]">Powered by terpDESK</span>}
    </div>
  </>
);

const AgencyLogo = ({ tone }: { tone: Tone }) => {
  if (AGENCY_LOGO_SRC) {
    return <Image src={AGENCY_LOGO_SRC} alt={DEFAULT_AGENCY_NAME} width={176} height={40} className="h-10 w-auto object-contain object-left" priority />;
  }
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--badge-ink)]">
        <HandHelping className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className={`text-[19px] font-semibold leading-tight ${TERPDESK_TEXT[tone]}`}>{DEFAULT_AGENCY_NAME}</span>
    </div>
  );
};
