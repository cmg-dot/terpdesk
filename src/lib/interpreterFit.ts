/** How an interpreter fits a job's time (see checkInterpreterFit in app/actions/interpreterFit.ts). Safe to import from the browser. */

export type InterpreterFitStatus =
  | "available"
  | "unavailable"
  | "outside_hours"
  | "not_provided"
  | "not_shared";
