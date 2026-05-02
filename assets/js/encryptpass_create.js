import { supabase }                        from "./app.js";
import { encryptMessage, generateRandomKey } from "./crypto.js";

const messageEl       = document.getElementById("message");
const charCountEl     = document.getElementById("charCount");
const passwordEl      = document.getElementById("password");
const togglePwBtn     = document.getElementById("togglePassword");
const eyeIconEl       = document.getElementById("eyeIcon");
const expiryEl        = document.getElementById("expiry");
const createBtn       = document.getElementById("createBtn");
const createBtnText   = document.getElementById("createBtnText");
const createSpinner   = document.getElementById("createSpinner");
const noPasswordWarn  = document.getElementById("noPasswordWarn");
const errorAlertEl    = document.getElementById("errorAlert");
const errorTextEl     = document.getElementById("errorText");
const successBoxEl    = document.getElementById("successBox");
const linkDisplayEl   = document.getElementById("linkDisplay");
const copyLinkBtn     = document.getElementById("copyLinkBtn");
const copyBtnTextEl   = document.getElementById("copyBtnText");
const newNoteBtnEl    = document.getElementById("newNoteBtn");
const pip1El          = document.getElementById("pip1");
const pip2El          = document.getElementById("pip2");
const pip3El          = document.getElementById("pip3");
const strengthLabelEl = document.getElementById("strengthLabel");

const MAX_CHARS         = 500;
const RATE_LIMIT_MAX    = 3;
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_KEY    = "encryptpass_rate";

messageEl.addEventListener("input", () => {
  const count = messageEl.value.length;
  charCountEl.textContent = `${count} / ${MAX_CHARS}`;
  charCountEl.classList.toggle("warn", count > MAX_CHARS * 0.85 && count < MAX_CHARS);
  charCountEl.classList.toggle("over", count >= MAX_CHARS);
});

messageEl.addEventListener("blur", () => { messageEl.value = sanitizeInput(messageEl.value); });

function sanitizeInput(str) {
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/javascript:/gi, "").replace(/on\w+\s*=/gi, "");
}

togglePwBtn.addEventListener("click", () => {
  const isHidden = passwordEl.type === "password";
  passwordEl.type = isHidden ? "text" : "password";
  eyeIconEl.innerHTML = isHidden
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
});

passwordEl.addEventListener("input", () => {
  const pw = passwordEl.value;
  noPasswordWarn.classList.toggle("hidden", pw.length > 0);
  const s = getPasswordStrength(pw);
  [pip1El, pip2El, pip3El].forEach(p => p.classList.remove("s-weak","s-fair","s-strong"));
  if (s === 1) { pip1El.classList.add("s-weak"); strengthLabelEl.style.color="var(--red)"; strengthLabelEl.textContent="Weak"; }
  else if (s === 2) { pip1El.classList.add("s-fair"); pip2El.classList.add("s-fair"); strengthLabelEl.style.color="var(--amber)"; strengthLabelEl.textContent="Fair"; }
  else if (s >= 3) { [pip1El,pip2El,pip3El].forEach(p=>p.classList.add("s-strong")); strengthLabelEl.style.color="var(--accent)"; strengthLabelEl.textContent="Strong"; }
  else { strengthLabelEl.textContent = ""; }
});

function getPasswordStrength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++; if (pw.length >= 14) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 0) return 0; if (s <= 2) return 1; if (s <= 3) return 2; return 3;
}

function getRateRecord() {
  try { const r = localStorage.getItem(RATE_LIMIT_KEY); if (r) { const p=JSON.parse(r); if (!p.timestamps) p.timestamps=[]; return p; } } catch {}
  return { timestamps: [] };
}
function saveRateRecord(r) { try { localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(r)); } catch {} }
function checkFrontendLimit() {
  let r = getRateRecord(); const now = Date.now();
  r.timestamps = r.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW); saveRateRecord(r);
  if (r.timestamps.length < RATE_LIMIT_MAX) return { allowed: true };
  return { allowed: false, resetsAt: new Date(r.timestamps[0] + RATE_LIMIT_WINDOW) };
}
function incrementFrontendCount() {
  const r = getRateRecord(); const now = Date.now();
  r.timestamps = (r.timestamps||[]).filter(t => now-t < RATE_LIMIT_WINDOW);
  r.timestamps.push(now); saveRateRecord(r);
}
async function checkDatabaseLimit() {
  let ip = "unknown";
  try { const res = await fetch("/.netlify/functions/get-ip"); const d = await res.json(); ip = d.ip || "unknown"; }
  catch { return { allowed: true, ip: "unknown" }; }
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();
  const { count, error } = await supabase.from("notes").select("id",{count:"exact",head:true})
    .eq("created_by_ip", ip).eq("type","password").gte("created_at", since);
  if (error) return { allowed: true, ip };
  return { allowed: count < RATE_LIMIT_MAX, ip };
}
function formatTimeLeft(resetsAt) {
  const s = Math.ceil((resetsAt.getTime() - Date.now()) / 1000);
  return s <= 60 ? `${s} second${s===1?"":"s"}` : `${Math.ceil(s/60)} minutes`;
}

createBtn.addEventListener("click", async () => {
  const message  = sanitizeInput(messageEl.value.trim());
  const password = passwordEl.value.trim();
  const expiry   = parseInt(expiryEl.value, 10);

  if (!message) { showError("Please enter a password or secret to share."); return; }
  if (message.length > MAX_CHARS) { showError(`Too long. Max ${MAX_CHARS} characters.`); return; }
  if (![1,2,6,12,24,72,168].includes(expiry)) { showError("Invalid expiry option."); return; }

  const fc = checkFrontendLimit();
  if (!fc.allowed) { showError(`Too fast. Try again in ${formatTimeLeft(fc.resetsAt)}.`); return; }

  setLoading(true); hideError();

  try {
    const db = await checkDatabaseLimit();
    if (!db.allowed) { showError(`Too fast. Try again in ${formatTimeLeft(new Date(Date.now()+RATE_LIMIT_WINDOW))}.`); return; }

    // URL hash key for passwordless — same as notes
    let encryptionKey, randomKey = null;
    if (password) { encryptionKey = password; }
    else { randomKey = generateRandomKey(); encryptionKey = randomKey; }

    const encryptedData = await encryptMessage(message, encryptionKey);
    const expiresAt = new Date(); expiresAt.setHours(expiresAt.getHours() + expiry);

    const { data, error } = await supabase.from("notes").insert([{
      message: JSON.stringify(encryptedData), expires_at: expiresAt.toISOString(),
      has_password: password.length > 0, created_by_ip: db.ip, type: "password",
    }]).select();
    if (error) throw error;

    incrementFrontendCount();
    const base = `${window.location.origin}/read-encryptpass.html?id=${data[0].id}`;
    showSuccess(randomKey ? `${base}#${randomKey}` : base);

  } catch (err) {
    console.error("EncryptPass create error:", err);
    showError("Something went wrong. Please try again.");
  } finally { setLoading(false); }
});

copyLinkBtn.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(linkDisplayEl.textContent); copyBtnTextEl.textContent="Copied!"; setTimeout(()=>{copyBtnTextEl.textContent="Copy Link";},2000); }
  catch { window.prompt("Copy this link:", linkDisplayEl.textContent); }
});

newNoteBtnEl.addEventListener("click", () => {
  messageEl.value=""; passwordEl.value=""; expiryEl.value="24";
  charCountEl.textContent=`0 / ${MAX_CHARS}`; successBoxEl.classList.add("hidden");
  noPasswordWarn.classList.remove("hidden");
  [pip1El,pip2El,pip3El].forEach(p=>p.classList.remove("s-weak","s-fair","s-strong"));
  strengthLabelEl.textContent=""; messageEl.focus();
});

function setLoading(l) { createBtn.disabled=l; createBtnText.textContent=l?"Creating…":"Create Secure Password Link"; createSpinner.classList.toggle("hidden",!l); }
function showSuccess(link) { linkDisplayEl.textContent=link; successBoxEl.classList.remove("hidden"); successBoxEl.scrollIntoView({behavior:"smooth",block:"nearest"}); }
function showError(msg) { errorTextEl.textContent=msg; errorAlertEl.classList.remove("hidden"); }
function hideError() { errorAlertEl.classList.add("hidden"); }
