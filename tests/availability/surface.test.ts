import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");
const exportedNames = (source: string): string[] => Array.from(source.matchAll(/^export (?:async )?(?:function|const|interface|type) (\w+)/gm), (m) => m[1]);
const isServerAction = (source: string): boolean => /^"use server";/m.test(source.split("\n").slice(0, 3).join("\n"));

const ACTIONS: Record<string, string[]> = {
  "availabilityRules.ts": ["td_save_availability", "td_update_interpreter_timezone"],
  "busyBlocks.ts": ["td_save_busy", "td_delete_busy"],
  "availabilityView.ts": ["td_availability_view", "td_toggle_share"],
  "interpreterFit.ts": ["checkInterpreterFit", "getInterpretersFitForJob"],
};
const PLAIN = [
  ["src", "lib", "availability", "conflict.ts"],
  ["src", "lib", "availability", "ensureTables.ts"],
  ["src", "lib", "availability", "ids.ts"],
  ["src", "lib", "availability", "types.ts"],
  ["src", "lib", "interpreterFit.ts"],
];

describe("what the browser can call after the availability split", () => {
  it("the old single file is gone", () => {
    assert.equal(existsSync(join(process.cwd(), "src", "app", "actions", "availability.ts")), false);
  });

  it("each action file is a Server Action file exporting exactly its own async functions", () => {
    for (const [file, names] of Object.entries(ACTIONS)) {
      const source = read("src", "app", "actions", file);
      assert.ok(isServerAction(source), `${file} is "use server"`);
      assert.deepEqual(exportedNames(source), names, file);
    }
  });

  it("td_conflict, ensureAvailabilityTables and resolveInterpreterIds are plain server modules, not endpoints", () => {
    for (const parts of PLAIN) assert.ok(!isServerAction(read(...parts)), `${parts.join("/")} must not be "use server"`);
    assert.deepEqual(exportedNames(read("src", "lib", "availability", "conflict.ts")), ["td_conflict"]);
    assert.deepEqual(exportedNames(read("src", "lib", "availability", "ids.ts")), ["isUuid", "resolveInterpreterIds"]);
    assert.deepEqual(exportedNames(read("src", "lib", "availability", "ensureTables.ts")), ["ensureAvailabilityTables"]);
  });

  it("no browser code imports a server module of the availability code (only types and the guarded actions)", () => {
    const clientFiles = [
      ["src", "connected", "availability.tsx"],
      ["src", "app", "(interpreter)", "interpreter-calendar", "page.tsx"],
    ];
    for (const parts of clientFiles) {
      const source = read(...parts);
      assert.ok(!/lib\/availability\/(conflict|ensureTables|ids)/.test(source), parts.join("/"));
    }
  });

  it("every action that takes an interpreter id checks the session before reading or writing", () => {
    for (const file of ["availabilityRules.ts", "busyBlocks.ts", "availabilityView.ts"]) {
      const source = read("src", "app", "actions", file);
      assert.ok(source.includes('requireRole("interpreter")'), file);
    }
    assert.equal((read("src", "app", "actions", "interpreterFit.ts").match(/requireRole\("agency"\)/g) ?? []).length, 2);
  });
});

describe("the files of the availability split", () => {
  it("are each under 300 lines, hold no any and no em-dash", () => {
    const files = [
      ...PLAIN,
      ...Object.keys(ACTIONS).map((f) => ["src", "app", "actions", f]),
    ];
    for (const parts of files) {
      const source = read(...parts);
      const name = parts.join("/");
      assert.ok(source.split("\n").length < 300, `${name} is under 300 lines`);
      assert.ok(!/:\s*any\b|<any>|\bas any\b/.test(source), `${name} has no any`);
      assert.ok(!source.includes(String.fromCharCode(0x2014)), `${name} has no em-dash`);
    }
  });
});
