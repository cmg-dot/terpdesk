import Image from "next/image";
import { AGENCY_LOGO_SRC, DEFAULT_AGENCY_NAME } from "@/lib/agency";

/**
 * The top of the agency navigation. Both brands are rendered and CSS shows one (see .brand-default / .brand-asl in
 * themes.css), so picking a theme in Settings swaps the logo instantly, with no flash and no client state.
 *   dark  = the coloured desktop sidebar        light = the cream mobile menu
 */
type Tone = "dark" | "light";

const TERPDESK_TEXT: Record<Tone, string> = { dark: "text-white", light: "text-[var(--forest)]" };
const SUBTITLE: Record<Tone, string> = { dark: "text-white/50", light: "text-[var(--sage)]" };

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
      <span className={`mt-2 block text-[10px] uppercase tracking-wider ${SUBTITLE[tone]}`}>Powered by terpDESK</span>
    </div>
  </>
);

/**
 * The official artwork is plum on a transparent background: on the plum sidebar it would disappear, so there it sits on a
 * snug ivory card (the theme's cream) with a faint gold edge and a soft shadow, rather than a stark white sticker. On the
 * cream mobile menu it is drawn directly. Height is fixed and width follows the artwork's ratio.
 */
const DARK_CARD = "inline-block rounded-lg border border-amber-200/40 bg-[var(--canvas)] px-2.5 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.25)]";
const AgencyLogo = ({ tone }: { tone: Tone }) => (
  <div className={tone === "dark" ? DARK_CARD : ""}>
    <Image src={AGENCY_LOGO_SRC} alt={DEFAULT_AGENCY_NAME} width={907} height={314} className="h-9 w-auto object-contain" priority />
  </div>
);
