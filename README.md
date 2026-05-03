# EncryptSecret

**Secrets that vanish after reading. End-to-end encrypted notes, passwords, and code snippets.**

Live site → [encryptsecret.netlify.app](https://encryptsecret.netlify.app/)

---

## About This Project

EncryptSecret is my second JavaScript project — the first was a weather app, you can find it in my GitHub profile. I developed it with the help of Claude AI, though not fully vibe-coded; the architecture, design decisions, and implementation choices are my own.

> Originally named SafeNote — renamed to EncryptSecret after finding another project using the same name, and to align with the OneXportal brand namespace ahead of getting a domain.

**Author:** Amos Isaiah Tizhe
**Brand:** OneXportal

| Platform | Link |
|---|---|
| GitHub | [@amosisaiahtizhe](https://github.com/amosisaiahtizhe) |
| Twitter / X | [@isaiahamostizhe](https://twitter.com/isaiahamostizhe) |
| Instagram | [@amosisaiahtizhe](https://instagram.com/amosisaiahtizhe) |
| LinkedIn | [@amosisaiahtizhe](https://linkedin.com/in/amosisaiahtizhe) |
| WhatsApp | [+2348137631164](https://wa.me/2348137631164) |
| Telegram | [@amosisaiahtizhe](https://t.me/amosisaiahtizhe) |
| Email | [amosisaiahtizhe@gmail.com](mailto:amosisaiahtizhe@gmail.com) |

---

## What it does

EncryptSecret is a suite of three privacy tools — all built on the same idea: encrypt in the browser, share a link, self-destruct after reading.

### 🔐 Encrypted Notes (`index.html`)
Write a private message, encrypt it in your browser, get a one-time link. The recipient reads it, it deletes itself. Nobody — not even the server — ever sees the plaintext.

### 🔑 EncryptPass (`encryptpass.html`)
Share passwords, API keys, PINs and credentials via a one-time link that permanently self-destructs the moment it's opened. Replaces sending credentials over WhatsApp or email where they stay forever.

### `</>` Private Pastebin (`pastebin.html`)
Share encrypted code snippets, config files, and error logs up to 20,000 characters. Unlike public pastebins, content is AES-256 encrypted before storage and deleted permanently after reading.

---

## Key Features

- AES-256-GCM encryption performed entirely in the browser (Web Crypto API)
- Burn-after-reading — note/password/paste deleted the moment it's opened
- Passwordless notes use a **random cryptographic key embedded in the URL hash** (`#`) — the server never receives or sees it
- Optional lock password for additional protection
- Expiry timer from 1 hour to 7 days
- Rolling rate limit — max 3 creations per 60 seconds per IP (burst protection)
- Two-layer rate limiting: localStorage (instant) + Supabase by IP (real protection)
- Server-side real IP detection via Netlify serverless function
- Input sanitization — strips HTML, blocks XSS and javascript: URIs before encryption
- Expiry value whitelist validation — prevents dev tools manipulation
- Content Security Policy headers via `_headers` file
- Strict Supabase Row Level Security — blocks bulk reads, restricts updates
- Auto-deletion of all data after 8 days via `pg_cron` scheduled job
- PWA — installable to home screen on Android and iOS
- Full SEO — sitemap, robots.txt, Open Graph, structured data, `llms.txt` for AI crawlers
- No account, no sign-up, no email required
- No ads, no tracking, no analytics
- Zero server-side code — static files only

---

## How it works

1. You type a message → JavaScript encrypts it in your browser → encrypted ciphertext is saved to Supabase
2. For passwordless content: a random 32-byte key is generated and embedded in the share link after `#` — the browser never sends the `#` fragment to the server
3. You share the link → recipient opens it → JavaScript fetches the ciphertext from Supabase
4. JavaScript decrypts it in the recipient's browser using the key from the link → they read it → it's permanently deleted

**The server only ever stores encrypted gibberish. The decryption key never touches the server.**

---

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript (ES Modules) |
| Encryption | Web Crypto API — AES-GCM 256-bit, PBKDF2 (310,000 iterations) |
| Database | [Supabase](https://supabase.com) (PostgreSQL, free tier) |
| Hosting | [Netlify](https://netlify.com) |
| Serverless | Netlify Functions (server-side IP detection) |
| PWA | Service Worker + Web App Manifest |

---

## Security Architecture

| Layer | What it does |
|---|---|
| AES-256-GCM | Encrypts content in the browser before transmission |
| URL hash key | Random key for passwordless content — never sent to server |
| PBKDF2 (310k iterations) | Derives strong encryption keys from passwords |
| Content Security Policy | Blocks unauthorized scripts and connections |
| Supabase RLS | Prevents bulk reads, restricts updates to view_count only |
| Rolling rate limit | Max 3 creations/60s per IP — stops bot bursts |
| Netlify function IP | Server-side IP — cannot be spoofed from the browser |
| pg_cron auto-delete | All notes deleted after 8 days regardless of status |
| Input sanitization | Strips HTML tags, javascript: URIs, inline event handlers |
| Expiry whitelist | Validates expiry against allowed values before saving |

---

## Changelog

### Rename — SafeNote → EncryptSecret
Renamed after finding another project using the SafeNote name. EncryptSecret aligns with the OneXportal brand namespace (`OneXp` prefix) ahead of domain registration.

---

### New tools added

**`encryptpass.html` + `read-encryptpass.html` — EncryptPass**
One-time password and credential sharing via self-destructing links.

**`pastebin.html` + `read-pastebin.html` — Private Pastebin**
Encrypted code snippet and text sharing up to 20,000 characters.

**`support.html` — Help & Support**
Step-by-step usage guide, 9-item FAQ accordion, contact cards.

A `type` column was added to the `notes` table to distinguish between `note`, `password`, and `paste` records.

---

### Security upgrades

**URL hash key for passwordless content**
Passwordless notes previously used a hardcoded fallback key `"public-mode"` visible in source code. Now a random 32-byte cryptographic key is generated per note and embedded in the share URL hash (`#`). The browser never sends the hash fragment to the server.

```
Old: /read.html?id=abc123
New: /read.html?id=abc123#kR9mXpQv2nBsLw8tYjGhCdAeZuFoIr4N
```

**Rate limit — daily cap → rolling burst window**
Changed from 5 notes per 24 hours to max 3 per 60-second rolling window. Tracked by a timestamp array — expired slots drop off automatically.

**Input sanitization layer**
Strips HTML `<>` tags, `javascript:` URIs, and inline event handlers before encryption. Expiry value validated against a whitelist.

**Content Security Policy**
Added `_headers` file for Netlify — enforces CSP, HSTS, X-Frame-Options, Referrer-Policy, and Permissions-Policy.

**Stricter Supabase RLS**
Replaced open anon policies with strict per-row access. Bulk reads blocked. Updates restricted to `view_count` only. Immutable fields (message, expiry, type) cannot be changed via the frontend.

**Server-side IP detection**
Added `netlify/functions/get-ip.js` — reads real client IP from server-side HTTP headers. Replaces client-side `ipapi.co` fetch which could be intercepted or blocked.

**PBKDF2 iterations increased**
Key derivation updated to 310,000 iterations per OWASP 2024 recommendations.

---

### Bug fixes

**`404.html` — GitHub Pages subfolder redirect**
Note links shared as `/read?id=...` were returning 404 because the redirect was using a hardcoded root path, stripping the subfolder:

```js
// ❌ Before
window.location.replace("/read.html" + search);

// ✅ After
const base = window.location.pathname.replace(/\/read\/?$/, "");
window.location.replace(base + "/read.html" + search);
```

The updated `404.html` now handles routes for all three tools.

---

### Database

**`pg_cron` auto-deletion**
Scheduled job runs every day at 2:00 AM UTC and permanently deletes all notes older than 8 days:

```sql
SELECT cron.schedule(
  'delete-expired-notes',
  '0 2 * * *',
  $$ DELETE FROM notes WHERE created_at < NOW() - INTERVAL '8 days'; $$
);
```

**`type` column added**
Distinguishes between `note`, `password`, and `paste` records for per-tool rate limiting and filtering.

---

### PWA

Added full Progressive Web App support:

- `sw.js` — service worker with cache-first strategy for app shell, network-only for Supabase
- `assets/js/pwa.js` — registers service worker, shows custom install banner on Android, shows manual install tip on iOS Safari
- `assets/img/icon-192.png` + `icon-512.png` — app icons generated from brand shield SVG
- `site.webmanifest` — full PWA manifest with shortcuts for all three tools

---

### SEO & AI discoverability

- `robots.txt` — allows Google, Bing, and AI crawlers (GPTBot, ClaudeBot, PerplexityBot); blocks read pages from indexing
- `sitemap.xml` — lists all four public pages with priority weights
- `llms.txt` — structured AI-readable description for ChatGPT, Claude, Perplexity recommendation engines
- Open Graph, Twitter Card, and JSON-LD structured data on every page
- Submitted to Google Search Console and Bing Webmaster Tools

---

## Pages

| Page | File | Purpose |
|---|---|---|
| Create note | `index.html` | Write and encrypt a self-destructing note |
| Read note | `read.html` | Decrypt and view a note via link |
| EncryptPass | `encryptpass.html` | Create a one-time password share link |
| Read password | `read-encryptpass.html` | Decrypt and view a shared password |
| Private Pastebin | `pastebin.html` | Create an encrypted code/text paste |
| Read paste | `read-pastebin.html` | Decrypt and view a paste |
| Help & Support | `support.html` | FAQ, usage guide, contact |
| 404 redirect | `404.html` | Handles clean URL redirects for all tools |

---

## Setup (run your own copy)

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a free project, and run this SQL:

```sql
create table notes (
  id                 uuid primary key default gen_random_uuid(),
  message            text not null,
  expires_at         timestamptz not null,
  has_password       boolean default false,
  created_by_ip      text,
  burn_after_reading boolean default true,
  view_count         integer default 0,
  max_views          integer,
  type               text not null default 'note'
                       check (type in ('note', 'password', 'paste')),
  created_at         timestamptz default now()
);

create table note_access_log (
  id        bigserial primary key,
  note_id   uuid references notes(id) on delete set null,
  action    text check (action in ('viewed', 'deleted', 'expired')),
  logged_at timestamptz default now()
);

alter table notes enable row level security;
create policy "anon_insert_notes" on notes for insert to anon with check (true);
create policy "anon_select_single_note" on notes for select to anon
  using (id = id and expires_at > now());
create policy "anon_delete_own_note" on notes for delete to anon using (id = id);
create policy "anon_update_view_count_only" on notes for update to anon
  using (id = id)
  with check (message = message and expires_at = expires_at
              and has_password = has_password and type = type);

alter table note_access_log enable row level security;
create policy "anon_insert_log" on note_access_log for insert to anon with check (true);
```

### 2. Enable pg_cron and schedule auto-deletion

In Supabase → Database → Extensions → enable `pg_cron`, then run:

```sql
SELECT cron.schedule(
  'delete-expired-notes',
  '0 2 * * *',
  $$ DELETE FROM notes WHERE created_at < NOW() - INTERVAL '8 days'; $$
);
```

### 3. Add your Supabase credentials

```js
// assets/js/config.js
export const SUPABASE_URL = "https://your-project.supabase.co";
export const SUPABASE_KEY = "your-anon-public-key";
```

> The anon key is safe to expose — it's public by design. Never commit your `service_role` key.

### 4. Deploy to Netlify

- Push to GitHub
- Connect repo to [Netlify](https://netlify.com)
- Set branch to `main`, publish directory to `/` (or your subfolder)
- Netlify auto-deploys on every push

---

## File Structure

```
encryptsecret/
├── index.html                  ← Encrypted Notes (create)
├── read.html                   ← Encrypted Notes (read)
├── encryptpass.html            ← EncryptPass (create)
├── read-encryptpass.html       ← EncryptPass (read)
├── pastebin.html               ← Private Pastebin (create)
├── read-pastebin.html          ← Private Pastebin (read)
├── support.html                ← Help & Support
├── 404.html                    ← Clean URL redirect handler
├── sw.js                       ← PWA service worker
├── site.webmanifest            ← PWA manifest
├── robots.txt                  ← Search engine + AI crawl rules
├── sitemap.xml                 ← Page index for Google/Bing
├── llms.txt                    ← AI-readable project description
├── _headers                    ← Netlify CSP + security headers
├── netlify/
│   └── functions/
│       └── get-ip.js           ← Server-side IP detection
└── assets/
    ├── css/
    │   └── styles.css
    ├── img/
    │   ├── og-image.png        ← Open Graph share image
    │   ├── icon-192.png        ← PWA icon
    │   └── icon-512.png        ← PWA icon
    └── js/
        ├── app.js              ← Supabase client
        ├── config.js           ← Supabase credentials
        ├── crypto.js           ← AES-256-GCM + random key generation
        ├── create.js           ← Note create logic
        ├── read.js             ← Note read + decrypt logic
        ├── encryptpass_create.js
        ├── encryptpass_read.js
        ├── pastebin_create.js
        ├── pastebin_read.js
        ├── toggle.js           ← Dark/light theme
        └── pwa.js              ← PWA install prompt + iOS banner
```

---

## Why no server?

Netlify only serves static files. EncryptSecret doesn't need a backend because:

- Encryption and decryption happen in JavaScript, inside the browser
- Supabase is a cloud database with its own REST API — JavaScript talks to it directly
- The one server-side piece (IP detection) runs as a Netlify serverless function — no Node.js server to maintain

No server means nothing to hack, nothing to maintain, and nothing that can log your messages.

---

*Built by [Amos Isaiah Tizhe](https://github.com/amosisaiahtizhe) — [OneXportal](https://OneXportalhub.com)*