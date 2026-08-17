import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";

// Which of the three "Add to calendar" options show up in the dropdown
// on every Programme session, site-wide. Not per-session — one on/off
// switch per calendar type, same as most display/config settings (both
// Super Admin and Customer Admin can change it, unlike the actual
// session data in sessions.mjs which is Super Admin only).

const KEY = "options";
const OPTION_KEYS = ["google", "outlook", "ics"];

function defaultOptions() {
  return { google: true, outlook: true, ics: true, updated_at: 0 };
}

export default async (req) => {
  const store = getStore({ name: "demoleqture-calendar-options", consistency: "strong" });

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

    const options = {};
    for (const k of OPTION_KEYS) options[k] = !!body[k];

    if (OPTION_KEYS.every((k) => !options[k])) {
      return Response.json({ error: "at least one calendar option must stay enabled" }, { status: 400 });
    }

    const state = { ...options, updated_at: Date.now() };
    await store.setJSON(KEY, state);
    return Response.json(state);
  }

  // GET is public — every visitor's browser needs this to know which
  // links to show in the "Add to calendar" dropdown.
  const state = (await store.get(KEY, { type: "json" })) || defaultOptions();
  return new Response(JSON.stringify(state), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/calendar-options" };
