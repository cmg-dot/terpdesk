import Link from "next/link";
import { ArrowRight, CalendarClock, Building2, IdCard } from "lucide-react";

interface Step {
  key: "calendar" | "profile" | "agencies";
  title: string;
  text: string;
  href: string;
  cta: string;
  Icon: typeof CalendarClock;
}

/** What an interpreter can do before (or between) agency work. Every line describes something the app does today. */
export const STANDALONE_STEPS: readonly Step[] = [
  {
    key: "calendar",
    title: "Set your availability",
    text: "Add the hours you usually work, and block time for your own jobs as private busy time. An agency job that overlaps blocked time cannot be accepted, and agencies never see why you are busy.",
    href: "/interpreter-calendar",
    cta: "Open calendar",
    Icon: CalendarClock,
  },
  {
    key: "profile",
    title: "Complete your profile and credentials",
    text: "List your certifications and liability insurance, with files if you like. Home reminds you 30 days before an insurance policy expires.",
    href: "/profile",
    cta: "Open My Profile",
    Icon: IdCard,
  },
  {
    key: "agencies",
    title: "Connect with an agency",
    text: "Ask an agency for its join code. Nothing is shared until the agency approves your request, and each agency sees only its own work with you.",
    href: "/agencies",
    cta: "Open Agencies",
    Icon: Building2,
  },
];

interface StandaloneStepsProps {
  /** Leave out "Connect with an agency" for someone who already is connected. */
  connected: boolean;
  /** A tighter layout for use inside an empty list. */
  compact?: boolean;
}

/** The suggested next steps, as links. Used on Home, on Jobs and on Mileage when there is nothing from an agency to show. */
export function StandaloneSteps({ connected, compact = false }: StandaloneStepsProps) {
  const steps = STANDALONE_STEPS.filter((step) => !(connected && step.key === "agencies"));
  return (
    <ul data-standalone-steps="" className={`grid gap-3 ${compact ? "" : "md:grid-cols-3"}`}>
      {steps.map(({ key, title, text, href, cta, Icon }) => (
        <li key={key} className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--tint-ink)]">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <h3 className="min-w-0 text-[14px] font-semibold text-[var(--ink)]">{title}</h3>
          </div>
          <p className="mt-2 flex-1 text-[13px] leading-relaxed text-[var(--sage)]">{text}</p>
          <Link href={href} className="mt-3 inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-[var(--forest)] hover:underline">
            {cta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
