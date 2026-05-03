// ============================================================
// assets/js/pwa.js — PWA Registration & Install Prompt
//
// This file does 3 things:
//   1. Registers the service worker (sw.js)
//   2. Catches the browser's install prompt and shows a custom
//      "Install App" button at the right moment
//   3. Shows a manual install tip banner for iOS Safari users
//      (iOS doesn't support automatic install prompts)
// ============================================================


// ── 1. REGISTER THE SERVICE WORKER
// This tells the browser that sw.js exists and should run in the background.
// It only runs if the browser supports service workers (all modern browsers do).

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("[PWA] Service worker registered:", registration.scope);
      })
      .catch((err) => {
        console.warn("[PWA] Service worker registration failed:", err);
      });
  });
}


// ── 2. INSTALL PROMPT (Android Chrome + Desktop Chrome)
//
// The browser fires a "beforeinstallprompt" event when it decides the
// app is installable. We catch it, hold onto it, and show our own
// custom install button instead of relying on the browser's default UI.
// When the user clicks our button, we trigger the native prompt.

let deferredPrompt = null; // stores the install event for later

window.addEventListener("beforeinstallprompt", (event) => {
  // Stop the browser from showing its own mini-bar automatically
  event.preventDefault();

  // Save the event so we can trigger it when the user clicks our button
  deferredPrompt = event;

  // Show our custom install banner
  showInstallBanner();
});

// Listen for successful install — hide the banner
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  hideInstallBanner();
  console.log("[PWA] App installed successfully");
});


// ── 3. BUILD AND SHOW THE INSTALL BANNER
//
// This creates a banner at the bottom of the screen.
// It only appears when the browser says the app is installable.
// Users can dismiss it and it won't appear again for 7 days.

function showInstallBanner() {
  // Don't show if already dismissed recently
  const dismissed = localStorage.getItem("pwa_dismissed");
  if (dismissed) {
    const dismissedAt = parseInt(dismissed);
    const sevenDays   = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - dismissedAt < sevenDays) return;
  }

  // Don't show if already installed (running as standalone PWA)
  if (window.matchMedia("(display-mode: standalone)").matches) return;

  // Build the banner HTML
  const banner = document.createElement("div");
  banner.id    = "pwa-install-banner";
  banner.innerHTML = `
    <div class="pwa-banner-inner">
      <div class="pwa-banner-left">
        <div class="pwa-banner-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div class="pwa-banner-text">
          <strong>Install EncryptSecret</strong>
          <span>Add to home screen for quick access</span>
        </div>
      </div>
      <div class="pwa-banner-actions">
        <button class="pwa-btn-install" id="pwaInstallBtn">Install</button>
        <button class="pwa-btn-dismiss" id="pwaDismissBtn" aria-label="Dismiss">✕</button>
      </div>
    </div>
  `;

  // Inject styles into the page
  injectBannerStyles();

  document.body.appendChild(banner);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      banner.classList.add("pwa-banner--visible");
    });
  });

  // Install button — trigger the native browser prompt
  document.getElementById("pwaInstallBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log("[PWA] User choice:", outcome);
    deferredPrompt = null;
    hideInstallBanner();
  });

  // Dismiss button — hide and remember for 7 days
  document.getElementById("pwaDismissBtn").addEventListener("click", () => {
    localStorage.setItem("pwa_dismissed", Date.now().toString());
    hideInstallBanner();
  });
}

function hideInstallBanner() {
  const banner = document.getElementById("pwa-install-banner");
  if (!banner) return;
  banner.classList.remove("pwa-banner--visible");
  setTimeout(() => banner.remove(), 400);
}


// ── 4. iOS INSTALL TIP BANNER
//
// iPhone and iPad users don't get the automatic install prompt.
// We detect iOS Safari and show a manual instruction tip instead:
// "Tap Share → Add to Home Screen"

function isIosSafari() {
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  // "standalone" means it's already installed — don't show the tip
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  // Check it's Safari specifically (not Chrome on iOS)
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);
  return isIos && isSafari && !isStandalone;
}

function showIosBanner() {
  // Don't show if dismissed recently
  const dismissed = localStorage.getItem("pwa_ios_dismissed");
  if (dismissed) {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - parseInt(dismissed) < sevenDays) return;
  }

  const banner = document.createElement("div");
  banner.id    = "pwa-ios-banner";
  banner.innerHTML = `
    <div class="pwa-banner-inner">
      <div class="pwa-banner-left">
        <div class="pwa-banner-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div class="pwa-banner-text">
          <strong>Install EncryptSecret</strong>
          <span>Tap <b>Share</b> ↑ then <b>Add to Home Screen</b></span>
        </div>
      </div>
      <div class="pwa-banner-actions">
        <button class="pwa-btn-dismiss" id="pwaIosDismissBtn" aria-label="Dismiss">✕</button>
      </div>
    </div>
    <div class="pwa-ios-arrow">▼</div>
  `;

  injectBannerStyles();
  document.body.appendChild(banner);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      banner.classList.add("pwa-banner--visible");
    });
  });

  document.getElementById("pwaIosDismissBtn").addEventListener("click", () => {
    localStorage.setItem("pwa_ios_dismissed", Date.now().toString());
    const b = document.getElementById("pwa-ios-banner");
    if (b) { b.classList.remove("pwa-banner--visible"); setTimeout(() => b.remove(), 400); }
  });
}

// Show iOS banner after a short delay so it doesn't feel intrusive
if (isIosSafari()) {
  setTimeout(showIosBanner, 3000);
}


// ── 5. INJECT BANNER STYLES
// Styles are injected via JS so this file is self-contained.
// You don't need to touch styles.css for the PWA banner.

function injectBannerStyles() {
  if (document.getElementById("pwa-banner-styles")) return; // already injected

  const style = document.createElement("style");
  style.id = "pwa-banner-styles";
  style.textContent = `
    #pwa-install-banner,
    #pwa-ios-banner {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      background: #171619;
      border-top: 1px solid #45424c;
      padding: 14px 20px;
      transform: translateY(100%);
      transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 -8px 32px rgba(0,0,0,0.4);
    }

    #pwa-install-banner.pwa-banner--visible,
    #pwa-ios-banner.pwa-banner--visible {
      transform: translateY(0);
    }

    .pwa-banner-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      max-width: 680px;
      margin: 0 auto;
    }

    .pwa-banner-left {
      display: flex;
      align-items: center;
      gap: 14px;
      flex: 1;
      min-width: 0;
    }

    .pwa-banner-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: rgba(144,111,229,0.12);
      border: 1px solid rgba(144,111,229,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: #906fe5;
    }

    .pwa-banner-icon svg {
      width: 20px;
      height: 20px;
    }

    .pwa-banner-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .pwa-banner-text strong {
      font-size: 0.9rem;
      font-weight: 700;
      color: #e6deff;
      font-family: 'Roboto', system-ui, sans-serif;
    }

    .pwa-banner-text span {
      font-size: 0.78rem;
      color: #a19bb2;
      font-family: 'Roboto', system-ui, sans-serif;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .pwa-banner-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .pwa-btn-install {
      background: #906fe5;
      color: #0e1117;
      border: none;
      border-radius: 999px;
      padding: 8px 20px;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Roboto', system-ui, sans-serif;
      transition: background 0.15s;
      white-space: nowrap;
    }

    .pwa-btn-install:hover {
      background: #a07cff;
    }

    .pwa-btn-dismiss {
      background: none;
      border: none;
      color: #736f7f;
      font-size: 1rem;
      cursor: pointer;
      padding: 4px 8px;
      line-height: 1;
      transition: color 0.15s;
    }

    .pwa-btn-dismiss:hover {
      color: #a19bb2;
    }

    .pwa-ios-arrow {
      text-align: center;
      color: #906fe5;
      font-size: 0.75rem;
      margin-top: 6px;
      animation: pwa-bounce 1.5s ease-in-out infinite;
    }

    @keyframes pwa-bounce {
      0%, 100% { transform: translateY(0); }
      50%       { transform: translateY(4px); }
    }

    @media (max-width: 480px) {
      #pwa-install-banner,
      #pwa-ios-banner {
        padding: 12px 16px;
      }
      .pwa-banner-text span {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);
}
