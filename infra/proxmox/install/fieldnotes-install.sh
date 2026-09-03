#!/usr/bin/env bash
# Field Notes — installed inside the LXC by ct/fieldnotes.sh via community-scripts' build.func.
# Not meant to be run standalone outside that flow (it relies on $FUNCTIONS_FILE_PATH,
# $STD, msg_info/msg_ok, etc. being injected by build.func first).

FIELDNOTES_REPO_URL="${FIELDNOTES_REPO_URL:-https://github.com/Kali727/OmniaNote.git}"

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Git"
$STD apt-get install -y git
msg_ok "Installed Git"

ensure_docker

msg_info "Cloning Field Notes"
$STD git clone "$FIELDNOTES_REPO_URL" /opt/fieldnotes
msg_ok "Cloned Field Notes"

msg_info "Generating configuration"
ENV_FILE=/opt/fieldnotes/infra/.env
cp /opt/fieldnotes/infra/.env.example "$ENV_FILE"

echo -n "${TAB}Domain for this server (leave blank for IP-only / self-signed): "
read -r FIELDNOTES_DOMAIN
FIELDNOTES_DOMAIN="${FIELDNOTES_DOMAIN:-localhost}"

# Fill in every placeholder with a real random secret — nothing in .env.example is usable as-is.
sed -i \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^S3_ACCESS_KEY_ID=.*|S3_ACCESS_KEY_ID=fieldnotes|" \
  -e "s|^S3_SECRET_ACCESS_KEY=.*|S3_SECRET_ACCESS_KEY=$(openssl rand -hex 24)|" \
  -e "s|^MEILI_MASTER_KEY=.*|MEILI_MASTER_KEY=$(openssl rand -hex 24)|" \
  -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -base64 48)|" \
  -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -base64 48)|" \
  -e "s|^MFA_TOTP_ENCRYPTION_KEY=.*|MFA_TOTP_ENCRYPTION_KEY=$(openssl rand -base64 32)|" \
  -e "s|^DOMAIN=.*|DOMAIN=${FIELDNOTES_DOMAIN}|" \
  -e "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${FIELDNOTES_DOMAIN}|" \
  "$ENV_FILE"
msg_ok "Generated configuration ($ENV_FILE)"

msg_info "Building and starting Field Notes (this takes a few minutes on first run)"
cd /opt/fieldnotes
$STD docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
msg_ok "Started Field Notes"

motd_ssh
customize
cleanup_lxc
