import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";

// A single admin-editable "text + image" content block, shown on the site
// as its own section (fixed position: after Recordings, before the
// footer). Both Super Admin and Customer Admin can edit it. Unlike the
// image link cards, this is one block, not a repeatable list — just a
// title, a paragraph of body text, and one optional image.
//
// Title and body accept basic rich text (bold, italic, underline, lists,
// links) from a small admin toolbar, stored and served as HTML. Since
// this HTML is rendered on the public site, it's run through a small
// allow-list sanitizer below before being saved — this is not meant to
// be a general-purpose HTML sanitizer (it's not hardened against every
// possible malformed-markup trick), just enough to strip anything but a
// handful of safe formatting tags for admin-authored content.

const INFO_KEY = "info";
const BYTES_KEY = "bytes";
const TITLE_MAX = 200;
const BODY_MAX = 4000;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

// Layout controls how the image and text are arranged on the site:
//   "right" — text left, image right (the original/default layout)
//   "left"  — image left, text right
//   "wrap"  — image floated to one side, text flows around it
//   "above" — image on top, text below, both full width
const LAYOUTS = new Set(["right", "left", "wrap", "above"]);
// imageSize is a percentage of the section's width the image should
// target (used differently per layout — column share for right/left,
// float width for wrap, max-width for above).
const IMAGE_SIZE_MIN = 20;
const IMAGE_SIZE_MAX = 100;
const IMAGE_SIZE_DEFAULT = 45;

const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "a", "p", "div", "span"]);

function sanitizeHtml(html) {
  if (typeof html !== "string") return "";
  return html
    .replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, function (match, tag, attrs) {
      tag = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (match.charAt(1) === "/") return "</" + tag + ">";
      if (tag === "a") {
        const hrefMatch = /href\s*=\s*"(https?:\/\/[^"]*)"/i.exec(attrs) || /href\s*=\s*'(https?:\/\/[^']*)'/i.exec(attrs);
        return hrefMatch ? '<a href="' + hrefMatch[1].replace(/"/g, "&quot;") + '" target="_blank" rel="noopener">' : "<a>";
      }
      return "<" + tag + ">";
    })
    .trim();
}

// position: 0 = before Sessions, 1 = between Sessions and Recordings,
// 2 = after Recordings, before the footer (the section's original,
// fixed spot — kept as the default so existing content doesn't move).
function defaultInfo() {
  return {
    title: "", body: "", hasImage: false, contentType: "", position: 2,
    layout: "right", imageSize: IMAGE_SIZE_DEFAULT, updated_at: 0
  };
}

async function readInfo(store) {
  const info = await store.get(INFO_KEY, { type: "json" });
  return info && typeof info === "object" ? { ...defaultInfo(), ...info } : defaultInfo();
}

function publicInfo(info) {
  return {
    title: info.title, body: info.body, hasImage: info.hasImage, position: info.position,
    layout: info.layout, imageSize: info.imageSize, updated_at: info.updated_at
  };
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

  // Public: metadata (title/body/hasImage/position/updated_at), no image bytes.
  if (req.method === "GET") {
    const info = await readInfo(store);
    return Response.json(publicInfo(info));
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
      return Response.json({ ok: true, info: publicInfo(next) });
    }
    // part === "all": clear the title/body/image back to empty, but keep
    // wherever the section was positioned.
    await store.delete(BYTES_KEY);
    const next = { ...defaultInfo(), position: current.position, updated_at: Date.now() };
    await store.setJSON(INFO_KEY, next);
    return Response.json({ ok: true, info: publicInfo(next) });
  }

  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") || "";

    // JSON body = move the section: {action:"position", position:0|1|2}
    if (contentType.includes("application/json")) {
      let body;
      try { body = await req.json(); }
      catch { return Response.json({ error: "invalid JSON body" }, { status: 400 }); }
      if (body.action !== "position") {
        return Response.json({ error: "expected {action:\"position\", position:0|1|2}" }, { status: 400 });
      }
      const p = Number(body.position);
      if (!Number.isInteger(p) || p < 0 || p > 2) {
        return Response.json({ error: "position must be 0, 1, or 2" }, { status: 400 });
      }
      const current = await readInfo(store);
      const next = { ...current, position: p, updated_at: Date.now() };
      await store.setJSON(INFO_KEY, next);
      return Response.json({ ok: true, info: publicInfo(next) });
    }

    // Otherwise: multipart/form-data = edit the title/body/image.
    let form;
    try { form = await req.formData(); }
    catch { return Response.json({ error: "expected multipart/form-data or application/json" }, { status: 400 }); }

    const title = sanitizeHtml(String(form.get("title") || ""));
    const body = sanitizeHtml(String(form.get("body") || ""));
    const file = form.get("image");

    if (title.length > TITLE_MAX) return Response.json({ error: `title must be under ${TITLE_MAX} characters` }, { status: 400 });
    if (body.length > BODY_MAX) return Response.json({ error: `body must be under ${BODY_MAX} characters` }, { status: 400 });

    const current = await readInfo(store);

    let layout = current.layout || "right";
    if (form.has("layout")) {
      const l = String(form.get("layout") || "").trim();
      if (!LAYOUTS.has(l)) {
        return Response.json({ error: `layout must be one of: ${Array.from(LAYOUTS).join(", ")}` }, { status: 400 });
      }
      layout = l;
    }

    let imageSize = current.imageSize || IMAGE_SIZE_DEFAULT;
    if (form.has("imageSize")) {
      const s = Number(form.get("imageSize"));
      if (!Number.isInteger(s) || s < IMAGE_SIZE_MIN || s > IMAGE_SIZE_MAX) {
        return Response.json({ error: `image size must be a whole number between ${IMAGE_SIZE_MIN} and ${IMAGE_SIZE_MAX}` }, { status: 400 });
      }
      imageSize = s;
    }

    const next = { ...current, title, body, layout, imageSize, updated_at: Date.now() };

    if (file && typeof file !== "string") {
      if (!file.type || !file.type.startsWith("image/")) return Response.json({ error: "file must be an image" }, { status: 400 });
      if (file.size > MAX_BYTES) return Response.json({ error: "image must be smaller than 5MB" }, { status: 400 });
      await store.set(BYTES_KEY, await file.arrayBuffer());
      next.hasImage = true;
      next.contentType = file.type;
    }

    await store.setJSON(INFO_KEY, next);
    return Response.json({ ok: true, info: publicInfo(next) });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/feature" };
