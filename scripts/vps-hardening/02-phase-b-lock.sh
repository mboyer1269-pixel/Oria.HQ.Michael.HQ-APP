#!/usr/bin/env bash
#
# SOVRA — VPS Hostinger Hardening — Phase B (LOCK SSH)
# ----------------------------------------------------------------
# À exécuter UNIQUEMENT après avoir vérifié que tu peux te connecter
# avec succès en sovra@VPS depuis une 2e session SSH avec ta clé.
#
# Ce script:
#   1. Désactive PasswordAuthentication dans sshd_config
#   2. Désactive PermitRootLogin (root SSH interdit)
#   3. Durcit autres paramètres SSH (MaxAuthTries, ClientAlive)
#   4. Recharge sshd
#
# IRRÉVERSIBLE sans accès console Hostinger (hPanel → Browser Terminal).
# Si ça casse, tu peux toujours te connecter via le terminal web
# Hostinger pour revert.
#
# Usage (en root sur le VPS, après validation Phase A):
#   bash /root/02-phase-b-lock.sh
# ----------------------------------------------------------------

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log() {
  echo -e "$(date '+%Y-%m-%d %H:%M:%S') [$1] $2" | tee -a /var/log/sovra-hardening.log
}

step() {
  echo -e "\n${YELLOW}═══ $1 ═══${NC}\n"
}

ok() {
  echo -e "${GREEN}✓ $1${NC}"
}

fail() {
  echo -e "${RED}✗ $1${NC}"
  exit 1
}

if [[ $EUID -ne 0 ]]; then
  fail "Ce script doit être exécuté en tant que root."
fi

# === Pré-condition: vérifier que sovra existe et a une clé ===
step "0/3 — Vérification pré-condition"
if ! id sovra &>/dev/null; then
  fail "Utilisateur 'sovra' n'existe pas. Lance d'abord 01-phase-a-safe.sh"
fi

SOVRA_HOME=$(getent passwd sovra | cut -d: -f6)
if [[ ! -s "$SOVRA_HOME/.ssh/authorized_keys" ]]; then
  fail "$SOVRA_HOME/.ssh/authorized_keys est vide ou manquant. Lance d'abord 01-phase-a-safe.sh"
fi
ok "Utilisateur 'sovra' présent avec clé SSH"

# === Confirmation explicite ===
echo
echo -e "${YELLOW}⚠⚠⚠  ATTENTION  ⚠⚠⚠${NC}"
echo
echo "Ce script va:"
echo "  • Désactiver le login SSH par mot de passe (key-only)"
echo "  • Désactiver le login SSH en root"
echo
echo "Si tu n'as PAS vérifié que 'ssh sovra@$(hostname -I | awk '{print $1}')'"
echo "fonctionne depuis ton Mac, NE CONTINUE PAS."
echo
read -p "Tape 'LOCK' (en majuscules) pour confirmer: " CONFIRM

if [[ "$CONFIRM" != "LOCK" ]]; then
  echo "Annulé. Aucun changement fait."
  exit 0
fi

# === Step 1: Backup sshd_config ===
step "1/3 — Backup sshd_config"
BACKUP="/etc/ssh/sshd_config.bak-$(date +%Y%m%d-%H%M%S)"
cp /etc/ssh/sshd_config "$BACKUP"
ok "Backup créé: $BACKUP"

# === Step 2: Durcir sshd_config ===
step "2/3 — Durcissement sshd_config"

# Fonction utilitaire pour set ou replace une directive
set_directive() {
  local key="$1"
  local value="$2"
  local file="/etc/ssh/sshd_config"

  if grep -qE "^\s*#?\s*${key}\s+" "$file"; then
    sed -i "s|^\s*#\?\s*${key}\s\+.*|${key} ${value}|" "$file"
  else
    echo "${key} ${value}" >> "$file"
  fi
}

set_directive "PermitRootLogin" "no"
set_directive "PasswordAuthentication" "no"
set_directive "PubkeyAuthentication" "yes"
set_directive "PermitEmptyPasswords" "no"
set_directive "ChallengeResponseAuthentication" "no"
set_directive "UsePAM" "yes"
set_directive "MaxAuthTries" "3"
set_directive "ClientAliveInterval" "300"
set_directive "ClientAliveCountMax" "2"
set_directive "X11Forwarding" "no"
set_directive "AllowUsers" "sovra"

ok "Directives appliquées:"
grep -E "^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|MaxAuthTries|AllowUsers)" /etc/ssh/sshd_config

# === Step 3: Validate et reload ===
step "3/3 — Validation syntaxe + reload sshd"
if sshd -t; then
  ok "Syntaxe sshd_config valide"
  systemctl reload sshd
  ok "sshd rechargé"
else
  echo -e "${RED}✗ Erreur syntaxe sshd_config — restauration du backup${NC}"
  cp "$BACKUP" /etc/ssh/sshd_config
  systemctl reload sshd
  fail "Backup restauré. Aucun changement appliqué."
fi

# === Résumé final ===
echo -e "\n${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  PHASE B TERMINÉE — VPS DURCI${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}\n"

cat <<EOF

ÉTAT FINAL DU VPS:
  ✓ SSH key-only (password désactivé)
  ✓ SSH root interdit
  ✓ Seul l'utilisateur 'sovra' peut se connecter
  ✓ MaxAuthTries=3, ClientAlive timeout activé
  ✓ Backup sshd_config: $BACKUP

VALIDATION FINALE:

  Depuis ton Mac, ouvre une 3e session SSH:

    ssh sovra@$(hostname -I | awk '{print $1}')

  Cette session doit:
    ✓ Marcher avec ta clé
    ✗ Refuser tout password (même si tu le tapes)
    ✗ Refuser 'ssh root@...' désormais

EN CAS DE PROBLÈME:
  hPanel Hostinger → Browser Terminal → reste accessible en root
  Restaurer: cp $BACKUP /etc/ssh/sshd_config && systemctl reload sshd

EOF
