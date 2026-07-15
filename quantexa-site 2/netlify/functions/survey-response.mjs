import { getStore } from "@netlify/blobs";

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

  const q1_rating = "q1_rating" in body ? clampRating(body.q1_rating) : undefined;
  const q2_rating = "q2_rating" in body ? clampRating(body.q2_rating) : undefined;

  // Strong consistency is required here too — this does a read-modify-write
  // of one shared JSON blob, so a stale read would silently drop or clobber
  // someone else's answer when two people save within the same second.
  const store = getStore({ name: "quantexa-survey", consistency: "strong" });
  const list = (await store.get(KEY, { type: "json" })) || [];

  let id = (body.id || "").toString().slice(0, 40);
  let entry = id ? list.find((r) => r.id === id) : null;

  if (!entry) {
    // Creating a brand-new response requires both mandatory ratings — this
    // mirrors the client, which only ever creates a response once both
    // stars are set, but we don't trust the client alone.
    if (q1_rating === null || q2_rating === null || q1_rating === undefined || q2_rating === undefined) {
      return Response.json(
        { error: "both mandatory ratings are required to start a response" },
        { status: 400 }
      );
    }
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    entry = {
      id,
      q1_rating,
      q2_rating,
      q3_text: "",
      q4_text: "",
      q5_text: "",
      complete: false,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    list.push(entry);
  } else {
    if (q1_rating !== undefined && q1_rating !== null) entry.q1_rating = q1_rating;
    if (q2_rating !== undefined && q2_rating !== null) entry.q2_rating = q2_rating;
    if ("q3_text" in body) entry.q3_text = clampText(body.q3_text);
    if ("q4_text" in body) entry.q4_text = clampText(body.q4_text);
    if ("q5_text" in body) entry.q5_text = clampText(body.q5_text);
    if ("complete" in body) entry.complete = !!body.complete;
    entry.updated_at = Date.now();
  }

  await store.setJSON(KEY, list.slice(-MAX));
  return Response.json({ ok: true, id, response: entry });
};

export const config = { path: "/api/survey-response" };
