import { supabase }                        from "./app.js";
import { encryptMessage, generateRandomKey } from "./crypto.js";

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
const successBoxEl   = document.getElementById("successBox");
const linkDisplayEl  = document.getElementById("linkDisplay");
const copyLinkBtn    = document.getElementById("copyLinkBtn");
const copyBtnTextEl  = document.getElementById("copyBtnText");
const newNoteBtnEl   = document.getElementById("newNoteBtn");
const pip1El         = document.getElementById("pip1");
const pip2El         = document.getElementById("pip2");
const pip3El         = document.getElementById("pip3");
const strengthLabelEl = document.getElementById("strengthLabel");

const MAX_CHARS         = 5000;
const RATE_LIMIT_MAX    = 3;
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_KEY    = "encryptsecret_note_rate";

// ── CHARACTER COUNTER
messageEl.addEventListener("input", () => {
  const count = messageEl.value.length;
  charCountEl.textContent = `${count} / ${MAX_CHARS}`;
  charCountEl.classList.toggle("warn", count > MAX_CHARS * 0.85 && count < MAX_CHARS);
  charCountEl.classList.toggle("over", count >= MAX_CHARS);
});

// ── INPUT SANITIZATION
messageEl.addEventListener("blur", () => {
  messageEl.value = sanitizeInput(messageEl.value);
});

function sanitizeInput(str) {
  return str
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "");
}

// ── PASSWORD TOGGLE
togglePwBtn.addEventListener("click", () => {
  const isHidden = passwordEl.type === "password";
  passwordEl.type = isHidden ? "text" : "password";
  eyeIconEl.innerHTML = isHidden
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
});

// ── PASSWORD STRENGTH
passwordEl.addEventListener("input", () => {
  const pw = passwordEl.value;
  noPasswordWarn.classList.toggle("hidden", pw.length > 0);
  const strength = getPasswordStrength(pw);
  [pip1El, pip2El, pip3El].forEach(p => p.classList.remove("s-weak", "s-fair", "s-strong"));
  if (strength === 1) {
    pip1El.classList.add("s-weak");
    strengthLabelEl.style.color = "var(--red)";
    strengthLabelEl.textContent = "Weak";
  } else if (strength === 2) {
    pip1El.classList.add("s-fair"); pip2El.classList.add("s-fair");
    strengthLabelEl.style.color = "var(--amber)";
    strengthLabelEl.textContent = "Fair";
  } else if (strength >= 3) {
    [pip1El, pip2El, pip3El].forEach(p => p.classList.add("s-strong"));
    strengthLabelEl.style.color = "var(--accent)";
    strengthLabelEl.textContent = "Strong";
  } else {
    strengthLabelEl.textContent = "";
  }
});

function getPasswordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8)                        score++;
  if (pw.length >= 14)                       score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw))                         score++;
  if (/[^A-Za-z0-9]/.test(pw))              score++;
  if (score <= 0) return 0;
  if (score <= 2) return 1;
  if (score <= 3) return 2;
  return 3;
}

// ── RATE LIMIT HELPERS
function getRateRecord() {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (raw) { const p = JSON.parse(raw); if (!p.timestamps) p.timestamps = []; return p; }
  } catch {}
  return { timestamps: [] };
}

function saveRateRecord(r) {
  try { localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(r)); } catch {}
}

function checkFrontendLimit() {
  let r = getRateRecord();
  const now = Date.now();
  r.timestamps = r.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  saveRateRecord(r);
  if (r.timestamps.length < RATE_LIMIT_MAX) return { allowed: true };
  return { allowed: false, resetsAt: new Date(r.timestamps[0] + RATE_LIMIT_WINDOW) };
}

function incrementFrontendCount() {
  const r = getRateRecord();
  const now = Date.now();
  r.timestamps = (r.timestamps || []).filter(t => now - t < RATE_LIMIT_WINDOW);
  r.timestamps.push(now);
  saveRateRecord(r);
}

async function checkDatabaseLimit() {
  let ip = "unknown";
  try {
    const res = await fetch("/.netlify/functions/get-ip");
    const data = await res.json();
    ip = data.ip || "unknown";
  } catch { return { allowed: true, ip: "unknown" }; }
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();
  const { count, error } = await supabase
    .from("notes").select("id", { count: "exact", head: true })
    .eq("created_by_ip", ip).eq("type", "note").gte("created_at", since);
  if (error) return { allowed: true, ip };
  return { allowed: count < RATE_LIMIT_MAX, ip };
}

function formatTimeLeft(resetsAt) {
  const s = Math.ceil((resetsAt.getTime() - Date.now()) / 1000);
  if (s <= 60) return `${s} second${s === 1 ? "" : "s"}`;
  return `${Math.ceil(s / 60)} minutes`;
}

// ── CREATE NOTE
createBtn.addEventListener("click", async () => {
  const message  = sanitizeInput(messageEl.value.trim());
  const password = passwordEl.value.trim();
  const expiry   = parseInt(expiryEl.value, 10);

  if (!message) { showError("Please write a message before creating a note."); return; }
  if (message.length > MAX_CHARS) { showError(`Message is too long. Max ${MAX_CHARS} characters.`); return; }

  const validExpiries = [1, 6, 24, 72, 168];
  if (!validExpiries.includes(expiry)) { showError("Invalid expiry option selected."); return; }

  const frontendCheck = checkFrontendLimit();
  if (!frontendCheck.allowed) {
    showError(`Too fast. Try again in ${formatTimeLeft(frontendCheck.resetsAt)}.`);
    return;
  }

  setLoading(true);
  hideError();

  try {
    const dbCheck = await checkDatabaseLimit();
    if (!dbCheck.allowed) {
      showError(`Too fast. Try again in ${formatTimeLeft(new Date(Date.now() + RATE_LIMIT_WINDOW))}.`);
      return;
    }

    // ── KEY DECISION:
    // If the user set a password → use it as the encryption key (as before).
    // If no password → generate a random key and embed it in the share URL hash.
    // The hash (#) is NEVER sent to the server by browsers — it stays client-side only.
    let encryptionKey;
    let randomKey = null;

    if (password) {
      encryptionKey = password;
    } else {
      randomKey     = generateRandomKey(); // random 32-byte base64url key
      encryptionKey = randomKey;
    }

    const encryptedData = await encryptMessage(message, encryptionKey);
    const expiresAt     = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiry);

    const { data, error } = await supabase.from("notes").insert([{
      message:       JSON.stringify(encryptedData),
      expires_at:    expiresAt.toISOString(),
      has_password:  password.length > 0,
      created_by_ip: dbCheck.ip,
      type:          "note",
    }]).select();

    if (error) throw error;

    incrementFrontendCount();

    // ── BUILD SHARE LINK
    // Password note  → /read.html?id=abc123         (user shares their password separately)
    // Passwordless   → /read.html?id=abc123#randomKey (key is in the hash, never hits server)
    const noteId    = data[0].id;
    const base      = `${window.location.origin}/read.html?id=${noteId}`;
    const shareLink = randomKey ? `${base}#${randomKey}` : base;

    showSuccess(shareLink);

  } catch (err) {
    console.error("Create note error:", err);
    showError("Something went wrong. Please check your connection and try again.");
  } finally {
    setLoading(false);
  }
});

// ── COPY LINK
copyLinkBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(linkDisplayEl.textContent);
    copyBtnTextEl.textContent = "Copied!";
    setTimeout(() => { copyBtnTextEl.textContent = "Copy Link"; }, 2000);
  } catch { window.prompt("Copy this link:", linkDisplayEl.textContent); }
});

// ── RESET FORM
newNoteBtnEl.addEventListener("click", () => {
  messageEl.value = ""; passwordEl.value = ""; expiryEl.value = "24";
  charCountEl.textContent = `0 / ${MAX_CHARS}`;
  successBoxEl.classList.add("hidden");
  noPasswordWarn.classList.remove("hidden");
  [pip1El, pip2El, pip3El].forEach(p => p.classList.remove("s-weak", "s-fair", "s-strong"));
  strengthLabelEl.textContent = "";
  messageEl.focus();
});

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

function showError(msg) { errorTextEl.textContent = msg; errorAlertEl.classList.remove("hidden"); }
function hideError()    { errorAlertEl.classList.add("hidden"); }
