/**
 * State jobs (ODHH / HCA): interpreters submit hours in the state portal, so TerpDesk must never email them a
 * timesheet link. The explicit `requests.is_state_job` flag is the source of truth; an ODHH funding program on
 * older requests (created before the flag existed) is treated the same way so they cannot slip through.
 */
interface StateJobSource {
  isStateJob?: boolean | null;
  data?: unknown;
}

/** The funding programs that make a job a state job (ODHH and HCA / Apple Health). */
export const isStateProgram = (program: string | null | undefined): boolean =>
  program === "WA ODHH" || program === "wa_odhh" || program === "WA Apple Health" || program === "wa_apple_health";

export const isStateJobRequest = (row: StateJobSource): boolean => {
  if (row.isStateJob === true) return true;
  return isStateProgram((row.data as { intake?: { program?: string } } | null | undefined)?.intake?.program);
};

export const STATE_JOB_BADGE_TEXT = "State Job: Hours managed via ODHH";
