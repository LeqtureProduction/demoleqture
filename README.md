# Learning at Work Week 2026 — Quantexa

A single-page site for Quantexa's Learning at Work Week 2026 (6–10 July), styled in Leqture's black/orange visual language. Content mirrors the original event page; design (colors, type, layout) is adapted from leqture.com.

## Structure

- `index.html` — the entire site (HTML + CSS, no build step, no dependencies besides Google Fonts).

## Run locally

Open `index.html` directly in a browser, or serve it:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Deploy with GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Save. The site will publish at `https://<username>.github.io/<repo-name>/`.
