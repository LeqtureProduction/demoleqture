import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";

// Site-wide theme: one font for the whole page, plus an optional
// background + text color override per section. Both Super Admin and
// Customer Admin are allowed to change most sections (unlike survey/
// announcement/player, which are super-only) — EXCEPT the footer
// section, which is Super Admin only. Customer Admin's incoming footer
// values are silently ignored/preserved rather than rejected, since the
// shared client-side save function always sends the whole theme object
// (see collectTheme() in admin.html / customer-admin.html).

const SECTION_KEYS = ["hero", "sessions", "recordings", "footer"];
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FONT_RE = /^[A-Za-z0-9 '-]{0,60}$/;
const TITLE_MAX = 80;
const SUBTITLE_MAX = 2500;
const EYEBROW_MAX = 80; // small line above Hero's heading, e.g. "DEMO LEQTURE · 6-10 JULY 2026"

function emptyTheme() {
  const sections = {};
  for (const k of SECTION_KEYS) sections[k] = { bg: "", text: "", title: "", subtitle: "", eyebrow: "" };
  return { font: "", accent: "", sections, updated_at: 0 };
}

function sanitizeColor(v) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  if (t === "") return "";
  return HEX_RE.test(t) ? t : null; // null = invalid
}

function sanitizeText(v, max) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  if (t.length > max) return null; // null = invalid (too long)
  return t;
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
    const role = getRole(req);
    if (!role) {
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

    const accent = sanitizeColor(body.accent);
    if (accent === null) {
      return Response.json({ error: "invalid accent color — use hex like #a855f7 or leave blank" }, { status: 400 });
    }

    const current = (await store.get("theme", { type: "json" })) || emptyTheme();

    const sections = {};
    const incoming = body.sections && typeof body.sections === "object" ? body.sections : {};
    for (const k of SECTION_KEYS) {
      // Footer is Super Admin only — Customer Admin's request always
      // includes a footer object (collectTheme() reads every field
      // regardless of who can see it), so instead of rejecting the
      // whole request we just keep whatever footer was already stored.
      if (k === "footer" && role !== "super") {
        sections[k] = current.sections?.footer || emptyTheme().sections.footer;
        continue;
      }

      const src = incoming[k] && typeof incoming[k] === "object" ? incoming[k] : {};
      const bg = sanitizeColor(src.bg);
      const text = sanitizeColor(src.text);
      if (bg === null || text === null) {
        return Response.json({ error: `invalid color for section "${k}" — use hex like #a855f7 or leave blank` }, { status: 400 });
      }
      const title = sanitizeText(src.title, TITLE_MAX);
      if (title === null) {
        return Response.json({ error: `title for section "${k}" must be under ${TITLE_MAX} characters` }, { status: 400 });
      }
      const subtitle = sanitizeText(src.subtitle, SUBTITLE_MAX);
      if (subtitle === null) {
        return Response.json({ error: `subtitle for section "${k}" must be under ${SUBTITLE_MAX} characters` }, { status: 400 });
      }
      // Only Hero currently shows an eyebrow line on the site, but the
      // field is accepted generically for every section (like title and
      // subtitle) so the schema stays uniform.
      const eyebrow = sanitizeText(src.eyebrow, EYEBROW_MAX);
      if (eyebrow === null) {
        return Response.json({ error: `eyebrow text for section "${k}" must be under ${EYEBROW_MAX} characters` }, { status: 400 });
      }
      sections[k] = { bg, text, title, subtitle, eyebrow };
    }

    const theme = { font, accent, sections, updated_at: Date.now() };
    await store.setJSON("theme", theme);
    return Response.json(theme);
  }

  // GET is public — every visitor's browser needs this to render the page.
  const theme = (await store.get("theme", { type: "json" })) || emptyTheme();
  return Response.json(theme);
};

export const config = { path: "/api/theme" };
