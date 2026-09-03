#!/usr/bin/env bash
# OmniaNote — runs INSIDE the LXC. Fetched and executed by ../deploy.sh via `pct exec`.
#
# Standalone (addon-style), unlike a classic community-scripts ct+install pair: it does
# NOT rely on $FUNCTIONS_FILE_PATH being pre-injected by build.func, because build.func's
# install-script fetch is hardcoded to community-scripts' own repo and can't be pointed
# at ours. Instead this sources their misc/*.func libraries directly, the same way their
# own tools/addon/*.sh scripts do.

if ! command -v curl &>/dev/null; then
  apt-get update -y >/dev/null 2>&1
  apt-get install -y curl >/dev/null 2>&1
fi
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/core.func)
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/tools.func)
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/error_handler.func)
load_functions
header_info
confirm_not_pve_host
get_lxc_ip

set -Eeuo pipefail
trap 'error_handler' ERR

APP="OmniaNote"
INSTALL_PATH="/opt/omnianote"
COMPOSE_FILE="${INSTALL_PATH}/infra/docker-compose.yml"
ENV_FILE="${INSTALL_PATH}/infra/.env"

: "${OMNIANOTE_REPO_URL:?OMNIANOTE_REPO_URL must be set to a git-clonable URL — deploy.sh sets this for you}"

function update() {
  msg_info "Pulling latest ${APP} code"
  cd "$INSTALL_PATH"
  $STD git pull
  msg_ok "Pulled latest code"

  msg_info "Rebuilding and restarting ${APP} (this can take a few minutes)"
  $STD docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build --remove-orphans
  # infra/Caddyfile is bind-mounted, not baked into an image — `up -d` only recreates a
  # container when its own service definition changed, so a Caddyfile-only edit (like a
  # config fix) would otherwise leave caddy running on its stale, already-loaded config.
  $STD docker compose -f infra/docker-compose.yml restart caddy
  msg_ok "Updated ${APP}"
}

function install() {
  msg_info "Installing prerequisites"
  $STD apt-get update
  # git for cloning the repo; the rest is Docker's own documented apt-repo prerequisite
  # list (docs.docker.com/engine/install/debian) — this minimal template ships with none
  # of it, and ensure_docker's repo setup silently depends on all of them being present.
  $STD apt-get install -y git ca-certificates curl gnupg lsb-release apt-transport-https
  msg_ok "Installed prerequisites"

  ensure_docker

  msg_info "Cloning ${APP}"
  $STD git clone "$OMNIANOTE_REPO_URL" "$INSTALL_PATH"
  msg_ok "Cloned ${APP}"

  # Asked before the msg_info spinner below starts: msg_info leaves a background spinner
  # running (stopped only by the next msg_info/msg_ok/msg_error) that redraws over
  # whatever else is on the terminal, which buries an interactive prompt started while
  # it's still spinning — the prompt still works, it's just invisible.
  echo -n "${TAB:-  }Domain for this server (leave blank for IP-only / self-signed): "
  local domain
  read -r domain
  domain="${domain:-localhost}"

  msg_info "Generating configuration"
  cp "${INSTALL_PATH}/infra/.env.example" "$ENV_FILE"

  # Fill in every placeholder with a real random secret — nothing in .env.example is usable as-is.
  sed -i \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
    -e "s|^S3_ACCESS_KEY_ID=.*|S3_ACCESS_KEY_ID=omnianote|" \
    -e "s|^S3_SECRET_ACCESS_KEY=.*|S3_SECRET_ACCESS_KEY=$(openssl rand -hex 24)|" \
    -e "s|^MEILI_MASTER_KEY=.*|MEILI_MASTER_KEY=$(openssl rand -hex 24)|" \
    -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -base64 48)|" \
    -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -base64 48)|" \
    -e "s|^MFA_TOTP_ENCRYPTION_KEY=.*|MFA_TOTP_ENCRYPTION_KEY=$(openssl rand -base64 32)|" \
    -e "s|^DOMAIN=.*|DOMAIN=${domain}|" \
    -e "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${domain}|" \
    "$ENV_FILE"
  msg_ok "Generated configuration (${ENV_FILE})"

  msg_info "Building and starting ${APP} (this takes a few minutes on first run)"
  cd "$INSTALL_PATH"
  $STD docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
  msg_ok "Started ${APP}"

  echo ""
  msg_ok "${APP} is reachable at: ${BL}http://${LOCAL_IP}${CL}"
}

if [[ -d "$INSTALL_PATH/.git" ]]; then
  msg_warn "${APP} is already installed at ${INSTALL_PATH} — updating instead of reinstalling."
  update
else
  install
fi
