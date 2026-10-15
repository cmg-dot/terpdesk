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

## 4. HIPAA & Logging Hygiene
- Do NOT output sensitive client, patient, or appointment details to terminal or production logs (`console.log`).
- Keep outbound email notifications free of Protected Health Information (PHI). Only include appointment time, generic setting (e.g., Medical, Legal, Educational), and format (Virtual / On-site).