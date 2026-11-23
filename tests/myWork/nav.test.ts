import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { INTERPRETER_BOTTOM_NAV, INTERPRETER_NAV, isNavActive } from "@/components/interpreter/interpreterNav";
import { INTERPRETER_PREFIXES, requiredRoleForPath } from "@/lib/auth/routes";

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("the interpreter navigation", () => {
  it("lists every item once, with My work after Mileage, and the five bottom items as a subset", () => {
    assert.deepEqual(INTERPRETER_NAV.map((i) => i.label), ["Home", "Jobs", "Calendar", "Mileage", "My work", "Prep", "Agencies", "My Profile", "Settings"]);
    assert.equal(new Set(INTERPRETER_NAV.map((i) => i.href)).size, INTERPRETER_NAV.length);
    assert.equal(INTERPRETER_NAV.find((i) => i.label === "My work")?.href, "/my-work");
    assert.deepEqual(INTERPRETER_BOTTOM_NAV.map((i) => i.label), ["Home", "Jobs", "Calendar", "Mileage", "Settings"]);
    for (const item of INTERPRETER_BOTTOM_NAV) assert.ok(INTERPRETER_NAV.includes(item));
  });

  it("is active on its own page and below it, except Home, which is active only on its own path", () => {
    const [home, , , , myWork] = INTERPRETER_NAV;
    assert.equal(isNavActive("/interpreter-home", home), true);
    assert.equal(isNavActive("/interpreter-home/anything", home), false);
    assert.equal(isNavActive("/my-work", myWork), true);
    assert.equal(isNavActive("/my-work/export", myWork), true);
    assert.equal(isNavActive("/jobs", myWork), false);
  });

  it("every item goes to a page that needs an interpreter sign-in", () => {
    for (const item of INTERPRETER_NAV) assert.equal(requiredRoleForPath(item.href), "interpreter", item.href);
  });

  it("the layout draws the desktop sidebar and the mobile menu from the list, the phone bar from its subset, and keeps the idle sign-out", () => {
    const layout = read("src", "app", "(interpreter)", "layout.tsx");
    assert.equal((layout.match(/INTERPRETER_NAV\.map/g) ?? []).length, 2, "sidebar and mobile menu");
    assert.equal((layout.match(/INTERPRETER_BOTTOM_NAV\.map/g) ?? []).length, 1);
    assert.match(layout, /<IdleTimeoutGuard \/>/);
    assert.ok(layout.split("\n").length < 300, "under 300 lines");
    assert.ok(!layout.includes('href="/jobs"'), "no hard-wired links left");
  });
});

describe("/my-work is an interpreter-only area, with the idle sign-out of the rest", () => {
  const SECRET = "test-secret-my-work";
  const MIN = 60_000;
  let middleware: (req: NextRequest) => Promise<Response>;
  let config: { matcher: string[] };
  before(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;
    const mod = (await import("@/middleware")) as { middleware: typeof middleware; config: typeof config };
    middleware = mod.middleware;
    config = mod.config;
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

  it("is on the interpreter list and in the middleware's matcher (every interpreter prefix is)", () => {
    assert.ok((INTERPRETER_PREFIXES as readonly string[]).includes("/my-work"));
    assert.equal(requiredRoleForPath("/my-work"), "interpreter");
    assert.equal(requiredRoleForPath("/my-work/anything"), "interpreter");
    for (const prefix of INTERPRETER_PREFIXES) assert.ok(config.matcher.includes(`${prefix}/:path*`), `matcher has ${prefix}`);
  });

  it("lets an active interpreter in", async () => {
    assert.equal((await visit("/my-work", await cookie("interpreter", 5 * MIN))).headers.get("x-middleware-next"), "1");
  });

  it("signs an interpreter idle past 30 minutes out to the interpreter sign-in, remembering the page", async () => {
    assert.equal(where(await visit("/my-work", await cookie("interpreter", 31 * MIN))), "/login/interpreter?reason=idle&callbackUrl=%2Fmy-work");
  });

  it("sends nobody else in: signed out goes to sign-in, agency staff go to their own dashboard", async () => {
    assert.match(where(await visit("/my-work")) ?? "", /^\/login\/interpreter\?callbackUrl=%2Fmy-work$/);
    assert.equal(where(await visit("/my-work", await cookie("agency", 5 * MIN))), "/dashboard");
  });
});
