import { supabase }        from "./app.js";
import { decryptMessage }  from "./crypto.js";

const stateLoading  = document.getElementById("stateLoading");
const stateLocked   = document.getElementById("stateLocked");
const stateRevealed = document.getElementById("stateRevealed");
const stateBurned   = document.getElementById("stateBurned");
const stateError    = document.getElementById("stateError");

const lockedDescEl      = document.getElementById("lockedDesc");
const passwordFieldEl   = document.getElementById("passwordField");
const readerPasswordEl  = document.getElementById("readerPassword");
const toggleReaderPwBtn = document.getElementById("toggleReaderPw");
const wrongPasswordEl   = document.getElementById("wrongPasswordAlert");
const unlockBtn         = document.getElementById("unlockBtn");
const unlockBtnText     = document.getElementById("unlockBtnText");
const unlockSpinner     = document.getElementById("unlockSpinner");

const messageBoxEl  = document.getElementById("messageBox");
const copyMsgBtn    = document.getElementById("copyMsgBtn");
const copyMsgTextEl = document.getElementById("copyMsgText");
const viewCountInfoEl = document.getElementById("viewCountInfo");
const errorMsgEl    = document.getElementById("errorMsg");

let currentNote = null;
let noteDeleted = false;

// ── GET URL PARAMS
// ?id=  → the note UUID from Supabase
// #key  → the random encryption key for passwordless notes
//         (the hash is NEVER sent to the server by browsers)
const noteId   = new URLSearchParams(window.location.search).get("id");
const hashKey  = window.location.hash ? window.location.hash.slice(1) : null;
// .slice(1) removes the leading "#" character

// ── FETCH NOTE
async function init() {
  if (!noteId) {
    showError("No note ID found in this link. The link may be invalid.");
    return;
  }

  try {
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("id", noteId)
      .single();

    if (error || !data) { showState("burned"); return; }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      await logAction(noteId, "expired");
      await deleteNote(noteId);
      showState("burned");
      return;
    }

    currentNote = data;

    if (data.has_password) {
      // Note has a user-set lock password — show the password field
      passwordFieldEl.classList.remove("hidden");
      lockedDescEl.textContent = "This note is password protected. Enter the password to reveal it.";
      readerPasswordEl.focus();
    } else if (!hashKey) {
      // Passwordless note but no hash key in the URL — link is broken or incomplete
      showError("This link is missing the decryption key. Make sure you copied the full link including everything after the # symbol.");
      return;
    } else {
      // Passwordless note with hash key — ready to unlock, no password field needed
      lockedDescEl.textContent = "Click the button below to decrypt and reveal this message.";
    }

    showState("locked");

  } catch (err) {
    console.error("Fetch note error:", err);
    showError("Could not connect to the database. Please check your internet connection.");
  }
}

// ── PASSWORD TOGGLE
toggleReaderPwBtn.addEventListener("click", () => {
  const isHidden = readerPasswordEl.type === "password";
  readerPasswordEl.type = isHidden ? "text" : "password";
});

readerPasswordEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlockNote();
});

unlockBtn.addEventListener("click", unlockNote);

// ── DECRYPT + BURN
async function unlockNote() {
  if (!currentNote) return;

  const userPassword = readerPasswordEl.value;
  wrongPasswordEl.classList.add("hidden");
  setUnlockLoading(true);

  try {
    const payload = JSON.parse(currentNote.message);

    // KEY DECISION:
    // If the note has a lock password → use what the user typed
    // If passwordless → use the random key from the URL hash
    let encryptionKey;
    if (currentNote.has_password) {
      if (!userPassword) {
        wrongPasswordEl.classList.remove("hidden");
        setUnlockLoading(false);
        return;
      }
      encryptionKey = userPassword;
    } else {
      encryptionKey = hashKey;
    }

    const plaintext = await decryptMessage(payload, encryptionKey);

    messageBoxEl.textContent = plaintext;
    showState("revealed");

    // ── BURN LOGIC
    const shouldBurn = currentNote.burn_after_reading !== false;

    if (shouldBurn) {
      if (!noteDeleted) {
        noteDeleted = true;
        await logAction(noteId, "viewed");
        await deleteNote(noteId);
      }
      if (viewCountInfoEl) {
        viewCountInfoEl.textContent = "This was a one-time note. It has been permanently destroyed.";
      }
    } else {
      const newViewCount = (currentNote.view_count ?? 0) + 1;
      await supabase.from("notes").update({ view_count: newViewCount }).eq("id", noteId);
      await logAction(noteId, "viewed");

      const maxViews = currentNote.max_views;
      if (maxViews !== null && newViewCount >= maxViews) {
        if (!noteDeleted) { noteDeleted = true; await deleteNote(noteId); }
        if (viewCountInfoEl) viewCountInfoEl.textContent = `Reached limit of ${maxViews} view(s). Note destroyed.`;
      } else if (maxViews !== null) {
        if (viewCountInfoEl) viewCountInfoEl.textContent = `${maxViews - newViewCount} read(s) remaining before self-destruct.`;
      } else {
        const exp = new Date(currentNote.expires_at).toLocaleString();
        if (viewCountInfoEl) viewCountInfoEl.textContent = `This note expires on ${exp}.`;
      }
    }

  } catch (err) {
    if (err instanceof DOMException) {
      // Wrong password — AES-GCM throws DOMException on auth failure
      wrongPasswordEl.classList.remove("hidden");
      readerPasswordEl.value = "";
      readerPasswordEl.focus();
    } else {
      console.error("Decrypt error:", err);
      showError("Decryption failed. The note may be corrupted or the link is incomplete.");
    }
  } finally {
    setUnlockLoading(false);
  }
}

// ── COPY MESSAGE
copyMsgBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(messageBoxEl.textContent);
    copyMsgTextEl.textContent = "Copied!";
    setTimeout(() => { copyMsgTextEl.textContent = "Copy Message"; }, 2000);
  } catch { window.prompt("Copy the message below:", messageBoxEl.textContent); }
});

async function deleteNote(id) {
  try { await supabase.from("notes").delete().eq("id", id); }
  catch (err) { console.warn("Could not delete note:", err); }
}

async function logAction(id, action) {
  try { await supabase.from("note_access_log").insert({ note_id: id, action }); }
  catch (err) { console.warn("Audit log failed:", err); }
}

function showState(stateName) {
  const states = { loading: stateLoading, locked: stateLocked, revealed: stateRevealed, burned: stateBurned, error: stateError };
  Object.values(states).forEach(el => el.classList.add("hidden"));
  const target = states[stateName];
  if (target) target.classList.remove("hidden");
}

function showError(message) { errorMsgEl.textContent = message; showState("error"); }

function setUnlockLoading(isLoading) {
  unlockBtn.disabled = isLoading;
  unlockBtnText.textContent = isLoading ? "Decrypting…" : "Open & Reveal Note";
  unlockSpinner.classList.toggle("hidden", !isLoading);
}

init();
