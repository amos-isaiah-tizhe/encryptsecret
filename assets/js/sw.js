// ============================================================
// sw.js — EncryptSecret Service Worker
// Location: project root (same folder as index.html)
//
// STRATEGY: Cache-first for app shell, network-only for Supabase.
// This makes the app install and load fast while keeping all
// note operations live against the real database.
// ============================================================

const CACHE_NAME    = "encryptsecret-v1";
const SUPABASE_HOST = "supabase.co"; // never cache anything from supabase

// ── App shell files to cache on install
// These are the files your app needs to open even without internet.
const SHELL_FILES = [
  "/",
  "/index.html",
  "/encryptpass.html",
  "/pastebin.html",
  "/support.html",
  "/404.html",
  "/assets/css/styles.css",
  "/assets/js/app.js",
  "/assets/js/config.js",
  "/assets/js/create.js",
  "/assets/js/read.js",
  "/assets/js/crypto.js",
  "/assets/js/toggle.js",
  "/assets/js/pwa.js",
  "/assets/js/encryptpass_create.js",
  "/assets/js/encryptpass_read.js",
  "/assets/js/pastebin_create.js",
  "/assets/js/pastebin_read.js",
  "/assets/img/icon-192.png",
  "/assets/img/icon-512.png",
  "/assets/img/og-image.png",
  "/site.webmanifest",
];

// ── INSTALL: cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll fetches and caches every file in the list.
      // If any single file fails, the whole install fails — so
      // make sure every path above actually exists in your project.
      return cache.addAll(SHELL_FILES);
    })
  );
  // Take control immediately without waiting for old SW to expire
  self.skipWaiting();
});

// ── ACTIVATE: delete old caches from previous versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME) // keep only current cache
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ── FETCH: decide how to handle every network request
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ── Rule 1: Never cache Supabase requests
  // All note create/read/delete operations must hit the live database.
  if (url.hostname.includes(SUPABASE_HOST)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ── Rule 2: Never cache POST/DELETE/PATCH requests
  // Only cache GET requests (page loads, assets).
  if (event.request.method !== "GET") {
    event.respondWith(fetch(event.request));
    return;
  }

  // ── Rule 3: Never cache ipapi.co (IP lookup for rate limiting)
  if (url.hostname.includes("ipapi.co")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ── Rule 4: Never cache Netlify functions
  if (url.pathname.startsWith("/.netlify/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ── Rule 5: Cache-first for everything else (app shell + assets)
  // Try the cache first. If not found, fetch from network and cache it.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      // Not in cache — fetch from network
      return fetch(event.request)
        .then((networkResponse) => {
          // Only cache successful responses
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed and not in cache.
          // For HTML page requests, return the homepage as fallback.
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/index.html");
          }
        });
    })
  );
});
