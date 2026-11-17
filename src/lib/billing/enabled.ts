import { IS_DEMO_MODE } from "@/lib/demoMode";

/**
 * Whether /billing (and the approved-travel field in Hours review) is switched on. On the demo deployment it always is; production
 * turns it on with NEXT_PUBLIC_BILLING_ENABLED=true only once 0013_billing.sql is applied there and Kari and Josie have signed off.
 * A literal process.env read, so Next inlines it into the browser bundle. Pure.
 */
export const BILLING_ENABLED = IS_DEMO_MODE || process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";
