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
  announcement.mjs           GET (public): current site announcement / POST (admin): publish or clear it
  player.mjs                  GET (public): current hero video link / POST (admin): publish or turn it off
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

## Site announcement bar

A separate feature from the survey: a one-line message you can push to the
site whenever you want, e.g. "Lunch is now being served in the atrium."

- It shows as a bar across the top of the page, styled in the site's purple.
- Visitors poll for it every 15 seconds, same as the survey.
- Each visitor can dismiss it with the × — dismissing is remembered per
  message (`localStorage`, keyed to when it was published), so publishing a
  new message, or re-publishing after clearing it, shows up again for
  everyone even if they dismissed an earlier one.
- Clearing it (empty text) hides it for everyone within ~15 seconds.
- Backed by `announcement.mjs` / Netlify Blobs, same strong-consistency
  pattern as everything else here — nothing shared is ever kept only in
  `localStorage`.

Controlled from the same `admin.html` page as the survey — see below.

## Hero video player

Another independent feature: a live video/stream link you control from
`admin.html`, shown to the right of the main heading.

- Paste a normal YouTube link (a `/watch?v=...` URL, a `youtu.be/...` short
  link, or a `/live/...` link) and the page converts it to the correct
  embeddable form automatically. Paste a Clevercast (or any other) embed
  link and it's used exactly as given.
- The player only takes up its column when a link is actually set — with no
  link published, the hero goes back to a single column, nothing reserved
  for it.
- Publishing a new link replaces whatever was showing; **Turn off** clears
  it for everyone within ~15 seconds. There's no separate on/off switch —
  an empty link is "off," same as the announcement bar.
- Backed by `player.mjs` / Netlify Blobs, same pattern as the rest of this
  site: the current link is public (anyone can GET it), only setting or
  clearing it needs the admin key.

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
5. Under **Site announcement**, type a message and click **Publish** to push
   it live, or **Clear** to take it down. The box shows whatever is
   currently live when you unlock the page.
6. Under **Hero video player**, paste a YouTube or Clevercast link and click
   **Publish** to show it, or **Turn off** to remove it. Same box shows
   whatever's currently live.

## Setup

```bash
npm install
```

## Test locally

```bash
npm install -g netlify-cli   # if you don't have it
netlify dev                  # run from the project root, not from inside public/
```

This serves `public/` and runs all five functions together (with a local
Blobs emulator) at `http://localhost:8888`. Opening `index.html` directly as
a file (double-click / `file://`) will never work for the survey — there's
no server behind it in that case.

## Deploy to Netlify

```bash
netlify login                 # if you haven't already
netlify link                  # or: netlify init, to create a new site
netlify deploy --prod
```

Confirm the deploy summary lists **5 functions** (`survey-state`,
`survey-response`, `survey-export`, `announcement`, `player`). If it says 0, you're deploying from
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

# 4. Publish an announcement, then confirm it, then clear it
curl -X POST https://<site>/api/announcement -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"text":"Test announcement"}'
curl https://<site>/api/announcement   # should show {"text":"Test announcement",...}
curl -X POST https://<site>/api/announcement -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"text":""}'
curl https://<site>/api/announcement   # should show {"text":"",...}

# 5. Publish a hero player link, then turn it off
curl -X POST https://<site>/api/player -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
curl https://<site>/api/player   # should show the same url back
curl -X POST https://<site>/api/player -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"url":""}'
curl https://<site>/api/player   # should show {"url":"",...}
```

Then manually:

5. Open the live URL in a normal window with the survey on — it should
   appear. Rate both stars, confirm the close (×) button becomes clickable,
   close it, and check `admin.html`'s response count went up by one.
6. Open it again in an incognito window, fill all 5 fields and hit
   **Submit feedback**, then confirm that response also shows up in the
   CSV/JSON download with `complete = true`.
7. Load the site on mobile and confirm the popup and star buttons are
   usable at that width.
8. Publish an announcement from `admin.html` and confirm the purple bar
   shows up at the top of the site within ~15 seconds, that the × dismisses
   it, and that **Clear** removes it for everyone.
9. Publish a YouTube link from `admin.html` and confirm the player appears
   to the right of the heading within ~15 seconds, that the hero switches
   to two columns only while it's showing, and that **Turn off** removes it
   and collapses the hero back to one column.

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
