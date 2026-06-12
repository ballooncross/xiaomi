# Cloudflare Deployment

## 1. Create Cloudflare Resources

Log in:

```bash
npx wrangler login
```

Create the D1 database:

```bash
npx wrangler d1 create personal-radar
```

Copy the returned `database_id` into both:

- `wrangler.toml`
- `wrangler.cron.toml`

Create the Pages project before adding Pages secrets or deploying:

```bash
npx wrangler pages project create personal-radar --production-branch main
```

If this command says the project already exists, continue with the next step. If you choose a different Pages project name, update every `--project-name personal-radar` command in this document and the `deploy` script in `package.json` to use that exact name.

## 2. Apply Schema And Seed Data

```bash
npm run db:migrate:remote
npm run db:seed:remote
```

## 3. Configure Secrets

Run these commands in your local terminal inside this project directory. They are not Cloudflare Console commands. `wrangler` is Cloudflare's CLI and talks to your Cloudflare account after `npx wrangler login`.

This project installs Wrangler as a dev dependency, so use `npx wrangler ...` for direct CLI commands. Raw `wrangler ...` only works if you also install Wrangler globally or add the local npm bin directory to your shell `PATH`.

Pages app:

```bash
npx wrangler pages secret put ADMIN_TOKEN --project-name personal-radar
npx wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name personal-radar
npx wrangler pages secret put TELEGRAM_CHAT_ID --project-name personal-radar
npx wrangler pages secret put TICKETMASTER_API_KEY --project-name personal-radar
npx wrangler pages secret put GEMINI_API_KEY --project-name personal-radar
npx wrangler pages secret put DEEPSEEK_API_KEY --project-name personal-radar
```

Cron worker:

```bash
npx wrangler secret put ADMIN_TOKEN --config wrangler.cron.toml
npx wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler.cron.toml
npx wrangler secret put TELEGRAM_CHAT_ID --config wrangler.cron.toml
npx wrangler secret put TICKETMASTER_API_KEY --config wrangler.cron.toml
npx wrangler secret put GEMINI_API_KEY --config wrangler.cron.toml
npx wrangler secret put DEEPSEEK_API_KEY --config wrangler.cron.toml
npx wrangler secret put ICA_APPLICATION_ID --config wrangler.cron.toml
```

Only set AI keys if you want AI enabled. The app falls back to rules when keys are missing.

Optional ICA browser fallback:

```bash
npx wrangler secret put ICA_FALLBACK_CHECK_URL --config wrangler.cron.toml
npx wrangler secret put ICA_FALLBACK_TRIGGER_TOKEN --config wrangler.cron.toml
```

Set these only after the GCP Playwright runner is deployed. The cron Worker automatically calls the fallback runner when Cloudflare Browser Run returns `blocked`, `error`, or is missing its Browser Run binding. It does not call the fallback after normal `ok` or `found_earlier` results.

For Ticketmaster, register on the Ticketmaster Developer Portal. The default application has a `Consumer Key`; use that value as `TICKETMASTER_API_KEY`.

## 4. GitHub Actions Deployment

The repository includes `.github/workflows/deploy.yml`. It runs when `main` receives a new commit and can also be started manually from GitHub Actions > Deploy > Run workflow.

The workflow does the production path end to end:

1. Install dependencies with `npm ci`.
2. Run `npm run check`.
3. Run `npm test`.
4. Run `npm run build`.
5. Apply remote D1 migrations.
6. Deploy Cloudflare Pages.
7. Deploy the cron Worker.

Add these repository secrets in GitHub > repository Settings > Secrets and variables > Actions:

- `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID. You can get it from `npx wrangler whoami`.
- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token allowed to deploy Pages, deploy Workers, and apply D1 migrations for this account.

Recommended Cloudflare token permissions:

- Account > Cloudflare Pages > Edit
- Account > Workers Scripts > Edit
- Account > D1 > Edit
- Account > Account Settings > Read

Keep local deploy commands as a fallback only:

```bash
npm run deploy
npm run deploy:cron
```

The Pages app serves the UI and API routes. The separate cron Worker runs scheduled fetch and digest jobs against the same D1 database.

Cloudflare Browser Run is not reliable for the ICA appointment checker because ICA's protected appointment search endpoint can reject automated sessions after the application-ID step. The production cron config keeps `ICA_CHECK_ENABLED = "false"` and does not schedule ICA checks. Use the GCP Playwright fallback runner in [GCP Playwright Runner](./gcp-playwright-runner.md) if you want to continue testing appointment automation with a persistent browser profile.

The web app still exposes the ICA tool under 我的 > 工具 for status history. The `立即检查` button is disabled while `ICA_CHECK_ENABLED = "false"`.

If you temporarily re-enable the Cloudflare checker, the app never auto-books or updates the appointment. It only checks availability and sends Telegram when a selectable ICA appointment date before `ICA_TARGET_BEFORE` appears. A one-off remote check would use:

```bash
curl -X POST https://personal-radar-cron.<your-workers-subdomain>.workers.dev/ica-check \
  -H 'x-admin-token: YOUR_ADMIN_TOKEN'
```

Use the Cloudflare Workers dashboard to find the deployed Worker route if your account exposes a workers.dev subdomain.

## Cron Schedule

`wrangler.cron.toml` currently configures:

- every 6 hours: fetch concerts and trend/news items
- `00:30 UTC`: send daily digest, which is `08:30 Asia/Singapore`

## Security

Set `ADMIN_TOKEN` before deploying. The current MVP uses a simple private admin token for job endpoints. The UI itself should eventually sit behind Cloudflare Access or another auth layer before sharing the URL.

## Protect The UI With Cloudflare Access

The deployed site contains birthday and preference data, so protect the public UI before sharing the URL.

Wrangler can deploy Pages and Workers for this project, but Cloudflare Access is account-level Zero Trust configuration. The current local Wrangler login has Pages/D1/Workers permissions, not `Access: Organizations, Identity Providers, and Groups Write`, so configure Access in the Cloudflare dashboard unless you create a separate API token with Access write permissions.

### Recommended Setup For `personal-radar.pages.dev`

1. Open Cloudflare Dashboard > Workers & Pages > `personal-radar`.
2. Go to Settings > General.
3. Select Enable access policy.
4. This initially protects preview deployments only. To protect `personal-radar.pages.dev` too:
   - Go to Zero Trust > Access controls > Applications.
   - Open the Access application created for the Pages project.
   - Select Configure.
   - Under Public hostname, delete the wildcard `*` subdomain so the app matches `personal-radar.pages.dev`.
   - Save.
5. Add a policy:
   - Action: Allow.
   - Include: Emails.
   - Value: your Google email address, for example `ballooncross@gmail.com`.
6. Login method:
   - Fastest: use Cloudflare One-time PIN for the allowed email.
   - Google login: Zero Trust > Integrations > Identity providers > Add new identity provider > Google, then select that provider on the Access application.

Cloudflare documents this `pages.dev` behavior in Pages preview deployment and known-issues docs:

- https://developers.cloudflare.com/pages/configuration/preview-deployments/
- https://developers.cloudflare.com/pages/platform/known-issues/

### Custom Domain Option

For a cleaner long-term setup, attach a custom domain such as `radar.yourdomain.com` to the Pages project, then create a normal Access self-hosted application for that hostname:

1. Workers & Pages > `personal-radar` > Custom domains.
2. Add the custom hostname.
3. Zero Trust > Access controls > Applications > Add an application > Self-hosted.
4. Public hostname: the custom hostname.
5. Policy: allow only your email or Google identity.

Cloudflare Access self-hosted applications require a hostname Cloudflare can proxy and validate before requests reach the origin.
