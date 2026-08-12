import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";

// A single admin-editable "text + image" content block, shown on the site
// as its own section (fixed position: after Recordings, before the
// footer). Both Super Admin and Customer Admin can edit it. Unlike the
// image link cards, this is one block, not a repeatable list — just a
// title, a paragraph of body text, and one optional image.

const INFO_KEY = "info";
const BYTES_KEY = "bytes";
const TITLE_MAX = 80;
const BODY_MAX = 600;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function defaultInfo() {
  return { title: "", body: "", hasImage: false, contentType: "", updated_at: 0 };
}

async function readInfo(store) {
  const info = await store.get(INFO_KEY, { type: "json" });
  return info && typeof info === "object" ? { ...defaultInfo(), ...info } : defaultInfo();
}

export default async (req) => {
  const store = getStore({ name: "demoleqture-feature", consistency: "strong" });
  const url = new URL(req.url);

  // Public: serve the image bytes.
  if (req.method === "GET" && url.searchParams.get("image")) {
    const info = await readInfo(store);
    if (!info.hasImage) return new Response("Not found", { status: 404 });
    const bytes = await store.get(BYTES_KEY, { type: "arrayBuffer" });
    if (!bytes) return new Response("Not found", { status: 404 });
    return new Response(bytes, {
      headers: { "content-type": info.contentType || "image/jpeg", "cache-control": "no-store" },
    });
  }

  // Public: metadata (title/body/hasImage/updated_at), no image bytes.
  if (req.method === "GET") {
    const info = await readInfo(store);
    return Response.json({ title: info.title, body: info.body, hasImage: info.hasImage, updated_at: info.updated_at });
  }

  // Everything below mutates — requires either admin role.
  if (!process.env.ADMIN_KEY && !process.env.CUSTOMER_ADMIN_KEY) {
    return Response.json(
      { error: "Neither ADMIN_KEY nor CUSTOMER_ADMIN_KEY is configured on this site." },
      { status: 500 }
    );
  }
  if (!getRole(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (req.method === "DELETE") {
    const part = url.searchParams.get("part") || "all";
    const current = await readInfo(store);
    if (part === "image") {
      await store.delete(BYTES_KEY);
      const next = { ...current, hasImage: false, contentType: "", updated_at: Date.now() };
      await store.setJSON(INFO_KEY, next);
      return Response.json({ ok: true, info: { title: next.title, body: next.body, hasImage: next.hasImage, updated_at: next.updated_at } });
    }
    // part === "all": clear everything back to empty.
    await store.delete(BYTES_KEY);
    const next = defaultInfo();
    next.updated_at = Date.now();
    await store.setJSON(INFO_KEY, next);
    return Response.json({ ok: true, info: { title: next.title, body: next.body, hasImage: next.hasImage, updated_at: next.updated_at } });
  }

  if (req.method === "POST") {
    let form;
    try { form = await req.formData(); }
    catch { return Response.json({ error: "expected multipart/form-data" }, { status: 400 }); }

    const title = String(form.get("title") || "").trim();
    const body = String(form.get("body") || "").trim();
    const file = form.get("image");

    if (title.length > TITLE_MAX) return Response.json({ error: `title must be under ${TITLE_MAX} characters` }, { status: 400 });
    if (body.length > BODY_MAX) return Response.json({ error: `body must be under ${BODY_MAX} characters` }, { status: 400 });

    const current = await readInfo(store);
    const next = { ...current, title, body, updated_at: Date.now() };

    if (file && typeof file !== "string") {
      if (!file.type || !file.type.startsWith("image/")) return Response.json({ error: "file must be an image" }, { status: 400 });
      if (file.size > MAX_BYTES) return Response.json({ error: "image must be smaller than 5MB" }, { status: 400 });
      await store.set(BYTES_KEY, await file.arrayBuffer());
      next.hasImage = true;
      next.contentType = file.type;
    }

    await store.setJSON(INFO_KEY, next);
    return Response.json({ ok: true, info: { title: next.title, body: next.body, hasImage: next.hasImage, updated_at: next.updated_at } });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/feature" };
