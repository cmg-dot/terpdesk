import { isOdhhProgram, isStateProgram } from "@/lib/stateJob";
import type { BillingCategory } from "@/lib/billing/types";

/** Who a job is billed to, and the words the screens use for it. Pure. */

export const CATEGORY_LABEL: Record<BillingCategory, string> = {
  state: "State (ODHH)",
  hca: "Apple Health (HCA)",
  non_state: "Non-state",
};

/** State and Apple Health share the rules: interpreter's own (State or King County) rate, 1.5-hour minimum, 1.5x first hour, $75 vendor fee. */
export const isStateRules = (category: BillingCategory): boolean => category !== "non_state";

/**
 * ODHH -> State; Apple Health -> HCA; anything else is Non-state, unless the request is flagged as a state job with no program on it
 * (older ODHH jobs), which stays State.
 */
export function billingCategoryOf(source: { program?: string | null; isStateJob?: boolean | null }): BillingCategory {
  if (isOdhhProgram(source.program)) return "state";
  if (isStateProgram(source.program)) return "hca";
  return source.isStateJob === true ? "state" : "non_state";
}
