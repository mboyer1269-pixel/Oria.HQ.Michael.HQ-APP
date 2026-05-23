# VPS Hostinger Hardening — Procédure d'exécution

**Cible:** VPS Hostinger KVM 4 — `2.24.118.156` — Ubuntu 24.04 LTS

**Durée estimée:** 45-60 minutes

**Risque:** Faible si tu suis les phases dans l'ordre. La Phase B est irréversible sauf via console hPanel Hostinger.

---

## Pré-conditions

- [ ] Accès SSH root au VPS fonctionne actuellement (testé ce soir via hPanel)
- [ ] Tu as accès au hPanel Hostinger pour faire un snapshot avant
- [ ] Tu as un Mac avec OpenSSH installé (par défaut sur macOS)

---

## Phase 0 — Snapshot Hostinger (5 min, dans hPanel)

**Avant tout changement, snapshot manuel.**

1. Va sur https://hpanel.hostinger.com → ton VPS
2. Menu gauche → **Backups & Monitoring** → **Snapshots**
3. Clique **Create snapshot** (ou équivalent)
4. Attends ~2-3 min que le snapshot termine
5. Note la date du snapshot

Ça te garantit un retour en arrière complet si quelque chose tourne mal.

---

## Phase 1 — Générer ta clé SSH locale (5 min, sur ton Mac)

Ouvre Terminal sur ton Mac et exécute:

```bash
# Vérifie si tu as déjà une clé ed25519
ls -la ~/.ssh/id_ed25519.pub 2>/dev/null

# Si elle n'existe pas, génère-la (sinon skip cette étape)
ssh-keygen -t ed25519 -C "michael@sovra-vps" -f ~/.ssh/id_ed25519

# Quand il te demande passphrase: tape une passphrase forte (ne pas laisser vide)
# Cette passphrase chiffre ta clé privée localement

# Récupère le contenu de ta clé publique
cat ~/.ssh/id_ed25519.pub
```

**Copie la sortie complète** — elle commence par `ssh-ed25519 AAAA...` et se termine par `michael@sovra-vps`.

---

## Phase 2 — Préparer le script Phase A (5 min, sur ton Mac)

1. Ouvre le fichier `01-phase-a-safe.sh` dans ton éditeur préféré
2. Ligne 35, remplace cette ligne:

   ```bash
   SSH_PUBLIC_KEY="REMPLACER_PAR_TA_CLE_PUBLIQUE_ED25519_COMPLETE"
   ```

   Par (exemple — utilise TA clé):

   ```bash
   SSH_PUBLIC_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...truc...end michael@sovra-vps"
   ```

3. Sauvegarde le fichier

---

## Phase 3 — Uploader et exécuter Phase A (10 min)

Sur ton Mac, Terminal:

```bash
# 1. Upload les 2 scripts sur le VPS (root pour l'instant)
cd /chemin/vers/scripts/vps-hardening/
scp 01-phase-a-safe.sh 02-phase-b-lock.sh root@2.24.118.156:/root/

# 2. Connecte-toi en root
ssh root@2.24.118.156

# 3. Sur le VPS:
chmod +x /root/01-phase-a-safe.sh /root/02-phase-b-lock.sh
bash /root/01-phase-a-safe.sh
```

Le script va prendre 2-5 minutes et afficher chaque étape en couleur. À la fin il te dit:

```
PHASE A TERMINÉE AVEC SUCCÈS
PROCHAINE ÉTAPE — VALIDATION OBLIGATOIRE
```

**NE FERME PAS cette session SSH root.**

---

## Phase 4 — Tester l'accès sovra@VPS (5 min)

**Garde la session root ouverte.** Ouvre une **2e fenêtre Terminal** sur ton Mac:

```bash
ssh sovra@2.24.118.156
```

3 résultats possibles:

| Résultat | Action |
|----------|--------|
| ✅ Tu te connectes en `sovra@vps:~$` | Parfait → passe à Phase 5 |
| ❌ "Permission denied (publickey)" | Mauvaise clé installée → Phase 4-debug |
| ❌ "Connection refused" | Firewall a bloqué le port 22 → Phase 4-debug |

### Phase 4-debug

Reviens dans ta session root (1re fenêtre) et exécute:

```bash
# Vérifier que la clé est bien là
cat /home/sovra/.ssh/authorized_keys

# Vérifier les permissions
ls -la /home/sovra/.ssh/

# Vérifier le firewall
ufw status

# Vérifier les logs SSH
journalctl -u ssh -n 30 --no-pager
```

Compare ta clé locale `~/.ssh/id_ed25519.pub` avec ce qui est dans `authorized_keys`. Si différent, copie-colle manuellement.

---

## Phase 5 — Lock définitif (Phase B, 5 min)

**SEULEMENT** si la 2e session SSH `sovra@VPS` fonctionne.

Toujours dans la session root:

```bash
bash /root/02-phase-b-lock.sh
```

Le script va te demander de taper `LOCK` en majuscules pour confirmer. Tape `LOCK` puis Enter.

Le script:
1. Backup `sshd_config`
2. Désactive password SSH
3. Désactive root SSH
4. Limite l'accès à l'utilisateur `sovra` uniquement
5. Recharge sshd

---

## Phase 6 — Validation finale (5 min)

Ouvre une **3e fenêtre Terminal**:

```bash
# Doit MARCHER avec ta clé:
ssh sovra@2.24.118.156

# Doit ÉCHOUER (root interdit):
ssh root@2.24.118.156

# Doit ÉCHOUER (password désactivé) — même si tu connais le password root,
# le serveur le refusera car PasswordAuthentication=no:
ssh -o PreferredAuthentications=password root@2.24.118.156
```

Si les 3 tests passent (1 OK, 2 KO) → **hardening complété**.

---

## Phase 7 — Activer backups Hostinger auto (5 min, dans hPanel)

1. https://hpanel.hostinger.com → ton VPS
2. **Backups & Monitoring** → **Automatic Backups**
3. Active **Weekly backups** (gratuit dans la plupart des plans)
4. Si dispo, active aussi **Daily backups** (souvent payant ~$2-5/mo, mais valable)
5. Configure la rétention (recommandé: 4 semaines)

---

## Récapitulatif — État final du VPS

Après ces 7 phases, ton VPS aura:

| Élément | Avant | Après |
|---------|-------|-------|
| Accès SSH root | ✓ password actif | ✗ interdit |
| Accès SSH password | ✓ | ✗ |
| Accès SSH clé `sovra@vps` | ✗ | ✓ |
| Firewall UFW | ✗ 0 règles | ✓ 22/80/443 |
| fail2ban | ✗ absent | ✓ 3 essais = ban 1h |
| Sudo NOPASSWD pour `sovra` | n/a | ✓ |
| Mises à jour sécurité auto | partielle | ✓ unattended-upgrades |
| Snapshot Hostinger | ✗ | ✓ pré-changements + auto hebdo |

---

## En cas d'urgence (rollback)

### Option A — Console hPanel Hostinger (toujours accessible)
1. https://hpanel.hostinger.com → ton VPS
2. **Browser Terminal** (ou équivalent) — donne shell root sans SSH
3. Restaurer le backup sshd_config:
   ```bash
   ls /etc/ssh/sshd_config.bak-*
   cp /etc/ssh/sshd_config.bak-<dernière> /etc/ssh/sshd_config
   systemctl reload sshd
   ```

### Option B — Restaurer le snapshot
1. hPanel → Backups & Monitoring → Snapshots
2. Sélectionner le snapshot Phase 0
3. Restore (perd ~30 min de changements mais récupère tout)

---

## Prochaine étape après ce hardening

Une fois ces 7 phases complétées, le VPS est prêt à recevoir la **stack Docker SOVRA** (Caddy + n8n + Langfuse + Postgres + Redis).

Cette installation est documentée dans `docs/VPS_HOSTINGER_SETUP.md` section 5 (`docker-compose.yml`). Je peux te générer le script `03-deploy-stack.sh` quand tu seras prêt.
