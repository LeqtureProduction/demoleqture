import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";

const BYTES_KEY = "bytes";
const INFO_KEY = "info";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export default async (req) => {
  const store = getStore({ name: "demoleqture-hero-image", consistency: "strong" });

  if (req.method === "POST") {
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

    // Customer Admin can manage the image, but only while the hero video
    // player isn't live — the image wouldn't be visible anyway in that
    // state, so changing it would be confusing. Super Admin has no such
    // restriction.
    if (role === "customer") {
      const playerStore = getStore({ name: "demoleqture-player", consistency: "strong" });
      const playerState = await playerStore.get("player", { type: "json" });
      if (playerState && playerState.url) {
        return Response.json(
          { error: "The hero video player is currently live. Turn it off before changing the image." },
          { status: 409 }
        );
      }
    }

    let form;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ error: "expected multipart/form-data with an \"image\" field" }, { status: 400 });
    }
    const file = form.get("image");
    if (!file || typeof file === "string") {
      return Response.json({ error: "no image file provided" }, { status: 400 });
    }
    if (!file.type || !file.type.startsWith("image/")) {
      return Response.json({ error: "file must be an image" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "image must be smaller than 5MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const info = { contentType: file.type, updated_at: Date.now() };
    await store.set(BYTES_KEY, bytes);
    await store.setJSON(INFO_KEY, info);
    return Response.json({ ok: true, info });
  }

  if (req.method === "DELETE") {
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
    if (role === "customer") {
      const playerStore = getStore({ name: "demoleqture-player", consistency: "strong" });
      const playerState = await playerStore.get("player", { type: "json" });
      if (playerState && playerState.url) {
        return Response.json(
          { error: "The hero video player is currently live. Turn it off before changing the image." },
          { status: 409 }
        );
      }
    }
    await store.delete(BYTES_KEY);
    await store.delete(INFO_KEY);
    return Response.json({ ok: true });
  }

  // GET is public. ?meta=1 returns lightweight JSON (whether an image
  // exists, and its timestamp) so the site can poll cheaply without
  // re-downloading the image itself every time. Without that flag it
  // serves the actual image bytes.
  const url = new URL(req.url);
  const info = (await store.get(INFO_KEY, { type: "json" })) || null;

  if (url.searchParams.get("meta") === "1") {
    return new Response(JSON.stringify({ exists: !!info, updated_at: info ? info.updated_at : 0 }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  if (!info) {
    return new Response("Not found", { status: 404 });
  }
  const bytes = await store.get(BYTES_KEY, { type: "arrayBuffer" });
  if (!bytes) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(bytes, {
    headers: { "content-type": info.contentType, "cache-control": "no-store" },
  });
};

export const config = { path: "/api/hero-image" };
