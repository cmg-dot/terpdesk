import { dayLabel } from "@/lib/billing/format";
import { formatCents, formatUnits } from "@/lib/billing/money";
import type { HcaBillingFields, PositionLedger } from "@/lib/billing/types";

/**
 * Apple Health: exactly what Kari types into ProviderOne for one interpreter, in the order she enters it. The SLICR report (the
 * state's backup attachment) is deliberately not here. STRICTLY AGENCY ONLY: holds PHI (client name, date of birth, WA #).
 */
export function ProviderOneCard({ serviceDate, hca, position }: { serviceDate: string; hca: HcaBillingFields; position: PositionLedger }) {
  const sum = (kinds: string[]) => position.bill.filter((l) => kinds.includes(l.kind)).reduce((n, l) => n + l.amountCents, 0);
  const miles = position.bill.find((l) => l.kind === "mileage");
  const travelHours = position.bill.filter((l) => l.kind === "travel" || l.kind === "travel_evening").reduce((n, l) => n + l.quantity, 0);
  const extras = [miles ? `${formatUnits(miles.quantity)} mi` : "", travelHours > 0 ? `${formatUnits(travelHours)} hr travel` : ""].filter(Boolean).join(" · ");
  const fields: [string, string][] = [
    ["Date", dayLabel(serviceDate, "MM/dd/yyyy")],
    ["Client name", hca.clientName || "—"],
    ["DOB", hca.dob || "—"],
    ["WA #", hca.providerOne || "—"],
    ["PA #", hca.priorAuth || "—"],
    ["Modifier", hca.modifier || "—"],
    ["Billed units", `${formatUnits(position.billedUnits)} (incl. +0.5 base)`],
    ["Mileage / travel", extras ? `${extras} · ${formatCents(sum(["mileage", "travel", "travel_evening"]))}` : "None"],
    ["Vendor fee", formatCents(sum(["vendor_fee"]))],
  ];
  const missing = [hca.clientName, hca.dob, hca.providerOne, hca.priorAuth, hca.modifier].some((v) => !v);
  return (
    <div className="rounded-xl border border-gray-200 bg-[#FBFAF7] p-4" data-providerone-card>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sage)]">ProviderOne entry</div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-[var(--sage)]">{label}</dt>
            <dd className="font-medium tabular-nums text-[var(--ink)]">{value}</dd>
          </div>
        ))}
      </dl>
      {missing && <p className="mt-2 text-xs text-amber-800">Some ProviderOne fields are empty: fill them in on the job&apos;s Staffing panel.</p>}
    </div>
  );
}
