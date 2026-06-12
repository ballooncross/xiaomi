# GCP Playwright Runner

Use this when Cloudflare Browser Run cannot reliably access a site. The main Personal Radar app can stay on Cloudflare; this VM only runs browser automation jobs such as the ICA appointment checker.

## When To Use It

Use the GCP runner if:

- Cloudflare Browser Run is blocked or receives different markup from the target site.
- The job needs normal Linux browser behavior with a full Playwright install.
- The job is low frequency and can run from one small VM.

Do not use it for the whole Personal Radar app unless Cloudflare itself becomes unsuitable. Keeping UI, D1, Telegram digest, and normal fetch jobs on Cloudflare is still simpler.

## Cost Guardrails

GCP Free Tier can cover a small Compute Engine VM if you stay inside current limits. Use an `e2-micro`, a small standard persistent disk, no GPU/TPU, and low outbound traffic. Confirm the current free-tier regions and limits in Google Cloud docs before relying on it for zero cost.

## Create The VM

In Google Cloud Console:

1. Go to Compute Engine > VM instances > Create instance.
2. Name: `personal-radar-runner`.
3. Region/zone: choose a currently eligible Free Tier region if cost matters.
4. Machine type: `e2-micro`.
5. Boot disk: Debian 12 or Ubuntu 24.04.
6. Disk size: 20-30 GB standard persistent disk.
7. Firewall: no inbound HTTP/HTTPS needed. SSH only.
8. Create.

Connect with the SSH button in the VM instances page, or from Cloud Shell:

```bash
gcloud compute ssh personal-radar-runner --zone=YOUR_ZONE
```

## Install Node And Playwright

On the VM:

```bash
sudo apt update
sudo apt install -y curl git ca-certificates

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node -v
npm -v
```

Create the runner project:

```bash
mkdir -p ~/personal-radar-runner
cd ~/personal-radar-runner
npm init -y
npm install playwright dotenv
npx playwright install --with-deps chromium
```

## Configure Secrets

Create an env file:

```bash
nano ~/personal-radar-runner/.env
chmod 600 ~/personal-radar-runner/.env
```

Example:

```env
ICA_APPLICATION_ID=ISC...
TARGET_BEFORE=2026-07-01
TELEGRAM_BOT_TOKEN=123456:bot-token-from-botfather
TELEGRAM_CHAT_ID=123456789
```

Keep this file off GitHub. It lives only on the VM.

## Runner Script Shape

Create:

```bash
nano ~/personal-radar-runner/ica-check.mjs
```

The script should:

- load `.env`
- open ICA with Chromium
- select `Completion of Formalities`
- input `ICA_APPLICATION_ID`
- click `Proceed`
- inspect selectable calendar dates
- compare against `TARGET_BEFORE`
- send Telegram only when an earlier date appears
- print useful logs to stdout/stderr

Minimal skeleton:

```js
import 'dotenv/config';
import { chromium } from 'playwright';

const ICA_URL = 'https://eservices.ica.gov.sg/eappt/serviceselection';
const targetBefore = process.env.TARGET_BEFORE ?? '2026-07-01';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });

  try {
    await page.goto(ICA_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.locator('ng-select, input[role="combobox"], [role="combobox"]').first().click();

    // Continue with service selection, application ID input, calendar extraction,
    // and Telegram notification. Keep booking/update buttons untouched.

    console.log(`ICA check completed. targetBefore=${targetBefore}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## Manual Test

Run:

```bash
cd ~/personal-radar-runner
node ica-check.mjs
```

For debugging only, you can run headed if you connect with a desktop environment, but the normal VPS path should be headless.

## Schedule In Singapore Time

Set the VM timezone:

```bash
sudo timedatectl set-timezone Asia/Singapore
timedatectl
```

Create a systemd service:

```bash
sudo nano /etc/systemd/system/ica-check.service
```

Replace `YOUR_USER` with the Linux username shown by `whoami`.

```ini
[Unit]
Description=ICA appointment checker

[Service]
Type=oneshot
WorkingDirectory=/home/YOUR_USER/personal-radar-runner
ExecStart=/usr/bin/node /home/YOUR_USER/personal-radar-runner/ica-check.mjs
Environment=NODE_ENV=production
```

Create a timer:

```bash
sudo nano /etc/systemd/system/ica-check.timer
```

```ini
[Unit]
Description=Run ICA checker five times daily

[Timer]
OnCalendar=*-*-* 08,11,14,17,19:00:00
Persistent=false
Unit=ica-check.service

[Install]
WantedBy=timers.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ica-check.timer
systemctl list-timers | grep ica
```

## Logs

Check the last run:

```bash
journalctl -u ica-check.service -n 100 --no-pager
```

Follow live logs:

```bash
journalctl -u ica-check.service -f
```

Trigger immediately:

```bash
sudo systemctl start ica-check.service
```

## Optional: Send Results Back To Personal Radar

The simplest MVP path is Telegram-only notification from the VM.

Later, add a private Personal Radar API endpoint such as `/api/tools/ica/result`, protected by `ADMIN_TOKEN`, and make the VM POST structured results back to Cloudflare D1. That would let the website show the GCP runner status next to the Cloudflare runner status.

## Operations Notes

- Do not expose HTTP ports on the VM unless needed.
- Keep the VM patched: `sudo apt update && sudo apt upgrade`.
- Keep the `.env` file permissions at `600`.
- If the VM is used only as fallback, leave the timer disabled until needed:

```bash
sudo systemctl disable --now ica-check.timer
```

