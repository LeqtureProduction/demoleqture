import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";

// The "Session recordings" grid on the site. Each entry is a session's
// recording: a session name, a speaker name, and an optional link to the
// recording itself. Leaving the link blank shows "Available soon" (a
// plain, non-clickable card); filling it in shows "Available now" (a
// clickable card opening the link in a new tab).
//
// The speaker's photo is never uploaded here — it's looked up by matching
// this entry's speaker name (case-insensitive) against the Programme
// session list in sessions.mjs, and used automatically if that speaker
// has a photo uploaded there. No match, or no photo on the matching
// session, just means the card shows with no photo.
//
// Only Super Admin can add, edit, delete, or reorder recordings — same
// restriction as the Programme session list this data is paired with.
// The section's own heading/subheading (the "Recordings" title/subtitle)
// is handled separately by theme.mjs, same pattern as Hero and Sessions.

const LIST_KEY = "list";
const MAX_RECORDINGS = 60;
const SESSION_NAME_MAX = 150;
const SPEAKER_NAME_MAX = 100;
const LINK_MAX = 500;

function isHttpUrl(v) {
  if (typeof v !== "string") return false;
  return /^https?:\/\/.+/i.test(v.trim());
}

async function readList(store) {
  const list = await store.get(LIST_KEY, { type: "json" });
  return Array.isArray(list) ? list : [];
}

// Best-effort lookup — if the sessions list has never been saved yet
// (fresh site, nothing uploaded there), this just finds nothing, which
// is the same outcome as a speaker who genuinely has no photo yet.
async function findSpeakerPhotoSessionId(speakerName) {
  const name = (speakerName || "").trim().toLowerCase();
  if (!name) return null;
  const sessionsStore = getStore({ name: "demoleqture-sessions", consistency: "strong" });
  const sessions = (await sessionsStore.get("list", { type: "json" })) || [];
  const match = sessions.find(
    (s) => s.hasPhoto && (s.speakerName || "").trim().toLowerCase() === name
  );
  return match ? match.id : null;
}

async function publicEntry(entry) {
  return {
    id: entry.id,
    sessionName: entry.sessionName,
    speakerName: entry.speakerName,
    link: entry.link || "",
    available: isHttpUrl(entry.link),
    speakerPhotoSessionId: await findSpeakerPhotoSessionId(entry.speakerName),
    updated_at: entry.updated_at,
  };
}

function publicList(list) {
  return Promise.all(list.map(publicEntry));
}

export default async (req) => {
  const store = getStore({ name: "demoleqture-recordings", consistency: "strong" });

  // GET is public — every visitor's browser needs the recordings list.
  if (req.method === "GET") {
    const list = await readList(store);
    return Response.json({ recordings: await publicList(list) });
  }

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
  // Every mutation here is Super Admin only.
  if (role !== "super") {
    return Response.json({ error: "only Super Admin can change recordings" }, { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (body.action === "reorder") {
    if (!Array.isArray(body.order)) {
      return Response.json({ error: 'expected {action:"reorder", order:[ids]}' }, { status: 400 });
    }
    const list = await readList(store);
    const byId = new Map(list.map((r) => [r.id, r]));
    const ordered = [];
    for (const id of body.order) {
      if (byId.has(id)) {
        ordered.push(byId.get(id));
        byId.delete(id);
      }
    }
    for (const leftover of byId.values()) ordered.push(leftover);
    await store.setJSON(LIST_KEY, ordered);
    return Response.json({ ok: true, recordings: await publicList(ordered) });
  }

  if (body.action === "delete") {
    const list = await readList(store);
    const next = list.filter((r) => r.id !== body.id);
    if (next.length === list.length) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    await store.setJSON(LIST_KEY, next);
    return Response.json({ ok: true, recordings: await publicList(next) });
  }

  if (body.action === "add" || body.action === "edit") {
    const src = body.recording && typeof body.recording === "object" ? body.recording : {};
    const sessionName = typeof src.sessionName === "string" ? src.sessionName.trim() : "";
    const speakerName = typeof src.speakerName === "string" ? src.speakerName.trim() : "";
    const link = typeof src.link === "string" ? src.link.trim() : "";

    if (!sessionName || sessionName.length > SESSION_NAME_MAX) {
      return Response.json({ error: `session name is required, max ${SESSION_NAME_MAX} characters` }, { status: 400 });
    }
    if (!speakerName || speakerName.length > SPEAKER_NAME_MAX) {
      return Response.json({ error: `speaker name is required, max ${SPEAKER_NAME_MAX} characters` }, { status: 400 });
    }
    if (link && (!isHttpUrl(link) || link.length > LINK_MAX)) {
      return Response.json(
        { error: `link must be a full http(s) URL, or left blank for "Available soon"` },
        { status: 400 }
      );
    }

    const list = await readList(store);
    const clean = { sessionName, speakerName, link, updated_at: Date.now() };

    if (body.action === "edit") {
      const idx = list.findIndex((r) => r.id === body.id);
      if (idx === -1) {
        return Response.json({ error: "not found" }, { status: 404 });
      }
      list[idx] = { ...clean, id: list[idx].id };
      await store.setJSON(LIST_KEY, list);
      return Response.json({ ok: true, recording: await publicEntry(list[idx]), recordings: await publicList(list) });
    }

    if (list.length >= MAX_RECORDINGS) {
      return Response.json({ error: `maximum of ${MAX_RECORDINGS} recordings reached — remove one first` }, { status: 400 });
    }
    const recording = { ...clean, id: crypto.randomUUID() };
    list.push(recording);
    await store.setJSON(LIST_KEY, list);
    return Response.json({ ok: true, recording: await publicEntry(recording), recordings: await publicList(list) });
  }

  return Response.json(
    { error: 'expected {action:"add"|"edit"|"delete"|"reorder", ...}' },
    { status: 400 }
  );
};

export const config = { path: "/api/recordings" };
