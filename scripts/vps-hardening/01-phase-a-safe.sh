#!/usr/bin/env bash
#
# SOVRA - VPS Hostinger Hardening - Phase A (SAFE / reversible)
# ----------------------------------------------------------------
# Execute as root on the Hostinger VPS before SSH lock-down.
# This script:
#   1. Updates system packages
#   2. Installs UFW, fail2ban, unattended-upgrades, curl, and htop
#   3. Creates the non-root 'sovra' operator user with sudo
#   4. Requires a password for 'sovra' sudo usage
#   5. Installs Michael's SSH public key from a runtime-only file
#   6. Enables UFW with SSH only on port 22
#   7. Prepares /opt/sovra without secrets or application stack
#
# It intentionally does not disable root/password SSH. Phase B does that
# only after a separate ssh sovra@VPS login has been validated.
#
# Usage:
#   scp ~/.ssh/id_ed25519.pub root@2.24.118.156:/root/michael-vps.pub
#   scp 01-phase-a-safe.sh root@2.24.118.156:/root/
#   ssh root@2.24.118.156
#   chmod +x /root/01-phase-a-safe.sh
#   bash /root/01-phase-a-safe.sh /root/michael-vps.pub
#
# Logs: /var/log/sovra-hardening.log
# ----------------------------------------------------------------

set -euo pipefail

PUBLIC_KEY_FILE="${1:-/root/michael-vps.pub}"
SOVRA_USER="${SOVRA_USER:-sovra}"
SOVRA_ROOT="${SOVRA_ROOT:-/opt/sovra}"
LOG_FILE="${LOG_FILE:-/var/log/sovra-hardening.log}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
  echo -e "$(date '+%Y-%m-%d %H:%M:%S') [$1] $2" | tee -a "$LOG_FILE"
}

step() {
  echo -e "\n${YELLOW}=== $1 ===${NC}\n" | tee -a "$LOG_FILE"
}

ok() {
  echo -e "${GREEN}OK: $1${NC}" | tee -a "$LOG_FILE"
}

fail() {
  echo -e "${RED}ERROR: $1${NC}" | tee -a "$LOG_FILE"
  exit 1
}

read_public_key() {
  if [[ ! -f "$PUBLIC_KEY_FILE" ]]; then
    fail "Public key file not found: $PUBLIC_KEY_FILE"
  fi

  if grep -q "PRIVATE KEY" "$PUBLIC_KEY_FILE"; then
    fail "$PUBLIC_KEY_FILE appears to contain a private key. Upload only the .pub file."
  fi

  local public_key
  public_key="$(sed -n '1p' "$PUBLIC_KEY_FILE" | tr -d '\r\n')"

  if [[ -z "$public_key" ]]; then
    fail "$PUBLIC_KEY_FILE is empty."
  fi

  if [[ ! "$public_key" =~ ^ssh-ed25519[[:space:]][A-Za-z0-9+/=]+([[:space:]].*)?$ ]]; then
    fail "Public key must be a single ssh-ed25519 public key line."
  fi

  echo "$public_key"
}

ensure_sudo_requires_password() {
  local sudoers_file="/etc/sudoers.d/$SOVRA_USER"

  if [[ -f "$sudoers_file" ]] && grep -q "NOPASSWD" "$sudoers_file"; then
    local backup="${sudoers_file}.bak-$(date +%Y%m%d-%H%M%S)"
    mv "$sudoers_file" "$backup"
    ok "Removed old sudo NOPASSWD rule; backup: $backup"
  fi

  if [[ -f "$sudoers_file" ]]; then
    chmod 440 "$sudoers_file"
    visudo -cf "$sudoers_file" >/dev/null
  fi
}

ensure_user_password() {
  local status
  status="$(passwd -S "$SOVRA_USER" 2>/dev/null | awk '{print $2}')"

  if [[ "$status" == "P" ]]; then
    ok "Password already set for '$SOVRA_USER' sudo usage"
    return
  fi

  echo
  echo "Set a strong Unix password for '$SOVRA_USER'."
  echo "This password is for sudo only; SSH password login remains a temporary root fallback until Phase B."
  passwd "$SOVRA_USER"
  ok "Password set for '$SOVRA_USER'"
}

if [[ $EUID -ne 0 ]]; then
  fail "This script must be executed as root."
fi

touch "$LOG_FILE"
chmod 600 "$LOG_FILE"

SSH_PUBLIC_KEY="$(read_public_key)"
log "INFO" "Starting Phase A hardening on $(hostname) ($(hostname -I | awk '{print $1}'))"

step "1/7 - Update packages"
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
ok "System packages updated"

step "2/7 - Install security packages"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  ufw fail2ban unattended-upgrades curl htop
ok "Security packages installed"

step "3/7 - Create and configure '$SOVRA_USER'"
if id "$SOVRA_USER" &>/dev/null; then
  log "INFO" "User '$SOVRA_USER' already exists"
else
  adduser --disabled-password --gecos "" "$SOVRA_USER"
  ok "User '$SOVRA_USER' created"
fi

usermod -aG sudo "$SOVRA_USER"
ok "'$SOVRA_USER' is in the sudo group"
ensure_sudo_requires_password
ensure_user_password

step "4/7 - Install SSH public key for '$SOVRA_USER'"
SOVRA_HOME="$(getent passwd "$SOVRA_USER" | cut -d: -f6)"
SSH_DIR="$SOVRA_HOME/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if ! grep -qxF "$SSH_PUBLIC_KEY" "$AUTH_KEYS" 2>/dev/null; then
  echo "$SSH_PUBLIC_KEY" >> "$AUTH_KEYS"
  ok "Public key added to $AUTH_KEYS"
else
  log "INFO" "Public key already present in $AUTH_KEYS"
fi

chmod 600 "$AUTH_KEYS"
chown -R "$SOVRA_USER:$SOVRA_USER" "$SSH_DIR"
ok "SSH permissions hardened"

step "5/7 - Configure UFW firewall"
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw --force enable >/dev/null
ok "UFW enabled; only inbound 22/tcp is open for this hardening phase"
ufw status verbose | tee -a "$LOG_FILE"

step "6/7 - Configure fail2ban"
FAIL2BAN_DROPIN_DIR="/etc/fail2ban/jail.d"
FAIL2BAN_DROPIN_FILE="$FAIL2BAN_DROPIN_DIR/sovra-sshd.conf"

mkdir -p "$FAIL2BAN_DROPIN_DIR"

cat > "$FAIL2BAN_DROPIN_FILE" <<'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 3
backend  = systemd

[sshd]
enabled  = true
port     = ssh
maxretry = 3
bantime  = 3600
EOF
chmod 644 "$FAIL2BAN_DROPIN_FILE"
ok "fail2ban sshd drop-in written: $FAIL2BAN_DROPIN_FILE"

systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban
sleep 2

if systemctl is-active --quiet fail2ban; then
  ok "fail2ban is active"
  fail2ban-client status sshd | tee -a "$LOG_FILE" || true
else
  fail "fail2ban did not start"
fi

step "7/7 - Configure unattended-upgrades and workspace root"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
ok "Security auto-updates enabled"

mkdir -p "$SOVRA_ROOT"
chown "$SOVRA_USER:$SOVRA_USER" "$SOVRA_ROOT"
chmod 750 "$SOVRA_ROOT"
ok "$SOVRA_ROOT prepared for future stack files; no secrets or application stack created"

echo -e "\n${GREEN}===============================================================${NC}"
echo -e "${GREEN}  PHASE A COMPLETED SUCCESSFULLY${NC}"
echo -e "${GREEN}===============================================================${NC}\n"

cat <<EOF | tee -a "$LOG_FILE"

CURRENT VPS STATE:
  OK UFW active; inbound 22/tcp only
  OK fail2ban active for sshd; 3 retries, 1h ban
  OK User '$SOVRA_USER' exists, belongs to sudo, and requires a password for sudo
  OK SSH public key installed for '$SOVRA_USER'
  OK unattended-upgrades configured
  OK $SOVRA_ROOT exists and is owned by '$SOVRA_USER'
  WARNING root SSH/password auth is still active intentionally

MANDATORY NEXT VALIDATION:

  1. Keep this root SSH session open.
  2. From another terminal, test:

       ssh $SOVRA_USER@$(hostname -I | awk '{print $1}')

  3. If the second session works, execute Phase B.
     If it fails, debug from this still-open root session and do not run Phase B.

Full log: $LOG_FILE
EOF
