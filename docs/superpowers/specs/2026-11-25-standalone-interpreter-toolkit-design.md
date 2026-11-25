# Standalone Interpreter Toolkit: glossary, calendar feed, credentials and CEU, expenses (slices D, C, E, F)

Status: **approved by the owner on 2026-11-25. Build order D, C, E, F.** Slice D (glossary) is the first to be built; each slice is a separate commit series with its own migration, applied to `terpdesk_demo` only until the owner asks for production.

## Intent

Slices A and B gave an interpreter with no agency a job log. This phase makes the workspace worth opening every day: a private glossary to study, a calendar feed for the phone, a credential renewal tracker, and a light expense log for tax time. Everything works with zero linked agencies, and none of it adds anything an agency can see.

Goals: daily-use value for a standalone interpreter; private by construction; each slice small, reversible and demo-first.
Non-goals: income, invoices, payroll or accounting; multi-agency discovery; any change to `requests`, `offers`, `timesheets` or billing tables; any agency-visible output from D, E (CEU) or F.
Anti-goals: PHI in logs, email, audit rows, calendar titles or agency views; a deploy that breaks a page because a new table is missing.

## What exists (inspection, 2026-11-25)

- **My Profile**: tabs Overview, Credentials, Visibility and sharing. `credentials` holds name, type, issuer, number, issue and expiry dates, notes, soft archive, insurance kind and files (`files.linked_credential_id`, private S3, signed links). `expiryStatus` shows only Expired and Expires soon (60 days or less). Every active credential is visible to every agency the interpreter is rostered with (number and notes excluded; the code calls this "not optional"). `credential_agency_shares` is defined and has no readers or writers. No CEU code anywhere.
- **Prep**: only files an agency shared for jobs the interpreter is booked on (`getMyPrepMaterials`, `bookedRequestIds`). A standalone interpreter sees an empty state.
- **Calendar**: composed in the browser. Booked jobs come from client state; busy time and personal jobs from `td_availability_view`. The only server-side read of an interpreter's accepted jobs is the accepted-offers query in `lib/availability/conflict.ts` (staff-assigned jobs are accepted offers too). No `.ics` code exists.
- **Mileage**: agency jobs only (`mileage_legs` plus approvals). Personal-job miles are on `/my-work`.
- **Patterns to reuse**: hashed tokens (`security.md` 3), audit-log counting for rate limits (`passwordReset.ts`), Papa with `escapeFormulae` for CSV, `genericSetting()` for PHI-free setting names, `isMissingTable` for a database without a migration.
- **Migrations**: `0013_billing` is in review; `0014_personal_jobs` is on demo only. New numbers follow the build order below.

## Decisions (approved)

1. Order D, C, E, F.
2. Slice C: no hard expiry on the feed token; one-click rotate and revoke; `last_fetched_at` shown in Calendar settings. This is a documented exception to `security.md` 3 (which asks for expiry and one-time use): a calendar subscription cannot be one-time, and an expiry would silently break it. The exception is written into `security.md` when Slice C ships.
3. Slice E: Option (a). Existing agency visibility of active credentials is unchanged; the renewal goals and the CEU log are private to the interpreter (separate tables, never selected by any agency view). `credential_agency_shares` stays untouched. Amended 2026-11-26: cycles are standalone-capable (see Slice E).
4. Slice D: both ASL and spoken languages. Fields are labelled `English / Source term` and `ASL Gloss / Target rendering`, with a hint that an ASL entry is a gloss or a short sign note.
5. Slice F: included, as a Jobs / Expenses tab on `/my-work`, with an annual category plus combined-mileage summary and a CSV export.

## Slice D: personal glossary on Prep (`0015_glossary.sql`)

```
interpreter_glossary_terms
  id uuid pk, interpreter_id uuid fk interpreters on delete cascade
  term varchar(200) not null          -- "English / Source term"
  rendering varchar(300) not null     -- "ASL Gloss / Target rendering"
  source_lang varchar(40) not null default 'English', target_lang varchar(40) not null default 'ASL'
  setting varchar(40) null            -- one of FILTER_SETTINGS
  note varchar(300) null              -- context note; hint "No client names or patient details"
  created_at, updated_at timestamptz
  index (interpreter_id, setting); unique (interpreter_id, source_lang, target_lang, lower(term), lower(rendering))
```

- Languages come from a fixed list (English, ASL, common spoken languages, Other), validated by the server.
- Prep becomes two tabs: Job materials (unchanged) and Glossary. The glossary is the My work pattern: a themed toolbar (search over term, rendering and note; language pair; setting; sort), cards with inline edit, ten a page, reduced-motion-safe animation.
- Filtering is pure and client-side (`lib/glossaryFilters.ts`), over at most 5,000 terms.
- CSV export (`GET /api/glossary/export`, session only, `escapeFormulae`, BOM, no-store, audited by row count) and CSV import (a server action: size-limited, every row validated by the same schema, duplicates and bad rows skipped and counted, capped by the 5,000 limit).
- Privacy: only the signed-in interpreter's own rows; ids from the browser never widen that; the audit log records action, id and counts, never a term, rendering or note; no agency view reads the table; missing table shows "not set up on this database yet".
- Later, no schema change: a flashcard study mode.

## Slice C: private `.ics` feed (`0016_calendar_feed.sql`)

`interpreter_calendar_feeds`: id, interpreter_id, `token_hash` (SHA-256, unique), `detail_level` ('busy' default, 'generic'), created_at, rotated_at, revoked_at, last_fetched_at, rate-limit window columns; one active row per interpreter. Route `GET /api/calendar/feed/[token]` (the `.ics` suffix is stripped from the parameter; to be verified first), outside the middleware's protected prefixes. Token shown once, stored only as a hash. Revoked or unknown token returns an identical 404. About 60 fetches an hour per token, then 429 with Retry-After; ETag and 304. Window: 30 days back to 180 ahead, UTC times, stable UIDs; agency jobs (accepted offers, read server-side), personal jobs and busy time. Event titles are only "terpDESK job", "Personal job" and "Busy"; the `generic` level adds one `genericSetting()` category. Never client names, organizations, addresses, busy-block titles or personal-job labels. Audit: created, rotated, revoked (identifiers only). A parity check against the calendar page is part of verification. The settings copy says plainly that events already synced to Google or Apple cannot be recalled.

## Slice E: credentials and CEU (`0017_ceu_tracker.sql`)

**Amended 2026-11-26 (owner approved):** the first draft tied every goal to a credential (`credential_id` unique). It is replaced by the design below, so a renewal tracker also works for an interpreter who has added no credential at all.

- **Placement:** a 4th pill on `/profile`: `Overview | Credentials | CEUs & renewals | Visibility & sharing`. The tab opens with a neutral lock banner, "Private to you. Agencies never see this.", and Visibility & sharing carries a matching "Never shared" note. The Credentials tab and its "Visible to your agency" banner are unchanged. The tab loads its data when first opened, so Overview and Credentials are untouched.
- **`renewal_cycles`** (new): interpreter_id, credential_id (nullable, `ON DELETE SET NULL`; linking only pre-fills the label and end date, the two dates stay separate), label, cycle_start, cycle_end, unit (`ceu` or `hours`, never converted), and three nullable targets: required_total, required_ethics, required_ppo. Several cycles may be active at once; at most 20 per interpreter.
- **`ceu_entries`** (new): interpreter_id, cycle_id (nullable, `ON DELETE SET NULL`, so a deleted cycle keeps the log), earned_on, title, provider, category (fixed neutral list plus Other), amount (two decimals), unit, is_ethics, is_ppo. At most 2,000 per interpreter. An entry in a cycle takes the cycle's unit and must fall inside its dates; a cycle's dates or unit cannot change in a way that strands an assigned entry. The form defaults the cycle when exactly one is active.
- **Progress:** a total counts an entry once; the ethics and PPO subtotals count each flagged entry (an entry may carry both). Countdown badges at 180, 90, 60 and 30 days and "Ended", computed in the interpreter's own time zone by a new pure function (the agency-facing `expiryStatus` is unchanged). Certifying-body rules are not encoded.
- **Privacy:** no file uploads (so nothing lands in the agency-shareable credential files); the form says "No client names or patient details"; audit rows carry ids and counts only; the CSV transcript escapes cells that start with = + - @ and is exported with `GET /api/profile/ceu/export`. A database without 0017 answers "not set up yet" (Postgres 42P01) and never breaks `/profile`.
- **Interface:** inline card editing, ten entries a page, a search that "/" focuses, reduced-motion-safe transitions, the app's theme tokens, no em-dashes in copy. Renewal reminder emails stay out of the first pass.

## Slice F: expenses and tax summary (`0018_expenses.sql`)

`interpreter_expenses` (spent_on, category in parking_tolls, ceu_training, equipment, dues_insurance, other; amount_cents 1 to 10,000,000; description 80 characters, no client names), shown as an Expenses tab on `/my-work`. Annual summary: totals per category plus tax-year miles (agency-approved miles plus personal-job counted miles), no IRS rate hard-coded, a "not tax advice" line, CSV export. Out of scope: income, receipts, recurring items, other currencies.

## Standing constraints

Every file under 300 lines, zero `any`, zero em-dashes in copy, `EMAIL_SILENT_MODE=true`, no production writes, no PHI in logs. Every action starts with `requireInterpreter()` and scopes writes by `id AND interpreter_id`. Each slice is checked in a real browser at 1280, 900 and 390 px against `terpdesk_demo`, with synthetic rows removed afterwards.

## Slice D: what was built (2026-11-25)

Built: `migrations/manual/0015_glossary.sql` (applied to `terpdesk_demo` only, run twice to confirm it is idempotent; **not applied to production**), `db/glossarySchema.ts`, `lib/validation/glossaryTerm.ts`, `lib/glossary.ts`, `lib/glossaryFilters.ts`, `lib/glossaryImport.ts`, `lib/glossaryStore.ts`, `lib/glossaryData.ts`, `app/actions/glossary.ts` (`listMyGlossaryTerms`, `saveGlossaryTerm`, `deleteGlossaryTerm`, `importGlossaryCsv`), `GET /api/glossary/export`, `components/glossary/*` (board, card with inline edit, form, list, toolbar, import panel) and `components/prep/PrepTabs.tsx` (Job materials / My glossary; both stay mounted so a search survives a tab switch; the glossary opens first when no agency has shared anything). The My work `Reveal` and `MyWorkPager` and the Hours review `AnimatedListItem` are reused as they are.

- The migration numbers follow the build order: D is 0015, so Slice C becomes `0016_calendar_feed.sql`, E `0017_ceu_tracker.sql`, F `0018_expenses.sql`.
- A missing table never breaks Prep: the glossary tab says it is not set up yet and Job materials is unaffected; the export answers 503; saving answers the same plain message.
- Languages are a fixed list (English, ASL and common spoken languages, Other); a pair of one language twice is refused except Other. Settings are the request forms' list. A duplicate (same pair, term and rendering, any case) is refused by a unique index and reported plainly.
- CSV import: the export's own columns (or the short names term and rendering), up to 2,000 rows and about 400 KB, every row through the form's own parse; invalid and repeated rows are skipped and counted, duplicates already stored are skipped by the database, and the 5,000-term limit is respected. Export escapes cells that start with = + - @.
- Audit rows carry the action, the term id or counts, never a term, rendering or note. No agency-side code reads the table (a test walks the agency code to keep it that way).
- The test harness gained two fakes (`onConflictDoNothing`, `writeErrors`); nothing that used it changed.
- Verified: unit tests (logic, actions through the stubbed database, the export route, rendered components, file limits) and a real-browser run at 1280, 900, 768 and 390 px against `terpdesk_demo` with a demo interpreter other than the demo login: paging and every filter reset, search (and the "/" and Escape keys), add with validation and the duplicate refusal, inline edit, cancel, two-step delete, CSV import and export (byte order mark, the view carried to the download, formulas escaped), tab switch keeping state, no horizontal overflow, 44px targets and one-column fields on a phone. Synthetic rows and their audit rows were deleted afterwards.
- Known and not fixed here: the shared `Dropdown` intermittently takes about 2 seconds to apply a pick (about one pick in six in the dev server, on different dropdowns); typical is 300 to 470 ms including the list's animation. It is in the shared component, so it is left for its own change.

## Slice C: what was built (2026-11-25)

Built: `migrations/manual/0016_calendar_feed.sql` (one table, `interpreter_calendar_feeds`, and one partial unique index; applied to `terpdesk_demo` only, run twice; **not applied to production**), `db/calendarFeedSchema.ts`, `lib/calendarFeed/{token,ics,events,bookedRule,sources,feed,store}.ts`, `app/actions/calendarFeed.ts` (`getMyCalendarFeed`, `createCalendarFeed`, `rotateCalendarFeed`, `revokeCalendarFeed`, `setCalendarFeedDetail`), `GET /api/calendar/feed/[token]/route.ts`, `hooks/useCalendarFeed.ts`, `components/calendar/interpreter/CalendarFeedCard.tsx`, a Subscribe button and the card on the Interpreter Calendar page, and the exception in `security.md` 3.

- **Endpoint.** Public (outside the middleware's protected paths) and self-guarding. The `.ics` suffix is stripped from the one `[token]` segment (verified in the real dev server: `<secret>.ics` and the bare secret both work). A malformed, unknown or revoked secret, or a database without the table, all get the identical 404 (same status, body and headers; the revoked case is excluded inside the same UPDATE, `revoked_at is null`). Any other failure is a 503 that says nothing. `ETag` is a hash of the text and `If-None-Match` (weak, listed or `*`) gets a bodiless 304. Headers: `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, max-age=300, must-revalidate`, no cookie. A fetch writes no audit row and logs nothing.
- **Rate limit.** About 60 fetches an hour per secret, counted in ONE `UPDATE ... RETURNING` (window restart, count and `last_fetched_at` together). Verified live: 80 simultaneous fetches gave exactly 60 allowed and 20 `429`s with `Retry-After`. `Retry-After` is capped at the hour (the database's clock and the server's can differ by a few seconds). A 304 counts too.
- **Token.** 32 random bytes as 43 URL-safe characters, shown once (create or rotate), stored only as SHA-256. Verified against the demo database after the run: every stored hash is 64 hex, no raw secret is in any row or audit entry, and a rotate leaves only the latest hash.
- **Text.** Hand-written RFC 5545 (`lib/calendarFeed/ics.ts`): UTC times, CRLF on every line, text escaped, lines folded at 75 octets without splitting a character, stable UIDs (`job-<offer>`, `personal-<id>`, `busy-<id>`), DTSTAMP and LAST-MODIFIED from when the thing last changed (so the same data gives the same text and a stable ETag), SEQUENCE from the update time or the busy block's revision. Window 30 days back to 180 ahead.
- **PHI.** The only titles are "terpDESK job", "Personal job" and "Busy"; the generic level adds one `genericSetting()` category (a personal job with no setting stays plain). The reads select only ids, times, a request's setting words (reduced to the category), a personal job's setting and a busy block's revision: a personal-job label or a busy-block title is never read, and a test asserts that against the selected columns.
- **Server and client agree.** The Calendar page draws `bookedAppointments(jobs)` with the status `fetchInterpreterOffers` gives each offer. `bookedRule.ts` is that rule for the server (an accepted offer on a request that is not cancelled by column or status; a "Fictional" title is left out), and `tests/calendarFeed/parity.test.ts` runs both over every combination of offer status, request status and title, and checks the action's source still carries the same expressions. Live check: the page's month view showed the two confirmed synthetic jobs and none of the four the feed leaves out.
- **Card.** Create feed link, a one-time copyable address with an Apple Calendar (webcal) link and Google instructions, the Busy only / With setting choice (saves at once, same address), Last synced (from `last_fetched_at`), Rotate link and Revoke each with a confirm step, and the plain note that apps keep what they already fetched. The address is held in memory only until the card closes or the page reloads; after that the card says to rotate for a new one. No page is revalidated by these actions (the page is client-rendered).
- **Tests.** 60 new unit tests under `tests/calendarFeed` (RFC 5545 formatting and folding, the secret, event titles by level, the window, 404 parity, the rate limit, ETag and 304, the booked-job rule and its drift check, the actions, files and the migration's shape). 587 total; `tsc` and lint clean. Browser run at 1280, 900, 768 and 390 px against `terpdesk_demo` with a demo interpreter other than the demo login: 142 checks passed, 0 failed, including no horizontal overflow, 44px controls on a phone and no console errors. Synthetic requests, offers, a personal job, a busy block, feed rows and audit rows were deleted afterwards (the seeded requests were briefly visible in the demo's agency views).
- **Known, not changed here.** (1) In the dev server a server action takes 1 to 4 seconds and queues behind the page's own calls, so the card's detail toggle can take several seconds to confirm; production is faster. (2) The new Subscribe button matches its neighbours (Add a personal job, Block time) at 38px tall rather than 44px. (3) An unknown secret cannot be rate limited per secret; a 256-bit secret cannot be guessed, so the exposure is the ordinary public-endpoint one. (4) The existing demo interpreter used for the check had two real accepted jobs, which the feed correctly included.
