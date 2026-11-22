import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { saveAnswer } from "@/lib/clarificationReply";
import type { AnswerTx } from "@/lib/clarificationReply";
import { questionHref } from "@/lib/clarificationThread";

const REQUEST = "5a8c56a4-0000-4000-8000-000000000033";
const TERP = "5a8c56a4-0000-4000-8000-0000000000aa";
const Q_BEFORE = "5a8c56a4-0000-4000-8000-0000000000b1";
const Q_AFTER = "5a8c56a4-0000-4000-8000-0000000000b2";
const NOW = new Date("2026-11-23T20:00:00.000Z");

type Call = { op: "update" | "insert"; values: Record<string, unknown> };

/** A stand-in for the transaction: it hands back one request row and records every write, in order. */
function fakeTx(clarifications: unknown[]) {
  const calls: Call[] = [];
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: async () => [{ data: { clarifications } }] }) }) }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => void calls.push({ op: "update", values }) }) }),
    insert: () => ({ values: async (values: Record<string, unknown>) => void calls.push({ op: "insert", values }) }),
  };
  return { tx: tx as unknown as AnswerTx, calls };
}

/** Every parameter inside a drizzle `sql` value (and its nested sql), flattened. */
function sqlParams(value: unknown): unknown[] {
  const chunks = (value as { queryChunks?: unknown[] } | null)?.queryChunks;
  if (!Array.isArray(chunks)) return [];
  return chunks.flatMap((chunk) => (chunk && typeof chunk === "object" && "queryChunks" in chunk ? sqlParams(chunk) : [chunk]));
}
const rawDates = (value: unknown): number => sqlParams(value).filter((p) => p instanceof Date).length;

const open = (id: string, extra: Record<string, unknown> = {}) => ({ id, interpreterId: TERP, interpreterName: "Interpreter", question: "Is parking provided?", askedAt: "2026-11-23T10:00:00.000Z", ...extra });
const params = (questionId: string) => ({ requestId: REQUEST, questionId, answer: "Yes, free parking in lot B.", staffName: "Agency staff" });

describe("answering an interpreter's question (Phase 33.1)", () => {
  it("the check below does catch the old bug: a raw Date inside a sql template", () => {
    assert.equal(rawDates(sql`UPDATE requests SET updated_at = ${NOW} WHERE id = ${REQUEST}`), 1);
    assert.equal(rawDates(sql`select ${"a string"}::jsonb, ${3}`), 0);
  });

  for (const [label, extra, id] of [["asked before accepting", { beforeAccepting: true }, Q_BEFORE], ["asked after accepting", {}, Q_AFTER]] as const) {
    it(`saves an answer to a question ${label}, without a raw Date in any sql`, async () => {
      const { tx, calls } = fakeTx([open(id, extra), open("5a8c56a4-0000-4000-8000-0000000000b3", { askedAt: "2026-11-23T11:00:00.000Z" })]);
      const saved = await saveAnswer(tx, params(id), NOW);
      assert.ok(saved.ok);
      assert.equal(saved.answered.answer, "Yes, free parking in lot B.");
      assert.equal(saved.answered.answeredAt, NOW.toISOString());

      const [requestWrite, ...rest] = calls;
      assert.equal(requestWrite.op, "update");
      assert.equal(requestWrite.values.updatedAt, NOW, "updated_at goes through the typed column, not a sql parameter");
      assert.equal(rawDates(requestWrite.values.data), 0);
      for (const call of calls) for (const value of Object.values(call.values)) assert.equal(rawDates(value), 0);
      // The stored list is a JSON string parameter with this one answered and the other still open.
      const stored = sqlParams(requestWrite.values.data).find((p): p is string => typeof p === "string" && p.startsWith("["));
      const list = JSON.parse(stored ?? "[]") as { id: string; answer?: string }[];
      assert.equal(list.find((q) => q.id === id)?.answer, "Yes, free parking in lot B.");
      assert.equal(list.filter((q) => q.answer).length, 1);

      // The interpreter's message, the staff history line, and the notices closed for staff, all in the same transaction.
      assert.deepEqual(rest.map((c) => [c.op, c.values.kind ?? "dismiss"]), [["insert", "agency_message"], ["insert", "question_answered"], ["update", "dismiss"]]);
      assert.equal(rest[0].values.interpreterId, TERP);
      assert.equal(rest[0].values.audience, "shared");
      assert.equal(rest[1].values.audience, "agency");
      assert.ok(rest[2].values.bannerDismissedAt === NOW && rest[2].values.isRead === true);
    });
  }

  it("refuses a question that is gone or already answered, and a request that is gone, writing nothing", async () => {
    const answered = open(Q_AFTER, { answer: "Already answered", answeredAt: "2026-11-23T12:00:00.000Z" });
    for (const [rows, id, error] of [
      [[answered], Q_AFTER, "This question was already answered."],
      [[open(Q_BEFORE)], Q_AFTER, "That question is no longer on this request."],
    ] as const) {
      const { tx, calls } = fakeTx([...rows]);
      assert.deepEqual(await saveAnswer(tx, params(id), NOW), { ok: false, error });
      assert.equal(calls.length, 0);
    }
    const gone = { select: () => ({ from: () => ({ where: () => ({ for: async () => [] }) }) }) } as unknown as AnswerTx;
    assert.deepEqual(await saveAnswer(gone, params(Q_AFTER), NOW), { ok: false, error: "This request no longer exists." });
  });

  it("the staff notice for the question is the one that is closed", () => {
    assert.equal(questionHref(REQUEST, Q_BEFORE), `/requests/${REQUEST}?question=${Q_BEFORE}#questions`);
  });
});
