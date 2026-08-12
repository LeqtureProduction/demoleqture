import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";

// Site-wide theme: one font for the whole page, plus an optional
// background + text color override per section. Both Super Admin and
// Customer Admin are allowed to change this (unlike survey/announcement/
// player, which are super-only).

const SECTION_KEYS = ["hero", "sessions", "recordings", "footer"];
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FONT_RE = /^[A-Za-z0-9 '-]{0,60}$/;

function emptyTheme() {
  const sections = {};
  for (const k of SECTION_KEYS) sections[k] = { bg: "", text: "" };
  return { font: "", sections, updated_at: 0 };
}

function sanitizeColor(v) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  if (t === "") return "";
  return HEX_RE.test(t) ? t : null; // null = invalid
}

export default async (req) => {
  const store = getStore({ name: "demoleqture-theme", consistency: "strong" });

  if (req.method === "POST") {
    if (!process.env.ADMIN_KEY && !process.env.CUSTOMER_ADMIN_KEY) {
      return Response.json(
        { error: "Neither ADMIN_KEY nor CUSTOMER_ADMIN_KEY is configured on this site." },
        { status: 500 }
      );
    }
    if (!getRole(req)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }

    const font = typeof body.font === "string" ? body.font.trim() : "";
    if (!FONT_RE.test(font)) {
      return Response.json({ error: "font name must be letters, numbers, spaces or hyphens, under 60 characters" }, { status: 400 });
    }

    const sections = {};
    const incoming = body.sections && typeof body.sections === "object" ? body.sections : {};
    for (const k of SECTION_KEYS) {
      const src = incoming[k] && typeof incoming[k] === "object" ? incoming[k] : {};
      const bg = sanitizeColor(src.bg);
      const text = sanitizeColor(src.text);
      if (bg === null || text === null) {
        return Response.json({ error: `invalid color for section "${k}" — use hex like #a855f7 or leave blank` }, { status: 400 });
      }
      sections[k] = { bg, text };
    }

    const theme = { font, sections, updated_at: Date.now() };
    await store.setJSON("theme", theme);
    return Response.json(theme);
  }

  // GET is public — every visitor's browser needs this to render the page.
  const theme = (await store.get("theme", { type: "json" })) || emptyTheme();
  return Response.json(theme);
};

export const config = { path: "/api/theme" };
