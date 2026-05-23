#!/usr/bin/env bash
#
# SOVRA - VPS Hostinger Hardening - Phase B (LOCK SSH)
# ----------------------------------------------------------------
# Execute only after validating a separate ssh sovra@VPS session.
# This script writes a dedicated sshd_config drop-in, validates syntax
# and effective values, then reloads the available SSH service.
#
# Usage:
#   bash /root/02-phase-b-lock.sh
# ----------------------------------------------------------------

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

LOG_FILE="${LOG_FILE:-/var/log/sovra-hardening.log}"
SOVRA_USER="${SOVRA_USER:-sovra}"
MAIN_CONFIG="/etc/ssh/sshd_config"
DROPIN_DIR="/etc/ssh/sshd_config.d"
DROPIN_FILE="$DROPIN_DIR/00-sovra-hardening.conf"
MAIN_BACKUP=""
DROPIN_BACKUP=""

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

reload_ssh_service() {
  if systemctl reload sshd; then
    log "INFO" "Reloaded SSH service via sshd"
    return 0
  fi

  if systemctl reload ssh; then
    log "INFO" "Reloaded SSH service via ssh"
    return 0
  fi

  log "ERROR" "Failed to reload SSH service via both sshd and ssh"
  return 1
}

rollback() {
  if [[ -n "$MAIN_BACKUP" && -f "$MAIN_BACKUP" ]]; then
    cp "$MAIN_BACKUP" "$MAIN_CONFIG"
  fi

  if [[ -n "$DROPIN_BACKUP" && -f "$DROPIN_BACKUP" ]]; then
    cp "$DROPIN_BACKUP" "$DROPIN_FILE"
  else
    rm -f "$DROPIN_FILE"
  fi

  reload_ssh_service || true
}

verify_effective_value() {
  local key="$1"
  local expected="$2"
  local effective="$3"

  if ! grep -qiE "^${key}[[:space:]]+${expected}$" <<< "$effective"; then
    echo "$effective" | grep -iE "^${key}[[:space:]]+" | tee -a "$LOG_FILE" || true
    rollback
    fail "Effective sshd value mismatch: expected '${key} ${expected}'"
  fi
}

if [[ $EUID -ne 0 ]]; then
  fail "This script must be executed as root."
fi

touch "$LOG_FILE"
chmod 600 "$LOG_FILE"

step "0/4 - Verify preconditions"
if ! id "$SOVRA_USER" &>/dev/null; then
  fail "User '$SOVRA_USER' does not exist. Run 01-phase-a-safe.sh first."
fi

SOVRA_HOME="$(getent passwd "$SOVRA_USER" | cut -d: -f6)"
if [[ ! -s "$SOVRA_HOME/.ssh/authorized_keys" ]]; then
  fail "$SOVRA_HOME/.ssh/authorized_keys is empty or missing. Run Phase A first."
fi

PASSWORD_STATUS="$(passwd -S "$SOVRA_USER" 2>/dev/null | awk '{print $2}')"
if [[ "$PASSWORD_STATUS" != "P" ]]; then
  fail "User '$SOVRA_USER' has no active Unix password for sudo. Run Phase A and set one."
fi

if ! groups "$SOVRA_USER" | grep -qw sudo; then
  fail "User '$SOVRA_USER' is not in the sudo group. Run Phase A first."
fi

ok "User '$SOVRA_USER' has SSH key, sudo group membership, and sudo password"

echo
echo -e "${YELLOW}ATTENTION${NC}"
echo
echo "This script will:"
echo "  - disable SSH password authentication"
echo "  - disable root SSH login"
echo "  - allow SSH login only for '$SOVRA_USER'"
echo
echo "If you have not validated 'ssh $SOVRA_USER@$(hostname -I | awk '{print $1}')' from a second terminal, stop now."
echo
read -r -p "Type 'LOCK' to confirm: " CONFIRM

if [[ "$CONFIRM" != "LOCK" ]]; then
  echo "Cancelled. No changes made."
  exit 0
fi

step "1/4 - Back up SSH configuration"
MAIN_BACKUP="${MAIN_CONFIG}.bak-$(date +%Y%m%d-%H%M%S)"
cp "$MAIN_CONFIG" "$MAIN_BACKUP"
ok "Main sshd_config backup created: $MAIN_BACKUP"

mkdir -p "$DROPIN_DIR"
chmod 755 "$DROPIN_DIR"

if [[ -f "$DROPIN_FILE" ]]; then
  DROPIN_BACKUP="${DROPIN_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$DROPIN_FILE" "$DROPIN_BACKUP"
  ok "Existing drop-in backup created: $DROPIN_BACKUP"
fi

if ! grep -Eq '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/\*\.conf' "$MAIN_CONFIG"; then
  printf '\nInclude /etc/ssh/sshd_config.d/*.conf\n' >> "$MAIN_CONFIG"
  ok "Added sshd_config.d include to $MAIN_CONFIG"
fi

step "2/4 - Write hardening drop-in"
cat > "$DROPIN_FILE" <<EOF
# Managed by SOVRA VPS hardening Phase B.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowUsers $SOVRA_USER
EOF

chmod 644 "$DROPIN_FILE"
ok "Drop-in written: $DROPIN_FILE"

step "3/4 - Validate syntax and effective SSH policy"
if ! sshd -t -f "$MAIN_CONFIG"; then
  rollback
  fail "sshd_config syntax validation failed; restored backups."
fi
ok "sshd_config syntax is valid"

EFFECTIVE_CONFIG="$(sshd -T -f "$MAIN_CONFIG" -C "user=$SOVRA_USER,host=$(hostname),addr=127.0.0.1")"
verify_effective_value "permitrootlogin" "no" "$EFFECTIVE_CONFIG"
verify_effective_value "passwordauthentication" "no" "$EFFECTIVE_CONFIG"
verify_effective_value "kbdinteractiveauthentication" "no" "$EFFECTIVE_CONFIG"
verify_effective_value "pubkeyauthentication" "yes" "$EFFECTIVE_CONFIG"
verify_effective_value "permitemptypasswords" "no" "$EFFECTIVE_CONFIG"
verify_effective_value "maxauthtries" "3" "$EFFECTIVE_CONFIG"
verify_effective_value "x11forwarding" "no" "$EFFECTIVE_CONFIG"
verify_effective_value "allowusers" "$SOVRA_USER" "$EFFECTIVE_CONFIG"
ok "Effective sshd policy verified"

step "4/4 - Reload SSH service"
if reload_ssh_service; then
  ok "SSH service reloaded"
else
  rollback
  fail "SSH service reload failed via both sshd and ssh; restored backups. Use hPanel Browser terminal if SSH is unavailable."
fi

echo -e "\n${GREEN}===============================================================${NC}"
echo -e "${GREEN}  PHASE B COMPLETED - VPS SSH IS HARDENED${NC}"
echo -e "${GREEN}===============================================================${NC}\n"

cat <<EOF | tee -a "$LOG_FILE"

FINAL SSH STATE:
  OK SSH key-only; password authentication disabled
  OK root SSH login disabled
  OK only '$SOVRA_USER' is allowed via SSH
  OK MaxAuthTries=3, ClientAlive timeout enabled
  OK Hardening drop-in: $DROPIN_FILE
  OK Main backup: $MAIN_BACKUP

FINAL VALIDATION FROM A THIRD TERMINAL:

  ssh $SOVRA_USER@$(hostname -I | awk '{print $1}')                         # must work
  ssh root@$(hostname -I | awk '{print $1}')                                # must fail
  ssh -o PreferredAuthentications=password root@$(hostname -I | awk '{print $1}')  # must fail

EMERGENCY RECOVERY:
  hPanel Hostinger -> Browser terminal -> root shell
  Restore $MAIN_BACKUP to $MAIN_CONFIG, remove $DROPIN_FILE, then reload the available SSH service (sshd or ssh).

EOF
