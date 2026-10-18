import { Building2, Landmark, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ClientType } from "@/lib/validation/client";

interface BannerCopy {
  title: (name: string) => string;
  description: (name: string) => string;
  icon: LucideIcon;
  /** Tailwind classes for the box; state agencies keep the green treatment. */
  tone: string;
}

const NEUTRAL = "bg-[#F9F8F6] border border-[#EBE8DF] text-gray-700";
const STATE = "bg-[#E6F4EA]/80 border border-[#CEEAD6] text-[#137333]";

const COPY: Record<ClientType, BannerCopy> = {
  state_agency: {
    title: (n) => `State Agency Assignment · ${n}`,
    description: (n) =>
      `This assignment is requested through ${n}. State guidelines, authorized travel time tracking, and specific verification rules apply.`,
    icon: Landmark,
    tone: STATE,
  },
  private_hospital: {
    title: (n) => `Healthcare Assignment · ${n}`,
    description: (n) => `This assignment is requested through ${n}. Standard billing rates and direct facility procedures apply.`,
    icon: Building2,
    tone: NEUTRAL,
  },
  organization: {
    title: (n) => `Corporate/Organization Assignment · ${n}`,
    description: (n) => `This assignment is requested by ${n}. Standard agency billing procedures apply.`,
    icon: Building2,
    tone: NEUTRAL,
  },
  individual: {
    title: (n) => `Private/Individual Assignment · ${n}`,
    description: (n) =>
      `This assignment is requested directly by ${n}. Review private payment or specialized billing terms if applicable.`,
    icon: User,
    tone: NEUTRAL,
  },
};

/** Informational box under "Overview": wording and icon follow the client's type and name. */
export const ClientAssignmentBanner = ({ clientType, clientName }: { clientType: ClientType; clientName?: string | null }) => {
  const name = clientName?.trim() || "Unknown Client";
  const copy = COPY[clientType];
  const Icon = copy.icon;

  return (
    <div className={`mt-2 rounded-xl p-4 text-xs flex items-start gap-3 ${copy.tone}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5 opacity-80" aria-hidden="true" />
      <div className="leading-relaxed">
        <span className="font-semibold block mb-0.5 text-[13px]">{copy.title(name)}</span>
        <p className="text-[13px] opacity-90">{copy.description(name)}</p>
      </div>
    </div>
  );
};
