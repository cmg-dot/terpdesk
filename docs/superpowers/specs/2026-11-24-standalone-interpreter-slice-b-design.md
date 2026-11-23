# Standalone Interpreter Mode, Slice B: personal jobs, `/my-work`, conflict check

Status: **approved decisions below; B0 (extractions), B1 (table, helpers, actions) and B3 (conflict check) done; B2 (UI and export) next.** Slice A (empty states and getting-started guidance, no schema change) shipped as `3bc175a`.

## Intent

Any interpreter login, whether linked to ASL Professionals with outside direct work or an independent interpreter with no agency, can log their own jobs, see hours and round-trip miles, and export a CSV. Agency offers, acceptance and auto-book must respect that time. The existing single-agency data model stays as is. Multi-agency discovery and linking wait until after `0013_billing.sql` and the marketing landing page.

## Goals, non-goals, anti-goals

- Goals: personal job log (date, time, setting, break, round-trip miles); hours and mileage totals; CSV export; personal jobs block agency offers and auto-book through the existing conflict check; read-only personal-job blocks on the interpreter Calendar.
- Non-goals: rates, earnings, payer, invoices, payroll, free-text notes, multi-agency linking.
- Anti-goals: any change to `requests`, `offers`, `timesheets`, billing tables or `0013_billing.sql`; any PHI in logs, email or agency views; a deploy that blocks every offer because a table is missing.

## Decisions (approved)

1. `td_conflict`, `ensureAvailabilityTables` and `resolveInterpreterIds` move out of `"use server"` into plain `lib/availability/*` modules, closing the public action exposure. Done in B0.
2. Optional `label varchar(80)` with a clear "No client names" hint. It is excluded from audit logs, email and every agency view (an agency only ever sees "unavailable").
3. Calendar integration is read-only: distinct personal-job blocks plus an "Add a personal job" link to `/my-work`. `ConnectedAvailability` is not changed (apart from its import lines in B0).
4. B0 first, as its own pure-extraction commit.

## B0 (done): what was extracted

`src/app/actions/availability.ts` (959 lines) is gone. A `"use server"` file can only export async functions and every export is a public endpoint, so the split is:

| New file | Holds |
|---|---|
| `lib/availability/ids.ts` | `isUuid`, `resolveInterpreterIds` (plain server code) |
| `lib/availability/ensureTables.ts` | `ensureAvailabilityTables` and its runtime DDL (plain server code) |
| `lib/availability/conflict.ts` | `td_conflict` (plain server code; B3 adds the personal-jobs query here) |
| `lib/availability/types.ts` | `AvailabilityRuleInput`, `AvailabilityExceptionInput` |
| `lib/interpreterFit.ts` | the `InterpreterFitStatus` type |
| `app/actions/availabilityRules.ts` | `td_save_availability`, `td_update_interpreter_timezone` |
| `app/actions/busyBlocks.ts` | `td_save_busy`, `td_delete_busy` |
| `app/actions/availabilityView.ts` | `td_availability_view`, `td_toggle_share` |
| `app/actions/interpreterFit.ts` | `checkInterpreterFit`, `getInterpretersFitForJob` (agency only) |

`interpreter-calendar/page.tsx` (648 lines) became a 100-line layout over `hooks/useInterpreterCalendar.ts`, `lib/interpreterCalendar.ts` (pure helpers) and `components/calendar/interpreter/{CalendarMonthView,CalendarWeekView,CalendarDayView}.tsx`. `connected/availability.tsx` (933 lines) is deliberately left whole; a later split is optional.

Proof of neutrality: 34 characterization tests (`tests/availability/characterization.test.ts`) were written against the original file and passed unchanged on the new modules; the original and new calendar pages were compared in a real browser (identical markup in Month, Week and Day at 1280 and 390 px).

## B1: migration `0014_personal_jobs.sql` (additive, idempotent, demo database first)

```
interpreter_personal_jobs
  id uuid pk default gen_random_uuid()
  interpreter_id uuid not null references interpreters(id) on delete cascade
  label varchar(80) null              -- hint: "No client names"
  setting varchar(40) null            -- from FILTER_SETTINGS
  starts_at timestamptz not null, ends_at timestamptz not null, check (ends_at > starts_at)
  time_zone text not null default 'America/Los_Angeles'
  break_minutes smallint not null default 0 check (break_minutes between 0 and 480)
  miles numeric(7,1) check (miles >= 0), round_trip boolean not null default false, counted_miles numeric(7,1)
  created_at, updated_at timestamptz
  index (interpreter_id, starts_at)
```

- Worked hours are derived (end minus start minus break); counted miles are computed on the server (doubled for a round trip).
- `app/actions/personalJobs.ts` ("use server"): save, delete, list. Each starts with `requireInterpreter()`; update and delete use `where id = ? and interpreter_id = own`; writes validated with Zod in `lib/validation/personalJob.ts`; the audit log records the action, never the label; at most 2000 rows per interpreter.

## B3: conflict integration and fail-closed tests

`lib/availability/conflict.ts` gains an isolated query against `interpreter_personal_jobs`. The reason stays `"busy"`, so every message and the agency's "unavailable" status are unchanged. A missing table (Postgres `42P01`) counts as no rows from that source, so a deploy before the SQL cannot block every offer; any other error still fails closed. Tests:

1. A personal-jobs read that fails with any other error returns a conflict.
2. `42P01` returns no conflict from that source and the other checks still run.
3. Boundaries: touching ends do not conflict; one minute of overlap does.
4. Another interpreter's rows are ignored.
5. `respondToOffer` refuses to accept over a personal job with the existing message.
6. `checkInterpreterFit` returns `unavailable` without leaking the label.
7. With no personal jobs, behaviour is identical to before.

The characterization harness in `tests/availability/harness.ts` (stubbed db and session, run with `--experimental-test-module-mocks`, which `npm test` now passes) is the base for these.

## B2: UI and export

- `(interpreter)/my-work/page.tsx` plus `components/myWork/{PersonalJobsBoard,PersonalJobForm,PersonalJobRow,MyWorkTotals}.tsx`; 30-day, 90-day and all-time totals for hours and miles, in the style of Mileage.
- `api/my-work/export/route.ts`: GET scoped to the session, Papa Parse with `escapeFormulae` (the `lib/billing/csv.ts` pattern); no PHI beyond the optional label.
- A "My work" nav item; the interpreter nav moves to `interpreterNav.ts` (precedent: `agencyNav.ts`) to keep `layout.tsx` under 300 lines.
- Calendar: `td_availability_view` returns a `personalJobs` array; the three calendar views draw them as distinct read-only blocks; an "Add a personal job" link beside "Block time".
- Pure logic in `lib/personalJobs.ts`: worked minutes, counted miles, range totals, CSV rows.

## Order and release

B0 (done) then B1 + B3 together (table and guard land together), then B2. SQL goes to the demo database first; production needs the SQL applied before or with the deploy. Nothing depends on `0013`, so this need not wait for Kari's sign-off, though two migrations in review at once is worth avoiding.

## Standing constraints

Every file under 300 lines, zero `any`, zero em-dashes in copy, `EMAIL_SILENT_MODE=true`, no production writes, no PHI in logs.

## After B1 + B3: what was built, and open items

Built: `migrations/manual/0014_personal_jobs.sql` (applied to `terpdesk_demo` only), `db/personalJobsSchema.ts`, `lib/personalJobs.ts`, `lib/validation/personalJob.ts`, `app/actions/personalJobs.ts` (`listMyPersonalJobs`, `savePersonalJob`, `deletePersonalJob`), `lib/availability/personalJobConflict.ts`, and the call in `lib/availability/conflict.ts`.

- Every acceptance path inherits the check, because they all go through `td_conflict`: `respondToOffer`, `/api/offers/response`, `updateRequest`, `updateRequestDetails`, and the agency's `checkInterpreterFit` (so offers, auto-book and the staffing "unavailable" status).
- Verified against the real demo database before and after the migration: a missing table (a real 42P01) falls back to "no personal jobs" and logs once; overlap is strict on both ends; another interpreter is never affected; the table's CHECK constraints hold; the actions work end to end with the audit log carrying only the job id.
- Open: the agency's Interpreter View timeline (`getInterpreterDayView`, `lib/agencyInterpreterView.ts`) reads busy blocks directly, so personal jobs do not appear there yet. Decide in B2 whether they should show as unavailable time (never with the label).
- Open: the 2,000-row cap is checked just before the insert, not in a transaction, so two simultaneous saves could pass 2,000 by one. It is an abuse limit, not a correctness boundary.
- Production: the SQL has not been applied there. Until it is, the conflict check ignores personal jobs and nothing else changes.
