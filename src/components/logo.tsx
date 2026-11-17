import { BrandLockup } from '@/components/brand/BrandLockup';

/** terpDESK's logo on light pages (sign-in, register, legal, job details): the owl and the "terpDESK" wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className || ''}`} role="img" aria-label="terpDESK">
      <BrandLockup
        tone="onLight"
        markClassName="h-9 w-9 lg:h-10 lg:w-10"
        textClassName="text-[26px] lg:text-[28px] font-bold tracking-tight"
        className="gap-2.5"
      />
    </div>
  );
}
