import Image from "next/image";
import { AGENCY_LOGO_SRC, DEFAULT_AGENCY_NAME } from "@/lib/agency";

/**
 * The brand at the top of the agency navigation. Both brands are rendered and CSS shows one (see .brand-default /
 * .brand-asl in themes.css), so picking a theme in Settings swaps them instantly, with no flash and no client state.
 *   BrandBanner    ASL Professionals on the desktop sidebar: a full-bleed light header strip the logo sits in
 *   TerpdeskBrand  the default theme's mark and name (desktop sidebar, `dark`, or mobile menu, `light`)
 *   MobileBrand    both, for the cream mobile menu header
 */
type Tone = "dark" | "light";

const TERPDESK_TEXT: Record<Tone, string> = { dark: "text-white", light: "text-[var(--forest)]" };

/** The official artwork is plum on transparent, so it always sits on a light surface. Height is capped, width follows the ratio. */
const AgencyLogoImage = () => (
  <Image src={AGENCY_LOGO_SRC} alt={DEFAULT_AGENCY_NAME} width={907} height={314} className="h-9 max-h-9 w-auto object-contain" priority />
);

const PoweredBy = () => <span className="mt-1 block text-[9px] font-semibold uppercase tracking-wider text-slate-500">Powered by terpDESK</span>;

/**
 * Desktop sidebar, ASL Professionals theme: an edge-to-edge ivory strip across the very top of the sidebar (outside its
 * padded content), closed by a faint gold rule where the plum navigation begins. The light colours are fixed on purpose:
 * this strip is the logo's backing, so it stays light whatever the page tokens are.
 */
export const BrandBanner = () => (
  <div className="brand-asl w-full border-b border-[#D4AF37]/25 bg-[#F9F6F0] px-4 py-3">
    <AgencyLogoImage />
    <PoweredBy />
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
