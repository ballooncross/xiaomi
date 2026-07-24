# Feature gates

Configurable toggles for product surfaces and cron jobs, with a minimum role (`member` | `admin`).

## Model

| Field | Meaning |
|--------|---------|
| `enabled` | Off → hide UI and skip linked cron |
| `minRole` | `member` = any logged-in user; `admin` = `ADMIN_EMAILS` only |

Code registry (labels/defaults): `src/lib/server/features.ts`  
Overrides: D1 table `feature_flags` (migration `0018_feature_flags.sql`)  
Admin UI: **我的 → 功能开关**

## Seeded features

| id | Default | Role | Cron |
|----|---------|------|------|
| `ica_check` | off | admin | `ica-appointment-check` |
| `coe_page` | on | member | — |
| `coe_notify` | on | member | `coe-check` (recipients = per-user subscribe) |
| `gym_page` | on | member | — |
| `telegram_digest` | on | member | `daily-digest` |
| `admin_ops` | on | admin | — |
| `dev_requests` | on | admin | — |

## API

```http
GET  /api/admin/features
PATCH /api/admin/features
{ "id": "ica_check", "enabled": true, "minRole": "admin" }
```

Admin session required.

## Adding a feature

1. Add id to `FeatureId` + `FEATURE_REGISTRY` in `features.ts`
2. Seed row in a new migration (or rely on code defaults)
3. Gate UI with `featureAllowed('…')` and cron/API with `isFeatureEnabled` / `isFeatureAllowed`
