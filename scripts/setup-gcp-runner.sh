#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER_DIR="$ROOT_DIR/runners/gcp-playwright"

INSTANCE_NAME="${GCP_RUNNER_INSTANCE:-personal-radar-runner}"
ZONE="${GCP_ZONE:-us-west1-a}"
MACHINE_TYPE="${GCP_MACHINE_TYPE:-e2-micro}"
DISK_SIZE="${GCP_DISK_SIZE:-20GB}"
IMAGE_FAMILY="${GCP_IMAGE_FAMILY:-debian-12}"
IMAGE_PROJECT="${GCP_IMAGE_PROJECT:-debian-cloud}"
RUNNER_PORT="${GCP_RUNNER_PORT:-8788}"
FIREWALL_RULE="${GCP_FIREWALL_RULE:-personal-radar-runner-8788}"
NETWORK_TAG="${GCP_NETWORK_TAG:-personal-radar-runner}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is not installed. Install Google Cloud CLI, run gcloud init, then retry." >&2
  exit 1
fi

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "No GCP project selected. Run gcloud init or set GCP_PROJECT_ID." >&2
  exit 1
fi

if [[ -z "${ICA_APPLICATION_ID:-}" ]]; then
  echo "Set ICA_APPLICATION_ID before running this script." >&2
  echo "Example: ICA_APPLICATION_ID='ISC...' ./scripts/setup-gcp-runner.sh" >&2
  exit 1
fi

if [[ -z "${ICA_FALLBACK_TRIGGER_TOKEN:-}" ]]; then
  ICA_FALLBACK_TRIGGER_TOKEN="$(openssl rand -hex 24)"
fi

echo "Using project=$PROJECT_ID zone=$ZONE instance=$INSTANCE_NAME"

if ! gcloud compute instances describe "$INSTANCE_NAME" --project "$PROJECT_ID" --zone "$ZONE" >/dev/null 2>&1; then
  gcloud compute instances create "$INSTANCE_NAME" \
    --project "$PROJECT_ID" \
    --zone "$ZONE" \
    --machine-type "$MACHINE_TYPE" \
    --image-family "$IMAGE_FAMILY" \
    --image-project "$IMAGE_PROJECT" \
    --boot-disk-size "$DISK_SIZE" \
    --tags "$NETWORK_TAG"
else
  echo "VM already exists; updating runner files only."
fi

if ! gcloud compute firewall-rules describe "$FIREWALL_RULE" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute firewall-rules create "$FIREWALL_RULE" \
    --project "$PROJECT_ID" \
    --allow "tcp:$RUNNER_PORT" \
    --target-tags "$NETWORK_TAG" \
    --source-ranges "0.0.0.0/0" \
    --description "Allow protected Personal Radar fallback runner webhook"
fi

gcloud compute ssh "$INSTANCE_NAME" --project "$PROJECT_ID" --zone "$ZONE" --command "
  set -e
  sudo apt-get update
  sudo apt-get install -y curl git ca-certificates
  if ! command -v node >/dev/null 2>&1 || ! node -v | grep -Eq '^v(20|21|22|23|24)\\.'; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  mkdir -p ~/personal-radar-runner
"

gcloud compute scp --recurse "$RUNNER_DIR"/* "$INSTANCE_NAME:~/personal-radar-runner/" \
  --project "$PROJECT_ID" \
  --zone "$ZONE"

TMP_ENV="$(mktemp)"
cat > "$TMP_ENV" <<EOF
ICA_APPLICATION_ID=$ICA_APPLICATION_ID
ICA_TARGET_BEFORE=${ICA_TARGET_BEFORE:-2026-07-01}
ICA_FALLBACK_TRIGGER_TOKEN=$ICA_FALLBACK_TRIGGER_TOKEN
PORT=$RUNNER_PORT
EOF

gcloud compute scp "$TMP_ENV" "$INSTANCE_NAME:~/personal-radar-runner/.env" \
  --project "$PROJECT_ID" \
  --zone "$ZONE"
rm -f "$TMP_ENV"

gcloud compute ssh "$INSTANCE_NAME" --project "$PROJECT_ID" --zone "$ZONE" --command '
  set -e
  cd ~/personal-radar-runner
  chmod 600 .env
  npm install
  npx playwright install --with-deps chromium
  REMOTE_USER="$(whoami)"
  REMOTE_HOME="$HOME"
  sudo tee /etc/systemd/system/personal-radar-runner.service >/dev/null <<SERVICE
[Unit]
Description=Personal Radar GCP Playwright fallback runner
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$REMOTE_USER
WorkingDirectory=$REMOTE_HOME/personal-radar-runner
ExecStart=/usr/bin/node $REMOTE_HOME/personal-radar-runner/server.mjs
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICE
  sudo systemctl daemon-reload
  sudo systemctl enable --now personal-radar-runner.service
  sudo systemctl status personal-radar-runner.service --no-pager
'

RUNNER_IP="$(gcloud compute instances describe "$INSTANCE_NAME" \
  --project "$PROJECT_ID" \
  --zone "$ZONE" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
RUNNER_URL="http://$RUNNER_IP:$RUNNER_PORT"

echo
echo "GCP runner deployed: $RUNNER_URL"
echo
echo "Set these Cloudflare cron Worker secrets:"
echo "npx wrangler secret put ICA_FALLBACK_CHECK_URL --config wrangler.cron.toml"
echo "  value: $RUNNER_URL"
echo "npx wrangler secret put ICA_FALLBACK_TRIGGER_TOKEN --config wrangler.cron.toml"
echo "  value: $ICA_FALLBACK_TRIGGER_TOKEN"
echo
echo "Then redeploy the cron Worker:"
echo "npm run deploy:cron"
