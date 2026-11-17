/** The two /billing states that have no ledger: switched off (production until sign-off) and not set up on this database. */

const CARD = "mt-6 rounded-2xl border border-gray-200 bg-white p-6";

export const BillingDeferred = () => (
  <div className="mx-auto max-w-[1200px] space-y-6 p-6 pb-24 antialiased">
    <div className={CARD}>
      <h2 className="mb-3 text-lg font-semibold text-[var(--ink)]">This workflow is deferred</h2>
      <p className="max-w-4xl text-[15px] leading-relaxed text-gray-600">
        This connected workspace supports appointments, offers, acceptance and private busy time. Billing, integrations and other workflows are not connected. The original demo remains available through the standard demo build.
      </p>
    </div>
  </div>
);

export const BillingNotReady = () => (
  <div className="mx-auto max-w-[1200px] space-y-6 p-6 pb-24 antialiased">
    <div className={CARD}>
      <h2 className="mb-3 text-lg font-semibold text-[var(--ink)]">Billing is not set up yet</h2>
      <p className="max-w-3xl text-[15px] leading-relaxed text-gray-600">
        This database does not have the billing tables yet. Once the billing update (0013) is applied, payroll, invoicing and the rates and rules appear here.
      </p>
    </div>
  </div>
);
