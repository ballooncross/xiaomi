(function () {
  if (window.__icaSlotWatcherBridgeInstalled) return;
  window.__icaSlotWatcherBridgeInstalled = true;

  const SLOT_PATH = "/eappt/Slots";

  function emit(detail) {
    window.postMessage(
      {
        source: "ica-slot-watcher-page",
        detail
      },
      window.location.origin
    );
  }

  async function readFetchResponse(response, url) {
    try {
      const clone = response.clone();
      const contentType = clone.headers.get("content-type") || "";
      const body = contentType.includes("application/json") ? await clone.json() : await clone.text();
      emit({
        type: "slots-response",
        url,
        status: response.status,
        ok: response.ok,
        body
      });
    } catch (error) {
      emit({
        type: "slots-response-error",
        url,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(input, init) {
    const response = await originalFetch.apply(this, arguments);
    const url = typeof input === "string" ? input : input && input.url;
    if (url && String(url).includes(SLOT_PATH)) {
      readFetchResponse(response, String(url));
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
    this.__icaSlotWatcherUrl = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function patchedSend() {
    this.addEventListener("load", function () {
      const url = this.__icaSlotWatcherUrl;
      if (!url || !String(url).includes(SLOT_PATH)) return;

      let body = this.responseText;
      const contentType = this.getResponseHeader("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          body = JSON.parse(this.responseText);
        } catch {
          body = this.responseText;
        }
      }

      emit({
        type: "slots-response",
        url: String(url),
        status: this.status,
        ok: this.status >= 200 && this.status < 300,
        body
      });
    });

    return originalSend.apply(this, arguments);
  };

  emit({ type: "bridge-ready" });
})();
