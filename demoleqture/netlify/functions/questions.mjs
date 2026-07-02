import { getStore } from "@netlify/blobs";

const KEY = "questions";
const MAX = 1000;

export default async (req) => {
  // Strong consistency is required — with the default (eventual) consistency,
  // reads can return stale data and questions can silently disappear when
  // people post in quick succession. Do not remove this.
  const store = getStore({ name: "quantexa-qa", consistency: "strong" });

  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {}
    const q = (body.question || "").toString().trim().slice(0, 280);
    if (!q) return Response.json({ error: "empty" }, { status: 400 });

    const list = (await store.get(KEY, { type: "json" })) || [];
    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      question: q,
      created_at: Date.now(),
    };
    list.push(item);
    await store.setJSON(KEY, list.slice(-MAX));
    return Response.json({ ok: true, question: item });
  }

  const list = (await store.get(KEY, { type: "json" })) || [];
  return new Response(JSON.stringify(list), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/questions" };
