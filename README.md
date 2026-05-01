# encryptSecret

**Send secrets that self-destruct. End-to-end encrypted, burn-after-read notes.**

Live site → [Netlify](https://encryptsecret.netlify.app/)

---

## About This Project

encryptSecret is my second project while learning JavaScript — the first was a weather app, you can find it in my GitHub profile.
I developed it with the help of Claude AI, though not fully vibe-coded; the architecture, design decisions, and implementation choices are my own.

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

---

## What it does

encryptSecret lets you write a private message, encrypt it in your browser, and get a one-time link you can share. The recipient opens the link, the message is decrypted in *their* browser, and then it's permanently deleted from the database. Nobody — not even the server — can read it.

**Key features:**
- AES-256 encryption done entirely in the browser (Web Crypto API)
- Optional password protection
- Burn-after-reading (note is deleted the moment it's viewed)
- Multi-read mode with a max view count limit
- Expiry time (1 hour to 7 days)
- Rolling rate limit (max 3 notes per 60 seconds per IP — burst protection)
- Input sanitization — strips HTML, blocks XSS attempts before encryption
- Expiry value whitelist validation — prevents dev tools manipulation
- Zero server-side code — runs 100% as static files on GitHub Pages

---

## How it works (simple explanation)

1. You type a message → JavaScript encrypts it → encrypted gibberish is saved to Supabase (a cloud database)
2. Supabase gives it a unique ID → we turn that into a link like `read.html?id=abc123`
3. You share that link → recipient opens it → JavaScript fetches the encrypted gibberish from Supabase
4. JavaScript decrypts it in the recipient's browser → they read it → it's deleted forever

**The server never sees the real message, only encrypted data.**

---

## Tech stack

| Layer | Tool |
|---|---|
| Frontend | HTML, CSS, Vanilla JavaScript (ES Modules) |
| Encryption | Web Crypto API (AES-GCM, 256-bit) |
| Database | [Supabase](https://supabase.com) (free tier) |
| Hosting | Netlify + GitHub Pages (static files only — no backend needed) |

---

## Changelog

### Bug fixes

**`404.html` — GitHub Pages subfolder redirect broken**

Note share links shared as `/read?id=...` were failing because the redirect handler used a hardcoded root path, stripping the `/encryptSecret/` subfolder:

```js
// ❌ Before
window.location.replace("/read.html" + search);

// ✅ After — preserves subfolder path dynamically
const base = window.location.pathname.replace(/\/read\/?$/, "");
window.location.replace(base + "/read.html" + search);
```

---

### Security upgrades

**`create.js` — Rate limit changed from daily cap to rolling burst protection**

Old: 5 notes per IP per 24 hours.  
New: Max 3 notes per 60-second rolling window, tracked by a timestamp array. Expired slots drop off automatically — real users are never blocked for long, bots are stopped immediately.

**`create.js` — Input security layer added**

Three new protections before a note is encrypted and saved:

- HTML sanitization — strips `<>` tags, `javascript:` URIs, and inline event handlers
- Expiry whitelist — validates the value against `[1, 6, 24, 72, 168]` hours so the `<select>` can't be tampered with via browser dev tools
- Double sanitization — input is cleaned on `blur` and again inside the click handler just before encryption

---

### New pages

**`support.html` — Help & Support page**

Added a full help page with a step-by-step usage guide, 9-item FAQ accordion, and contact cards (Email, GitHub, Instagram, WhatsApp, LinkedIn, X).

---

## Pages

| Page | File | Purpose |
|---|---|---|
| Create note | `index.html` | Write and encrypt a note, get a share link |
| Read note | `read.html` | Decrypt and view a note via link |
| Help & Support | `support.html` | FAQ, how-to guide, contact & bug reports |
| 404 redirect | `404.html` | Redirects `/read?id=` links to `read.html?id=` |

---

## Setup (if you want to run your own copy)

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a free project, and run the SQL below in the Supabase SQL editor:

```sql
-- Notes table
create table notes (
  id                 uuid primary key default gen_random_uuid(),
  message            text not null,
  expires_at         timestamptz not null,
  has_password       boolean default false,
  created_by_ip      text,
  burn_after_reading boolean default true,
  view_count         integer default 0,
  max_views          integer,
  created_at         timestamptz default now()
);

-- Audit log table
create table note_access_log (
  id        bigserial primary key,
  note_id   uuid references notes(id) on delete set null,
  action    text check (action in ('viewed', 'deleted', 'expired')),
  logged_at timestamptz default now()
);

-- Row Level Security
alter table notes enable row level security;
create policy "Allow anon insert" on notes for insert to anon with check (true);
create policy "Allow anon select" on notes for select to anon using (true);
create policy "Allow anon delete" on notes for delete to anon using (true);
create policy "Allow anon update" on notes for update to anon using (true);

alter table note_access_log enable row level security;
create policy "Allow anon insert log" on note_access_log for insert to anon with check (true);
```

### 2. Add your Supabase credentials

Open `assets/js/config.js` and replace the values with your own:

```js
export const SUPABASE_URL = "https://your-project.supabase.co";
export const SUPABASE_KEY = "your-anon-public-key";
```

> The anon key is safe to commit — it's public by design. Never commit your **service_role** key.

### 3. Deploy

- Push this folder to a GitHub repository
- Go to **Settings → Pages → Source**, set it to `main` branch, root `/`
- Or connect the repo to [Netlify](https://netlify.com) for automatic deploys

---

## File structure

```
encryptSecret/
├── index.html          ← Create note page
├── read.html           ← Read/decrypt note page
├── support.html        ← Help & Support page
├── 404.html            ← Redirect handler for /read?id= links
├── assets/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── app.js      ← Supabase client setup
│       ├── config.js   ← Your Supabase URL and key go here
│       ├── create.js   ← Create note logic + rate limiting + input security
│       ├── read.js     ← Read/decrypt note logic
│       ├── crypto.js   ← AES-256 encryption/decryption
│       └── toggle.js   ← Dark/light theme toggle
└── README.md
```

---

## Why no server?

GitHub Pages and Netlify only serve static files — HTML, CSS, and JavaScript. They cannot run Node.js or Express. encryptSecret doesn't need a server because:

- Encryption and decryption happen in JavaScript, inside your browser
- The database (Supabase) is a cloud service with its own API — JavaScript talks to it directly

This makes the app simpler, cheaper (free), and more trustworthy — there's no server in the middle that could log your messages.

---

*Built by [Amos Isaiah Tizhe](https://github.com/amosisaiahtizhe) — OneXportal*
