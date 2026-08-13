import { getStore } from "@netlify/blobs";
import { getRole } from "./lib/auth.mjs";

// The event programme: a list of timed sessions (date, start/end time,
// speaker name + bio + optional photo, session title, description) shown
// in an accordion on the site. The section's own heading/subheading text
// is handled by theme.mjs instead (sections.sessions.title/subtitle), same
// as Hero and Recordings — so this function only ever deals with the
// session list itself.
//
// Times are stored as plain wall-clock HH:MM values on a given date and
// are always treated as a fixed CET (UTC+1) offset — i.e. exactly what
// the source schedule was given in, not a DST-aware "Europe/..." zone —
// so a stored "07:00" on 2026-10-08 always means 06:00 UTC. The client
// converts that fixed UTC instant into whatever timezone the visitor has
// picked, and uses it to build "Add to calendar" links.
//
// Only Super Admin can add, edit, delete, or reorder sessions (including
// uploading or removing a speaker photo) — this is the "information in
// the excel" the site owner asked to keep locked to Super Admin. Customer
// Admin gets a 403 on every mutation here, and the admin UI hides the
// edit controls entirely for that role (showing a read-only list instead,
// including any uploaded speaker photo).
//
// Storage: one JSON array (store "demoleqture-sessions", key "list")
// holding session metadata in display order, plus one raw-bytes blob per
// uploaded speaker photo (key "photo-<id>"), mirroring cards.mjs's
// "img-<id>" pattern. Sessions without an uploaded photo fall back to an
// auto-generated initials avatar on the site — hasPhoto tells the client
// which to show.

const LIST_KEY = "list";
const MAX_SESSIONS = 60;
const TITLE_MAX = 150;
const SPEAKER_NAME_MAX = 100;
const SPEAKER_BIO_MAX = 3000;
const DESCRIPTION_MAX = 4000;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Seeded from the uploaded programme spreadsheet. Fixed ids ("s1".."s6")
// so edits/reorders/deletes are stable even before the list has ever been
// written to Blobs (see readList below).
const DEFAULT_SESSIONS = [
  {
    "id": "s1",
    "date": "2026-10-08",
    "startTime": "07:00",
    "endTime": "08:00",
    "speakerName": "Liesbeth Smit",
    "speakerBio": "Liesbeth Smit is a nutrition scientist, science communicator, and author of the best-selling book “Eat Like an Expert”. You can find her debunking common nutrition myths and explaining science on TV and in magazines. After a career in nutrition science at Harvard School of Public Health and VU University Amsterdam, she founded her company “The Online Scientist” where she helps other scientists communicate their research to the public in a clear and exciting way.",
    "title": "Pseudoscience And Nutrition",
    "description": "Are superfoods real? Is intermittent fasting healthy? Should we eat more eggs? Is milk a healthy drink? Is breakfast the most important meal of the day? Why is there so much confusion about which foods are healthy? Does the science about what is healthy really change every year? Liesbeth separates facts from fiction in the confusing world of nutrition and shows you how misinformation and pseudoscience can spread. Join Liesbeth in this session and find out if we should blame scientists, the media, or influencers and learn what you can do to live healthier.",
    "hasPhoto": false,
    "updated_at": 0
  },
  {
    "id": "s2",
    "date": "2026-10-08",
    "startTime": "08:00",
    "endTime": "09:00",
    "speakerName": "Abi Adamson",
    "speakerBio": "Abi Adamson, Founder of The Culture Partnership, is a pioneering voice in workplace culture transformation, recognized by The New York Times as one of the \"Stars of LinkedIn.\" She has designed and implemented cultural strategies for global industry leaders, including Spotify, Sony Music, SoHo House, and Wise, focusing on creating environments where belonging thrives. A sought-after consultant with demonstrable impact, Abi regularly contributes insights to prominent publications including The Metro, Raconteur, People Management, and HR Zone. She will deliver her first TEDx talk \"Who Owns Culture\" in November 2025 and release her debut book \"Culture Blooming: Nurturing Workplaces Where People Grow\" with Berrett-Koehler Publishers in August 2026. Abi transforms organizations by equipping leaders with practical tools to navigate complex conversations around inclusion and psychological safety, ensuring everyone can authentically contribute their unique strengths.",
    "title": "Survive or Thrive: The Culture Behind Workplace Wellbeing",
    "description": "Every Mental Health Day, organisations roll out the wellness apps and the free fruit, then wonder why people are still drained by November. The truth many workplaces avoid is that wellbeing is shaped by culture and conditions, not individual resilience alone. In this interactive session, I reframe mental health at work and explore why some people thrive while others only survive. Through live polls and honest reflection, you'll gain practical insights into how we can all contribute to creating workplaces where wellbeing grows by design.\n\nWe will cover:\n- Why some people thrive at work while others just survive, and how culture influences the difference\n- The hidden drains on mental health: always-on expectations, unclear roles, and feeling invisible\n- Practical ways we can all help create a workplace where wellbeing is protected, not simply patched over",
    "hasPhoto": false,
    "updated_at": 0
  },
  {
    "id": "s3",
    "date": "2026-10-08",
    "startTime": "09:00",
    "endTime": "10:00",
    "speakerName": "Geoff McDonald",
    "speakerBio": "Geoff is a global advocate, campaigner and consultant in addressing the stigma of mental ill-health in the workplace. He inspires and provokes organisations globally to put purpose and wellbeing at the centre of everything they do by motivating people to take action in creating workplaces that enhance the lives of everyone. He brings his own experience of addressing the stigma of mental ill-health within Unilever, helping to archetype the transformation of this company with purpose at its core. Geoff provides a real practitioner's perspective on how to address the stigma linked to depression and anxiety within workplaces today, and on how to elevate wellbeing to a strategic priority in the boardroom.",
    "title": "Mental Health - A Competitive Advantage in Addressing Stigma?",
    "description": "Geoff shares his own very powerful story of mental ill health and provides practical learnings and insights on how to address the stigma of mental ill health in the workplace. This includes the role of leadership, campaigning and storytelling in addressing stigma. The principles and lessons that Geoff will share are universal and can be used within different cultures globally, it is in the execution thereof that one needs to take into account some of the cultural nuances when it comes to stigma surrounding mental ill health. He will also describe the training interventions that are required to help alleviate stigma within organisations.",
    "hasPhoto": false,
    "updated_at": 0
  },
  {
    "id": "s4",
    "date": "2026-10-08",
    "startTime": "10:00",
    "endTime": "11:00",
    "speakerName": "Alessandra Patti",
    "speakerBio": "Alessandra Patti, is a professional trainer and consultant with a background in linguistics, psychology and marketing, and she has been nominated one of the top 15 coaches in Zurich for the year 2023.\n\nHer practical and tangible approach when explaining concepts is highly known and she works with many Fortune 500 European companies across Switzerland and Europe. She is multilingual, in fact she teaches in English, Italian (her mother tongue) and Spanish. Since her background is both in mental wellbeing and communication, she bridges them with workshops and sessions dedicated to certain topics like feedback, resilience and difficult conversations, and she teaches people how to navigate them safely and securely, and with the appropriate communications tools.",
    "title": "Digital Wellbeing & Focus in the Attention Economy",
    "description": "In the modern workplace, attention has become a scarce resource. Constant notifications, multitasking, and digital overload can reduce cognitive performance and increase stress levels. This session explores digital wellbeing as an organizational and leadership matter. Participants learn how technology impacts focus, mental health, and workplace culture — and how to build healthier digital habits without rejecting technology. We tackle email use, meetings and the impact of AI in written communication and as emotional support of employees. The neuroscience of infinite scrolling on internet browsers and our phone becomes clear and we can be more intentional about our technology use, without eliminating it.",
    "hasPhoto": false,
    "updated_at": 0
  },
  {
    "id": "s5",
    "date": "2026-10-08",
    "startTime": "11:00",
    "endTime": "12:00",
    "speakerName": "Zoia Mahjoubi",
    "speakerBio": "Zoia Mahjoubi is a Berlin-based psychologist, speaker, and facilitator specializing in mindfulness and self-leadership. Integrating insights from psychology, neuroscience, and contemplative practice, she helps individuals and organizations strengthen awareness, manage stress, and lead with clarity and purpose. Her experiential workshops and talks foster presence, authenticity, and a culture of well-being and psychological resilience at work. With a strong academic foundation and a warm, practical approach, she supports individuals in strengthening their self-awareness, building emotional resilience, and taking meaningful steps in both their personal and professional development.",
    "title": "The Art of Self Care: How to Strengthen Your Psychological Well Being",
    "description": "There's a myth fed by advertisement and social media that self-care is something like a luxurious spa-day, an extravagant weekend trip, or a fancy dinner in a prestigious restaurant. All these indulgences are great but they're not self-care. What is self-care then? At the most basic level, self-care means the ability to care for yourself so that you generally function in the world. In this interactive session Zoia aims to show you how to turn self-care into something that is not just about functioning but flourishing. You will learn about the effects of self-care and why it matters for your longterm health and wellbeing, and get ideas on how to build a self-care routine that actually sticks with you.",
    "hasPhoto": false,
    "updated_at": 0
  },
  {
    "id": "s6",
    "date": "2026-10-08",
    "startTime": "12:00",
    "endTime": "13:00",
    "speakerName": "Roy Gluckman",
    "speakerBio": "Roy is a qualified attorney and a director at Run to the Monster, a Diversity, Equity, Inclusion, and Belonging (DEIB) short-video training organisation. Roy speaks passionately on all matters relating to DEIB. Roy believes in having tough conversations; approaching complex material with honesty, authenticity, and simplicity. Roy has mastered the art of making difficult subject matters easily digestible for audiences of all types and for all occasions.",
    "title": "Building Healthier Teams",
    "description": "Mental health and workplace performance are interconnected. In this keynote I explore behavioural wellness, the intentional actions that foster connection, kindness, and belonging within teams. By prioritising these behaviours, teams can boost effectiveness, strengthen engagement, and enhance overall well-being.",
    "hasPhoto": false,
    "updated_at": 0
  }
];

async function readList(store) {
  const list = await store.get(LIST_KEY, { type: "json" });
  // Nothing saved yet — hand back a fresh copy of the seed data without
  // writing it, same approach as feature.mjs's defaultInfo(). The first
  // actual admin mutation (add/edit/delete/reorder) is what persists it.
  return Array.isArray(list) ? list : JSON.parse(JSON.stringify(DEFAULT_SESSIONS));
}

// Strips the internal-only photoContentType field (kept alongside the
// session purely so the image-serving branch below knows what
// content-type header to send) before handing a session back to a client.
function publicSession(s) {
  const out = { ...s };
  delete out.photoContentType;
  out.hasPhoto = !!s.hasPhoto;
  return out;
}

export default async (req) => {
  const store = getStore({ name: "demoleqture-sessions", consistency: "strong" });
  const url = new URL(req.url);

  // Public: serve a single session's uploaded speaker-photo bytes.
  if (req.method === "GET" && url.searchParams.get("image")) {
    const id = url.searchParams.get("image");
    const list = await readList(store);
    const session = list.find((s) => s.id === id);
    if (!session || !session.hasPhoto) return new Response("Not found", { status: 404 });
    const bytes = await store.get(`photo-${id}`, { type: "arrayBuffer" });
    if (!bytes) return new Response("Not found", { status: 404 });
    return new Response(bytes, {
      headers: { "content-type": session.photoContentType || "image/jpeg", "cache-control": "no-store" },
    });
  }

  // GET is public — every visitor's browser needs the programme list.
  if (req.method === "GET") {
    const sessions = await readList(store);
    return Response.json({ sessions: sessions.map(publicSession) });
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
    return Response.json({ error: "only Super Admin can change the session list" }, { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const contentType = req.headers.get("content-type") || "";

  // JSON body = reorder or delete (no file involved, so no need for multipart there).
  if (contentType.includes("application/json")) {
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
      const byId = new Map(list.map((s) => [s.id, s]));
      const ordered = [];
      for (const id of body.order) {
        if (byId.has(id)) {
          ordered.push(byId.get(id));
          byId.delete(id);
        }
      }
      for (const leftover of byId.values()) ordered.push(leftover);
      await store.setJSON(LIST_KEY, ordered);
      return Response.json({ ok: true, sessions: ordered.map(publicSession) });
    }

    if (body.action === "delete") {
      const list = await readList(store);
      const next = list.filter((s) => s.id !== body.id);
      if (next.length === list.length) {
        return Response.json({ error: "not found" }, { status: 404 });
      }
      await store.setJSON(LIST_KEY, next);
      await store.delete(`photo-${body.id}`);
      return Response.json({ ok: true, sessions: next.map(publicSession) });
    }

    return Response.json(
      { error: 'expected {action:"delete"|"reorder", ...}' },
      { status: 400 }
    );
  }

  // Otherwise: multipart/form-data = add or edit a session, with an
  // optional speaker photo upload (and an optional removePhoto flag).
  let form;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected multipart/form-data or application/json" }, { status: 400 });
  }

  const id = form.get("id");
  const date = String(form.get("date") || "").trim();
  const startTime = String(form.get("startTime") || "").trim();
  const endTime = String(form.get("endTime") || "").trim();
  const speakerName = String(form.get("speakerName") || "").trim();
  const speakerBio = String(form.get("speakerBio") || "").trim();
  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const removePhoto = String(form.get("removePhoto") || "") === "1";
  const file = form.get("photo");

  if (!DATE_RE.test(date)) {
    return Response.json({ error: "date must be in YYYY-MM-DD format" }, { status: 400 });
  }
  if (!TIME_RE.test(startTime)) {
    return Response.json({ error: "start time must be in 24-hour HH:MM format" }, { status: 400 });
  }
  if (!TIME_RE.test(endTime)) {
    return Response.json({ error: "end time must be in 24-hour HH:MM format" }, { status: 400 });
  }
  if (endTime <= startTime) {
    return Response.json({ error: "end time must be after start time" }, { status: 400 });
  }
  if (!title || title.length > TITLE_MAX) {
    return Response.json({ error: `title is required, max ${TITLE_MAX} characters` }, { status: 400 });
  }
  if (!speakerName || speakerName.length > SPEAKER_NAME_MAX) {
    return Response.json({ error: `speaker name is required, max ${SPEAKER_NAME_MAX} characters` }, { status: 400 });
  }
  if (speakerBio.length > SPEAKER_BIO_MAX) {
    return Response.json({ error: `speaker bio must be under ${SPEAKER_BIO_MAX} characters` }, { status: 400 });
  }
  if (description.length > DESCRIPTION_MAX) {
    return Response.json({ error: `description must be under ${DESCRIPTION_MAX} characters` }, { status: 400 });
  }
  if (file && typeof file !== "string") {
    if (!file.type || !file.type.startsWith("image/")) {
      return Response.json({ error: "speaker photo must be an image" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "speaker photo must be smaller than 5MB" }, { status: 400 });
    }
  }

  const list = await readList(store);
  const clean = { date, startTime, endTime, speakerName, speakerBio, title, description, updated_at: Date.now() };

  if (id && typeof id === "string") {
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    const existing = list[idx];
    const session = { ...clean, id: existing.id, hasPhoto: !!existing.hasPhoto, photoContentType: existing.photoContentType };
    if (file && typeof file !== "string") {
      await store.set(`photo-${existing.id}`, await file.arrayBuffer());
      session.hasPhoto = true;
      session.photoContentType = file.type;
    } else if (removePhoto) {
      await store.delete(`photo-${existing.id}`);
      session.hasPhoto = false;
      delete session.photoContentType;
    }
    list[idx] = session;
    await store.setJSON(LIST_KEY, list);
    return Response.json({ ok: true, session: publicSession(session), sessions: list.map(publicSession) });
  }

  if (list.length >= MAX_SESSIONS) {
    return Response.json({ error: `maximum of ${MAX_SESSIONS} sessions reached — remove one first` }, { status: 400 });
  }
  const newId = crypto.randomUUID();
  const session = { ...clean, id: newId, hasPhoto: false };
  if (file && typeof file !== "string") {
    await store.set(`photo-${newId}`, await file.arrayBuffer());
    session.hasPhoto = true;
    session.photoContentType = file.type;
  }
  list.push(session);
  await store.setJSON(LIST_KEY, list);
  return Response.json({ ok: true, session: publicSession(session), sessions: list.map(publicSession) });
};

export const config = { path: "/api/sessions" };
