# ICA Slot Watcher Chrome Extension

This is an unpacked Chrome extension for the ICA appointment page.

It does not store your ICA Authorization token or cookies. It runs inside an already-open ICA tab and listens to the page's own `/eappt/Slots` response after clicking `Proceed`.

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

1. Open the ICA appointment page — you can start from either:
   - Service selection: `https://eservices.ica.gov.sg/eappt/serviceselection`
   - Advanced search: `https://eservices.ica.gov.sg/eappt/locationselection`

2. In the floating **ICA Slot Watcher** panel, configure:
   - **Application ID**: your ICA application ID (e.g., `ISC2509SFXXXXXX`)
   - **Before date**: `2026-07-01` (the target — alerts if earlier slot is found)
   - **Search to date**: `2026-06-19` (the end date for ICA advanced search range)

3. Configure Telegram relay (optional):
   - **Radar notify API**: `https://personal-radar.pages.dev/api/extension-notify`
   - **Radar notify token**: the same value as `EXTENSION_NOTIFY_TOKEN` in Personal Radar.

4. Click **Check once** first.
5. If it works, click **Start** to check every `10` seconds.

## Full Navigation Flow

When starting from the service selection page or when the session needs renewal, the extension automates the full flow:

1. **Service Selection** → Selects "Completion of Formalities" from dropdown
2. **Application ID** → Fills your configured application ID
3. **Proceed** → Clicks Proceed to authenticate
4. **Update Appointment** → Clicks Update Appointment on the appointment page
5. **Advanced Search** → Clicks the Advanced Search tab
6. **Date Range** → Fills From (today) and To (search to date)
7. **Proceed/Back loop** → Checks for available slots before target date

## Session Renewal

When **Auto-renew session** is enabled, the extension navigates back to the service selection page every N minutes (default 13, before ICA's 15-min session expires) and re-runs the full flow above. This replaces the old page-reload approach which did not actually extend the session.

If Application ID is not set, it falls back to a simple page reload.

## Notifications

When an earlier slot is detected, the extension:
- Plays a short sound
- Shows a browser notification (or alert fallback)
- Sends a Telegram message via Personal Radar (if configured)

When the session expires unexpectedly, it:
- Notifies you via Telegram
- Automatically attempts session renewal if auto-renew is enabled

## Notes

- Keep the ICA tab open and active enough that Chrome does not throttle it aggressively.
- The date format used for ICA's date inputs is `DD/MM/YYYY`. If dates are not accepted, the format may need adjustment in `content-script.js` → `formatDateForIca()`.
- A 10-second interval is intentionally aggressive. If ICA starts rejecting requests, increase the interval.
- The Application ID is stored in Chrome extension local storage, not transmitted anywhere except to the ICA page itself.
