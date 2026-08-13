import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";
import { QUESTIONS_KEY, TYPES, LABEL_MAX, MAX_QUESTIONS, readQuestions } from "./lib/survey-schema.mjs";

// The set of questions shown in the on-demand survey modal. Originally a
// fixed 5-question list hardcoded into index.html; now Super Admin can
// add new questions, edit existing ones, hide a question (keeps it and
// its past answers, just stops showing it to new visitors), delete one
// outright, and reorder the list. Managing this list is Super Admin only
// — Customer Admin can still view/download responses (survey-export.mjs)
// but doesn't touch the question set itself.
//
// Storage: one JSON array (store "quantexa-survey", key "questions") —
// the same Blobs store survey-state.mjs and survey-response.mjs already
// use, just a different key, so responses/state/questions all live
// together.

export default async (req) => {
  const store = getStore({ name: "quantexa-survey", consistency: "strong" });

  // GET is public — every visitor's browser needs the current question
  // list to render the survey modal (hidden questions are included too;
  // the client is responsible for skipping them when rendering).
  if (req.method === "GET") {
    const questions = await readQuestions(store);
    return Response.json({ questions });
  }

  if (!process.env.ADMIN_KEY && !process.env.CUSTOMER_ADMIN_KEY) {
    return Response.json(
      { error: "Neither ADMIN_KEY nor CUSTOMER_ADMIN_KEY is configured on this site." },
      { status: 500 }
    );
  }
  const role = getRole(req);
  if (!role) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // Every mutation here is Super Admin only.
  if (role !== "super") {
    return Response.json({ error: "only Super Admin can change survey questions" }, { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const list = await readQuestions(store);

  if (body.action === "add") {
    if (list.length >= MAX_QUESTIONS) {
      return Response.json({ error: `maximum of ${MAX_QUESTIONS} questions reached — remove one first` }, { status: 400 });
    }
    const type = String(body.type || "").trim();
    if (!TYPES.has(type)) {
      return Response.json({ error: `type must be one of: ${Array.from(TYPES).join(", ")}` }, { status: 400 });
    }
    const label = String(body.label || "").trim();
    if (!label || label.length > LABEL_MAX) {
      return Response.json({ error: `label is required, max ${LABEL_MAX} characters` }, { status: 400 });
    }
    const question = { id: crypto.randomUUID(), type, label, required: !!body.required, hidden: false };
    list.push(question);
    await store.setJSON(QUESTIONS_KEY, list);
    return Response.json({ ok: true, question, questions: list });
  }

  if (body.action === "edit") {
    const idx = list.findIndex((q) => q.id === body.id);
    if (idx === -1) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    const type = String(body.type || list[idx].type).trim();
    if (!TYPES.has(type)) {
      return Response.json({ error: `type must be one of: ${Array.from(TYPES).join(", ")}` }, { status: 400 });
    }
    const label = String(body.label || "").trim();
    if (!label || label.length > LABEL_MAX) {
      return Response.json({ error: `label is required, max ${LABEL_MAX} characters` }, { status: 400 });
    }
    list[idx] = { ...list[idx], type, label, required: !!body.required };
    await store.setJSON(QUESTIONS_KEY, list);
    return Response.json({ ok: true, question: list[idx], questions: list });
  }

  if (body.action === "hide") {
    const idx = list.findIndex((q) => q.id === body.id);
    if (idx === -1) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    list[idx] = { ...list[idx], hidden: !!body.hidden };
    await store.setJSON(QUESTIONS_KEY, list);
    return Response.json({ ok: true, question: list[idx], questions: list });
  }

  if (body.action === "delete") {
    const next = list.filter((q) => q.id !== body.id);
    if (next.length === list.length) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    await store.setJSON(QUESTIONS_KEY, next);
    return Response.json({ ok: true, questions: next });
  }

  if (body.action === "reorder") {
    if (!Array.isArray(body.order)) {
      return Response.json({ error: 'expected {action:"reorder", order:[ids]}' }, { status: 400 });
    }
    const byId = new Map(list.map((q) => [q.id, q]));
    const ordered = [];
    for (const id of body.order) {
      if (byId.has(id)) {
        ordered.push(byId.get(id));
        byId.delete(id);
      }
    }
    for (const leftover of byId.values()) ordered.push(leftover);
    await store.setJSON(QUESTIONS_KEY, ordered);
    return Response.json({ ok: true, questions: ordered });
  }

  return Response.json(
    { error: 'expected {action:"add"|"edit"|"hide"|"delete"|"reorder", ...}' },
    { status: 400 }
  );
};

export const config = { path: "/api/survey-questions" };
