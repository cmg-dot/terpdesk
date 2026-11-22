import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { IDLE_LIMIT_MS, IDLE_LOGIN_REASON, IDLE_TOUCH_INTERVAL_MS, IDLE_WARNING_LEAD_MS, idleLoginPath, isIdleExpired, isIdleRole, isTouchUpdate, signedOutUrl } from "@/lib/auth/idle";

const SECRET = "phase-34-test-secret-not-a-real-one";
const MIN = 60_000;
const NOW = 1_800_000_000_000;

describe("the 30-minute idle rule covers both portals (Phase 34.2)", () => {
  it("is 30 minutes, with the warning at 28 and a ping at most once a minute", () => {
    assert.equal(IDLE_LIMIT_MS, 30 * MIN);
    assert.equal(IDLE_WARNING_LEAD_MS, 2 * MIN);
    assert.equal(IDLE_TOUCH_INTERVAL_MS, MIN);
  });

  for (const role of ["agency", "interpreter"] as const) {
    it(`expires a ${role} login after 30 minutes without activity, and not before`, () => {
      assert.equal(isIdleExpired({ role, lastActivityAt: NOW - 29 * MIN }, NOW), false);
      assert.equal(isIdleExpired({ role, lastActivityAt: NOW - 30 * MIN }, NOW), false, "exactly 30 minutes is still inside the limit");
      assert.equal(isIdleExpired({ role, lastActivityAt: NOW - 30 * MIN - 1 }, NOW), true);
      assert.equal(isIdleExpired({ role, lastActivityAt: NOW - 8 * 60 * MIN }, NOW), true);
    });

    it(`treats a ${role} token with no timestamp as expired, and falls back to when it was issued`, () => {
      assert.equal(isIdleExpired({ role }, NOW), true);
      assert.equal(isIdleExpired({ role, iat: (NOW - 5 * MIN) / 1000 }, NOW), false);
      assert.equal(isIdleExpired({ role, iat: (NOW - 45 * MIN) / 1000 }, NOW), true);
    });
  }

  it("never expires no token, or a token with no known role", () => {
    for (const token of [null, undefined, {}, { role: "visitor", lastActivityAt: 0 }, { role: undefined, lastActivityAt: 0 }]) assert.equal(isIdleExpired(token, NOW), false);
    assert.deepEqual([isIdleRole("agency"), isIdleRole("interpreter"), isIdleRole("admin"), isIdleRole(undefined)], [true, true, false, false]);
  });

  it("sends each portal's idle sign-out to its own sign-in, remembering only a same-site page", () => {
    assert.equal(idleLoginPath(undefined, "interpreter"), `/login/interpreter?reason=${IDLE_LOGIN_REASON}`);
    assert.equal(idleLoginPath(undefined, "agency"), `/login/agency?reason=${IDLE_LOGIN_REASON}`);
    assert.equal(idleLoginPath(), `/login/agency?reason=${IDLE_LOGIN_REASON}`, "the old call (no role) is still the agency sign-in");
    assert.equal(idleLoginPath("/jobs/abc?x=1", "interpreter"), "/login/interpreter?reason=idle&callbackUrl=%2Fjobs%2Fabc%3Fx%3D1");
    for (const bad of ["//evil.example", "https://evil.example", "jobs"]) assert.ok(!idleLoginPath(bad, "interpreter").includes("callbackUrl"), bad);
    assert.equal(signedOutUrl("interpreter"), "/login/interpreter?reason=idle");
    assert.equal(signedOutUrl("agency"), "/login/agency?reason=idle");
    assert.equal(signedOutUrl(undefined), "/login/agency?reason=idle");
  });

  it("only the browser's own ping moves the clock", () => {
    assert.equal(isTouchUpdate({ touch: true }), true);
    for (const other of [{ touch: false }, { touch: "true" }, {}, null, undefined, "touch"]) assert.equal(isTouchUpdate(other), false);
  });
});

describe("the middleware signs an idle interpreter out like an idle agency login", () => {
  let middleware: (req: NextRequest) => Promise<Response>;
  before(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;
    ({ middleware } = await import("@/middleware"));
  });

  const cookie = async (role: "agency" | "interpreter", idleMs: number): Promise<string> => {
    const token = await encode({ secret: SECRET, token: { sub: "u1", id: "u1", role, interpreterId: role === "interpreter" ? "i1" : null, lastActivityAt: Date.now() - idleMs, authAt: Date.now() - idleMs, sid: "s" } });
    return `next-auth.session-token=${token}`;
  };
  const visit = (path: string, cookieHeader?: string) => middleware(new NextRequest(`http://localhost${path}`, { headers: cookieHeader ? { cookie: cookieHeader } : {} }));
  const where = (res: Response): string | null => {
    const location = res.headers.get("location");
    return location ? `${new URL(location).pathname}${new URL(location).search}` : null;
  };
  const passes = (res: Response): boolean => res.headers.get("x-middleware-next") === "1";

  it("lets an active interpreter through, and an active agency login through to its own area", async () => {
    assert.ok(passes(await visit("/interpreter-home", await cookie("interpreter", 5 * MIN))));
    assert.ok(passes(await visit("/jobs/abc", await cookie("interpreter", 29 * MIN))));
    assert.ok(passes(await visit("/dashboard", await cookie("agency", 29 * MIN))));
  });

  it("redirects an interpreter idle past 30 minutes to the interpreter sign-in, with the reason and the page", async () => {
    const stale = await cookie("interpreter", 31 * MIN);
    for (const path of ["/interpreter-home", "/jobs/abc", "/mileage", "/profile"]) {
      assert.equal(where(await visit(path, stale)), `/login/interpreter?reason=idle&callbackUrl=${encodeURIComponent(path)}`, path);
    }
  });

  it("still redirects an idle agency login to the agency sign-in, as before", async () => {
    assert.equal(where(await visit("/requests/abc", await cookie("agency", 31 * MIN))), "/login/agency?reason=idle&callbackUrl=%2Frequests%2Fabc");
  });

  it("does not bounce an idle login back in from the sign-in pages", async () => {
    for (const [role, path] of [["interpreter", "/login/interpreter"], ["agency", "/login/agency"], ["interpreter", "/login"]] as const) {
      assert.ok(passes(await visit(path, await cookie(role, 31 * MIN))), `${role} ${path}`);
    }
    assert.equal(where(await visit("/login/interpreter", await cookie("interpreter", 5 * MIN))), "/interpreter-home", "an active one is sent in");
  });

  it("keeps the two portals apart, and sends anyone not signed in to the sign-in for that area", async () => {
    assert.equal(where(await visit("/dashboard", await cookie("interpreter", 5 * MIN))), "/interpreter-home");
    assert.equal(where(await visit("/jobs", await cookie("agency", 5 * MIN))), "/dashboard");
    assert.match(where(await visit("/interpreter-home")) ?? "", /^\/login\/interpreter\?callbackUrl=/);
    assert.ok(!(where(await visit("/interpreter-home")) ?? "").includes("reason=idle"), "signed out is not 'idle'");
  });

  it("leaves the public and emailed-link pages alone", async () => {
    for (const path of ["/job-details", "/api/offers/response", "/timesheet"]) assert.ok(passes(await visit(path, await cookie("interpreter", 90 * MIN))), path);
  });
});

describe("the session and the 'still here' ping follow the same rule", () => {
  const callbacks = async () => (await import("@/lib/auth/options")).authOptions.callbacks;
  const token = (role: "agency" | "interpreter", idleMs: number): JWT => ({ id: "u1", role, interpreterId: role === "interpreter" ? "i1" : null, lastActivityAt: Date.now() - idleMs, displayName: "X", theme: "default" });

  it("marks an idle interpreter's session expired, and an active one not", async () => {
    const { session } = (await callbacks()) ?? {};
    assert.ok(session);
    const read = async (t: JWT) => ((await session({ session: { user: { name: "x" }, expires: "" } as Session, token: t, user: undefined as never, newSession: undefined, trigger: "update" })) as Session).user.idleExpired;
    assert.equal(await read(token("interpreter", 31 * MIN)), true);
    assert.equal(await read(token("interpreter", 5 * MIN)), false);
    assert.equal(await read(token("agency", 31 * MIN)), true);
  });

  it("a ping keeps an active interpreter alive but never revives an expired one", async () => {
    const { jwt } = (await callbacks()) ?? {};
    assert.ok(jwt);
    const ping = async (t: JWT) => jwt({ token: t, trigger: "update", session: { touch: true }, user: undefined as never, account: null });
    const active = token("interpreter", 10 * MIN);
    assert.ok(((await ping(active)).lastActivityAt ?? 0) > Date.now() - 5000, "the clock moved to now");
    const expired = token("interpreter", 40 * MIN);
    const before = expired.lastActivityAt;
    assert.equal((await ping(expired)).lastActivityAt, before, "a late ping does not revive it");
  });
});

describe("both workspaces mount the idle guard, which governs both roles", () => {
  const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");

  it("the interpreter layout renders IdleTimeoutGuard, like the agency layout", () => {
    for (const file of [["src", "app", "(interpreter)", "layout.tsx"], ["src", "app", "(dashboard)", "layout.tsx"]]) {
      const source = read(...file);
      assert.match(source, /import \{ IdleTimeoutGuard \} from "@\/components\/auth\/IdleTimeoutGuard"/, file.join("/"));
      assert.match(source, /<IdleTimeoutGuard \/>/, file.join("/"));
    }
  });

  it("the guard attaches for either role, and the sign-out and audit paths accept either role", () => {
    assert.match(read("src", "components", "auth", "IdleTimeoutGuard.tsx"), /isIdleRole\(session\?\.user\?\.role\)/);
    assert.match(read("src", "app", "actions", "recordIdleSignOut.ts"), /!isIdleRole\(user\.role\)/);
    assert.match(read("src", "hooks", "useIdleTimeout.ts"), /signedOutUrl\(roleRef\.current\)/);
  });

  it("security.md records the 30-minute timeout for both portals", () => {
    const doc = read("security.md");
    assert.match(doc, /## 5\. Session Hardening/);
    assert.match(doc, /Both portals enforce the same 30-minute inactivity timeout: agency staff and interpreters/);
    assert.match(doc, /\/login\/interpreter/);
    assert.ok(!doc.includes("—"), "no em-dash");
  });
});
