# terpDESK Security & Backend Hardening Rules

## 1. Zero Trust for Server Actions & Route Handlers
- Treat all files with `'use server'` and all routes in `/api/*` as public endpoints.
- Every mutating Server Action and API handler must validate the payload using a strict Zod schema (`schema.parse()`).
- Never pass raw request payloads directly into Drizzle ORM `.set()` or `.values()` calls. Only pass validated, picked fields.

## 2. Authorization & IDOR Prevention
- Never perform database mutations (`UPDATE`, `DELETE`) solely on a client-supplied ID.
- Always scope queries to the authenticated user's organization/agency or verify explicit role permissions before executing.

## 3. Token & Secret Handling
- Never store raw dispatch or magic link tokens in plain text in the database.
- Store SHA-256 hashes (`crypto.createHash('sha256').update(token).digest('hex')`). Compare hashes on lookup.
- Tokens must have an explicit expiration timestamp (`expiresAt`) and a one-time-use flag or state-lock check.
- **Documented exception: the calendar subscription link (`/api/calendar/feed/<secret>.ics`, `interpreter_calendar_feeds`).** A calendar app (Apple, Google) re-fetches the same address for months or years, so the link can be neither one-time nor expiring: an expiry would silently end the subscription. In place of expiry and one-time use it has these controls, all required:
  - The secret is 32 random bytes (256 bits), shown to the interpreter once when it is made or rotated, and stored only as its SHA-256. It is never logged, audited or returned again; the request path is never printed.
  - The interpreter can **revoke** it or **rotate** it (a new secret; the old one stops working at once) in one click, and the card shows when a calendar app last fetched it (`last_fetched_at`).
  - A revoked, unknown or malformed secret, or a database without the table, all get the identical `404`, so the answer reveals nothing.
  - Fetches are rate limited in the database (about 60 an hour per secret, `429` with `Retry-After`), counted in one atomic statement.
  - Events carry no PHI: the only titles are "terpDESK job", "Personal job" and "Busy" (plus, if the interpreter chooses, one generic setting category from `src/lib/genericSetting.ts`). Never a client, organization, address, meeting link, note, busy-block title or personal-job label.
  - The response sets `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` and `Cache-Control: private`. Events a calendar app has already fetched cannot be recalled by revoking; the card says so.

## 4. HIPAA & Logging Hygiene
- Do NOT output sensitive client, patient, or appointment details to terminal or production logs (`console.log`).
- Keep outbound email notifications free of Protected Health Information (PHI). Only include appointment time, generic setting (e.g., Medical, Legal, Educational), and format (Virtual / On-site).
- The setting in an email is always one of the fixed categories in `src/lib/genericSetting.ts` (Medical, Legal, Educational, Mental Health, Social Services, Employment, General), never the form's own words.
- One exception to "no organization in email": the interpreter OFFER email may carry an Organization row, and only a value that passes `src/lib/emailOrganization.ts` (a clean organization name: no person's name, email address, phone number or ID number). Cancellation, removal and every other email still carry none.

## 5. Session Hardening (Automatic Logoff)
- Both portals enforce the same 30-minute inactivity timeout: agency staff and interpreters are signed out after 30 minutes without activity (HIPAA automatic logoff). The limit and the helpers are in `src/lib/auth/idle.ts`.
- The server decides. The signed session token carries `lastActivityAt`; a token idle past the limit counts as signed out in the middleware, in `requireSession` / `requireRole` (so every Server Action refuses it), and in the root layout (nothing of the session reaches the page). A token with no timestamp counts as expired. A late "still here" ping never revives an expired session.
- The browser only warns and reports activity (`src/hooks/useIdleTimeout.ts`, mounted by `IdleTimeoutGuard` in both the agency and the interpreter workspace layouts): a non-dismissible warning with a countdown appears at 28 minutes, activity is reported to the server at most once a minute, and other tabs share activity so a busy tab keeps the others alive.
- An idle sign-out lands on the sign-in of the same portal (`/login/agency` or `/login/interpreter`) with `?reason=idle`, which shows the "signed out after 30 minutes of inactivity" notice, and remembers the page (same-site paths only) to return to.
- Each idle sign-out writes a `session_idle_timeout` audit row with identifiers only (user id, email, the limit), never a name, page or data. The public token pages (emailed links) are not logins and are governed by their own token expiry (section 3).