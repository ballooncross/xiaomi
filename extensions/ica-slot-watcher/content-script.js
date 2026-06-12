(function () {
  if (window.__icaSlotWatcherContentInstalled) return;
  window.__icaSlotWatcherContentInstalled = true;

  const DEFAULTS = {
    enabled: false,
    intervalSeconds: 10,
    autoRefreshSession: true,
    refreshMinutes: 13,
    targetBefore: "2026-07-01",
    notifyWhenNoSlots: false,
    telegramNotifyEnabled: true,
    radarNotifyUrl: "https://personal-radar.pages.dev/api/extension-notify",
    radarNotifyToken: ""
  };

  const state = {
    ...DEFAULTS,
    running: false,
    timer: null,
    refreshTimer: null,
    lastRunAt: null,
    lastResult: "Idle",
    lastSlots: null,
    lastError: null,
    waitingForSlotsResolve: null,
    lastRadarNotifications: new Map()
  };

  const radarNotifyCooldownMs = 5 * 60 * 1000;

  injectPageBridge();
  createPanel();
  loadSettings();

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (!event.data || event.data.source !== "ica-slot-watcher-page") return;

    const detail = event.data.detail;
    if (!detail) return;

    if (detail.type === "bridge-ready") {
      setStatus("Ready on ICA page");
      return;
    }

    if (detail.type === "slots-response" && state.waitingForSlotsResolve) {
      state.waitingForSlotsResolve(detail);
      state.waitingForSlotsResolve = null;
    }
  });

  function injectPageBridge() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-bridge.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).append(script);
  }

  function createPanel() {
    const root = document.createElement("div");
    root.id = "ica-slot-watcher";
    root.innerHTML = `
      <div class="isw-card">
        <div class="isw-header">
          <div>
            <div class="isw-title">ICA Slot Watcher</div>
            <div class="isw-subtitle">Uses this tab's current ICA session</div>
          </div>
          <button class="isw-icon" data-isw-collapse title="Collapse">-</button>
        </div>
        <div class="isw-body">
          <label class="isw-label">
            Before date
            <input data-isw-target type="date" value="${state.targetBefore}">
          </label>
          <label class="isw-label">
            Interval seconds
            <input data-isw-interval type="number" min="10" step="5" value="${state.intervalSeconds}">
          </label>
          <label class="isw-label">
            Session refresh minutes
            <input data-isw-refresh-minutes type="number" min="5" step="1" value="${state.refreshMinutes}">
          </label>
          <label class="isw-check">
            <input data-isw-auto-refresh type="checkbox" checked>
            Refresh page before ICA session expires
          </label>
          <label class="isw-check">
            <input data-isw-no-slots type="checkbox">
            Notify when checked but no earlier slot
          </label>
          <label class="isw-check">
            <input data-isw-telegram-enabled type="checkbox" checked>
            Send Telegram via Personal Radar
          </label>
          <label class="isw-label">
            Radar notify API
            <input data-isw-radar-url type="url" value="${state.radarNotifyUrl}">
          </label>
          <label class="isw-label">
            Radar notify token
            <input data-isw-radar-token type="password" value="">
          </label>
          <div class="isw-actions">
            <button data-isw-run>Check once</button>
            <button data-isw-toggle>Start</button>
          </div>
          <div class="isw-status" data-isw-status>Idle</div>
          <div class="isw-result" data-isw-result></div>
        </div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #ica-slot-watcher {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        width: min(360px, calc(100vw - 32px));
        color: #16213b;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #ica-slot-watcher .isw-card {
        border: 1px solid rgba(10, 28, 52, 0.18);
        border-radius: 14px;
        background: #fffdf8;
        box-shadow: 0 18px 48px rgba(10, 28, 52, 0.2);
        overflow: hidden;
      }
      #ica-slot-watcher .isw-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        padding: 12px 14px;
        background: linear-gradient(135deg, #ffb86c, #f97373 55%, #6c7dfb);
        color: white;
      }
      #ica-slot-watcher .isw-title { font-size: 15px; font-weight: 800; }
      #ica-slot-watcher .isw-subtitle { font-size: 11px; opacity: 0.9; }
      #ica-slot-watcher .isw-icon {
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.2);
        color: white;
        font-size: 18px;
        line-height: 1;
      }
      #ica-slot-watcher .isw-body { padding: 12px 14px 14px; }
      #ica-slot-watcher.isw-collapsed .isw-body { display: none; }
      #ica-slot-watcher .isw-label {
        display: grid;
        gap: 5px;
        margin-bottom: 9px;
        font-size: 12px;
        font-weight: 700;
      }
      #ica-slot-watcher input[type="date"],
      #ica-slot-watcher input[type="number"] {
        width: 100%;
        border: 1px solid rgba(10, 28, 52, 0.18);
        border-radius: 9px;
        padding: 8px 10px;
        font-size: 13px;
        color: #16213b;
        background: white;
      }
      #ica-slot-watcher .isw-check {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 8px 0 12px;
        font-size: 12px;
      }
      #ica-slot-watcher .isw-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      #ica-slot-watcher button {
        cursor: pointer;
      }
      #ica-slot-watcher .isw-actions button {
        border: 0;
        border-radius: 10px;
        padding: 9px 10px;
        color: white;
        background: #334155;
        font-weight: 800;
        font-size: 13px;
      }
      #ica-slot-watcher .isw-actions button[data-isw-toggle].isw-on {
        background: #e11d48;
      }
      #ica-slot-watcher .isw-actions button[data-isw-run] {
        background: #2563eb;
      }
      #ica-slot-watcher .isw-status {
        margin-top: 11px;
        padding: 9px 10px;
        border-radius: 10px;
        background: #f1f5f9;
        font-size: 12px;
        line-height: 1.35;
      }
      #ica-slot-watcher .isw-result {
        margin-top: 8px;
        font-size: 12px;
        line-height: 1.45;
        max-height: 120px;
        overflow: auto;
        white-space: pre-wrap;
      }
    `;

    document.documentElement.append(style, root);

    root.querySelector("[data-isw-run]").addEventListener("click", () => runCheck("manual"));
    root.querySelector("[data-isw-toggle]").addEventListener("click", toggle);
    root.querySelector("[data-isw-collapse]").addEventListener("click", () => {
      root.classList.toggle("isw-collapsed");
    });
    root.querySelector("[data-isw-target]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-interval]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-refresh-minutes]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-auto-refresh]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-no-slots]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-telegram-enabled]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-radar-url]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-radar-token]").addEventListener("change", saveSettingsFromUi);
  }

  function loadSettings() {
    chrome.storage.local.get(DEFAULTS, (saved) => {
      Object.assign(state, saved);
      updateUiFromState();
      if (state.enabled) startTimers();
    });
  }

  function saveSettingsFromUi() {
    const root = document.getElementById("ica-slot-watcher");
    state.targetBefore = root.querySelector("[data-isw-target]").value || DEFAULTS.targetBefore;
    state.intervalSeconds = Math.max(10, Number(root.querySelector("[data-isw-interval]").value || 10));
    state.refreshMinutes = Math.max(5, Number(root.querySelector("[data-isw-refresh-minutes]").value || 13));
    state.autoRefreshSession = root.querySelector("[data-isw-auto-refresh]").checked;
    state.notifyWhenNoSlots = root.querySelector("[data-isw-no-slots]").checked;
    state.telegramNotifyEnabled = root.querySelector("[data-isw-telegram-enabled]").checked;
    state.radarNotifyUrl = root.querySelector("[data-isw-radar-url]").value || DEFAULTS.radarNotifyUrl;
    state.radarNotifyToken = root.querySelector("[data-isw-radar-token]").value;
    chrome.storage.local.set({
      enabled: state.enabled,
      intervalSeconds: state.intervalSeconds,
      autoRefreshSession: state.autoRefreshSession,
      refreshMinutes: state.refreshMinutes,
      targetBefore: state.targetBefore,
      notifyWhenNoSlots: state.notifyWhenNoSlots,
      telegramNotifyEnabled: state.telegramNotifyEnabled,
      radarNotifyUrl: state.radarNotifyUrl,
      radarNotifyToken: state.radarNotifyToken
    });
    restartTimersIfNeeded();
  }

  function updateUiFromState() {
    const root = document.getElementById("ica-slot-watcher");
    if (!root) return;
    root.querySelector("[data-isw-target]").value = state.targetBefore;
    root.querySelector("[data-isw-interval]").value = state.intervalSeconds;
    root.querySelector("[data-isw-refresh-minutes]").value = state.refreshMinutes;
    root.querySelector("[data-isw-auto-refresh]").checked = state.autoRefreshSession;
    root.querySelector("[data-isw-no-slots]").checked = state.notifyWhenNoSlots;
    root.querySelector("[data-isw-telegram-enabled]").checked = state.telegramNotifyEnabled;
    root.querySelector("[data-isw-radar-url]").value = state.radarNotifyUrl;
    root.querySelector("[data-isw-radar-token]").value = state.radarNotifyToken;
    const toggleButton = root.querySelector("[data-isw-toggle]");
    toggleButton.textContent = state.enabled ? "Stop" : "Start";
    toggleButton.classList.toggle("isw-on", state.enabled);
    setStatus(state.lastResult);
  }

  function toggle() {
    state.enabled = !state.enabled;
    chrome.storage.local.set({ enabled: state.enabled });
    if (state.enabled) {
      startTimers();
      runCheck("start");
    } else {
      stopTimers();
      setStatus("Stopped");
    }
    updateUiFromState();
  }

  function startTimers() {
    stopTimers();
    state.timer = window.setInterval(() => runCheck("timer"), state.intervalSeconds * 1000);
    scheduleSessionRefresh();
  }

  function stopTimers() {
    if (state.timer) window.clearInterval(state.timer);
    if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
    state.timer = null;
    state.refreshTimer = null;
  }

  function restartTimersIfNeeded() {
    if (state.enabled) startTimers();
  }

  function scheduleSessionRefresh() {
    if (!state.enabled || !state.autoRefreshSession) return;

    state.refreshTimer = window.setTimeout(refreshSessionPage, state.refreshMinutes * 60 * 1000);
  }

  function refreshSessionPage() {
    if (!state.enabled || !state.autoRefreshSession) return;

    if (state.running) {
      state.refreshTimer = window.setTimeout(refreshSessionPage, 30 * 1000);
      return;
    }

    chrome.storage.local.set({
      lastRefreshAt: new Date().toISOString()
    });
    setStatus(`Refreshing page to keep ICA session alive (${state.refreshMinutes} min)`);
    window.setTimeout(() => window.location.reload(), 500);
  }

  async function runCheck(reason) {
    if (state.running) {
      setStatus("Previous check still running");
      return;
    }

    state.running = true;
    state.lastRunAt = new Date();
    state.lastError = null;
    setStatus(`Checking (${reason}) at ${formatTime(state.lastRunAt)}...`);

    try {
      ensureAdvancedSearchPage();
      const slotsResponsePromise = waitForSlotsResponse(12000);
      await clickProceed();
      const slots = await slotsResponsePromise;
      const result = evaluateSlots(slots);
      state.lastSlots = slots;
      state.lastResult = result.summary;
      showResult(result);

      if (result.hasEarlierDate) {
        await alertUser(result.summary, true);
        await notifyRadarOnce("ica_slot_found", result);
      } else if (state.notifyWhenNoSlots) {
        await alertUser(result.summary, false);
      }

      await clickBack();
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      state.lastResult = `Error: ${state.lastError}`;
      setStatus(state.lastResult);
      showResult({ summary: state.lastResult, dates: [] });
      if (isLikelySessionExpired(state.lastError)) {
        await alertUser("ICA page session may have expired. Please refresh or reopen ICA manually.", true);
        await notifyRadarOnce("ica_session_expired", {
          summary: `ICA page session may have expired: ${state.lastError}`,
          dates: []
        });
      } else {
        await notifyRadarOnce("ica_check_error", {
          summary: state.lastResult,
          dates: []
        });
      }
      await clickBack({ quiet: true });
    } finally {
      state.running = false;
    }
  }

  function ensureAdvancedSearchPage() {
    if (!location.href.includes("/eappt/locationselection")) {
      throw new Error("Open the ICA location selection / advanced search page first.");
    }
    const adsTab = document.querySelector("#adsTab");
    if (adsTab && !adsTab.classList.contains("btn-primary")) adsTab.click();
  }

  function waitForSlotsResponse(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        if (state.waitingForSlotsResolve) state.waitingForSlotsResolve = null;
        reject(new Error("Timed out waiting for /eappt/Slots response"));
      }, timeoutMs);

      state.waitingForSlotsResolve = (detail) => {
        window.clearTimeout(timeoutId);
        resolve(detail);
      };
    });
  }

  async function clickProceed() {
    const button = findButton("Proceed") || document.querySelector(".btnProceed");
    if (!button) throw new Error("Proceed button not found");
    button.click();
    await sleep(700);
  }

  async function clickBack(options = {}) {
    await sleep(700);
    const button = findButton("Back");
    if (!button) {
      if (!options.quiet) throw new Error("Back button not found");
      return;
    }
    button.click();
    await sleep(700);
  }

  function findButton(text) {
    return Array.from(document.querySelectorAll("button")).find((button) =>
      (button.textContent || "").trim().toLowerCase() === text.toLowerCase()
    );
  }

  function evaluateSlots(slotsDetail) {
    const dates = extractDates(slotsDetail.body)
      .filter((date) => date < state.targetBefore)
      .sort();
    const uniqueDates = Array.from(new Set(dates));
    const earliest = uniqueDates[0] || "";
    const checkedAt = formatTime(new Date());

    if (!slotsDetail.ok) {
      return {
        hasEarlierDate: false,
        dates: [],
        summary: `Checked ${checkedAt}. ICA /Slots returned HTTP ${slotsDetail.status}.`
      };
    }

    if (uniqueDates.length > 0) {
      return {
        hasEarlierDate: true,
        dates: uniqueDates,
        earliestDate: earliest,
        summary: `Earlier ICA slot found before ${state.targetBefore}: ${earliest}\n${uniqueDates.join(", ")}`
      };
    }

    return {
      hasEarlierDate: false,
      dates: [],
      earliestDate: "",
      summary: `Checked ${checkedAt}. No slot before ${state.targetBefore}.`
    };
  }

  function extractDates(value) {
    const dates = [];
    const seen = new Set();

    function add(date) {
      if (!seen.has(date)) {
        seen.add(date);
        dates.push(date);
      }
    }

    function normalize(raw) {
      if (typeof raw !== "string") return null;

      const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

      const slash = raw.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
      if (slash) {
        return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
      }

      return null;
    }

    function walk(node, key = "") {
      if (node == null) return;

      if (typeof node === "string") {
        const normalized = normalize(node);
        if (normalized) add(normalized);
        return;
      }

      if (typeof node === "number" || typeof node === "boolean") return;

      if (Array.isArray(node)) {
        node.forEach((item) => walk(item, key));
        return;
      }

      if (typeof node === "object") {
        Object.entries(node).forEach(([childKey, childValue]) => {
          if (/date|day|slot|appointment/i.test(childKey)) {
            const normalized = normalize(String(childValue));
            if (normalized) add(normalized);
          }
          walk(childValue, childKey);
        });
      }
    }

    if (typeof value === "string") {
      const matches = value.match(/\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]20\d{2}\b/g) || [];
      matches.forEach((item) => {
        const normalized = normalize(item);
        if (normalized) add(normalized);
      });
    } else {
      walk(value);
    }

    return dates;
  }

  function showResult(result) {
    setStatus(result.summary.split("\n")[0]);
    const root = document.getElementById("ica-slot-watcher");
    root.querySelector("[data-isw-result]").textContent = result.summary;
  }

  function setStatus(text) {
    const root = document.getElementById("ica-slot-watcher");
    if (!root) return;
    root.querySelector("[data-isw-status]").textContent = text;
  }

  async function alertUser(message, urgent) {
    playSound(urgent);

    if ("Notification" in window) {
      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }
      if (permission === "granted") {
        new Notification(urgent ? "Earlier ICA slot found" : "ICA slot check", {
          body: message,
          requireInteraction: urgent
        });
        return;
      }
    }

    if (urgent) window.alert(message);
  }

  async function notifyRadarOnce(type, result) {
    if (!state.telegramNotifyEnabled || !state.radarNotifyUrl || !state.radarNotifyToken) return;

    const signature = `${type}:${result.earliestDate || ""}:${result.summary}`;
    const lastAt = state.lastRadarNotifications.get(signature) || 0;
    if (Date.now() - lastAt < radarNotifyCooldownMs) return;
    state.lastRadarNotifications.set(signature, Date.now());

    try {
      const response = await fetch(state.radarNotifyUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${state.radarNotifyToken}`
        },
        body: JSON.stringify({
          type,
          summary: result.summary,
          earliestDate: result.earliestDate || "",
          earlierDates: result.dates || [],
          targetBefore: state.targetBefore,
          pageUrl: location.href,
          checkedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const detail = await response.text();
        setStatus(`Telegram API failed: HTTP ${response.status} ${detail.slice(0, 100)}`);
      }
    } catch (error) {
      setStatus(`Telegram API failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function isLikelySessionExpired(errorMessage) {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ");
    return (
      /session|expired|timed out|please log in|login again|something went wrong/i.test(`${errorMessage} ${text}`) ||
      !location.href.includes("/eappt/locationselection") ||
      !document.querySelector(".btnProceed")
    );
  }

  function playSound(urgent) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = urgent ? 880 : 440;
      gain.gain.value = urgent ? 0.18 : 0.08;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + (urgent ? 0.45 : 0.18));
    } catch {
      // Browser audio can be blocked until the user interacts with the page.
    }
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
})();
