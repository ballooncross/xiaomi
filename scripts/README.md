# Data scripts

## Exercise catalog

Fetch the Garmin catalog and create the base D1 seed:

```bash
npm run exercises:import:garmin
npm run exercises:seed:garmin:local
```

The base import uses upserts. Existing descriptions, media, and match decisions remain in D1 when Garmin changes its catalog.

## Exercise enrichment

Fetch source data, match records, and create the enrichment seed:

```bash
npm run exercises:enrich:garmin
npm run exercises:seed:enrichment:local
```

Useful importer options:

```bash
node scripts/enrich-garmin-exercises.mjs --limit 25
node scripts/enrich-garmin-exercises.mjs --skip-garmin-details
node scripts/enrich-garmin-exercises.mjs --offline
```

`--limit` runs a small end-to-end sample. `--skip-garmin-details` tests matching without the per-exercise Garmin requests. `--offline` uses only cached responses.

The importer creates these ignored files:

- `scripts/seed-garmin-enrichment.sql`
- `scripts/exercise-enrichment-report.json`
- `scripts/exercise-review-queue.json`
- `scripts/.exercise-enrichment-cache/`

Accepted and rejected match decisions are stored in the tracked file `data/exercise-enrichment/match-overrides.json`.

## Codex and Claude review

Review unresolved matches through the locally installed CLIs:

```bash
npm run exercises:review:garmin -- --dry-run
npm run exercises:review:garmin -- --max-batches 1
npm run exercises:review:garmin
```

The defaults are:

```text
codex exec --sandbox read-only --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -
claude -p --tools "" --no-session-persistence --safe-mode --disable-slash-commands
```

The script runs both commands in an empty temporary directory. Codex receives a read-only sandbox, and Claude receives no tools. This prevents source descriptions in the review prompt from accessing the repository or changing files.

Override either command when local CLI setup requires different flags:

```bash
EXERCISE_CODEX_COMMAND="codex exec -" \
EXERCISE_CLAUDE_COMMAND="claude -p" \
npm run exercises:review:garmin
```

Both services must return the same candidate with at least 0.90 confidence. Disagreements are saved as `needs-manual` so later runs skip the completed batch.

After new decisions are saved, run the enrichment importer again so the generated SQL includes them.

## Production commands

Run these only after reviewing the coverage report:

```bash
npm run db:migrate:remote
npm run exercises:import:garmin
npm run exercises:seed:garmin:remote
npm run exercises:enrich:garmin
npm run exercises:seed:enrichment:remote
```

See [the exercise enrichment runbook](../docs/exercise-enrichment.md) for source priority, request limits, matching rules, and verification queries.
