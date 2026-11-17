import { OwlLogo } from "@/components/brand/OwlLogo";

/**
 * Where the mark sits. "onDark": a dark sidebar (forest, ocean, dark), where the owl's forest body would vanish, so it sits on a
 * cream circle (fixed, like a logo's backing, whatever the theme). "onLight": a light surface, the owl drawn bare; under Dark Mode
 * the page itself is dark, so themes.css gives it the same cream circle there (.brand-mark-bare).
 */
export type BrandTone = "onDark" | "onLight";

/** The terpDESK owl mark. `className` sets its size (e.g. "h-8 w-8"). Decorative: the wordmark or the page names terpDESK. */
export const BrandMark = ({ tone, className = "" }: { tone: BrandTone; className?: string }) => (
  <span
    className={`inline-flex shrink-0 items-center justify-center ${tone === "onDark" ? "rounded-full bg-[#FAF9F5]" : "brand-mark-bare"} ${className}`}
    data-brand-mark={tone}
  >
    {/* On the circle the owl is 82% of the mark's own size (a percentage padding would follow the parent's width instead). */}
    <OwlLogo className={tone === "onDark" ? "h-[82%] w-[82%]" : "h-full w-full"} />
  </span>
);
