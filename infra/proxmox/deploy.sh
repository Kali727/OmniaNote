#!/usr/bin/env bash
# OmniaNote — Proxmox VE deploy script. Run this on the Proxmox host, as root.
#
# The OmniaNote repo is private, so every fetch from it needs a GitHub token —
# raw.githubusercontent.com returns 404 (not 401/403) for an unauthenticated request
# to a private repo. Create a fine-grained personal access token scoped to just this
# repo with "Contents: Read-only" at https://github.com/settings/personal-access-tokens/new,
# then run:
#
#   export GH_TOKEN=github_pat_xxx
#   bash -c "$(curl -fsSL -H "Authorization: token $GH_TOKEN" \
#     https://raw.githubusercontent.com/Kali727/OmniaNote/main/infra/proxmox/deploy.sh)"
#
# GH_TOKEN must be `export`ed as its own step, not a same-line prefix (`GH_TOKEN=x cmd`) —
# a prefix assignment isn't visible to that same command's own argument expansion, so the
# $GH_TOKEN inside the curl -H above would silently expand to empty and 404.
#
# Security note: this puts the token in your shell history. Revoke/rotate it once you're
# done deploying, or prefix both lines with a space if HISTCONTROL=ignorespace is set.
# `unset GH_TOKEN` when you're finished if you'd rather it not linger in this session.
#
# Re-running this same command against an existing container's CTID updates it
# (git pull + rebuild) instead of creating a second one.

set -Eeuo pipefail

REPO_OWNER="Kali727"
REPO_NAME="OmniaNote"
REPO_RAW_BASE="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main"

command -v pct >/dev/null 2>&1 || { echo "This must run on a Proxmox VE host (pct not found)." >&2; exit 1; }
: "${GH_TOKEN:?Set GH_TOKEN to a token that can read the private ${REPO_OWNER}/${REPO_NAME} repo, then re-run.}"

CLONE_URL="https://${GH_TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git"

echo "== OmniaNote Proxmox deploy =="
echo ""

read -rp "Container ID [next free]: " CTID
CTID="${CTID:-$(pvesh get /cluster/nextid)}"

if pct status "$CTID" &>/dev/null; then
  echo "Container ${CTID} already exists — this will update OmniaNote inside it rather than creating a new container."
else
  read -rp "Hostname [omnianote]: " CT_HOSTNAME
  CT_HOSTNAME="${CT_HOSTNAME:-omnianote}"
  read -rp "CPU cores [4]: " CORES
  CORES="${CORES:-4}"
  read -rp "Memory in MB [4096]: " MEMORY
  MEMORY="${MEMORY:-4096}"
  read -rp "Disk size in GB [24]: " DISK
  DISK="${DISK:-24}"
  read -rp "Storage pool for the container's disk [local-lvm]: " STORAGE
  STORAGE="${STORAGE:-local-lvm}"
  read -rp "Storage holding the OS template [local]: " TEMPLATE_STORAGE
  TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
  read -rp "Network bridge [vmbr0]: " BRIDGE
  BRIDGE="${BRIDGE:-vmbr0}"

  echo ""
  echo "Looking up the latest Debian 13 template..."
  pveam update >/dev/null
  TEMPLATE=$(pveam available | awk '$2 ~ /^debian-13-standard_/ {print $2}' | sort -V | tail -1)
  if [[ -z "$TEMPLATE" ]]; then
    echo "Couldn't find a debian-13-standard template via 'pveam available'." >&2
    echo "Download one manually (pveam available | grep debian-13; pveam download <storage> <template>) and re-run." >&2
    exit 1
  fi
  if ! pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
    echo "Downloading ${TEMPLATE}..."
    pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
  fi

  echo "Creating container ${CTID}..."
  pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
    -unprivileged 1 \
    -hostname "$CT_HOSTNAME" \
    -cores "$CORES" \
    -memory "$MEMORY" \
    -swap 512 \
    -rootfs "${STORAGE}:${DISK}" \
    -net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
    -features "nesting=1,keyctl=1" \
    -onboot 1

  echo "Starting container ${CTID}..."
  pct start "$CTID"
fi

echo "Waiting for the container's network..."
for _ in $(seq 1 30); do
  pct exec "$CTID" -- getent hosts github.com &>/dev/null && break
  sleep 2
done

echo "Fetching the installer..."
INSTALL_SCRIPT="$(curl -fsSL -H "Authorization: token ${GH_TOKEN}" "${REPO_RAW_BASE}/infra/proxmox/install/omnianote-install.sh")"
if [[ -z "$INSTALL_SCRIPT" ]]; then
  echo "Failed to fetch the install script — check that GH_TOKEN is valid and can read ${REPO_OWNER}/${REPO_NAME}." >&2
  exit 1
fi

echo "Running it inside container ${CTID}..."
pct exec "$CTID" -- env OMNIANOTE_REPO_URL="$CLONE_URL" bash -c "$INSTALL_SCRIPT"

IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')
echo ""
echo "Done. OmniaNote should be reachable at: http://${IP}"
echo "Shell in any time with: pct exec ${CTID} -- bash"
echo "Re-run this same command against CTID ${CTID} to update."
