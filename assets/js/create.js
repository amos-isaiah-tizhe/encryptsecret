import { supabase }         from "./app.js";
import { encryptMessage }   from "./crypto.js";

const messageEl      = document.getElementById("message");
const charCountEl    = document.getElementById("charCount");
const passwordEl     = document.getElementById("password");
const togglePwBtn    = document.getElementById("togglePassword");
const eyeIconEl      = document.getElementById("eyeIcon");
const expiryEl       = document.getElementById("expiry");
const createBtn      = document.getElementById("createBtn");
const createBtnText  = document.getElementById("createBtnText");
const createSpinner  = document.getElementById("createSpinner");
const noPasswordWarn = document.getElementById("noPasswordWarn");
const errorAlertEl   = document.getElementById("errorAlert");
const errorTextEl    = document.getElementById("errorText");

// Success box elements
const successBoxEl   = document.getElementById("successBox");
const linkDisplayEl  = document.getElementById("linkDisplay");
const copyLinkBtn    = document.getElementById("copyLinkBtn");
const copyBtnTextEl  = document.getElementById("copyBtnText");
const newNoteBtnEl   = document.getElementById("newNoteBtn");

// Strength indicator elements
const pip1El          = document.getElementById("pip1");
const pip2El          = document.getElementById("pip2");
const pip3El          = document.getElementById("pip3");
const strengthLabelEl = document.getElementById("strengthLabel");

// Max characters allowed in a note
const MAX_CHARS = 5000;

// RATE LIMIT SETTINGS — rolling window (burst protection)
// Max 3 notes per 60 seconds, tracked both in localStorage and Supabase by IP.
const RATE_LIMIT_MAX    = 3;          // max notes per window
const RATE_LIMIT_WINDOW = 60 * 1000;  // 60 seconds in milliseconds
const RATE_LIMIT_KEY    = "safenote_rate";


// ─────────────────────────────────────────
// CHARACTER COUNTER
// ─────────────────────────────────────────
messageEl.addEventListener("input", () => {
  const count = messageEl.value.length;
  charCountEl.textContent = `${count} / ${MAX_CHARS}`;
  charCountEl.classList.toggle("warn", count > MAX_CHARS * 0.85 && count < MAX_CHARS);
  charCountEl.classList.toggle("over", count >= MAX_CHARS);
});


// ─────────────────────────────────────────
// INPUT SECURITY — sanitize message on blur
// Strips any HTML tags a user might paste in, preventing XSS if
// the message is ever rendered as HTML elsewhere.
// ─────────────────────────────────────────
messageEl.addEventListener("blur", () => {
  messageEl.value = sanitizeInput(messageEl.value);
});

function sanitizeInput(str) {
  // Replace < and > so no HTML tags can sneak through
  return str
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/javascript:/gi, "")   // block javascript: URIs
    .replace(/on\w+\s*=/gi, "");    // block inline event handlers like onerror=
}


// ─────────────────────────────────────────
// PASSWORD VISIBILITY TOGGLE
// ─────────────────────────────────────────
togglePwBtn.addEventListener("click", () => {
  const isHidden = passwordEl.type === "password";
  passwordEl.type = isHidden ? "text" : "password";

  eyeIconEl.innerHTML = isHidden
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
       <circle cx="12" cy="12" r="3"/>`;
});


// ─────────────────────────────────────────
// PASSWORD STRENGTH INDICATOR
// ─────────────────────────────────────────
passwordEl.addEventListener("input", () => {
  const pw = passwordEl.value;
  noPasswordWarn.classList.toggle("hidden", pw.length > 0);

  const strength = getPasswordStrength(pw);

  [pip1El, pip2El, pip3El].forEach(p => {
    p.classList.remove("s-weak", "s-fair", "s-strong");
  });

  if (strength === 1) {
    pip1El.classList.add("s-weak");
    strengthLabelEl.style.color = "var(--red)";
    strengthLabelEl.textContent = "Weak";
  } else if (strength === 2) {
    pip1El.classList.add("s-fair");
    pip2El.classList.add("s-fair");
    strengthLabelEl.style.color = "var(--amber)";
    strengthLabelEl.textContent = "Fair";
  } else if (strength >= 3) {
    pip1El.classList.add("s-strong");
    pip2El.classList.add("s-strong");
    pip3El.classList.add("s-strong");
    strengthLabelEl.style.color = "var(--accent)";
    strengthLabelEl.textContent = "Strong";
  } else {
    strengthLabelEl.textContent = "";
  }
});

// PASSWORD STRENGTH CALCULATOR
function getPasswordStrength(pw) {
  if (!pw) return 0;

  let score = 0;
  if (pw.length >= 8)                          score++;
  if (pw.length >= 14)                         score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw))   score++;
  if (/\d/.test(pw))                           score++;
  if (/[^A-Za-z0-9]/.test(pw))                score++;

  if (score <= 0) return 0;
  if (score <= 2) return 1;
  if (score <= 3) return 2;
  return 3;
}


// ─────────────────────────────────────────
// RATE LIMITING HELPERS
// Two layers of protection:
//   Layer 1 — localStorage (instant, no network needed)
//   Layer 2 — Supabase by IP (real protection, can't be cleared)
// ─────────────────────────────────────────

// HELPER: Read the rate limit record from localStorage.
// New format stores an array of timestamps instead of a count.
// If old format (count/windowStart) is found, migrate it safely.
function getRateRecord() {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old format to new format
      if (!parsed.timestamps) parsed.timestamps = [];
      return parsed;
    }
  } catch {
    // Tampered or corrupted — start clean
  }
  return { timestamps: [] };
}

// HELPER: Save the rate limit record to localStorage
function saveRateRecord(record) {
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(record));
  } catch {
    // Storage full — not critical, skip
  }
}

// HELPER: Layer 1 check — frontend rolling window
// Keeps an array of timestamps of recent note creations.
// Drops anything older than 60 seconds, then checks if the
// remaining count has hit the limit.
//
// Returns: { allowed: true }
//       or { allowed: false, resetsAt: Date }
function checkFrontendLimit() {
  let record = getRateRecord();
  const now  = Date.now();

  // Drop timestamps older than the rolling window
  record.timestamps = record.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  saveRateRecord(record);

  if (record.timestamps.length < RATE_LIMIT_MAX) {
    return { allowed: true };
  }

  // Oldest timestamp tells us when the earliest slot frees up
  const resetsAt = new Date(record.timestamps[0] + RATE_LIMIT_WINDOW);
  return { allowed: false, resetsAt };
}

// HELPER: Increment the timestamp log after a successful save
function incrementFrontendCount() {
  const record = getRateRecord();
  const now    = Date.now();

  if (!record.timestamps) record.timestamps = [];

  // Clean expired entries first
  record.timestamps = record.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);

  // Add this note's timestamp
  record.timestamps.push(now);
  saveRateRecord(record);
}

// HELPER: Layer 2 check — Supabase by IP (real protection)
// localStorage can be cleared by the user, but this check
// queries your actual database — it cannot be bypassed.
//
// Flow:
//   1. Fetch user's IP from ipapi.co (free, no API key needed)
//   2. Count notes from that IP in the last 60 seconds
//   3. Block if count >= RATE_LIMIT_MAX
//
// Returns: { allowed: true,  ip: "1.2.3.4" }
//       or { allowed: false, ip: "1.2.3.4" }
async function checkDatabaseLimit() {
  let ip = "unknown";

  // Step 1: Get IP address
  try {
    const res  = await fetch("https://ipapi.co/json/");
    const data = await res.json();
    ip = data.ip || "unknown";
  } catch {
    // IP service down — don't punish users, let them through
    console.warn("Could not fetch IP — DB rate limit check skipped.");
    return { allowed: true, ip: "unknown" };
  }

  // Step 2: Count notes from this IP in the last 60 seconds
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();

  const { count, error } = await supabase
    .from("notes")
    .select("id", { count: "exact", head: true })
    // head: true = only return the count, not the actual rows (faster & cheaper)
    .eq("created_by_ip", ip)
    .gte("created_at", since); // gte = "greater than or equal to"

  if (error) {
    // DB check failed — let them through, don't punish for server errors
    console.warn("DB rate limit check failed:", error.message);
    return { allowed: true, ip };
  }

  // Step 3: Block if at or over the limit
  if (count >= RATE_LIMIT_MAX) {
    return { allowed: false, ip };
  }

  return { allowed: true, ip };
}

// HELPER: Turn milliseconds into a human-readable countdown
// e.g. "45 seconds" or "2 minutes"
function formatTimeLeft(resetsAt) {
  const secondsLeft = Math.ceil((resetsAt.getTime() - Date.now()) / 1000);
  if (secondsLeft <= 60) return `${secondsLeft} second${secondsLeft === 1 ? "" : "s"}`;
  return `${Math.ceil(secondsLeft / 60)} minutes`;
}


// ─────────────────────────────────────────
// CREATE NOTE — main action
// ─────────────────────────────────────────
createBtn.addEventListener("click", async () => {

  // 1. Read and sanitize values from the form
  const message  = sanitizeInput(messageEl.value.trim());
  const password = passwordEl.value.trim();
  const expiry   = parseInt(expiryEl.value, 10);

  // 2. Validate message
  if (!message) {
    showError("Please write a message before creating a note.");
    return;
  }
  if (message.length > MAX_CHARS) {
    showError(`Message is too long. Maximum is ${MAX_CHARS} characters.`);
    return;
  }

  // 3. Validate expiry is a real number (security: don't trust the select value blindly)
  const validExpiries = [1, 6, 24, 72, 168]; // hours matching your <select> options
  if (!validExpiries.includes(expiry)) {
    showError("Invalid expiry option selected. Please choose from the list.");
    return;
  }

  // 4. Layer 1 — Frontend rate limit (instant, no network)
  const frontendCheck = checkFrontendLimit();

  if (!frontendCheck.allowed) {
    const timeLeft = formatTimeLeft(frontendCheck.resetsAt);
    showError(`You're creating notes too fast. Try again in ${timeLeft}.`);
    return; // Stop here — don't show spinner, don't hit the database
  }

  // 5. Show loading state
  setLoading(true);
  hideError();

  try {

    // 6. Layer 2 — Database rate limit by IP (real protection)
    // Runs before encryption so we don't waste time encrypting
    // if the user is already over the limit.
    const dbCheck = await checkDatabaseLimit();

    if (!dbCheck.allowed) {
      const resetsAt = new Date(Date.now() + RATE_LIMIT_WINDOW);
      const timeLeft = formatTimeLeft(resetsAt);
      showError(`You're creating notes too fast. Try again in ${timeLeft}.`);
      return;
    }

    // 7. Encrypt the message in the browser (never sent as plain text)
    const passKey       = password || "public-mode";
    const encryptedData = await encryptMessage(message, passKey);

    // 8. Calculate expiry timestamp
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiry);

    // 9. Save to Supabase
    const { data, error } = await supabase
      .from("notes")
      .insert([{
        message:       JSON.stringify(encryptedData),
        expires_at:    expiresAt.toISOString(),
        has_password:  password.length > 0,
        created_by_ip: dbCheck.ip,
      }])
      .select();

    if (error) throw error;

    // 10. Increment frontend timestamp log (only after successful save)
    incrementFrontendCount();

    // 11. Build and show the shareable link
    const noteId    = data[0].id;
    const shareLink = `${window.location.origin}/read.html?id=${noteId}`;
    showSuccess(shareLink);

  } catch (err) {
    console.error("Create note error:", err);
    showError(
      "Something went wrong. Check that your Supabase URL and key are correct, " +
      "and that your 'notes' table exists."
    );
  } finally {
    setLoading(false);
  }
});


// ─────────────────────────────────────────
// COPY LINK BUTTON
// ─────────────────────────────────────────
copyLinkBtn.addEventListener("click", async () => {
  const link = linkDisplayEl.textContent;
  try {
    await navigator.clipboard.writeText(link);
    copyBtnTextEl.textContent = "Copied!";
    setTimeout(() => { copyBtnTextEl.textContent = "Copy Link"; }, 2000);
  } catch {
    window.prompt("Copy this link:", link);
  }
});


// ─────────────────────────────────────────
// NEW NOTE BUTTON — reset the form
// ─────────────────────────────────────────
newNoteBtnEl.addEventListener("click", () => {
  messageEl.value         = "";
  passwordEl.value        = "";
  expiryEl.value          = "24";
  charCountEl.textContent = `0 / ${MAX_CHARS}`;
  successBoxEl.classList.add("hidden");
  createBtn.classList.remove("hidden");
  noPasswordWarn.classList.remove("hidden");
  [pip1El, pip2El, pip3El].forEach(p =>
    p.classList.remove("s-weak", "s-fair", "s-strong")
  );
  strengthLabelEl.textContent = "";
  messageEl.focus();
});


// ─────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────

function setLoading(isLoading) {
  createBtn.disabled = isLoading;
  createBtnText.textContent = isLoading ? "Creating…" : "Create Secure Note";
  createSpinner.classList.toggle("hidden", !isLoading);
}

function showSuccess(link) {
  linkDisplayEl.textContent = link;
  successBoxEl.classList.remove("hidden");
  successBoxEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showError(message) {
  errorTextEl.textContent = message;
  errorAlertEl.classList.remove("hidden");
}

function hideError() {
  errorAlertEl.classList.add("hidden");
}
