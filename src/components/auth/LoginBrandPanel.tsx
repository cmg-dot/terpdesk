import { Logo } from "@/components/logo";
import { TerpMascot } from "@/components/auth/TerpMascot";
import { MascotSpeechBubble } from "@/components/auth/MascotSpeechBubble";
import { LoginMobileMascot } from "@/components/auth/LoginMobileMascot";

export const LOGIN_HEADLINE = "Your interpreting business. One place.";

/** The left half of the sign-in page on wide screens: logo, headline, the portal's one-line pitch and the owl rising from the corner. */
export const LoginBrandPanel = ({ copy }: { copy: string }) => (
  <aside className="relative hidden overflow-hidden bg-[var(--surface)] lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgb(var(--mint-rgb))_0%,transparent_55%)]" />
    <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -left-40 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgb(var(--mint-edge-rgb)/0.5)_0%,transparent_65%)]" />

    <div className="relative z-10 px-12 pt-10 xl:px-16">
      <div className="w-fit">
        <Logo />
      </div>
    </div>

    <div className="relative z-10 mt-14 max-w-xl px-12 xl:mt-20 xl:px-16">
      <p className="text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--forest)] xl:text-5xl">
        Your interpreting business.
        <br />
        <span className="text-[var(--ink)]">One place.</span>
      </p>
      <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--tint-ink)]">{copy}</p>
    </div>

    {/* Only the bottom 8% of the owl dips below the panel, so the tablet's label stays in view even at the low point of its float. */}
    <div className="pointer-events-none absolute bottom-0 left-12 z-20 w-[280px] translate-y-[8%] xl:left-16 xl:w-[330px]">
      <TerpMascot className="h-auto w-full drop-shadow-[0_18px_24px_rgba(11,59,50,0.18)]" />
      {/* Beside the owl's head, where its pointing wing aims; clear of the headline above. */}
      <MascotSpeechBubble layout="panel" />
    </div>
  </aside>
);

/** Phones and narrow windows: a compact logo and the owl peeking over the top of the sign-in card (its bubble beside it). */
export const LoginMobileBrand = () => (
  <div className="flex flex-col items-center text-center lg:hidden">
    <Logo />
    <p className="mt-1 text-sm text-slate-700">{LOGIN_HEADLINE}</p>
    <LoginMobileMascot />
  </div>
);
