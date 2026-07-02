# Quantexa — Learning at Work Week 2026

Static site for Quantexa's Learning at Work Week 2026, with a live anonymous
Q&A embedded under the town hall video. Styled in Quantexa's black/orange
brand (Poppins/Inter, 2px corner radius).

## Project structure

```
public/                  → published static site (index.html)
netlify/functions/       → serverless functions
  questions.mjs          → GET/POST /api/questions, backed by Netlify Blobs
netlify.toml             → publish = "public", functions directory
package.json             → @netlify/blobs dependency
```

`node_modules/` and `netlify/` are deliberately outside `public/` so they are
never uploaded as static files.

## How the live Q&A works

- **Shared & server-side.** Questions are stored in a single Netlify Blobs
  JSON blob (`quantexa-qa` store, key `questions`), read with
  `consistency: "strong"` so nobody reads stale data. There is no
  `localStorage`/in-memory state — every visitor is reading the same backend.
- **Anonymous.** Only question text + timestamp are stored, no name/login.
- **No lost messages.** Each new question does a read-modify-write of the one
  shared JSON blob (not `store.list()` over many small blobs, which is
  eventually consistent and too slow for this).
- **Near-real-time.** The page polls `/api/questions` every 6 seconds while
  the tab is visible, plus once immediately when the tab regains focus. The
  poster's own question is also rendered optimistically from the POST
  response, de-duplicated by `id` against the next poll.

## Setup

```bash
npm install
```

## Deploy to Netlify

This repo is not yet linked to a Netlify site or deployed — that requires
your Netlify login, so it has to be run from your machine / CI:

```bash
netlify login                 # if you haven't already
netlify link                  # or `netlify init` to create a new site
netlify deploy --prod
```

Confirm the deploy summary lists **1 function** (`questions`). If it says
0 functions, the `netlify.toml` isn't being picked up — deploy from the repo
root, not from inside `public/`.

## Self-test (run these after every deploy — do not assume it works)

Replace `<site>` with your live Netlify URL.

```bash
# 1. Post a question, then read it back
curl -X POST https://<site>/api/questions -H "content-type: application/json" -d '{"question":"test"}'
curl https://<site>/api/questions

# 2. Post 3 in a row, confirm all 3 come back (proves strong consistency)
for i in 1 2 3; do curl -s -X POST https://<site>/api/questions -H "content-type: application/json" -d "{\"question\":\"burst $i\"}"; done
curl https://<site>/api/questions
```

Then manually:

3. Open the live URL in two different browsers (or one normal + one
   incognito window). Submit a question in one — it must appear in the other
   within about 6 seconds, without refreshing. This is what proves the
   feature is shared, not local to one device.
4. Load the live URL on a phone and confirm the panel is usable and a
   question submitted from mobile shows up on desktop.

## Before the live event

Wipe test questions so the Q&A starts empty:

```bash
netlify blobs:delete quantexa-qa questions --force
```

## Moderation note

Questions currently appear publicly with **no moderation** — anything
submitted shows to everyone immediately. If that's a concern for a public
event, the function can be extended with an `approved` flag (default
`false`) and the GET handler changed to only return approved questions, with
a simple admin view or Netlify Blobs edit to approve them. Flagging this for
the site owner to decide before go-live rather than building it silently.

## Deploy from GitHub Pages instead?

Don't — GitHub Pages only serves static files, it can't run the
`netlify/functions/questions.mjs` backend this feature depends on. This
project needs to be deployed on Netlify.
