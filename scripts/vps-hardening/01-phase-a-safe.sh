#!/usr/bin/env bash
#
# SOVRA — VPS Hostinger Hardening — Phase A (SAFE / réversible)
# ----------------------------------------------------------------
# À exécuter en tant que root sur le VPS Hostinger KVM 4.
# Ce script:
#   1. Met à jour les paquets sécurité
#   2. Installe UFW (firewall) + fail2ban (anti brute-force)
#   3. Crée un utilisateur 'sovra' non-root avec sudo
#   4. Copie la clé SSH publique fournie pour 'sovra'
#   5. Active UFW (ports 22, 80, 443) et fail2ban
#   6. Configure unattended-upgrades (mises à jour sécurité auto)
#
# CE SCRIPT N'ACTIVE PAS encore le SSH key-only. Le password root
# reste actif. C'est la Phase B (script 02) qui coupera le password,
# UNIQUEMENT après que tu auras validé que tu peux te connecter en
# sovra@VPS avec ta clé depuis une 2e session SSH.
#
# Idempotent: re-exécutable sans casser quoi que ce soit.
#
# Usage:
#   1. Copier le contenu de ta clé publique ed25519 dans la variable
#      SSH_PUBLIC_KEY ci-dessous (ligne 35)
#   2. scp ce fichier sur le VPS:
#        scp 01-phase-a-safe.sh root@2.24.118.156:/root/
#   3. ssh root@2.24.118.156
#      chmod +x /root/01-phase-a-safe.sh
#      bash /root/01-phase-a-safe.sh
#
# Logs: /var/log/sovra-hardening.log
# ----------------------------------------------------------------

set -euo pipefail

# === CONFIGURATION — À REMPLIR AVANT EXÉCUTION ===
SSH_PUBLIC_KEY="REMPLACER_PAR_TA_CLE_PUBLIQUE_ED25519_COMPLETE"
SOVRA_USER="sovra"
LOG_FILE="/var/log/sovra-hardening.log"
# ===================================================

# Couleurs pour lisibilité
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log() {
  echo -e "$(date '+%Y-%m-%d %H:%M:%S') [$1] $2" | tee -a "$LOG_FILE"
}

step() {
  echo -e "\n${YELLOW}═══ $1 ═══${NC}\n" | tee -a "$LOG_FILE"
}

ok() {
  echo -e "${GREEN}✓ $1${NC}" | tee -a "$LOG_FILE"
}

fail() {
  echo -e "${RED}✗ $1${NC}" | tee -a "$LOG_FILE"
  exit 1
}

# === Pré-conditions ===
if [[ $EUID -ne 0 ]]; then
  fail "Ce script doit être exécuté en tant que root."
fi

if [[ "$SSH_PUBLIC_KEY" == "REMPLACER_PAR_TA_CLE_PUBLIQUE_ED25519_COMPLETE" ]]; then
  fail "Tu dois remplir SSH_PUBLIC_KEY ligne 35 avant d'exécuter."
fi

if [[ ! "$SSH_PUBLIC_KEY" =~ ^ssh-(ed25519|rsa) ]]; then
  fail "SSH_PUBLIC_KEY ne ressemble pas à une clé publique valide (doit commencer par ssh-ed25519 ou ssh-rsa)."
fi

touch "$LOG_FILE"
log "INFO" "Démarrage hardening Phase A — VPS $(hostname) — $(hostname -I | awk '{print $1}')"

# === Step 1: Mise à jour paquets ===
step "1/6 — Mise à jour paquets"
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
ok "Paquets à jour"

# === Step 2: Installation UFW + fail2ban + unattended-upgrades ===
step "2/6 — Installation UFW + fail2ban + unattended-upgrades"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  ufw fail2ban unattended-upgrades curl htop
ok "Paquets sécurité installés"

# === Step 3: Création utilisateur sovra ===
step "3/6 — Création utilisateur '$SOVRA_USER'"
if id "$SOVRA_USER" &>/dev/null; then
  log "INFO" "Utilisateur '$SOVRA_USER' existe déjà, skip création"
else
  adduser --disabled-password --gecos "" "$SOVRA_USER"
  ok "Utilisateur '$SOVRA_USER' créé"
fi

usermod -aG sudo "$SOVRA_USER"
ok "'$SOVRA_USER' ajouté au groupe sudo"

# Permettre sudo sans mot de passe pour cet utilisateur (clé SSH = auth)
SUDOERS_FILE="/etc/sudoers.d/$SOVRA_USER"
if [[ ! -f "$SUDOERS_FILE" ]]; then
  echo "$SOVRA_USER ALL=(ALL) NOPASSWD:ALL" > "$SUDOERS_FILE"
  chmod 440 "$SUDOERS_FILE"
  ok "Sudo NOPASSWD configuré pour '$SOVRA_USER'"
fi

# === Step 4: Installation clé SSH pour sovra ===
step "4/6 — Installation clé SSH publique pour '$SOVRA_USER'"
SOVRA_HOME=$(getent passwd "$SOVRA_USER" | cut -d: -f6)
SSH_DIR="$SOVRA_HOME/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

# Idempotent: ajoute la clé seulement si pas déjà présente
if ! grep -qxF "$SSH_PUBLIC_KEY" "$AUTH_KEYS" 2>/dev/null; then
  echo "$SSH_PUBLIC_KEY" >> "$AUTH_KEYS"
  ok "Clé SSH ajoutée à $AUTH_KEYS"
else
  log "INFO" "Clé SSH déjà présente dans $AUTH_KEYS"
fi

chmod 600 "$AUTH_KEYS"
chown -R "$SOVRA_USER:$SOVRA_USER" "$SSH_DIR"
ok "Permissions SSH durcies"

# === Step 5: Configuration UFW firewall ===
step "5/6 — Configuration UFW (firewall)"
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP (Caddy redirect)' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
ok "UFW activé — ports ouverts: 22/80/443"
ufw status verbose | tee -a "$LOG_FILE"

# === Step 6: Configuration fail2ban ===
step "6/6 — Configuration fail2ban"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 3
backend  = systemd

[sshd]
enabled = true
port    = ssh
maxretry = 3
bantime  = 3600
EOF

systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban
sleep 2
if systemctl is-active --quiet fail2ban; then
  ok "fail2ban actif"
  fail2ban-client status sshd | tee -a "$LOG_FILE" || true
else
  fail "fail2ban n'a pas démarré"
fi

# === Configuration unattended-upgrades ===
step "Bonus — unattended-upgrades (mises à jour sécurité auto)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
ok "Mises à jour sécurité automatiques activées"

# === Résumé final ===
echo -e "\n${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  PHASE A TERMINÉE AVEC SUCCÈS${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}\n"

cat <<EOF | tee -a "$LOG_FILE"

ÉTAT ACTUEL DU VPS:
  ✓ UFW actif (22, 80, 443 ouverts)
  ✓ fail2ban actif (ban après 3 essais SSH ratés)
  ✓ Utilisateur '$SOVRA_USER' créé avec sudo NOPASSWD
  ✓ Clé SSH installée pour '$SOVRA_USER'
  ✓ Unattended-upgrades configuré
  ⚠ Password SSH root TOUJOURS ACTIF (volontaire)

PROCHAINE ÉTAPE — VALIDATION OBLIGATOIRE:

  1. Garde cette session SSH OUVERTE (ne ferme pas)
  2. Depuis ton Mac, ouvre une 2e session SSH:

       ssh $SOVRA_USER@$(hostname -I | awk '{print $1}')

  3. Si la 2e session marche → tu peux exécuter le script 02-phase-b-lock.sh
                              pour couper le password SSH
     Si la 2e session échoue → reste sur cette session root,
                              débogue (vérifie ta clé publique),
                              ne lance PAS le script 02

Log complet: $LOG_FILE
EOF
