import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";

const KEY = "message";
const TEXT_MAX = 300;

export default async (req) => {
  // Strong consistency so a published/cleared message is visible to every
  // visitor's next poll immediately, not eventually.
  const store = getStore({ name: "demoleqture-announcement", consistency: "strong" });

  if (req.method === "POST") {
    if (!process.env.ADMIN_KEY) {
      return Response.json(
        { error: "ADMIN_KEY is not configured on this site. Set it in Netlify env vars." },
        { status: 500 }
      );
    }
    if (getRole(req) !== "super") {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    let body = {};
    try {
      body = await req.json();
    } catch {}
    const text = (body.text || "").toString().trim().slice(0, TEXT_MAX);
    const state = { text, updated_at: Date.now() };
    await store.setJSON(KEY, state);
    return Response.json({ ok: true, state });
  }

  // GET is public — every visitor needs to be able to check for a message.
  const state = (await store.get(KEY, { type: "json" })) || { text: "", updated_at: 0 };
  return new Response(JSON.stringify(state), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/announcement" };
