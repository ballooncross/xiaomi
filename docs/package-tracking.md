# Package tracking

Package tracking is available from the dedicated Packages page and from the linked Telegram bot.

## User behavior

- Add one tracking number at a time from the web page or with `/track TRACKING_NUMBER`.
- Remove a package and all stored event history from the web page or with `/untrack TRACKING_NUMBER`.
- List active packages with `/packages`.
- Use the Telegram command menu beside the message field to discover the bot commands.
- Refresh an active package manually from its web card.
- View delivered packages in the History tab.

The scheduled worker checks active and unresolved packages every day at 08:30 Singapore time. Telegram receives a message only when the provider returns a new event. A delivered package moves to History after that event has been handled successfully.

New tracking numbers can temporarily have no provider data. The worker retries them daily for seven days. It then changes the item to Needs attention and stops automatic checks. A manual refresh remains available.

Tracking records are isolated by Personal Radar user. The Telegram chat must already be linked to that user before package commands are accepted.

## Provider adapters

Provider selection starts with known number formats, then tries the configured adapters when the format is unknown.

| Provider | Lookup method | Known format |
|----------|---------------|--------------|
| YXD | Cloudflare Browser rendering, with direct HTML fallback | `ADN...` |
| D-EXI | Stateful form search followed by its detail endpoint | `LX...` |
| MH56 | Server-rendered tracking page | `YD...` |

The provider list is maintained in code. There is no provider-management UI. D-EXI requires its tracking-field update and result-row selection requests before loading full details. It uses day-first timestamps in Singapore time and requires a browser-compatible user agent.

## Storage and scheduling

Migration `0024_package_tracking.sql` creates `package_trackings` and `package_tracking_events`, and enables the `package_tracking` feature for members. Event fingerprints prevent duplicate notifications when a provider returns the same history repeatedly.

The existing `00:30` UTC cron trigger runs the package job at 08:30 Singapore time. Pages sends manual refreshes to the cron Worker through the existing `CRON_WORKER` service binding and falls back to a direct lookup if that service is temporarily unavailable.

## Verification

Run the normal project checks before release:

```bash
npm test
npm run check
npm run build
```

Also apply the migrations to a local D1 database and run a cron Worker dry build. Provider parser unit tests use stored HTML fragments, while a live smoke test should use a tracking number the user has explicitly provided.
