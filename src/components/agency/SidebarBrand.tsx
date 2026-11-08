import Image from "next/image";
import { AGENCY_LOGO_SRC, DEFAULT_AGENCY_NAME } from "@/lib/agency";

/**
 * The brand at the top of the agency navigation. Both brands are rendered and CSS shows one (see .brand-default /
 * .brand-asl in themes.css), so picking a theme in Settings swaps them instantly, with no flash and no client state.
 *   BrandCard      ASL Professionals on the desktop sidebar: a compact ivory card holding the logo, label beneath
 *   TerpdeskBrand  the default theme's mark and name (desktop sidebar, `dark`, or mobile menu, `light`)
 *   MobileBrand    both, for the cream mobile menu header
 */
type Tone = "dark" | "light";

const TERPDESK_TEXT: Record<Tone, string> = { dark: "text-white", light: "text-[var(--forest)]" };

/** The official artwork is plum on transparent, so it always sits on a light surface. Height is capped, width follows the ratio. */
const AgencyLogoImage = () => (
  <Image src={AGENCY_LOGO_SRC} alt={DEFAULT_AGENCY_NAME} width={907} height={314} className="h-9 max-h-9 w-auto object-contain" priority />
);

/** On the cream mobile header. */
const PoweredBy = () => <span className="mt-1 block text-[9px] font-semibold uppercase tracking-wider text-slate-500">Powered by terpDESK</span>;

/**
 * Desktop sidebar, ASL Professionals theme. A compact rounded ivory card holds ONLY the logo, inset by the same 16px as the
 * navigation links so the two line up; "Powered by terpDESK" is centred beneath it, directly on the plum. The card's ivory is
 * fixed on purpose: it is the logo's backing (the artwork is plum), so it stays light whatever the page tokens are.
 */
export const BrandCard = () => (
  <div className="brand-asl px-4 pt-5">
    <div className="flex justify-center rounded-lg bg-[#F9F6F0] px-3 py-2">
      <AgencyLogoImage />
    </div>
    <span className="block pb-1 pt-2 text-center text-[9px] font-medium uppercase tracking-wider text-white/50">Powered by terpDESK</span>
  </div>
);

export const TerpdeskBrand = ({ tone }: { tone: Tone }) => (
  <div className="brand-default">
    <div className="mb-1 flex items-center gap-3">
      <Image src="/terpdesk-mark.png" alt="terpDESK Logo" width={32} height={32} className="h-8 w-8 rounded-full object-contain" priority />
      <span className={`text-[22px] font-semibold ${TERPDESK_TEXT[tone]}`}>terpDESK</span>
    </div>
    {tone === "dark" && <span className="text-[13px] text-[var(--sidebar-muted)]">{DEFAULT_AGENCY_NAME}</span>}
  </div>
);

/** The mobile menu's header already sits on the cream page, so the logo is drawn directly, with the same label. */
export const MobileBrand = () => (
  <>
    <TerpdeskBrand tone="light" />
    <div className="brand-asl">
      <AgencyLogoImage />
      <PoweredBy />
    </div>
  </>
);
