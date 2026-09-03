#!/usr/bin/env bash
# Field Notes — Proxmox VE LXC installer
#
# Run on the Proxmox host. This creates a new unprivileged Debian LXC and installs
# the Field Notes Docker stack inside it. Adapted from the community-scripts.org
# Proxmox VE Helper-Scripts pattern (https://github.com/community-scripts/ProxmoxVE) —
# same build.func container-creation framework, our own install script.
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/infra/proxmox/ct/fieldnotes.sh)"
#
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)

APP="Field Notes"
var_tags="${var_tags:-docker;maintenance}"
var_cpu="${var_cpu:-4}"
var_ram="${var_ram:-4096}"
var_disk="${var_disk:-24}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/fieldnotes ]]; then
    msg_error "No ${APP} installation found!"
    exit
  fi

  msg_info "Pulling latest Field Notes code and images"
  cd /opt/fieldnotes
  $STD git pull
  $STD docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
  msg_ok "Updated ${APP}"
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW}The API is reachable inside the container at:${CL}"
echo -e "${GATEWAY}${BGN}http://${IP}${CL}  (Caddy — point a real DOMAIN at this IP for HTTPS)"
echo -e "${INFO}${YW}Re-run this same one-liner any time to update ${APP}.${CL}"
