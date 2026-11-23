import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENCY_NAV } from "@/components/agency/agencyNav";

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("the Website requests count on the sidebar", () => {
  it("is on the Website requests item, and the Inbox keeps its own", () => {
    const withCount = AGENCY_NAV.filter((item) => item.trailing === "websiteCount");
    assert.deepEqual(withCount.map((item) => item.href), ["/website-requests"]);
    assert.equal(AGENCY_NAV.find((item) => item.href === "/inbox")?.trailing, "inboxCount");
  });

  it("is shown by the desktop sidebar and the mobile menu with the same badge as the Inbox", () => {
    const sidebar = read("src", "components", "agency", "AgencySidebar.tsx");
    assert.match(sidebar, /useWebsiteReviewCount\(\)/);
    assert.match(sidebar, /item\.trailing === "websiteCount" && <CountBadge count=\{websiteToReview\}/);
    const layout = read("src", "app", "(dashboard)", "layout.tsx");
    assert.match(layout, /useWebsiteReviewCount\(\)/);
    assert.match(layout, /Website requests\s*<CountBadge count=\{websiteToReview\}/);
  });

  it("is counted by an agency-only action that says 0 to anyone else, with no database call", async () => {
    const { getWebsiteReviewCount } = await import("@/app/actions/websiteRequestCount");
    assert.equal(await getWebsiteReviewCount(), 0, "no session: 0");
    const source = read("src", "app", "actions", "websiteRequestCount.ts");
    assert.match(source, /hasRole\("agency"\)/);
  });

  it("counts only the unreviewed drafts that came from the public form", () => {
    const source = read("src", "lib", "websiteRequests.ts");
    assert.match(source, /and\(fromPublicForm, eq\(requests\.status, "draft"\)\)/);
  });

  it("is re-counted when the person moves to another page, and the Inbox count still works through the same hook", () => {
    assert.match(read("src", "hooks", "useWebsiteReviewCount.ts"), /usePolledCount\(getWebsiteReviewCount, undefined, pathname \?\? undefined\)/);
    const inbox = read("src", "hooks", "useInboxUnreadCount.ts");
    assert.match(inbox, /usePolledCount\(getInboxUnreadCount, INBOX_CHANGED\)/);
    assert.match(inbox, /export const notifyInboxChanged/);
    const polled = read("src", "hooks", "usePolledCount.ts");
    assert.match(polled, /const POLL_MS = 60_000/);
    assert.match(polled, /visibilityState === "visible"/);
    assert.match(polled, /\[status, refresh, changedEvent, refreshKey\]/);
  });
});

describe("the board's wiring", () => {
  it("the page reads the filters from the address on the server and hands the board the server's clock", () => {
    const page = read("src", "app", "(dashboard)", "website-requests", "page.tsx");
    assert.match(page, /parseFilters\(searchParams \?\? \{\}\)/);
    assert.match(page, /serverNow=\{Date\.now\(\)\}/);
    assert.match(page, /requireRole\("agency"\)/);
  });

  it("the search box takes the / shortcut, and the shortcut ignores typing in a field", async () => {
    assert.match(read("src", "components", "requests", "website", "WebsiteRequestsToolbar.tsx"), /useSlashToFocus\(search\)/);
    const { isTypingTarget } = await import("@/hooks/useSlashToFocus");
    assert.equal(isTypingTarget(null), false);
    assert.equal(isTypingTarget({} as EventTarget), false);
    const target = (fields: { tagName: string; isContentEditable?: boolean }) => fields as unknown as EventTarget;
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) assert.equal(isTypingTarget(target({ tagName })), true, tagName);
    assert.equal(isTypingTarget(target({ tagName: "DIV", isContentEditable: true })), true);
    for (const tagName of ["DIV", "BUTTON", "BODY"]) assert.equal(isTypingTarget(target({ tagName })), false, tagName);
  });

  it("no new or changed file is over 300 lines", () => {
    const files = [
      ["src", "lib", "websiteRequests.ts"],
      ["src", "lib", "websiteRequestView.ts"],
      ["src", "hooks", "useWebsiteRequestFilters.ts"],
      ["src", "components", "requests", "website", "WebsiteRequestsBoard.tsx"],
      ["src", "components", "requests", "website", "WebsiteRequestCard.tsx"],
      ["src", "components", "requests", "website", "WebsiteRequestsToolbar.tsx"],
    ];
    for (const file of files) assert.ok(read(...file).split("\n").length <= 300, file.join("/"));
  });
});
