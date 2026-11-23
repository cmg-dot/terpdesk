import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FORMATS, SETTINGS } from "@/lib/publicIntake";
import { REQUEST_FORMATS, REQUEST_SETTINGS } from "@/lib/requestOptions";
import { websiteFormatLabel } from "@/lib/websiteRequests";

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("the setting and format choices the Website requests board filters by", () => {
  it("cover every setting the public website form can send, and every format it can send", () => {
    for (const setting of SETTINGS) assert.ok((REQUEST_SETTINGS as readonly string[]).includes(setting), `public form setting ${setting}`);
    for (const format of FORMATS) assert.ok((REQUEST_FORMATS as readonly string[]).includes(websiteFormatLabel(format)), `public form format ${format}`);
  });

  it("stay level with the New request and Edit request forms (a setting added there must be added here)", () => {
    for (const page of [["src", "app", "(dashboard)", "requests", "new", "page.tsx"], ["src", "app", "(dashboard)", "requests", "[id]", "edit", "page.tsx"]]) {
      const source = read(...page);
      const options = /options=\{\["Choose a setting", ([^\]]*)\]\}/.exec(source)?.[1] ?? "";
      const formSettings = options.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      assert.deepEqual([...formSettings].sort(), [...REQUEST_SETTINGS].sort(), page.join("/"));
      assert.ok(source.includes('options={["In person", "Virtual", "Hybrid'), `${page.join("/")} formats`);
    }
    assert.deepEqual([...REQUEST_FORMATS], ["In person", "Virtual", "Hybrid"]);
  });

  it("have no em-dash and no repeats", () => {
    const all = [...REQUEST_SETTINGS, ...REQUEST_FORMATS];
    assert.equal(new Set(all.map((v) => v.toLowerCase())).size, all.length);
    for (const value of all) assert.ok(!value.includes(String.fromCharCode(0x2014)));
  });
});

describe("the card's layout follows the card's own width (a split screen with the sidebar open leaves a narrow card in a wide window)", () => {
  const source = read("src", "components", "requests", "website", "WebsiteRequestCard.tsx");

  it("is a size container, with the Review button and the lane for it appearing only when the card is wide enough", () => {
    assert.match(source, /\[container-type:inline-size\]/);
    assert.match(source, /"\[@container_\(min-width:34rem\)\]:mr-\[5\.5rem\]"/);
    assert.match(source, /"\[@container_\(min-width:34rem\)\]:inline-flex"/);
    assert.match(source, /absolute right-12 top-3\.5 hidden/, "hidden until the container query shows it");
  });

  it("uses the underscore form of the container query (the form without it is generated as invalid CSS) and no fixed reserve", () => {
    assert.ok(!source.includes("@container(min-width"), "no @container( without the underscore");
    assert.ok(!/sm:pr-40|right-14/.test(source), "the old fixed dead zone is gone");
  });

  it("keeps the chevron and the first line level (the header is top-aligned)", () => {
    assert.match(source, /headerClassName="!items-start /);
  });
});
