import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";
import { readQuestions } from "./lib/survey-schema.mjs";

const KEY = "responses";

function csvCell(v) {
  const s = (v === undefined || v === null) ? "" : v.toString();
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Columns are built from the *current* question list (in its current
// order, using each question's label as the header) rather than a fixed
// q1..q5 shape — so the export always matches whatever questions exist
// today, including ones Super Admin added after the fact. A response's
// answer for a question that's since been deleted has nowhere to go in
// this layout; use the JSON export if you need that raw data preserved.
function toCsv(rows, questions) {
  const headers = ["id", "created_at", "updated_at", "complete"].concat(
    questions.map((q) => q.label || q.id)
  );
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    const answers = r.answers || {};
    const row = [
      r.id,
      new Date(r.created_at).toISOString(),
      new Date(r.updated_at).toISOString(),
      r.complete,
    ].concat(questions.map((q) => (q.id in answers ? answers[q.id] : "")));
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\n");
}

export default async (req) => {
  if (!process.env.ADMIN_KEY && !process.env.CUSTOMER_ADMIN_KEY) {
    return Response.json(
      { error: "Neither ADMIN_KEY nor CUSTOMER_ADMIN_KEY is configured on this site." },
      { status: 500 }
    );
  }
  // Both Super Admin and Customer Admin are allowed to view/download
  // responses — only starting/stopping the survey, changing its
  // questions, and deleting results are super-only.
  const role = getRole(req);
  if (!role) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const store = getStore({ name: "quantexa-survey", consistency: "strong" });

  if (req.method === "DELETE") {
    if (role !== "super") {
      return Response.json({ error: "only Super Admin can delete survey results" }, { status: 403 });
    }
    await store.setJSON(KEY, []);
    return Response.json({ ok: true, cleared: true });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const list = (await store.get(KEY, { type: "json" })) || [];

  const url = new URL(req.url);
  if (url.searchParams.get("format") === "json") {
    return new Response(JSON.stringify(list, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="survey-responses.json"`,
        "cache-control": "no-store",
      },
    });
  }

  const questions = await readQuestions(store);
  const csv = toCsv(list, questions);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="survey-responses.csv"`,
      "cache-control": "no-store",
    },
  });
};

export const config = { path: "/api/survey-export" };
