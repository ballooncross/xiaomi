(function () {
  if (window.__icaSlotWatcherBridgeInstalled) return;
  window.__icaSlotWatcherBridgeInstalled = true;

  var SLOT_PATH = "/eappt/Slots";

  function emit(detail) {
    window.postMessage(
      {
        source: "ica-slot-watcher-page",
        detail: detail
      },
      window.location.origin
    );
  }

  // --- Network interception for /eappt/Slots ---

  async function readFetchResponse(response, url) {
    try {
      var clone = response.clone();
      var contentType = clone.headers.get("content-type") || "";
      var body = contentType.includes("application/json") ? await clone.json() : await clone.text();
      emit({
        type: "slots-response",
        url: url,
        status: response.status,
        ok: response.ok,
        body: body
      });
    } catch (error) {
      emit({
        type: "slots-response-error",
        url: url,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  var originalFetch = window.fetch;
  window.fetch = async function patchedFetch(input, init) {
    var response = await originalFetch.apply(this, arguments);
    var url = typeof input === "string" ? input : input && input.url;
    if (url && String(url).includes(SLOT_PATH)) {
      readFetchResponse(response, String(url));
    }
    return response;
  };

  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__icaSlotWatcherUrl = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function patchedSend() {
    this.addEventListener("load", function () {
      var url = this.__icaSlotWatcherUrl;
      if (!url || !String(url).includes(SLOT_PATH)) return;

      var body = this.responseText;
      var contentType = this.getResponseHeader("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          body = JSON.parse(this.responseText);
        } catch (_) {
          body = this.responseText;
        }
      }

      emit({
        type: "slots-response",
        url: String(url),
        status: this.status,
        ok: this.status >= 200 && this.status < 300,
        body: body
      });
    });

    return originalSend.apply(this, arguments);
  };

  // --- Action handlers for content script commands ---

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    if (!event.data || event.data.source !== "ica-slot-watcher-content") return;
    handleContentAction(event.data);
  });

  async function handleContentAction(msg) {
    var action = msg.action;
    var data = msg.data || {};

    try {
      switch (action) {
        case "select-service":
          await selectServiceDropdown();
          emit({ type: "action-result", action: action, success: true });
          break;
        case "fill-application-id":
          fillApplicationIdInput(data.id);
          emit({ type: "action-result", action: action, success: true });
          break;
        case "set-dates":
          setAdvancedSearchDates(data.fromDate, data.toDate);
          emit({ type: "action-result", action: action, success: true });
          break;
        default:
          emit({ type: "action-result", action: action, success: false, error: "Unknown action: " + action });
      }
    } catch (error) {
      emit({
        type: "action-result",
        action: action,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async function selectServiceDropdown() {
    var ngSelect = document.querySelector("ng-select");
    if (!ngSelect) throw new Error("Service dropdown (ng-select) not found on page");

    // Try multiple click targets — ng-select internals vary by version
    var clickTargets = [
      ngSelect.querySelector('input[role="combobox"]'),
      ngSelect.querySelector('input[role="searchbox"]'),
      ngSelect.querySelector("input[type='text']"),
      ngSelect.querySelector(".ng-select-container"),
      ngSelect.querySelector(".ng-value-container"),
      ngSelect
    ];

    var opened = false;
    for (var t = 0; t < clickTargets.length; t++) {
      var el = clickTargets[t];
      if (!el) continue;
      var rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      // Simulate full mouse interaction sequence
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      el.focus && el.focus();

      // Wait briefly and check if options appeared
      await waitMs(800);
      if (document.querySelectorAll(".ng-option, [role='option'], .ng-dropdown-panel .ng-option-label").length > 0) {
        opened = true;
        break;
      }
    }

    if (!opened) {
      // Last resort: click the center of ng-select via coordinates
      var nsRect = ngSelect.getBoundingClientRect();
      if (nsRect.width > 0) {
        var cx = nsRect.left + nsRect.width / 2;
        var cy = nsRect.top + nsRect.height / 2;
        var target2 = document.elementFromPoint(cx, cy);
        if (target2) {
          target2.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
          target2.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
          target2.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        }
      }

      await waitForCondition(function () {
        return document.querySelectorAll(".ng-option, [role='option'], .ng-dropdown-panel .ng-option-label").length > 0;
      }, 8000, "Dropdown options did not appear after clicking ng-select. " + diagNgSelect(ngSelect));
    }

    var options = document.querySelectorAll(".ng-option, [role='option']");
    var target = null;
    for (var i = 0; i < options.length; i++) {
      var text = (options[i].textContent || "").trim();
      if (text.includes("Completion of Formalities")) {
        target = options[i];
        break;
      }
    }

    if (!target) {
      throw new Error('"Completion of Formalities" not found. Options: ' +
        Array.from(options).map(function (o) { return (o.textContent || "").trim().slice(0, 60); }).join("; "));
    }

    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

    await waitForCondition(function () {
      return (document.body.innerText || "").includes("Group Application ID") ||
             (document.body.innerText || "").includes("Application ID");
    }, 10000, "Application ID input did not appear after service selection");
  }

  function diagNgSelect(ngSelect) {
    var children = ngSelect ? ngSelect.innerHTML.slice(0, 300) : "null";
    var inputs = ngSelect ? ngSelect.querySelectorAll("input").length : 0;
    var containers = ngSelect ? ngSelect.querySelectorAll(".ng-select-container").length : 0;
    var panels = document.querySelectorAll(".ng-dropdown-panel").length;
    return "inputs=" + inputs + " containers=" + containers + " panels=" + panels + " html=" + children;
  }

  function waitMs(ms) {
    return new Promise(function(r) { setTimeout(r, ms); });
  }

  function fillApplicationIdInput(id) {
    if (!id) throw new Error("Application ID is empty");

    var inputs = document.querySelectorAll(
      'input[type="text"]:not([role="combobox"]):not(.dateSearchInput):not([style*="display: none"])'
    );

    var idInput = null;
    for (var i = 0; i < inputs.length; i++) {
      var rect = inputs[i].getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && !inputs[i].closest("ng-select")) {
        idInput = inputs[i];
        break;
      }
    }

    if (!idInput) throw new Error("Application ID input not found on page");

    setNativeInputValue(idInput, id);
  }

  function setAdvancedSearchDates(fromDate, toDate) {
    var fromInput = document.querySelector('input[formcontrolname="adFromDate"], input[aria-label="From Date"]');
    var toInput = document.querySelector('input[formcontrolname="adEndDate"], input[aria-label="End Date"]');

    var results = [];

    if (fromInput && fromDate) {
      setNativeInputValue(fromInput, fromDate);
      results.push("from=" + fromDate);
    }
    if (toInput && toDate) {
      setNativeInputValue(toInput, toDate);
      results.push("to=" + toDate);
    }

    if (results.length === 0) {
      throw new Error("Date inputs not found. Are you on the Advanced Search tab?");
    }
  }

  function setNativeInputValue(element, value) {
    element.focus();

    var nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    nativeSetter.call(element, value);

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));

    element.blur();
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function waitForCondition(conditionFn, timeoutMs, errorMsg) {
    return new Promise(function (resolve, reject) {
      if (conditionFn()) return resolve();

      var elapsed = 0;
      var interval = 300;

      function check() {
        if (conditionFn()) return resolve();
        elapsed += interval;
        if (elapsed >= timeoutMs) return reject(new Error(errorMsg || "Condition not met within timeout"));
        setTimeout(check, interval);
      }

      setTimeout(check, interval);
    });
  }

  emit({ type: "bridge-ready" });
})();
