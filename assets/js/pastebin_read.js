import { supabase }        from "./app.js";
import { decryptMessage }  from "./crypto.js";

const stateLoading       = document.getElementById("stateLoading");
const stateLocked        = document.getElementById("stateLocked");
const stateRevealed      = document.getElementById("stateRevealed");
const stateBurned        = document.getElementById("stateBurned");
const stateError         = document.getElementById("stateError");
const lockedDesc         = document.getElementById("lockedDesc");
const passwordField      = document.getElementById("passwordField");
const readerPasswordEl   = document.getElementById("readerPassword");
const toggleReaderPwBtn  = document.getElementById("toggleReaderPw");
const wrongPasswordAlert = document.getElementById("wrongPasswordAlert");
const unlockBtn          = document.getElementById("unlockBtn");
const unlockBtnText      = document.getElementById("unlockBtnText");
const unlockSpinner      = document.getElementById("unlockSpinner");
const messageBoxEl       = document.getElementById("messageBox");
const copyMsgBtn         = document.getElementById("copyMsgBtn");
const copyMsgText        = document.getElementById("copyMsgText");
const errorMsg           = document.getElementById("errorMsg");

let encryptedPayload = null;
let noteHasPassword  = false;

const noteId  = new URLSearchParams(window.location.search).get("id");
const hashKey = window.location.hash ? window.location.hash.slice(1) : null;

function showState(el) {
  [stateLoading,stateLocked,stateRevealed,stateBurned,stateError].forEach(s=>s.classList.add("hidden"));
  el.classList.remove("hidden");
}

toggleReaderPwBtn?.addEventListener("click", () => {
  readerPasswordEl.type = readerPasswordEl.type==="password" ? "text" : "password";
});
readerPasswordEl?.addEventListener("keydown", e => { if(e.key==="Enter") unlockBtn.click(); });

copyMsgBtn?.addEventListener("click", async () => {
  try{await navigator.clipboard.writeText(messageBoxEl.textContent);copyMsgText.textContent="Copied!";setTimeout(()=>{copyMsgText.textContent="Copy Code";},2000);}
  catch{window.prompt("Copy this paste:", messageBoxEl.textContent);}
});

window.addEventListener("DOMContentLoaded", async () => {
  if (!noteId) { showState(stateError); errorMsg.textContent="No paste ID in this link."; return; }
  showState(stateLoading);
  try {
    const { data, error } = await supabase.from("notes")
      .select("id,message,has_password,expires_at,type").eq("id",noteId).eq("type","paste").single();
    if (error || !data) { showState(stateBurned); return; }
    if (new Date(data.expires_at) < new Date()) {
      await supabase.from("notes").delete().eq("id",noteId);
      showState(stateBurned); return;
    }
    encryptedPayload = JSON.parse(data.message);
    noteHasPassword  = data.has_password;
    showState(stateLocked);
    if (noteHasPassword) {
      passwordField.classList.remove("hidden");
      lockedDesc.textContent="This paste is protected. Enter the password to reveal it.";
      readerPasswordEl.focus();
    } else if (!hashKey) {
      showState(stateError);
      errorMsg.textContent="This link is missing the decryption key. Make sure you copied the full link including everything after the # symbol.";
    }
  } catch(err){ console.error("Pastebin load error:",err); showState(stateError); }
});

unlockBtn?.addEventListener("click", async () => {
  if (!encryptedPayload) return;
  const userPassword = readerPasswordEl?.value.trim() || "";
  if (noteHasPassword && !userPassword) { wrongPasswordAlert.classList.remove("hidden"); readerPasswordEl.focus(); return; }

  unlockBtn.disabled=true; unlockBtnText.textContent="Decrypting…"; unlockSpinner.classList.remove("hidden");
  wrongPasswordAlert.classList.add("hidden");

  try {
    const encryptionKey = noteHasPassword ? userPassword : hashKey;
    const decrypted = await decryptMessage(encryptedPayload, encryptionKey);
    if (!decrypted) { wrongPasswordAlert.classList.remove("hidden"); unlockBtn.disabled=false; unlockBtnText.textContent="Reveal Paste"; unlockSpinner.classList.add("hidden"); return; }
    messageBoxEl.textContent = decrypted; // textContent so code renders as-is, no HTML
    showState(stateRevealed);
    await supabase.from("notes").delete().eq("id",noteId);
  } catch(err){
    wrongPasswordAlert.classList.remove("hidden");
    unlockBtn.disabled=false; unlockBtnText.textContent="Reveal Paste"; unlockSpinner.classList.add("hidden");
  }
});
