import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";

// A small admin-managed grid of "image + external link + title + body"
// cards, shown on the site between the Sessions and Recordings sections.
// Both Super Admin and Customer Admin can add/edit/remove/reorder cards.
//
// Storage: one JSON array (store "demoleqture-cards", key "list") holding
// card metadata in display order, plus one raw-bytes blob per card image
// (key "img-<id>"). Kept as a single list blob (not store.list()) so reads
// and reorders are one strongly-consistent read-modify-write.

const LIST_KEY = "list";
const MAX_CARDS = 24;
const TITLE_MAX = 60;
const BODY_MAX = 220;
const LINK_MAX = 500;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function isHttpUrl(v) {
  if (typeof v !== "string") return false;
  return /^https?:\/\/.+/i.test(v.trim());
}

async function readList(store) {
  const list = await store.get(LIST_KEY, { type: "json" });
  return Array.isArray(list) ? list : [];
}

export default async (req) => {
  const store = getStore({ name: "demoleqture-cards", consistency: "strong" });
  const url = new URL(req.url);

  // Public: serve a single card's image bytes.
  if (req.method === "GET" && url.searchParams.get("image")) {
    const id = url.searchParams.get("image");
    const list = await readList(store);
    const card = list.find((c) => c.id === id);
    if (!card) return new Response("Not found", { status: 404 });
    const bytes = await store.get(`img-${id}`, { type: "arrayBuffer" });
    if (!bytes) return new Response("Not found", { status: 404 });
    return new Response(bytes, {
      headers: { "content-type": card.contentType || "image/jpeg", "cache-control": "no-store" },
    });
  }

  // Public: list card metadata (no image bytes).
  if (req.method === "GET") {
    const list = await readList(store);
    const cards = list.map((c) => ({ id: c.id, title: c.title, body: c.body, link: c.link, updated_at: c.updated_at }));
    return Response.json({ cards });
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
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "missing id" }, { status: 400 });
    const list = await readList(store);
    const next = list.filter((c) => c.id !== id);
    if (next.length === list.length) return Response.json({ error: "not found" }, { status: 404 });
    await store.setJSON(LIST_KEY, next);
    await store.delete(`img-${id}`);
    return Response.json({ ok: true, cards: next.map((c) => ({ id: c.id, title: c.title, body: c.body, link: c.link, updated_at: c.updated_at })) });
  }

  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") || "";

    // JSON body = reorder request: {action:"reorder", order:["id1","id2",...]}
    if (contentType.includes("application/json")) {
      let body;
      try { body = await req.json(); }
      catch { return Response.json({ error: "invalid JSON body" }, { status: 400 }); }
      if (body.action !== "reorder" || !Array.isArray(body.order)) {
        return Response.json({ error: "expected {action:\"reorder\", order:[ids]}" }, { status: 400 });
      }
      const list = await readList(store);
      const byId = new Map(list.map((c) => [c.id, c]));
      const ordered = [];
      for (const id of body.order) {
        if (byId.has(id)) {
          ordered.push(byId.get(id));
          byId.delete(id);
        }
      }
      // Any cards not mentioned in the requested order are kept, appended at the end.
      for (const leftover of byId.values()) ordered.push(leftover);
      await store.setJSON(LIST_KEY, ordered);
      return Response.json({ ok: true, cards: ordered.map((c) => ({ id: c.id, title: c.title, body: c.body, link: c.link, updated_at: c.updated_at })) });
    }

    // Otherwise: multipart/form-data = add or edit a card.
    let form;
    try { form = await req.formData(); }
    catch { return Response.json({ error: "expected multipart/form-data or application/json" }, { status: 400 }); }

    const id = form.get("id");
    const title = String(form.get("title") || "").trim();
    const body = String(form.get("body") || "").trim();
    const link = String(form.get("link") || "").trim();
    const file = form.get("image");

    if (!title || title.length > TITLE_MAX) return Response.json({ error: `title is required, max ${TITLE_MAX} characters` }, { status: 400 });
    if (body.length > BODY_MAX) return Response.json({ error: `body must be under ${BODY_MAX} characters` }, { status: 400 });
    if (!isHttpUrl(link) || link.length > LINK_MAX) return Response.json({ error: "link must be a full http(s) URL" }, { status: 400 });

    const list = await readList(store);

    if (id && typeof id === "string") {
      // Edit existing card.
      const idx = list.findIndex((c) => c.id === id);
      if (idx === -1) return Response.json({ error: "card not found" }, { status: 404 });
      const card = { ...list[idx], title, body, link, updated_at: Date.now() };
      if (file && typeof file !== "string") {
        if (!file.type || !file.type.startsWith("image/")) return Response.json({ error: "file must be an image" }, { status: 400 });
        if (file.size > MAX_BYTES) return Response.json({ error: "image must be smaller than 5MB" }, { status: 400 });
        await store.set(`img-${id}`, await file.arrayBuffer());
        card.contentType = file.type;
      }
      list[idx] = card;
      await store.setJSON(LIST_KEY, list);
      return Response.json({ ok: true, card: { id: card.id, title: card.title, body: card.body, link: card.link, updated_at: card.updated_at } });
    }

    // New card — image is required.
    if (list.length >= MAX_CARDS) return Response.json({ error: `maximum of ${MAX_CARDS} cards reached — remove one first` }, { status: 400 });
    if (!file || typeof file === "string") return Response.json({ error: "an image file is required for a new card" }, { status: 400 });
    if (!file.type || !file.type.startsWith("image/")) return Response.json({ error: "file must be an image" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "image must be smaller than 5MB" }, { status: 400 });

    const newId = crypto.randomUUID();
    await store.set(`img-${newId}`, await file.arrayBuffer());
    const card = { id: newId, title, body, link, contentType: file.type, updated_at: Date.now() };
    list.push(card);
    await store.setJSON(LIST_KEY, list);
    return Response.json({ ok: true, card: { id: card.id, title: card.title, body: card.body, link: card.link, updated_at: card.updated_at } });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/cards" };
