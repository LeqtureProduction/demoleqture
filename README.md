# Quantexa Learning at Work Week 2026

Static site + Netlify Functions for Quantexa's Learning at Work Week 2026 event page.

## Structure

- `public/` — static site (`index.html`, `admin.html`), published as the site root
- `netlify/functions/` — serverless functions backing the admin panel, live player link, announcement banner, and post-session survey (all persisted via Netlify Blobs)
- `netlify.toml` — Netlify build/functions config

## Setup

```bash
npm install
```

Set the `ADMIN_KEY` environment variable in Netlify (Site settings → Environment variables) — it protects the admin-only endpoints (`announcement`, `player`, `survey-state`, `survey-export`).

## Deploy

Connect this repo to Netlify, or run locally with the Netlify CLI:

```bash
npx netlify dev
```
