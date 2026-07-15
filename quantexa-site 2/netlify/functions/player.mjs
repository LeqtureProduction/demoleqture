import { getStore } from "@netlify/blobs";

const KEY = "player";
const URL_MAX = 500;

function isAdmin(req) {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  return req.headers.get("x-admin-key") === key;
}

export default async (req) => {
  // Strong consistency so a published/cleared link is visible to every
  // visitor's next poll immediately, not eventually.
  const store = getStore({ name: "demoleqture-player", consistency: "strong" });

  if (req.method === "POST") {
    if (!process.env.ADMIN_KEY) {
      return Response.json(
        { error: "ADMIN_KEY is not configured on this site. Set it in Netlify env vars." },
        { status: 500 }
      );
    }
    if (!isAdmin(req)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    let body = {};
    try {
      body = await req.json();
    } catch {}
    const url = (body.url || "").toString().trim().slice(0, URL_MAX);
    const state = { url, updated_at: Date.now() };
    await store.setJSON(KEY, state);
    return Response.json({ ok: true, state });
  }

  // GET is public — every visitor needs to be able to check for a link.
  const state = (await store.get(KEY, { type: "json" })) || { url: "", updated_at: 0 };
  return new Response(JSON.stringify(state), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/player" };
