(function () {
  if (window.__icaSlotWatcherContentInstalled) return;
  window.__icaSlotWatcherContentInstalled = true;

  const SERVICE_SELECTION_URL = "https://eservices.ica.gov.sg/eappt/serviceselection";

  const DEFAULTS = {
    enabled: false,
    intervalSeconds: 10,
    autoRefreshSession: false,
    refreshMinutes: 13,
    targetBefore: "2026-07-01",
    searchToDate: "2026-06-19",
    applicationId: "",
    notifyWhenNoSlots: false,
    telegramNotifyEnabled: true,
    radarNotifyUrl: "https://personal-radar.pages.dev/api/extension-notify",
    radarNotifyToken: ""
  };

  const state = {
    ...DEFAULTS,
    running: false,
    setupInProgress: false,
    bridgeReady: false,
    timer: null,
    refreshTimer: null,
    lastRunAt: null,
    lastResult: "Idle",
    lastSlots: null,
    lastError: null,
    waitingForSlotsResolve: null,
    waitingForActionResolve: null,
    consecutiveErrors: 0,
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
      state.bridgeReady = true;
      setStatus("Ready on ICA page");
      return;
    }

    if (detail.type === "slots-response" && state.waitingForSlotsResolve) {
      state.waitingForSlotsResolve(detail);
      state.waitingForSlotsResolve = null;
    }

    if (detail.type === "action-result" && state.waitingForActionResolve) {
      state.waitingForActionResolve(detail);
      state.waitingForActionResolve = null;
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
            <div class="isw-subtitle">Auto-navigates from service selection</div>
          </div>
          <button class="isw-icon" data-isw-collapse title="Collapse">-</button>
        </div>
        <div class="isw-body">
          <label class="isw-label">
            Application ID
            <input data-isw-app-id type="text" placeholder="ISC2509SFXXXXXX" value="">
          </label>
          <label class="isw-label">
            Before date
            <input data-isw-target type="date" value="${state.targetBefore}">
          </label>
          <label class="isw-label">
            Search to date
            <input data-isw-search-to type="date" value="${state.searchToDate}">
          </label>
          <label class="isw-label">
            Interval seconds
            <input data-isw-interval type="number" min="10" step="5" value="${state.intervalSeconds}">
          </label>
          <label class="isw-check">
            <input data-isw-auto-refresh type="checkbox">
            Periodic session refresh
          </label>
          <div class="isw-refresh-opts" data-isw-refresh-opts>
            <label class="isw-label">
              Refresh every (minutes)
              <input data-isw-refresh-minutes type="number" min="5" step="1" value="${state.refreshMinutes}">
            </label>
          </div>
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
        max-height: calc(100vh - 32px);
        overflow-y: auto;
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
      #ica-slot-watcher input[type="number"],
      #ica-slot-watcher input[type="text"],
      #ica-slot-watcher input[type="url"],
      #ica-slot-watcher input[type="password"] {
        width: 100%;
        border: 1px solid rgba(10, 28, 52, 0.18);
        border-radius: 9px;
        padding: 8px 10px;
        font-size: 13px;
        color: #16213b;
        background: white;
        box-sizing: border-box;
      }
      #ica-slot-watcher .isw-check {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 8px 0 4px;
        font-size: 12px;
      }
      #ica-slot-watcher .isw-refresh-opts {
        margin: 0 0 12px;
        padding-left: 4px;
        display: none;
      }
      #ica-slot-watcher .isw-refresh-opts.isw-visible {
        display: block;
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

    root.querySelector("[data-isw-run]").addEventListener("click", () => {
      ensureReadyThen("manual-check");
    });
    root.querySelector("[data-isw-toggle]").addEventListener("click", toggle);
    root.querySelector("[data-isw-collapse]").addEventListener("click", () => {
      root.classList.toggle("isw-collapsed");
    });
    root.querySelector("[data-isw-app-id]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-target]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-search-to]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-interval]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-refresh-minutes]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-auto-refresh]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-no-slots]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-telegram-enabled]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-radar-url]").addEventListener("change", saveSettingsFromUi);
    root.querySelector("[data-isw-radar-token]").addEventListener("change", saveSettingsFromUi);
  }

  function loadSettings() {
    chrome.storage.local.get({ ...DEFAULTS, pendingNavigationSetup: false, consecutiveErrors: 0 }, (saved) => {
      state.consecutiveErrors = saved.consecutiveErrors || 0;
      Object.assign(state, saved);
      updateUiFromState();

      if (saved.pendingNavigationSetup && state.applicationId &&
          location.href.includes("/eappt/serviceselection")) {
        runFullSetupFlow("session-renew");
      } else if (saved.pendingNavigationSetup && state.applicationId &&
          location.href.includes("/eappt/")) {
        chrome.storage.local.set({ pendingNavigationSetup: false });
        if (state.enabled) ensureReadyThen("start");
      } else if (state.enabled) {
        ensureReadyThen("start");
      }
    });
  }

  function saveSettingsFromUi() {
    const root = document.getElementById("ica-slot-watcher");
    state.applicationId = root.querySelector("[data-isw-app-id]").value.trim();
    state.targetBefore = root.querySelector("[data-isw-target]").value || DEFAULTS.targetBefore;
    state.searchToDate = root.querySelector("[data-isw-search-to]").value || DEFAULTS.searchToDate;
    state.intervalSeconds = Math.max(10, Number(root.querySelector("[data-isw-interval]").value || 10));
    state.refreshMinutes = Math.max(5, Number(root.querySelector("[data-isw-refresh-minutes]").value || 13));
    state.autoRefreshSession = root.querySelector("[data-isw-auto-refresh]").checked;
    root.querySelector("[data-isw-refresh-opts]").classList.toggle("isw-visible", state.autoRefreshSession);
    state.notifyWhenNoSlots = root.querySelector("[data-isw-no-slots]").checked;
    state.telegramNotifyEnabled = root.querySelector("[data-isw-telegram-enabled]").checked;
    state.radarNotifyUrl = root.querySelector("[data-isw-radar-url]").value || DEFAULTS.radarNotifyUrl;
    state.radarNotifyToken = root.querySelector("[data-isw-radar-token]").value;
    chrome.storage.local.set({
      enabled: state.enabled,
      applicationId: state.applicationId,
      intervalSeconds: state.intervalSeconds,
      autoRefreshSession: state.autoRefreshSession,
      refreshMinutes: state.refreshMinutes,
      targetBefore: state.targetBefore,
      searchToDate: state.searchToDate,
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
    root.querySelector("[data-isw-app-id]").value = state.applicationId;
    root.querySelector("[data-isw-target]").value = state.targetBefore;
    root.querySelector("[data-isw-search-to]").value = state.searchToDate;
    root.querySelector("[data-isw-interval]").value = state.intervalSeconds;
    root.querySelector("[data-isw-refresh-minutes]").value = state.refreshMinutes;
    root.querySelector("[data-isw-auto-refresh]").checked = state.autoRefreshSession;
    root.querySelector("[data-isw-refresh-opts]").classList.toggle("isw-visible", state.autoRefreshSession);
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
      ensureReadyThen("start");
    } else {
      stopTimers();
      setStatus("Stopped");
    }
    updateUiFromState();
  }

  async function ensureReadyThen(afterAction) {
    if (location.href.includes("/eappt/locationselection")) {
      // Already on the search page — just ensure adsTab + dates, then go
      await prepareAdvancedSearch();
      if (afterAction === "start") {
        startTimers();
        runCheck("start");
      } else if (afterAction === "manual-check") {
        runCheck("manual");
      }
    } else if (location.href.includes("/eappt/serviceselection")) {
      await runFullSetupFlow(afterAction);
    } else if (state.applicationId) {
      // Some other ICA page — navigate to service selection
      runSetupThenAction(afterAction);
    } else {
      setStatus("Please enter Application ID first.");
    }
  }

  async function prepareAdvancedSearch() {
    state.setupInProgress = true;
    try {
      if (!state.bridgeReady) {
        await waitForBridgeReady(10000);
      }
      // Click Advanced Search tab if not active
      var adsTab = document.querySelector("#adsTab");
      if (adsTab && !adsTab.classList.contains("btn-primary")) {
        adsTab.click();
        await sleep(500);
      }
      // Fill date range
      var fromDate = formatDateForIca(new Date());
      var toDate = formatDateForIca(parseIsoDate(state.searchToDate));
      await sendPageAction("set-dates", { fromDate, toDate });
      await sleep(300);
      setStatus("Ready on advanced search page.");
    } catch (err) {
      setStatus("Prepare failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      state.setupInProgress = false;
    }
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
    if (state.enabled && !state.setupInProgress) startTimers();
  }

  function scheduleSessionRefresh() {
    if (!state.enabled || !state.autoRefreshSession) return;
    state.refreshTimer = window.setTimeout(renewSession, state.refreshMinutes * 60 * 1000);
  }

  function renewSession() {
    if (!state.enabled) return;

    if (state.running || state.setupInProgress) {
      state.refreshTimer = window.setTimeout(renewSession, 30 * 1000);
      return;
    }

    if (!state.applicationId) {
      setStatus("Cannot renew session: Application ID not set. Falling back to page reload.");
      chrome.storage.local.set({ lastRefreshAt: new Date().toISOString() });
      window.setTimeout(() => window.location.reload(), 500);
      return;
    }

    stopTimers();
    setStatus("Renewing ICA session via full navigation...");
    chrome.storage.local.set({
      pendingNavigationSetup: true,
      lastRefreshAt: new Date().toISOString()
    });
    window.setTimeout(() => {
      window.location.href = SERVICE_SELECTION_URL;
    }, 500);
  }

  async function runSetupThenAction(afterAction) {
    if (!state.applicationId) {
      setStatus("Please enter Application ID first.");
      return;
    }

    if (location.href.includes("/eappt/serviceselection")) {
      await runFullSetupFlow(afterAction);
    } else {
      setStatus("Navigating to service selection...");
      chrome.storage.local.set({ pendingNavigationSetup: true });
      window.location.href = SERVICE_SELECTION_URL;
    }
  }

  async function runFullSetupFlow(afterAction) {
    state.setupInProgress = true;
    state.running = true;
    chrome.storage.local.set({ pendingNavigationSetup: false });

    try {
      setStatus("Waiting for page to load...");
      await sleep(2000);

      if (!state.bridgeReady) {
        setStatus("Waiting for page bridge...");
        await waitForBridgeReady(15000);
      }

      // Step 1: Select service
      setStatus("Step 1/6: Selecting service...");
      await sendPageAction("select-service", {});
      await sleep(1000);

      // Step 2: Fill application ID
      setStatus("Step 2/6: Entering application ID...");
      await sendPageAction("fill-application-id", { id: state.applicationId });
      await sleep(500);

      // Step 3: Click Proceed
      setStatus("Step 3: Clicking Proceed...");
      const proceedBtn = findButton("Proceed") || document.querySelector(".btnProceed");
      if (!proceedBtn) throw new Error("Proceed button not found on service selection page");
      proceedBtn.click();

      // Step 4: Wait for next page — could be "Update Appointment" page OR directly the location/calendar page
      setStatus("Step 4: Waiting for next page...");
      await waitForTextInPage([
        "Update Appointment",
        "Appointment Details",
        "Advanced search",
        "Search by date",
        "Search by location",
        "Error Message",
        "Something went wrong"
      ], 25000);

      var bodyText = document.body.innerText;
      if (bodyText.includes("Something went wrong") || bodyText.includes("Error Message")) {
        throw new Error("ICA returned an error after Proceed. Check application ID.");
      }

      // If "Update Appointment" button exists, click it (intermediate page)
      await sleep(800);
      var updateBtn = findButton("Update Appointment");
      if (updateBtn) {
        setStatus("Step 5: Clicking Update Appointment...");
        updateBtn.click();
        await waitForTextInPage(["Appointment Details", "Advanced search", "Search by date"], 25000);
        await sleep(800);
      }
      // Otherwise we landed directly on the location/calendar page — continue

      // Click Advanced Search tab
      setStatus("Switching to Advanced Search...");
      var adsTab = document.querySelector("#adsTab");
      if (adsTab && !adsTab.classList.contains("btn-primary")) {
        adsTab.click();
        await sleep(500);
      }

      // Fill date range
      setStatus("Setting date range...");
      var fromDate = formatDateForIca(new Date());
      var toDate = formatDateForIca(parseIsoDate(state.searchToDate));
      await sendPageAction("set-dates", { fromDate, toDate });
      await sleep(500);

      setStatus("Session ready. On advanced search page.");

      if (afterAction === "start" || afterAction === "session-renew") {
        if (state.enabled) {
          startTimers();
          runCheck("after-setup");
        }
      } else if (afterAction === "manual-check") {
        runCheck("manual");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setStatus("Setup failed: " + msg);
      await notifyRadarOnce("ica_session_expired", {
        summary: "ICA session setup failed: " + msg,
        dates: []
      });
    } finally {
      state.setupInProgress = false;
      state.running = false;
    }
  }

  // --- Slot checking flow (existing, from advanced search page) ---

  async function runCheck(reason) {
    if (state.running || state.setupInProgress) {
      setStatus("Previous check still running");
      return;
    }

    state.running = true;
    state.lastRunAt = new Date();
    state.lastError = null;
    setStatus("Checking (" + reason + ") at " + formatTime(state.lastRunAt) + "...");

    try {
      ensureAdvancedSearchPage();
      var slotsResponsePromise = waitForSlotsResponse(12000);
      await clickProceed();
      await sleep(800);

      // Method 1: intercept /Slots API response
      var apiSlots = null;
      try { apiSlots = await slotsResponsePromise; } catch (_) { /* timeout ok, try DOM */ }

      // Method 2: check DOM for selectable calendar dates
      var domDates = extractDatesFromDom();

      var result = evaluateAllSlots(apiSlots, domDates);
      state.lastSlots = apiSlots;
      state.lastResult = result.summary;
      showResult(result);

      state.consecutiveErrors = 0;
      chrome.storage.local.set({ consecutiveErrors: 0 });

      if (result.hasEarlierDate) {
        await alertUser(result.summary, true);
        await notifyRadarOnce("ica_slot_found", result);
      } else if (state.notifyWhenNoSlots) {
        await alertUser(result.summary, false);
      }

      await clickBack();
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      state.consecutiveErrors++;
      chrome.storage.local.set({ consecutiveErrors: state.consecutiveErrors });
      state.lastResult = "Error (" + state.consecutiveErrors + "): " + state.lastError;
      setStatus(state.lastResult);
      showResult({ summary: state.lastResult, dates: [] });

      if (needsRenavigation(state.lastError) && state.enabled && state.applicationId) {
        if (state.consecutiveErrors <= 2) {
          // First 2 failures: just refresh the page, often recovers on its own
          setStatus("Retry " + state.consecutiveErrors + "/3: refreshing page...");
          await sleep(3000);
          window.location.reload();
          return;
        } else if (state.consecutiveErrors <= 4) {
          // Failures 3-4: re-navigate from start
          setStatus("Retry " + state.consecutiveErrors + "/5: re-navigating from start...");
          stopTimers();
          await sleep(2000);
          renewSession();
          return;
        } else {
          // 5+ failures: notify via Telegram, keep trying
          await notifyRadarOnce("ica_session_expired", {
            summary: "ICA session lost after " + state.consecutiveErrors + " retries: " + state.lastError,
            dates: []
          });
          stopTimers();
          await sleep(5000);
          renewSession();
          return;
        }
      } else if (state.consecutiveErrors >= 5) {
        await notifyRadarOnce("ica_check_error", {
          summary: "ICA check failed " + state.consecutiveErrors + " times: " + state.lastError,
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
      throw new Error("Not on ICA location selection page. Setup navigation needed.");
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

  async function clickBack(options) {
    options = options || {};
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
    return Array.from(document.querySelectorAll("button")).find(function (button) {
      return (button.textContent || "").trim().toLowerCase() === text.toLowerCase();
    });
  }

  function evaluateAllSlots(apiSlots, domDates) {
    var checkedAt = formatTime(new Date());
    var todayStr = toIsoDateStr(new Date());
    var toStr = state.searchToDate || "2099-12-31";

    // Method 1: Parse API response — look for slotDates with isNoSlotDay === false
    var apiAvailable = [];
    var apiTotal = 0;
    var apiStatus = "";
    if (apiSlots) {
      apiStatus = apiSlots.ok ? "HTTP " + apiSlots.status : "HTTP " + apiSlots.status + " (error)";
      if (apiSlots.ok && apiSlots.body && typeof apiSlots.body === "object") {
        var parsed = parseIcaSlotsResponse(apiSlots.body);
        apiAvailable = parsed.available;
        apiTotal = parsed.total;
      }
    }

    // Merge API + DOM, filter to search range
    var allDates = apiAvailable.concat(domDates);
    var inRange = allDates
      .filter(function (d) { return d >= todayStr && d <= toStr; })
      .sort();
    var uniqueDates = Array.from(new Set(inRange));
    var earliest = uniqueDates[0] || "";

    var debug = "[api: " + apiStatus + ", slots: " + apiAvailable.length + "/" + apiTotal +
      ", dom: " + domDates.length + ", inRange: " + uniqueDates.length + "]";

    if (apiSlots && !apiSlots.ok) {
      return {
        hasEarlierDate: false,
        dates: [],
        summary: "Checked " + checkedAt + ". /Slots " + apiStatus + ". " + debug
      };
    }

    if (uniqueDates.length > 0) {
      return {
        hasEarlierDate: true,
        dates: uniqueDates,
        earliestDate: earliest,
        summary: "Slot found: " + earliest + "\n" + uniqueDates.join(", ") + "\n" + debug
      };
    }

    return {
      hasEarlierDate: false,
      dates: [],
      earliestDate: "",
      summary: "Checked " + checkedAt + ". No slots in range. " + debug
    };
  }

  // Parse ICA /Slots API response: { locationWiseData: [{ slotDates: [{ slotDate, isNoSlotDay }] }] }
  function parseIcaSlotsResponse(body) {
    var available = [];
    var total = 0;

    var locations = body.locationWiseData || body.LocationWiseData || [];
    if (!Array.isArray(locations)) locations = [];

    locations.forEach(function (loc) {
      var slots = loc.slotDates || loc.SlotDates || [];
      if (!Array.isArray(slots)) return;

      slots.forEach(function (slot) {
        total++;
        var isNoSlot = slot.isNoSlotDay === true || slot.IsNoSlotDay === true;
        if (isNoSlot) return;

        var raw = slot.slotDate || slot.SlotDate || "";
        var m = String(raw).match(/(20\d{2})-(\d{2})-(\d{2})/);
        if (m) available.push(m[1] + "-" + m[2] + "-" + m[3]);
      });
    });

    // Fallback: if response has a different shape, try generic date extraction
    if (total === 0) {
      var fallbackDates = extractDates(body);
      return { available: fallbackDates, total: fallbackDates.length };
    }

    return { available: available, total: total };
  }

  // Extract available dates from the DOM (slot result carousel, not the advanced-search calendar)
  function extractDatesFromDom() {
    var monthAbbr = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"
    };

    var dates = [];
    var year = new Date().getFullYear();

    // ICA renders results as .date-holder inside app-service-day-section carousel
    // Available = .date-holder without .restrictedDate
    document.querySelectorAll(".date-holder").forEach(function (holder) {
      if (holder.classList.contains("restrictedDate")) return;

      var monthEl = holder.querySelector(".monthText");
      var dateEl = holder.querySelector(".dateText");
      if (!monthEl || !dateEl) return;

      var monthStr = (monthEl.textContent || "").trim();
      var dayStr = (dateEl.textContent || "").trim().padStart(2, "0");
      var mm = monthAbbr[monthStr];
      if (!mm || !dayStr) return;

      // Infer year: if month is before current month, it's next year
      var monthNum = parseInt(mm, 10);
      var currentMonth = new Date().getMonth() + 1;
      var y = monthNum < currentMonth ? year + 1 : year;

      dates.push(y + "-" + mm + "-" + dayStr);
    });

    return dates;
  }

  function extractDates(value) {
    var dates = [];
    var seen = new Set();

    function add(date) {
      if (!seen.has(date)) {
        seen.add(date);
        dates.push(date);
      }
    }

    function normalize(raw) {
      if (typeof raw !== "string") return null;
      var iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
      if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
      var slash = raw.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
      if (slash) return slash[3] + "-" + slash[2].padStart(2, "0") + "-" + slash[1].padStart(2, "0");
      return null;
    }

    function walk(node, key) {
      key = key || "";
      if (node == null) return;
      if (typeof node === "string") {
        var normalized = normalize(node);
        if (normalized) add(normalized);
        return;
      }
      if (typeof node === "number" || typeof node === "boolean") return;
      if (Array.isArray(node)) {
        node.forEach(function (item) { walk(item, key); });
        return;
      }
      if (typeof node === "object") {
        Object.entries(node).forEach(function (entry) {
          var childKey = entry[0], childValue = entry[1];
          if (/date|day|slot|appointment/i.test(childKey)) {
            var n = normalize(String(childValue));
            if (n) add(n);
          }
          walk(childValue, childKey);
        });
      }
    }

    if (typeof value === "string") {
      var matches = value.match(/\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]20\d{2}\b/g) || [];
      matches.forEach(function (item) {
        var normalized = normalize(item);
        if (normalized) add(normalized);
      });
    } else {
      walk(value);
    }

    return dates;
  }

  // --- Page-bridge communication helpers ---

  function sendPageAction(action, data) {
    return new Promise(function (resolve, reject) {
      var timeoutId = window.setTimeout(function () {
        state.waitingForActionResolve = null;
        reject(new Error("Timed out waiting for page action: " + action));
      }, 20000);

      state.waitingForActionResolve = function (result) {
        window.clearTimeout(timeoutId);
        if (result.success) resolve(result);
        else reject(new Error(result.error || "Action failed: " + action));
      };

      window.postMessage({
        source: "ica-slot-watcher-content",
        action: action,
        data: data || {}
      }, window.location.origin);
    });
  }

  function waitForBridgeReady(timeoutMs) {
    if (state.bridgeReady) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var elapsed = 0;
      var check = function () {
        if (state.bridgeReady) return resolve();
        elapsed += 300;
        if (elapsed >= timeoutMs) return reject(new Error("Page bridge did not become ready"));
        window.setTimeout(check, 300);
      };
      window.setTimeout(check, 300);
    });
  }

  function waitForTextInPage(texts, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var elapsed = 0;
      var check = function () {
        var bodyText = document.body.innerText || "";
        for (var i = 0; i < texts.length; i++) {
          if (bodyText.includes(texts[i])) return resolve(texts[i]);
        }
        elapsed += 500;
        if (elapsed >= timeoutMs) {
          return reject(new Error("Timed out waiting for page text: " + texts.join(" / ")));
        }
        window.setTimeout(check, 500);
      };
      window.setTimeout(check, 500);
    });
  }

  // --- UI helpers ---

  function showResult(result) {
    setStatus(result.summary.split("\n")[0]);
    var root = document.getElementById("ica-slot-watcher");
    root.querySelector("[data-isw-result]").textContent = result.summary;
  }

  function setStatus(text) {
    var root = document.getElementById("ica-slot-watcher");
    if (!root) return;
    root.querySelector("[data-isw-status]").textContent = text;
  }

  async function alertUser(message, urgent) {
    playSound(urgent);

    if ("Notification" in window) {
      var permission = Notification.permission;
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

    var signature = type + ":" + (result.earliestDate || "") + ":" + result.summary;
    var lastAt = state.lastRadarNotifications.get(signature) || 0;
    if (Date.now() - lastAt < radarNotifyCooldownMs) return;
    state.lastRadarNotifications.set(signature, Date.now());

    try {
      var today = new Date();
      var fromDateStr = today.getFullYear() + "-" +
        String(today.getMonth() + 1).padStart(2, "0") + "-" +
        String(today.getDate()).padStart(2, "0");

      var response = await fetch(state.radarNotifyUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Bearer " + state.radarNotifyToken
        },
        body: JSON.stringify({
          type: type,
          summary: result.summary,
          earliestDate: result.earliestDate || "",
          earlierDates: result.dates || [],
          searchFrom: fromDateStr,
          searchTo: state.searchToDate,
          pageUrl: location.href,
          checkedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        var detail = await response.text();
        setStatus("Telegram API failed: HTTP " + response.status + " " + detail.slice(0, 100));
      }
    } catch (error) {
      setStatus("Telegram API failed: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  function needsRenavigation(errorMessage) {
    var text = (document.body ? document.body.innerText : "").replace(/\s+/g, " ");
    return (
      /setup navigation needed|not on ica location/i.test(errorMessage) ||
      /session|expired|timed out|please log in|login again|something went wrong/i.test(errorMessage + " " + text) ||
      (!location.href.includes("/eappt/locationselection") && !location.href.includes("/eappt/serviceselection")) ||
      (!document.querySelector(".btnProceed") && !document.querySelector("ng-select"))
    );
  }

  function playSound(urgent) {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var context = new AudioCtx();
      var oscillator = context.createOscillator();
      var gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = urgent ? 880 : 440;
      gain.gain.value = urgent ? 0.18 : 0.08;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + (urgent ? 0.45 : 0.18));
    } catch (_) {}
  }

  // --- Utility ---

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function formatDateForIca(date) {
    var dd = String(date.getDate()).padStart(2, "0");
    var mm = String(date.getMonth() + 1).padStart(2, "0");
    var yyyy = date.getFullYear();
    return dd + "/" + mm + "/" + yyyy;
  }

  function parseIsoDate(isoStr) {
    var parts = isoStr.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function sleep(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }
})();
