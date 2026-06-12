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

## What Can Be Automated

The repository includes an automated setup/deploy script:

```bash
ICA_APPLICATION_ID="ISC..." npm run gcp:runner:setup
```

This script can create or update the VM, install Node and Playwright, copy the runner, create a systemd service, open the protected runner port, and print the two Cloudflare secrets needed by the cron Worker.

It cannot create your Google account, enable billing, or complete Google identity prompts for you. Do those once in Google Cloud Console or with `gcloud init`, then run the script from this project folder.

Optional overrides:

```bash
GCP_PROJECT_ID=your-project-id \
GCP_ZONE=us-west1-a \
ICA_APPLICATION_ID="ISC..." \
ICA_TARGET_BEFORE=2026-07-01 \
npm run gcp:runner:setup
```

If you do not set `ICA_FALLBACK_TRIGGER_TOKEN`, the script generates one and prints it at the end.

## Create The VM Manually

In Google Cloud Console:

1. Go to Compute Engine > VM instances > Create instance.
2. Name: `personal-radar-runner`.
3. Region/zone: choose a currently eligible Free Tier region if cost matters.
4. Machine type: `e2-micro`.
5. Boot disk: Debian 12 or Ubuntu 24.04.
6. Disk size/type: 20-30 GB `pd-standard` persistent disk.
7. Firewall: no inbound HTTP/HTTPS needed. SSH only.
8. Create.

Connect with the SSH button in the VM instances page, or from Cloud Shell:

```bash
gcloud compute ssh personal-radar-runner --zone=YOUR_ZONE
```

The manual steps below are kept for debugging and for users who do not want to use the setup script.

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

## Runner Script

The implemented runner lives in:

```text
runners/gcp-playwright/
```

It exposes `POST /ica-check`, protected by `ICA_FALLBACK_TRIGGER_TOKEN`, and returns the same result shape expected by the Cloudflare cron Worker. The runner does not send Telegram directly; Cloudflare records and notifies once after receiving the fallback result.

## Manual Test

Run:

```bash
cd ~/personal-radar-runner
npm run check:ica
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
sudo nano /etc/systemd/system/personal-radar-runner.service
```

Replace `YOUR_USER` with the Linux username shown by `whoami`.

```ini
[Unit]
Description=Personal Radar GCP Playwright fallback runner
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/personal-radar-runner
ExecStart=/usr/bin/node /home/YOUR_USER/personal-radar-runner/server.mjs
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now personal-radar-runner.service
systemctl status personal-radar-runner.service --no-pager
```

Do not create a separate timer when using automatic Cloudflare fallback. Cloudflare is the scheduler; the VM waits for a protected fallback request only after Cloudflare Browser Run fails.

## Logs

Check the last run:

```bash
journalctl -u personal-radar-runner.service -n 100 --no-pager
```

Follow live logs:

```bash
journalctl -u personal-radar-runner.service -f
```

Trigger immediately:

```bash
curl -X POST http://RUNNER_EXTERNAL_IP:8788/ica-check \
  -H "content-type: application/json" \
  -H "x-runner-token: YOUR_FALLBACK_TRIGGER_TOKEN" \
  -d '{"targetBefore":"2026-07-01"}'
```

## Wire It To Cloudflare

After the setup script prints the runner URL and token, set them on the cron Worker:

```bash
npx wrangler secret put ICA_FALLBACK_CHECK_URL --config wrangler.cron.toml
npx wrangler secret put ICA_FALLBACK_TRIGGER_TOKEN --config wrangler.cron.toml
npm run deploy:cron
```

The 我的 > 工具 screen shows `失败备用: 自动` when both values are configured.

## Operations Notes

- The runner port is protected by `ICA_FALLBACK_TRIGGER_TOKEN`, but it is still an exposed HTTP endpoint. Use a strong generated token.
- Keep the VM patched: `sudo apt update && sudo apt upgrade`.
- Keep the `.env` file permissions at `600`.
- If the VM is not needed, stop the service:

```bash
sudo systemctl disable --now personal-radar-runner.service
```
