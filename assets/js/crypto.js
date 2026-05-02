// ─────────────────────────────────────────────────────────────
// crypto.js — AES-256-GCM encryption / decryption
// Updated: passwordless notes now use a random key embedded
// in the share URL hash (#) instead of a hardcoded fallback.
// ─────────────────────────────────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ── INTERNAL: derive a strong AES-256 key from a password string
async function deriveKey(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name:       "PBKDF2",
      salt:       salt,
      iterations: 310_000,   // OWASP-recommended for 2024
      hash:       "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ── ENCRYPT
// Takes a plaintext string + password string.
// Returns { cipher, salt, iv } — all base64 encoded.
export async function encryptMessage(message, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(message)
  );

  return {
    cipher: arrayBufferToBase64(encrypted),
    salt:   arrayBufferToBase64(salt),
    iv:     arrayBufferToBase64(iv)
  };
}

// ── DECRYPT
// Takes { cipher, salt, iv } and password.
// Returns the original plaintext string.
// Throws DOMException if password is wrong.
export async function decryptMessage(payload, password) {
  const key = await deriveKey(password, base64ToArrayBuffer(payload.salt));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToArrayBuffer(payload.iv) },
    key,
    base64ToArrayBuffer(payload.cipher)
  );
  return decoder.decode(decrypted);
}

// ── NEW: Generate a random URL-safe key for passwordless notes
// Returns a random 32-byte string encoded as base64url.
// This goes into the share link as the URL hash (#key).
// The server NEVER sees it — browsers don't send the hash to servers.
export function generateRandomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return arrayBufferToBase64Url(bytes);
}

// ── BASE64 HELPERS (standard)
function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToArrayBuffer(base64) {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

// ── BASE64URL HELPER (URL-safe, no +/= characters)
// Used for the random key in the URL hash so it doesn't break links.
function arrayBufferToBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
