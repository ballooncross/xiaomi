# Personal Radar Agent Instructions

## Deployment And Branching

- Production code must end up on the repository's canonical branch.
- After deploying, or as part of deployment, always merge the deployed code into `main` or `master`.
- Do not leave production-only changes on a workspace, feature, or deployment branch without merging them back to the canonical branch.
- Before merging, run the relevant checks for the change; for normal app changes use `npm test`, `npm run check`, and `npm run build`.
