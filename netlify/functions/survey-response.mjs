import { getStore } from "@netlify/blobs";
import { readQuestions } from "./lib/survey-schema.mjs";

const KEY = "responses";
const MAX = 5000;
const TEXT_MAX = 2000;

function clampRating(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return n;
}

function clampText(v) {
  if (v === undefined || v === null) return "";
  return v.toString().trim().slice(0, TEXT_MAX);
}

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405 });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {}

  const incoming = body.answers && typeof body.answers === "object" ? body.answers : {};

  // Strong consistency is required here too — this does a read-modify-write
  // of one shared JSON blob, so a stale read would silently drop or clobber
  // someone else's answer when two people save within the same second.
  const store = getStore({ name: "quantexa-survey", consistency: "strong" });
  const questions = await readQuestions(store);
  const byId = new Map(questions.map((q) => [q.id, q]));

  // Validate/clean whatever answers were sent against the *current*
  // question list — anything for a question id that's since been deleted
  // is silently dropped rather than trusted as-is.
  const cleanAnswers = {};
  for (const [qid, raw] of Object.entries(incoming)) {
    const q = byId.get(qid);
    if (!q) continue;
    if (q.type === "rating") {
      const n = clampRating(raw);
      if (n !== null) cleanAnswers[qid] = n;
    } else {
      cleanAnswers[qid] = clampText(raw);
    }
  }

  const list = (await store.get(KEY, { type: "json" })) || [];

  let id = (body.id || "").toString().slice(0, 40);
  let entry = id ? list.find((r) => r.id === id) : null;

  // Questions that are both required and currently visible are the
  // mandatory gate — matches the client, which only ever creates a
  // response once every required field has a value, but we don't trust
  // the client alone.
  const requiredIds = questions.filter((q) => q.required && !q.hidden).map((q) => q.id);

  if (!entry) {
    const hasAllRequired = requiredIds.every((qid) => {
      const q = byId.get(qid);
      const v = cleanAnswers[qid];
      return q.type === "rating" ? typeof v === "number" : typeof v === "string" && v.length > 0;
    });
    if (!hasAllRequired) {
      return Response.json(
        { error: "all required questions must be answered to start a response" },
        { status: 400 }
      );
    }
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    entry = {
      id,
      answers: cleanAnswers,
      complete: false,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    list.push(entry);
  } else {
    entry.answers = { ...entry.answers, ...cleanAnswers };
    if ("complete" in body) entry.complete = !!body.complete;
    entry.updated_at = Date.now();
  }

  await store.setJSON(KEY, list.slice(-MAX));
  return Response.json({ ok: true, id, response: entry });
};

export const config = { path: "/api/survey-response" };
