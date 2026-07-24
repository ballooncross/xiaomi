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

## Versioned Deployments

- Production deploys via GitHub Actions on `main`. The workflow runs `npm version patch` before build/deploy, then commits `package.json` / `package-lock.json` with `[skip ci]` after a successful deploy so the live footer and git stay aligned.
- Do not manually bump the patch version just for a normal production deploy; CI owns that. Prefer intentional pre-bumps only for special releases.
- After merging, confirm the GitHub deployment succeeded, Cloudflare production references the merged commit, and the live footer shows the new patch version.
