import { BrandMark } from "@/components/brand/BrandMark";
import type { BrandTone } from "@/components/brand/BrandMark";

/** The wordmark's colour: white on a dark sidebar, the fixed brand forest on light surfaces (light text under Dark Mode, themes.css). */
const WORDMARK: Record<BrandTone, string> = { onDark: "text-white", onLight: "brand-wordmark-light text-[#0B3B32]" };

interface BrandLockupProps {
  tone: BrandTone;
  /** False for the owl alone (icon-only). */
  wordmark?: boolean;
  /** The mark's size, e.g. "h-8 w-8". */
  markClassName: string;
  /** The wordmark's size and weight, e.g. "text-[22px] font-semibold". */
  textClassName?: string;
  className?: string;
}

/** terpDESK's brand: the owl mark, with the "terpDESK" wordmark beside it unless `wordmark` is false. */
export const BrandLockup = ({ tone, wordmark = true, markClassName, textClassName = "text-[22px] font-semibold", className = "" }: BrandLockupProps) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <BrandMark tone={tone} className={markClassName} />
    {wordmark && <span className={`${textClassName} ${WORDMARK[tone]}`}>terpDESK</span>}
  </div>
);
