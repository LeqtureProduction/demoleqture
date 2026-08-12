import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";

const KEY = "responses";

function csvCell(v) {
  const s = (v === undefined || v === null) ? "" : v.toString();
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows) {
  const headers = [
    "id",
    "created_at",
    "updated_at",
    "complete",
    "q1_rating",
    "q2_rating",
    "q3_text",
    "q4_text",
    "q5_text",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        new Date(r.created_at).toISOString(),
        new Date(r.updated_at).toISOString(),
        r.complete,
        r.q1_rating,
        r.q2_rating,
        r.q3_text,
        r.q4_text,
        r.q5_text,
      ]
        .map(csvCell)
        .join(",")
    );
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
  // responses — only starting/stopping the survey itself is super-only.
  if (!getRole(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const store = getStore({ name: "quantexa-survey", consistency: "strong" });
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

  const csv = toCsv(list);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="survey-responses.csv"`,
      "cache-control": "no-store",
    },
  });
};

export const config = { path: "/api/survey-export" };
