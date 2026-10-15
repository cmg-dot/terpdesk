# terpDESK: Core AI Guidelines

## 1. Project Overview & Tech Stack
- **Framework:** Next.js (App Router), TypeScript, Tailwind CSS
- **Database & ORM:** PostgreSQL, Drizzle ORM
- **Authentication/Roles:** NextAuth v5 (Agency, Interpreter, Client RBAC)
- **Deployment:** AWS Infrastructure (SES for Magic Links)

## 2. Strict Architectural Enforcement
Before writing any code, you MUST review the complete architectural rules located in:
`architecture.md`
Key highlights: 
- Max 250-300 lines per file (break down into `/components/ui/` or `/hooks/`).
- Separation of concerns: UI rendering vs. business logic.
- Strict TypeScript (no `any`).

## 3. Vercel & React Best Practices
We utilize a strict Vercel React best practices skill. For data fetching, server/client component boundaries, and performance rules, you must adhere to the guidelines located in:
`.agents/skills/vercel-react-best-practices/SKILL.md`

## 4. Anti-Hallucination & Execution Rules
- **NO ASSUMPTIONS:** Never hallucinate features, endpoints, or dependencies. 
- **REUSE FIRST:** Always check the codebase for existing components or patterns before generating new ones.
- **NO TERMINAL EXECUTION:** Do not run destructive terminal commands without explicit permission.

- **Security & Authorization:** Before creating or modifying any API routes, Server Actions, or DB mutations, review and strictly adhere to `security.md`.