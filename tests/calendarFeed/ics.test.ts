import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, escapeText, foldLine, formatUtc } from "@/lib/calendarFeed/ics";
import type { IcsEvent } from "@/lib/calendarFeed/ics";
import { FEED_TOKEN_PATTERN, feedUrl, generateFeedToken, hashFeedToken, parseFeedToken } from "@/lib/calendarFeed/token";

const event = (over: Partial<IcsEvent> = {}): IcsEvent => ({
  uid: "job-1@terpdesk", startsAt: new Date("2026-12-07T17:00:00Z"), endsAt: new Date("2026-12-07T18:30:00Z"), summary: "terpDESK job", modified: new Date("2026-11-02T08:09:10Z"), sequence: 5, ...over,
});
const octets = (s: string): number => Buffer.byteLength(s, "utf8");

describe("RFC 5545 text", () => {
  it("escapes backslash, semicolon, comma and line breaks, in that order of care", () => {
    assert.equal(escapeText("a\\b;c,d"), "a\\\\b\\;c\\,d");
    assert.equal(escapeText("one\ntwo\r\nthree\rfour"), "one\\ntwo\\nthree\\nfour");
    assert.equal(escapeText("plain"), "plain");
  });

  it("writes UTC times as yyyymmddThhmmssZ, zero padded", () => {
    assert.equal(formatUtc(new Date("2026-01-02T03:04:05Z")), "20260102T030405Z");
    assert.equal(formatUtc(new Date("2026-12-31T23:59:59Z")), "20261231T235959Z");
  });
});

describe("line folding", () => {
  it("leaves a line of 75 octets or fewer alone", () => {
    const line = `SUMMARY:${"x".repeat(67)}`;
    assert.equal(octets(line), 75);
    assert.equal(foldLine(line), line);
  });

  it("folds a longer line onto continuation lines that begin with one space, none over 75 octets, and unfolds to the original", () => {
    const line = `SUMMARY:${"abcdefghij".repeat(30)}`;
    const folded = foldLine(line);
    const physical = folded.split("\r\n");
    assert.ok(physical.length > 1);
    assert.ok(physical.every((p) => octets(p) <= 75), "every physical line is at most 75 octets");
    assert.ok(physical.slice(1).every((p) => p.startsWith(" ")));
    assert.equal(physical.map((p, i) => (i === 0 ? p : p.slice(1))).join(""), line);
  });

  it("never splits a multi-byte character (accents, an emoji) across lines", () => {
    const line = `SUMMARY:${"é".repeat(60)}${"😀".repeat(10)}`;
    const physical = foldLine(line).split("\r\n");
    assert.ok(physical.every((p) => octets(p) <= 75));
    const unfolded = physical.map((p, i) => (i === 0 ? p : p.slice(1))).join("");
    assert.equal(unfolded, line);
    assert.ok(!unfolded.includes("�"));
  });
});

describe("buildCalendar", () => {
  const text = buildCalendar([event(), event({ uid: "busy-2@terpdesk", summary: "Busy" })], "terpDESK");
  const lines = text.split("\r\n");

  it("is a VCALENDAR with the required properties, CRLF on every line including the last, and no bare LF", () => {
    assert.equal(lines[0], "BEGIN:VCALENDAR");
    assert.equal(lines.at(-1), "", "ends with CRLF");
    assert.equal(lines.at(-2), "END:VCALENDAR");
    assert.ok(!/(^|[^\r])\n/.test(text));
    for (const required of ["VERSION:2.0", "PRODID:-//terpDESK//Interpreter calendar feed//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:terpDESK"]) assert.ok(lines.includes(required), required);
    assert.equal(lines.filter((l) => l === "BEGIN:VEVENT").length, 2);
    assert.equal(lines.filter((l) => l === "END:VEVENT").length, 2);
  });

  it("gives each event a stable UID, UTC start and end, DTSTAMP and LAST-MODIFIED from when it changed, SEQUENCE, and a summary", () => {
    for (const expected of ["UID:job-1@terpdesk", "DTSTART:20261207T170000Z", "DTEND:20261207T183000Z", "DTSTAMP:20261102T080910Z", "LAST-MODIFIED:20261102T080910Z", "SEQUENCE:5", "SUMMARY:terpDESK job", "STATUS:CONFIRMED", "TRANSP:OPAQUE"]) assert.ok(lines.includes(expected), expected);
    assert.ok(lines.includes("UID:busy-2@terpdesk") && lines.includes("SUMMARY:Busy"));
  });

  it("depends only on its input (no clock): the same events give the same text, which is what makes the ETag stable", () => {
    assert.equal(buildCalendar([event()], "terpDESK"), buildCalendar([event()], "terpDESK"));
    assert.notEqual(buildCalendar([event()], "terpDESK"), buildCalendar([event({ sequence: 6 })], "terpDESK"));
  });

  it("with no events is still a valid, empty calendar", () => {
    const empty = buildCalendar([], "terpDESK").split("\r\n");
    assert.ok(empty.includes("BEGIN:VCALENDAR") && empty.includes("END:VCALENDAR") && !empty.includes("BEGIN:VEVENT"));
  });

  it("escapes a summary that has special characters and keeps every physical line within 75 octets", () => {
    const odd = buildCalendar([event({ summary: `A, B; C\\D\n${"é".repeat(120)}` })], "terpDESK");
    assert.ok(odd.split("\r\n").every((l) => octets(l) <= 75));
    const unfolded = odd.replace(/\r\n /g, "");
    assert.ok(unfolded.includes("SUMMARY:A\\, B\\; C\\\\D\\n"));
  });
});

describe("the feed secret", () => {
  it("is 32 random bytes as 43 URL-safe characters, different every time", () => {
    const a = generateFeedToken();
    const b = generateFeedToken();
    assert.match(a, FEED_TOKEN_PATTERN);
    assert.equal(a.length, 43);
    assert.notEqual(a, b);
  });

  it("is stored as its SHA-256 (64 hex characters), never as itself", () => {
    const token = generateFeedToken();
    const hash = hashFeedToken(token);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.ok(!hash.includes(token));
    assert.equal(hash, hashFeedToken(token));
    assert.notEqual(hash, hashFeedToken(generateFeedToken()));
  });

  it("is read out of the address segment with or without .ics, and anything else is not a secret", () => {
    const token = generateFeedToken();
    assert.equal(parseFeedToken(`${token}.ics`), token);
    assert.equal(parseFeedToken(`${token}.ICS`), token);
    assert.equal(parseFeedToken(token), token);
    for (const bad of [undefined, "", "short", `${token}x`, `${token.slice(1)}`, `${token}.txt`, `${token}.ics.ics`, `../${token}`, `${token.slice(0, 42)}!`, `${token}%2e`]) assert.equal(parseFeedToken(bad), null, String(bad));
  });

  it("makes the address a calendar app subscribes to", () => {
    const token = generateFeedToken();
    assert.equal(feedUrl("https://myterpdesk.com", token), `https://myterpdesk.com/api/calendar/feed/${token}.ics`);
  });
});
