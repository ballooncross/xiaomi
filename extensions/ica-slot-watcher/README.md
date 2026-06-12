# ICA Slot Watcher Chrome Extension

This is an unpacked Chrome extension for the ICA appointment page.

It does not store your ICA application ID, Authorization token, cookies, or page session. It only runs inside an already-open ICA tab and listens to the page's own `/eappt/Slots` response after clicking `Proceed`.

## Install Locally

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this folder:

   `/Users/stevebai/conductor/workspaces/xiaomi/jackson/extensions/ica-slot-watcher`

For day-to-day local use, this folder may also be copied to Desktop and loaded from there:

`/Users/stevebai/Desktop/ica-slot-watcher-extension`

## Use

1. Open ICA manually and reach the advanced search page:

   `https://eservices.ica.gov.sg/eappt/locationselection`

2. Confirm the search range and filters on the ICA page.
3. Use the floating **ICA Slot Watcher** panel.
4. Set **Before date** to `2026-07-01`.
5. Configure Telegram relay:
   - **Radar notify API**: `https://personal-radar.pages.dev/api/extension-notify`
   - **Radar notify token**: the same value as `EXTENSION_NOTIFY_TOKEN` in Personal Radar.
6. Click **Check once** first.
7. If it works, click **Start** to check every `10` seconds.

When an earlier slot is detected, the extension plays a short sound and sends a browser notification. If notification permission is blocked, it falls back to a browser alert.

If Telegram relay is enabled, the extension also calls Personal Radar's `/api/extension-notify` endpoint. Personal Radar sends the Telegram message, so Telegram bot credentials stay in Personal Radar and are not stored in this extension.

Example notification API call:

```bash
curl -X POST 'https://personal-radar.pages.dev/api/extension-notify' \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_EXTENSION_NOTIFY_TOKEN' \
  --data '{
    "type": "ica_slot_found",
    "summary": "Earlier ICA slot found before 2026-07-01: 2026-06-23",
    "earliestDate": "2026-06-23",
    "earlierDates": ["2026-06-23"],
    "targetBefore": "2026-07-01",
    "pageUrl": "https://eservices.ica.gov.sg/eappt/locationselection",
    "checkedAt": "2026-06-12T11:30:00.000Z"
  }'
```

The extension also sends a Telegram alert when the ICA page session looks expired, for example when the expected appointment page or Proceed button disappears.

When **Refresh page before ICA session expires** is enabled, the extension reloads the ICA page every `13` minutes while the watcher is running. This is intended to refresh ICA's 15-minute page session before it expires.

## Notes

- Keep the ICA tab open and active enough that Chrome does not throttle it aggressively.
- If ICA starts showing errors or the session expires, stop the watcher and refresh/login manually.
- A 10-second interval is intentionally aggressive. If ICA starts rejecting requests, increase the interval to 60-180 seconds.
