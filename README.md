# Demo Leqture — Learning at Work Week 2026

Static site for Demo Leqture's Learning at Work Week 2026, with a live anonymous
Q&A-style feedback survey, a site announcement bar, a hero video player/image,
a site-wide theme (font, accent color, per-section colors, and editable
Hero/Recordings headings), a repositionable, renameable grid of
admin-managed image link cards, and a repositionable admin-editable text +
image content block — all switched on and off from two separate admin
panels. Styled in Demo Leqture's black/purple brand (Poppins/Inter, 2px
corner radius, purple accent) by default, but the look and copy can be
changed live from either admin panel, and both panels stay in sync with
each other. Each admin panel opens with a "jump to" pill bar and clearly
labeled sections so it's obvious at a glance what can be changed.

## Project structure

```
public/                     → published static site
  index.html                  the site itself, incl. survey popup, announcement bar, hero player/image, link cards, text+image section
  admin.html                   Super Admin: everything
  customer-admin.html          Customer Admin: survey responses (view only) + hero image + theme + link cards + text/image section
netlify/functions/          → serverless functions
  lib/auth.mjs                 shared role check (not a function itself, just imported by the others)
  whoami.mjs                   GET: validates a key, returns its role ("super" / "customer")
  survey-state.mjs             GET (public): is the survey on? / POST (super only): turn it on or off
  survey-response.mjs          POST: create/update a response, backed by Netlify Blobs
  survey-export.mjs            GET (super or customer): download all responses as CSV or JSON
  announcement.mjs             GET (public): current site announcement / POST (super only): publish or clear it
  player.mjs                   GET (public): current hero video link / POST (super only): publish or turn it off
  hero-image.mjs                GET (public): the hero image / POST, DELETE (super or customer): upload or remove it
  theme.mjs                    GET (public): font, accent + per-section colors / POST (super or customer): change them
  cards.mjs                    GET (public): the link cards list/images/section text / POST, DELETE (super or customer): manage them
  feature.mjs                  GET (public): the text+image block / POST, DELETE (super or customer): edit or clear it
netlify.toml                 publish = "public", functions directory
package.json                  @netlify/blobs dependency
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

## Hero section

The top of the page is intentionally simple: an eyebrow tag, a heading, a
subheading, and (to the right, once something is published) a video player
or a static image.

- **Heading and subheading are editable** from either admin panel, under
  the **Hero** block — the same block the hero image lives in, so the text
  and image controls sit together instead of in separate places. Leave
  both blank to keep the original copy ("Learning at *Work Week* 2026."
  with "Work Week" highlighted in purple). Typing a custom heading
  replaces the whole line with plain text plus the decorative purple "." —
  a custom heading can't keep that one-word highlight, since there's no
  way to know which word in arbitrary text should be emphasized. Click
  **Save hero text** to publish it (the Hero background/text *colors* are
  still set separately, under **Site theme → Hero**).
- The original stat row ("5 days / 11 sessions / Global") and the **View
  schedule** / **See recordings** buttons that used to sit under the
  heading have been removed — the hero is just the eyebrow, heading, and
  subheading now (the same links still exist in the top nav bar).
- **Video player** — paste a normal YouTube link (`/watch?v=...`,
  `youtu.be/...`, or `/live/...`) and the page converts it to the correct
  embeddable form automatically. Paste a Clevercast (or any other) embed
  link and it's used exactly as given. Publishing a new link replaces
  whatever was showing; **Turn off** clears it for everyone within ~15
  seconds. There's no separate on/off switch — an empty link is "off," same
  as the announcement bar. Controlled only from Super Admin
  (`admin.html`).
- **Hero image** — a static image shown in the same spot whenever there's
  no video link published. Controlled from *either* admin panel (with one
  restriction on Customer Admin — see below). It displays as a square
  rather than a 16:9 letterbox, scaled to fit neatly next to the heading
  text (capped at 440px so it doesn't overwhelm the layout on wide
  screens) rather than stretched or cropped to the full column width. The
  video player keeps its normal 16:9 shape, since it has to match the
  embedded player.
- **The video always wins.** If a link is published, the image is hidden
  even if one is uploaded — it comes back automatically the moment the
  link is turned off. Nothing is deleted when this happens; the image is
  just not shown while a link is live.
- The panel only takes up its column when something is actually showing
  (video or image) — with neither set, the hero goes back to a single
  column.
- Backed by `player.mjs`, `hero-image.mjs`, and `theme.mjs` (for the
  heading/subheading) / Netlify Blobs. The current link/image/text is
  public (anyone visiting the site can fetch it); only setting, uploading,
  editing, or removing needs an admin key.

## Site theme

Either admin panel can change, live, for every visitor:

- **Font** — type any Google Fonts family name (e.g. `Sora`, `Playfair
  Display`). The site loads that font from Google Fonts and applies it
  everywhere, overriding the default Poppins/Inter pairing. Leave it blank
  to keep the default.
- **Accent color** — one hex color (default `#a855f7`, purple) used for
  buttons, badges, tags, and highlights across the whole site. A slightly
  darker shade for hover states is computed automatically — there's only
  one field to set. Leave it blank to keep the default purple.
- **Background and text color per section** — Hero, Sessions (the
  programme), Recordings, and Footer each have their own optional
  background color and text color (hex, e.g. `#a855f7`). Leave either
  field blank to keep that section's default look. Colors apply to the
  section's own background and its heading/intro copy — the cards and
  accordions inside a section keep their own built-in styling so contrast
  stays readable regardless of what colors are chosen.
- **Heading and subheading text for Hero and Recordings** — Recordings has
  a heading and subheading field right above its colors, in this same
  block. Hero's heading/subheading live instead in the **Hero** block
  (next to the hero image controls) — see "Hero section" above. Leave
  either blank to keep the original wording. (Sessions and Footer don't
  have text fields yet — only their colors are editable.)
- Changes apply for every visitor within about 15 seconds, the same
  polling pattern as the announcement bar and hero player. Backed by
  `theme.mjs` / Netlify Blobs (`demoleqture-theme`).
- **Both admin panels stay in sync.** Since either role can change the
  theme, both `admin.html` and `customer-admin.html` also poll `/api/theme`
  every 15 seconds while unlocked, so a change made in one panel shows up
  in the other without a manual refresh. Whatever field you're actively
  typing in is left alone by the poll so it never overwrites your
  in-progress edit — only fields you're not currently focused in get
  updated.
- Each color has both a hex text field and a small color-picker square next
  to it — they're kept in sync in both directions: picking a color updates
  the hex text, and loading/saving/polling a theme now also updates the
  little squares to match (this used to only update the text, leaving the
  squares showing a stale color — fixed).

## Image link cards

Either admin panel can maintain a small grid of clickable cards, shown in
a "Useful links" section on the site. Each card has an image, a title, a
short line of body text, and an external link — clicking anywhere on the
card opens that link in a new tab. Useful for pointing visitors at
resources, sign-up forms, related sites, and so on.

- Add a card with the image/title/body/link form at the bottom of the
  **Image link cards** section in either admin panel (image is required
  for a new card; max 5MB).
- Edit a card via its **Edit** button — this loads it back into the form;
  you can change the image or leave it as-is.
- Reorder cards with the ↑ / ↓ buttons; the site always shows them in the
  order set in admin.
- Remove a card with **Delete**.
- Up to 24 cards. The section on the site is hidden entirely whenever
  there are zero cards.
- **Section title and subtitle** are editable text — change "Useful links"
  and its subtitle line to whatever fits, then **Save section text**.
- **Move the whole section up or down** with the two **Move section**
  buttons. There are three possible slots: before Sessions (right after
  the hero), between Sessions and Recordings (the default), or after
  Recordings (right before the footer). The buttons disable themselves at
  either end.
- Backed by `cards.mjs` / Netlify Blobs (`demoleqture-cards`, storing both
  the card list and this section's title/subtitle/position). Card
  metadata, images, and section text are public (anyone visiting the site
  can see them); only adding, editing, reordering, moving, or removing
  needs an admin key.
- Like the theme, both admin panels poll for card/section changes every 15
  seconds while unlocked, so edits made in one panel appear in the other
  without a manual refresh.

## Text and image section

Either admin panel can edit one content block — a title, a paragraph of
body text, and an image — shown as its own section on the site. Unlike the
image link cards, this is a single block, not a repeatable list.

- Fill in the title, body text, and/or upload an image, then **Save**.
  None of the three are required on their own — you can save just text
  with no image, or upload an image with no text.
- **Remove image** clears only the image, keeping whatever text is saved.
  **Clear whole section** wipes the title, body, and image back to empty
  (asks for confirmation first).
- The section is hidden entirely on the site whenever title, body, and
  image are all empty — there's nothing to accidentally leave half-visible.
- **Layout**: text on the left, a square image on the right (capped at
  480px so it scales to fit neatly alongside the text rather than
  overflowing on wide screens). Any image you upload is center-cropped to
  fit that square, same as the hero image. With no image, the text centers
  itself in a single column; with no text, the image centers itself
  instead.
- **Move the whole section up or down** with the two **Move section**
  buttons, using the same three slots as the image link cards: before
  Sessions, between Sessions and Recordings, or after Recordings (the
  original, and still the default, spot). The buttons disable themselves
  at either end. If this section and the image link cards end up in the
  same slot, they just stack — whichever was moved there more recently
  ends up closer to the following section.
- Backed by `feature.mjs` / Netlify Blobs (`demoleqture-feature`). Content
  and the image are public; only editing, moving, or clearing needs an
  admin key.
- Also polled every 15 seconds by both admin panels while unlocked, same
  as the theme and image link cards, so edits stay in sync between panels.

## Two admin panels

Both panels open with a row of pill-shaped **jump-to links** (Survey,
Announcement, Hero video, Hero image, Theme, Link cards, Text & image —
Customer Admin shows only the ones it has access to) so it's obvious at a
glance what's available without scrolling through the whole page first.
Each feature is grouped into its own labeled block with an icon, a name,
and a one-line description of what it does, followed by its controls.


There are two separate, separately-keyed admin pages — not one page with
two logins, two entirely different shared secrets:

| | Super Admin (`admin.html`) | Customer Admin (`customer-admin.html`) |
|---|---|---|
| Survey on/off | Yes | No (view only) |
| Survey responses (view/download) | Yes | Yes |
| Site announcement | Yes | No |
| Hero video player | Yes | No |
| Hero image | Yes | Yes — **disabled while the hero video player is live** (there's nothing to preview, so changing it would just be confusing; the fields grey out with an explanation until a Super Admin turns the player off) |
| Site theme (font, accent, section colors) | Yes | Yes |
| Image link cards | Yes | Yes |
| Text & image section | Yes | Yes |

Both are plain, unlisted pages — not linked from the site nav — gated by a
shared secret each, not a full login system. Enough to keep random visitors
out, not meant as strong security. A Super Admin key also works to unlock
the Customer Admin page (full access is a superset of limited access), but
not the other way around — a Customer Admin key will not unlock
`admin.html`.

### Setting up the keys

In Netlify: Site settings → Environment variables → add both:

```bash
netlify env:set ADMIN_KEY "choose-a-long-random-value"
netlify env:set CUSTOMER_ADMIN_KEY "choose-a-different-long-random-value"
```

Redeploy after setting them. Give the `ADMIN_KEY` value only to whoever
should have full control; give the `CUSTOMER_ADMIN_KEY` value to the
client/customer contact.

### Using Super Admin (`admin.html`)

1. Enter the `ADMIN_KEY`, click **Unlock**. Use the pill bar at the top
   (Survey, Announcement, Hero, Theme, Link cards, Text & image) to jump
   straight to any feature instead of scrolling.
2. **Turn on** to start showing the survey to visitors, **Turn off** to stop
   showing it to new visitors (anyone already looking at it keeps their
   in-progress popup).
3. **Download CSV** or **Download JSON** any time to get everything
   collected so far.
4. Under **Site announcement**, type a message and click **Publish** to push
   it live, or **Clear** to take it down.
5. Under **Hero**, type a heading and/or subheading and click **Save hero
   text** (leave both blank to keep the original wording). In the same
   block, paste a YouTube or Clevercast link and click **Publish** to show
   a live player, or **Turn off** to remove it; or choose a file and click
   **Upload** for a static image, or **Remove** to take it down. A note
   reminds you the image won't be visible while the video player is live,
   but you can still change it — it'll show as soon as the player is off.
6. Under **Site theme**, type a Google Fonts name, an accent color, and/or
   set background/text colors and the Recordings heading/subheading, then
   **Save theme**. **Reset all** clears everything back to the default
   look (Hero's heading/subheading are saved separately, from the Hero
   block above).
7. Under **Image link cards**, fill in the title/body/link/image form and
   click **Add card**; use **Edit** to change one, ↑/↓ to reorder, and
   **Delete** to remove one.
8. Under **Text & image section**, fill in a title, body text, and/or an
   image, then **Save**. **Remove image** clears just the image;
   **Clear whole section** wipes all three back to empty; **Move section
   up**/**down** repositions it on the page.

### Using Customer Admin (`customer-admin.html`)

1. Enter the `CUSTOMER_ADMIN_KEY`, click **Unlock**. The pill bar at the top
   only lists what this key has access to (no Announcement pill, since
   that's Super Admin only).
2. See whether the survey is on, how many responses have come in, and
   **Download CSV** / **Download JSON** — no ability to turn the survey
   itself on or off.
3. Under **Hero**, type a heading and/or subheading and click **Save hero
   text** — this works the same as Super Admin. Choose a file and click
   **Upload**, or **Remove**, for the hero image. If the hero video player
   is currently live, the image controls are disabled and a note explains
   why — ask a Super Admin to turn the player off first (there's no video
   player control here at all — publishing a video link is Super Admin
   only).
4. Under **Site theme**, **Image link cards**, and **Text & image section**,
   the controls work exactly as in Super Admin — both panels have full
   access to these three features.

## Setup

```bash
npm install
```

## Test locally

```bash
npm install -g netlify-cli   # if you don't have it
netlify dev                  # run from the project root, not from inside public/
```

This serves `public/` and runs all ten functions together (with a local
Blobs emulator) at `http://localhost:8888`. Opening `index.html` directly as
a file (double-click / `file://`) will never work for the survey — there's
no server behind it in that case.

## Deploy to Netlify

```bash
netlify login                 # if you haven't already
netlify link                  # or: netlify init, to create a new site
netlify deploy --prod
```

Confirm the deploy summary lists **10 functions** (`survey-state`,
`survey-response`, `survey-export`, `announcement`, `player`, `whoami`,
`hero-image`, `theme`, `cards`, `feature`). If it says 0, you're deploying
from inside `public/` instead of the project root.

Don't forget to set both `ADMIN_KEY` and `CUSTOMER_ADMIN_KEY` (see above) —
without them, every admin action returns a clear error instead of quietly
working, and neither admin page will unlock.

## Self-test (run these after every deploy — do not assume it works)

Replace `<site>` with your live URL, `<key>` with your `ADMIN_KEY`, and
`<ckey>` with your `CUSTOMER_ADMIN_KEY`.

```bash
# 0. Confirm both keys resolve to the right role, and that a bad key fails
curl -H "x-admin-key: <key>" https://<site>/api/whoami    # {"role":"super"}
curl -H "x-admin-key: <ckey>" https://<site>/api/whoami   # {"role":"customer"}
curl https://<site>/api/whoami                             # 401, no key sent
curl -H "x-admin-key: wrong" https://<site>/api/whoami     # 401, bad key

# 1. Turn the survey on (super only — confirm the customer key is rejected)
curl -X POST https://<site>/api/survey-state -H "content-type: application/json" -H "x-admin-key: <ckey>" -d '{"active":true}'  # 401
curl -X POST https://<site>/api/survey-state -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"active":true}'
curl https://<site>/api/survey-state   # should show {"active":true,...}

# 2. Submit a response as if both mandatory ratings were answered
curl -X POST https://<site>/api/survey-response -H "content-type: application/json" -d '{"q1_rating":5,"q2_rating":4}'
# copy the "id" from the response, then update it with an open answer:
curl -X POST https://<site>/api/survey-response -H "content-type: application/json" -d '{"id":"<id-from-above>","q3_text":"Loved the AI keynote"}'

# 3. Download everything with EITHER key and confirm both fields are on the same row
curl -H "x-admin-key: <key>" https://<site>/api/survey-export
curl -H "x-admin-key: <ckey>" https://<site>/api/survey-export

# 4. Publish an announcement, then confirm it, then clear it (super only)
curl -X POST https://<site>/api/announcement -H "content-type: application/json" -H "x-admin-key: <ckey>" -d '{"text":"Test"}'  # 401
curl -X POST https://<site>/api/announcement -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"text":"Test announcement"}'
curl https://<site>/api/announcement   # should show {"text":"Test announcement",...}
curl -X POST https://<site>/api/announcement -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"text":""}'
curl https://<site>/api/announcement   # should show {"text":"",...}

# 5. Publish a hero player link, then turn it off (super only)
curl -X POST https://<site>/api/player -H "content-type: application/json" -H "x-admin-key: <ckey>" -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'  # 401
curl -X POST https://<site>/api/player -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
curl https://<site>/api/player   # should show the same url back
curl -X POST https://<site>/api/player -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"url":""}'
curl https://<site>/api/player   # should show {"url":"",...}

# 6. Upload a hero image as Customer Admin, check metadata, then remove it
curl -X POST https://<site>/api/hero-image -H "x-admin-key: <ckey>" -F "image=@/path/to/test.jpg"
curl https://<site>/api/hero-image?meta=1   # {"exists":true,"updated_at":...}
curl -X DELETE https://<site>/api/hero-image -H "x-admin-key: <ckey>"
curl https://<site>/api/hero-image?meta=1   # {"exists":false,"updated_at":0}

# 7. Confirm Customer Admin is blocked from uploading while the player is live
curl -X POST https://<site>/api/player -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
curl -X POST https://<site>/api/hero-image -H "x-admin-key: <ckey>" -F "image=@/path/to/test.jpg"   # 409
curl -X POST https://<site>/api/hero-image -H "x-admin-key: <key>" -F "image=@/path/to/test.jpg"    # succeeds, super is never blocked
curl -X POST https://<site>/api/player -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"url":""}'   # turn player back off
curl -X DELETE https://<site>/api/hero-image -H "x-admin-key: <key>"   # clean up
```

Then manually:

8. Open `admin.html`, unlock with `ADMIN_KEY`, and confirm every section is
   visible: survey on/off, announcement, hero video player, hero image.
   Try unlocking it with `CUSTOMER_ADMIN_KEY` instead — it should be
   rejected (Super Admin only).
9. Open `customer-admin.html`, unlock with `CUSTOMER_ADMIN_KEY`, and
   confirm you only see: survey status (read-only) + response
   counts/downloads, and the hero image uploader. There should be no
   survey on/off toggle, no announcement field, and no player field. Then
   confirm `ADMIN_KEY` also unlocks this page (Super Admin is a superset).
10. Open the live URL in a normal window with the survey on — it should
    appear. Rate both stars, confirm the close (×) button becomes clickable,
    close it, and check the response count went up by one in either admin
    page.
11. Open it again in an incognito window, fill all 5 fields and hit
    **Submit feedback**, then confirm that response also shows up in the
    CSV/JSON download with `complete = true`.
12. Load the site on mobile and confirm the popup and star buttons are
    usable at that width.
13. Publish an announcement from `admin.html` and confirm the purple bar
    shows up at the top of the site within ~15 seconds, that the × dismisses
    it, and that **Clear** removes it for everyone.
14. Publish a YouTube link from `admin.html` and confirm the player appears
    to the right of the heading within ~15 seconds, that the hero switches
    to two columns only while it's showing, and that **Turn off** removes it
    and collapses the hero back to one column.
15. Upload a hero image from either admin page while the player is off —
    confirm it appears to the right of the heading within ~15 seconds as a
    square, sized to sit neatly next to the text rather than stretching to
    fill the whole column. Publish a player link and confirm the image is
    replaced by the video; turn the player off and confirm the image
    reappears automatically.
16. While the player is live, open `customer-admin.html` and confirm the
    hero image upload/remove controls are disabled with an explanatory
    notice. Open `admin.html` with `ADMIN_KEY` at the same time and confirm
    Super Admin can still upload/change the image even while the player is
    live.

```bash
# 8. Site theme — set a font, accent color, and section colors as customer, confirm public GET
curl -X POST https://<site>/api/theme -H "content-type: application/json" -H "x-admin-key: <ckey>" -d '{"font":"Sora","accent":"#22c55e","sections":{"hero":{"bg":"#111111","text":"#ffffff"},"sessions":{"bg":"","text":""},"recordings":{"bg":"","text":""},"footer":{"bg":"","text":""}}}'
curl https://<site>/api/theme   # should echo it back, no key needed
curl -X POST https://<site>/api/theme -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"font":"","accent":"","sections":{"hero":{"bg":"","text":""},"sessions":{"bg":"","text":""},"recordings":{"bg":"","text":""},"footer":{"bg":"","text":""}}}'
curl https://<site>/api/theme   # back to default (accent back to purple)

# 9. Image link cards — add, list, fetch image, reorder, delete
curl -X POST https://<site>/api/cards -H "x-admin-key: <key>" -F "title=Test card" -F "body=Short description" -F "link=https://example.com" -F "image=@/path/to/test.jpg"
curl https://<site>/api/cards   # {"cards":[{"id":"...","title":"Test card",...}],"meta":{...}}
curl https://<site>/api/cards?image=<id-from-above>   # raw image bytes
curl -X DELETE "https://<site>/api/cards?id=<id-from-above>" -H "x-admin-key: <ckey>"
curl https://<site>/api/cards   # {"cards":[],"meta":{...}}

# 10. Useful links section — rename title/subtitle and move its position
curl -X POST https://<site>/api/cards -H "content-type: application/json" -H "x-admin-key: <ckey>" -d '{"action":"meta","title":"Extra resources","subtitle":"Worth a look."}'
curl -X POST https://<site>/api/cards -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"action":"meta","position":0}'
curl https://<site>/api/cards   # meta.title/subtitle/position reflect both changes
curl -X POST https://<site>/api/cards -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"action":"meta","position":1}'   # put it back
```

Then manually:

17. Open `admin.html` or `customer-admin.html`, type a Google Fonts name
    under **Site theme**, and confirm the whole site switches font within
    ~15 seconds. Set an **accent color** and confirm buttons/badges/tags
    across the site pick it up. Set a background/text color for one
    section (e.g. Hero) and confirm just that section changes. **Reset
    all** and confirm the site returns to its default look (including
    purple accent).
18. Add two or three cards under **Image link cards** with different
    images/titles/links. Confirm a new "Useful links" section appears on
    the site between the programme and recordings, that each card opens
    its link in a new tab, and that the section disappears again if you
    delete every card. Use ↑/↓ to reorder and confirm the site reflects
    the new order within ~15 seconds. Confirm both admin panels show and
    can manage the same set of cards.
19. Rename the section title/subtitle under **Image link cards** and
    confirm the site's "Useful links" heading and its subtitle text update
    within ~15 seconds. Use **Move section up** twice to put it right
    after the hero, confirm it moves on the site, then **Move section
    down** it back — check the buttons disable themselves at each end.
20. Open both `admin.html` and `customer-admin.html` at once (e.g. two
    browser tabs), unlocked with their respective keys. Change the font or
    an accent color in one, and confirm it appears in the other within
    ~15 seconds without clicking Refresh — while doing this, confirm that
    if you're actively typing in a field in the *other* tab at that
    moment, your typing isn't overwritten.
21. Set a background or text color under **Site theme** and confirm the
    little color-picker square next to that field updates to match — not
    just the hex text next to it. Reload the page (or wait for the next
    poll) and confirm the square still matches after a fresh fetch.
22. On either admin panel, confirm the pill bar at the top has one pill per
    feature you have access to, and that clicking a pill scrolls straight
    to that block. Confirm every block has a short bolded name and
    one-line description above its controls.

```bash
# 11. Text & image section — save text only, then add an image, then clear
curl -X POST https://<site>/api/feature -H "x-admin-key: <ckey>" -F "title=Our mission" -F "body=A short paragraph."
curl https://<site>/api/feature   # {"title":"Our mission","body":"...","hasImage":false,...}
curl -X POST https://<site>/api/feature -H "x-admin-key: <key>" -F "title=Our mission" -F "body=A short paragraph." -F "image=@/path/to/test.jpg"
curl https://<site>/api/feature?image=1   # raw image bytes
curl -X DELETE "https://<site>/api/feature?part=image" -H "x-admin-key: <ckey>"
curl https://<site>/api/feature   # hasImage back to false, text unchanged
curl -X DELETE https://<site>/api/feature -H "x-admin-key: <key>"
curl https://<site>/api/feature   # {"title":"","body":"","hasImage":false,...}
```

Then manually:

23. Under **Text & image section** in either admin panel, save a title and
    body with no image — confirm the site shows just the centered text
    within ~15 seconds. Add an image — confirm a square image appears to
    the right of the text, sized to fit next to it. **Remove image** and
    confirm it goes back to centered text-only. **Clear whole section**
    and confirm the section disappears from the site entirely.

```bash
# 12. Hero and Recordings heading/subheading text
curl -X POST https://<site>/api/theme -H "content-type: application/json" -H "x-admin-key: <ckey>" -d '{"font":"","accent":"","sections":{"hero":{"bg":"","text":"","title":"Custom Hero Heading","subtitle":"Custom hero subheading."},"sessions":{"bg":"","text":"","title":"","subtitle":""},"recordings":{"bg":"","text":"","title":"Custom Recordings Heading","subtitle":"Custom recordings subheading."},"footer":{"bg":"","text":"","title":"","subtitle":""}}}'
curl https://<site>/api/theme   # both sets of title/subtitle come back
curl -X POST https://<site>/api/theme -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"font":"","accent":"","sections":{"hero":{"bg":"","text":"","title":"","subtitle":""},"sessions":{"bg":"","text":"","title":"","subtitle":""},"recordings":{"bg":"","text":"","title":"","subtitle":""},"footer":{"bg":"","text":"","title":"","subtitle":""}}}'
curl https://<site>/api/theme   # back to blank (site shows original wording)

# 13. Text & image section position
curl -X POST https://<site>/api/feature -H "content-type: application/json" -H "x-admin-key: <ckey>" -d '{"action":"position","position":0}'
curl https://<site>/api/feature   # position: 0
curl -X POST https://<site>/api/feature -H "content-type: application/json" -H "x-admin-key: <key>" -d '{"action":"position","position":2}'   # put it back
```

Then manually:

24. Under **Site theme**, type a custom heading and subheading for **Hero**
    and confirm the site's H1/lede update within ~15 seconds — note the
    purple "Work Week" highlight disappears once you set a custom heading
    (expected, since a custom heading is plain text). Clear both fields
    and confirm the original heading, with its highlight, comes back
    exactly as it was. Repeat for **Recordings**.
25. Confirm the hero no longer shows the "5 days / 11 sessions / Global"
    stat row or the "View schedule" / "See recordings" buttons under the
    heading — the hero should now be just the eyebrow, heading, and
    subheading (plus the video/image panel, if one is published).
26. Under **Text & image section**, use **Move section up**/**Move section
    down** and confirm the section moves on the site within ~15 seconds,
    same three slots as the image link cards. Confirm the buttons disable
    themselves at either end.

## Before a live event

Turn the survey off (or leave it off) until you actually want it live —
`admin.html` → **Turn off**. To wipe test data before the real thing:

```bash
netlify blobs:delete quantexa-survey responses --force
netlify blobs:delete demoleqture-hero-image bytes --force
netlify blobs:delete demoleqture-hero-image info --force
netlify blobs:delete demoleqture-theme theme --force
netlify blobs:delete demoleqture-cards list --force
netlify blobs:delete demoleqture-cards meta --force
netlify blobs:delete demoleqture-feature info --force
netlify blobs:delete demoleqture-feature bytes --force
```

The theme, image link cards, and text & image section are cosmetic/content,
not test data, so there's usually no need to wipe `demoleqture-theme`,
`demoleqture-cards`, or `demoleqture-feature` before a live event — only do
this if you specifically want to clear whatever a Customer Admin left
configured during testing.

## Moderation / privacy note

Open text answers are free-form and unmoderated — anything a visitor types
goes straight into the downloadable export, visible to whoever has either
`ADMIN_KEY` or `CUSTOMER_ADMIN_KEY`. There's no way for other visitors to
see survey answers (unlike the Q&A feature) — only ratings/text exported by
an admin. Uploaded hero images and image link cards are public by design
(served to every visitor, and card links open wherever the admin pointed
them), so don't upload anything sensitive and only link to trusted
destinations — both admin keys have equal ability to add cards and change
the theme, there's no review/approval step before something goes live.

## Deploy from GitHub Pages instead?

Don't — GitHub Pages only serves static files, it can't run the
`netlify/functions/*.mjs` backend this feature depends on. This project
needs to be deployed on Netlify.
