# Demo Leqture — Learning at Work Week 2026

Static site for Demo Leqture's Learning at Work Week 2026, with a live anonymous
Q&A-style feedback survey you can switch on whenever you want. Styled in
Demo Leqture's black/purple brand (Poppins/Inter, 2px corner radius).

## Project structure

```
public/                    → published static site
  index.html                the site itself, incl. the survey popup + logic
  admin.html                 key-gated page to turn the survey on/off and download results
netlify/functions/         → serverless functions
  survey-state.mjs           GET (public): is the survey on? / POST (admin): turn it on or off
  survey-response.mjs        POST: create/update a response, backed by Netlify Blobs
  survey-export.mjs          GET (admin): download all responses as CSV or JSON
netlify.toml                publish = "public", functions directory
package.json                 @netlify/blobs dependency
```

`node_modules/` and `netlify/` are outside `public/` so they're never uploaded
as static files.

## How the survey works

- **5 questions**: 2 mandatory star ratings (1–5), then 3 optional open text
  questions.
- **Quit after the mandatory two.** The close (×) button stays disabled until
  both stars are set. The moment they are, the two ratings are saved to the
  backend immediately and the visitor is free to close the popup.
- **Nothing is lost.** Any optional answer typed after that point is saved
  when the field loses focus, and again automatically if the visitor
  switches tabs or navigates away (via `navigator.sendBeacon`), so a
  half-finished survey is never discarded.
- **Anonymous.** Only ratings, text, and timestamps are stored — no name,
  no login, no IP.
- **Shared & server-side**, same architecture as the site's live Q&A: one
  JSON blob in Netlify Blobs, read/written with `consistency: "strong"` so
  concurrent submissions don't clobber each other.
- **Shows only when you turn it on.** The site polls `/api/survey-state`
  every 15 seconds. Flip it on from `admin.html` and visitors currently on
  the page will see it within ~15 seconds; new visitors see it on load.
  Once someone completes or closes it, they see a "Thanks for your
  feedback!" confirmation and the popup closes on its own. Their browser
  then remembers that specific round (`localStorage`, keyed to the
  survey's activation timestamp) so they won't be nagged again on that
  device *for that round* — this is just a "don't re-annoy this visitor"
  flag, not where the actual answers are stored. If you turn the survey
  off and later on again, that's a new round: everyone, including people
  who already answered before, gets a blank form again.

## Admin: triggering the survey and getting results

Open `/admin.html` on your deployed site (e.g.
`https://<site>.netlify.app/admin.html`). It's a plain, unlisted page — not
linked from the site nav — gated by a single shared secret, not a full login
system. Enough to keep random visitors from flipping the switch or
downloading responses, not meant as strong security.

1. **Set the admin key** (once, in Netlify): Site settings → Environment
   variables → add `ADMIN_KEY` with a value only you know. Or via CLI:
   ```bash
   netlify env:set ADMIN_KEY "choose-a-long-random-value"
   ```
   Redeploy after setting it.
2. Go to `admin.html`, enter that same key, click **Unlock**.
3. **Turn on** to start showing the survey to visitors, **Turn off** to stop
   showing it to new visitors (anyone already looking at it keeps their
   in-progress popup).
4. **Download CSV** or **Download JSON** any time to get everything
   collected so far.

## Setup

```bash
npm install
```

## Test locally

```bash
npm install -g netlify-cli   # if you don't have it
netlify dev                  # run from the project root, not from inside public/
```

This serves `public/` and runs all three functions together (with a local
Blobs emulator) at `http://localhost:8888`. Opening `index.html` directly as
a file (double-click / `file://`) will never work for the survey — there's
no server behind it in that case.

## Deploy to Netlify

```bash
netlify login                 # if you haven't already
netlify link                  # or: netlify init, to create a new site
netlify deploy --prod
```

Confirm the deploy summary lists **3 functions** (`survey-state`,
`survey-response`, `survey-export`). If it says 0, you're deploying from
inside `public/` instead of the project root.

Don't forget to set `ADMIN_KEY` (see above) — without it, every admin action
returns a clear error instead of quietly working.

## Self-test (run these after every deploy — do not assume it works)

Replace `<site>` with your live URL and `<key>` with your `ADMIN_KEY`.

```bash
# 1. Turn the survey on
curl -X POST https://<site>/api/survey-state -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"active":true}'
curl https://<site>/api/survey-state   # should show {"active":true,...}

# 2. Submit a response as if both mandatory ratings were answered
curl -X POST https://<site>/api/survey-response -H "content-type: application/json" -d '{"q1_rating":5,"q2_rating":4}'
# copy the "id" from the response, then update it with an open answer:
curl -X POST https://<site>/api/survey-response -H "content-type: application/json" -d '{"id":"<id-from-above>","q3_text":"Loved the AI keynote"}'

# 3. Download everything and confirm both fields are on the same row
curl -H "x-admin-key: <key>" https://<site>/api/survey-export
```

Then manually:

4. Open the live URL in a normal window with the survey on — it should
   appear. Rate both stars, confirm the close (×) button becomes clickable,
   close it, and check `admin.html`'s response count went up by one.
5. Open it again in an incognito window, fill all 5 fields and hit
   **Submit feedback**, then confirm that response also shows up in the
   CSV/JSON download with `complete = true`.
6. Load the site on mobile and confirm the popup and star buttons are
   usable at that width.

## Before a live event

Turn the survey off (or leave it off) until you actually want it live —
`admin.html` → **Turn off**. To wipe test data before the real thing:

```bash
netlify blobs:delete quantexa-survey responses --force
```

## Moderation / privacy note

Open text answers are free-form and unmoderated — anything a visitor types
goes straight into the downloadable export, visible only to whoever has the
`ADMIN_KEY`. There's no way for other visitors to see survey answers (unlike
the Q&A feature) — only ratings/text you export yourself.

## Deploy from GitHub Pages instead?

Don't — GitHub Pages only serves static files, it can't run the
`netlify/functions/*.mjs` backend this feature depends on. This project
needs to be deployed on Netlify.
