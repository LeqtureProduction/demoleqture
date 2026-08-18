import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";

// Live audience-participation popup (e.g. a Mentimeter link) that the
// Super Admin can push out to every visitor mid-session, same on/off
// pattern as the hero video player and the announcement bar: publishing
// a link shows it, clearing the link hides it. Super Admin only — this
// is a live-event control, not everyday content, same tier as
// announcement.mjs and player.mjs.

const KEY = "state";
const URL_MAX = 500;
const URL_RE = /^https?:\/\//i;

export default async (req) => {
  // Strong consistency so a published/cleared link is visible to every
  // visitor's next poll immediately, not eventually.
  const store = getStore({ name: "demoleqture-menti", consistency: "strong" });

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
    const url = (body.url || "").toString().trim().slice(0, URL_MAX);
    if (url && !URL_RE.test(url)) {
      return Response.json({ error: "link must start with http:// or https://" }, { status: 400 });
    }
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

export const config = { path: "/api/menti" };
