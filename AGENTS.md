# Personal Radar Agent Instructions

## Deployment And Branching

- Production code must end up on the repository's canonical branch.
- After deploying, or as part of deployment, always merge the deployed code into `main` or `master`.
- Do not leave production-only changes on a workspace, feature, or deployment branch without merging them back to the canonical branch.
- Before merging, run the relevant checks for the change; for normal app changes use `npm test`, `npm run check`, and `npm run build`.

## Trend Freshness

- Web trend, news, and opportunity items must carry the source publication date through every ingestion path. Do not substitute the ingestion timestamp when the publication date is missing.
- Treat web trend, news, and opportunity items with a missing or invalid publication date as unverified and exclude them from the radar.
- Verify freshness fixes against the stored production row and the original article date, not only normalized in-memory fixtures.

## Interest Processing Lanes

- `watch_topics.feed` is the authoritative routing field: `concerts` or `trends`.
- Concert interests are event trackers only. Never send them to news search, AI trend prompts, trend scoring, trend feedback learning, active-story follow-ups, or interest optimization.
- Trend `category` values classify results but never route ingestion. Concert entries use `general` because concerts are represented by `feed`, not by a category value.
- Actual source subscriptions belong to the source subsystem. Do not model a source as a user interest keyword.

## Versioned Deployments

- Production deploys via GitHub Actions on `main`. The workflow runs `npm version patch` before build/deploy, then commits `package.json` / `package-lock.json` with `[skip ci]` after a successful deploy so the live footer and git stay aligned.
- Do not manually bump the patch version just for a normal production deploy; CI owns that. Prefer intentional pre-bumps only for special releases.
- After merging, confirm the GitHub deployment succeeded, Cloudflare production references the merged commit, and the live footer shows the new patch version.

## Local Agent Status

- The local agent reports every tick to `POST /api/agent/status` with `running`, `ok`, or `error`.
- Keep the `local-agent` entry in the 定时任务状态 list aligned with that endpoint so stale runs and failures remain visible to admins.

## Package Tracking

- Package tracking data is user scoped. Telegram commands must resolve the linked chat to a Personal Radar user before reading or changing packages.
- Run package checks at 08:30 Singapore time and notify only when a new provider event is stored.
- Retry unresolved tracking numbers for seven days, then move them to `needs_attention` and stop automatic checks.
- Archive delivered packages only after the delivery update has been handled successfully.
- Removing a package permanently deletes its event history and stops future checks and notifications.
- Provider additions are code changes. Keep provider parsing behind adapters and retain provider fixture tests.
- YXD requires browser rendering for reliable results. MH56 is server rendered. Validate D-EXI against the first live sample because no working D-EXI number was available during initial implementation.
